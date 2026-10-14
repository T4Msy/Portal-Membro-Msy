// Configurações de voz do MSY Space (como no Discord): microfone, saída de áudio, câmera,
// teste de microfone/som e processamento de voz. As escolhas ficam em space_preferences e
// valem na hora, inclusive no meio de uma chamada.
//
// Limite do navegador: no celular o site não escolhe entre alto-falante e o "do ouvido" —
// quem decide é o sistema. Isso entra no app Android novo (ver docs/msy-space/README.md).
import { listDevices } from '../voice/media/devices.js';
import { getCapabilities } from '../voice/media/capabilities.js';
import { esc, icon, toast } from './dom.js';

let open = null;

export function openVoiceSettings({ prefs, voice }) {
  if (open) return;
  open = new VoiceSettings(prefs, voice);
  open.mount();
}

class VoiceSettings {
  constructor(prefs, voice) {
    this.prefs = prefs;
    this.voice = voice;
    this.caps = getCapabilities();
    this.testStream = null;
    this.meterCtx = null;
    this.raf = null;
    this.onDeviceChange = () => this.renderDevices();
  }

  mount() {
    const p = this.prefs.get();
    this.el = document.createElement('div');
    this.el.className = 'modal-overlay open sp-modal sp-settings';
    this.el.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Configurações de voz">
      <div class="modal-header"><div class="modal-title">${icon('fa-sliders')} Voz e vídeo</div>
        <button class="modal-close" data-act="close" aria-label="Fechar">${icon('fa-xmark')}</button></div>
      <div class="modal-body">
        <div class="sp-set-allow" data-allow hidden>
          ${icon('fa-lock-open')} Para ver os nomes dos seus dispositivos, o navegador precisa de permissão.
          <button class="btn btn-primary btn-sm" data-act="allow">Permitir acesso</button>
        </div>

        <section class="sp-set-block">
          <label class="sp-set-label" for="spSetInput">${icon('fa-microphone')} Microfone</label>
          <select id="spSetInput" class="form-input" data-pref="inputDeviceId"></select>
          <div class="sp-meter-row">
            <button class="btn btn-ghost btn-sm" data-act="mic-test">${icon('fa-wave-square')} Testar microfone</button>
            <div class="sp-meter" aria-hidden="true"><span data-meter></span></div>
          </div>
          <p class="sp-hint" data-mic-hint>Fale algo: a barra deve se mexer.</p>
        </section>

        <section class="sp-set-block">
          <label class="sp-set-label" for="spSetOutput">${icon('fa-volume-high')} Saída de áudio</label>
          <select id="spSetOutput" class="form-input" data-pref="outputDeviceId"></select>
          <button class="btn btn-ghost btn-sm" data-act="sound-test">${icon('fa-bell')} Testar som</button>
          <p class="sp-hint" data-output-hint></p>
        </section>

        <section class="sp-set-block">
          <label class="sp-set-label" for="spSetCamera">${icon('fa-video')} Câmera</label>
          <select id="spSetCamera" class="form-input" data-pref="cameraDeviceId"></select>
        </section>

        <section class="sp-set-block">
          <div class="sp-set-label">${icon('fa-wand-magic-sparkles')} Processamento de voz</div>
          ${this.toggle('noiseSuppression', 'Supressão de ruído', 'Corta barulho de fundo (ventilador, teclado).', p.noiseSuppression ?? true)}
          ${this.toggle('echoCancellation', 'Cancelamento de eco', 'Evita que os outros ouçam o próprio som de volta.', p.echoCancellation ?? true)}
          ${this.toggle('autoGainControl', 'Volume automático do microfone', 'Ajusta seu volume sozinho quando você fala baixo ou alto.', p.autoGainControl ?? true)}
        </section>
      </div>
      <div class="modal-footer"><button class="btn btn-primary" data-act="close">Pronto</button></div>
    </div>`;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('change', (e) => this.onChangeField(e));
    navigator.mediaDevices?.addEventListener?.('devicechange', this.onDeviceChange);
    this.renderDevices();
  }

  toggle(key, label, hint, on) {
    return `<label class="sp-switch-row"><span><b>${esc(label)}</b><small>${esc(hint)}</small></span>
      <input type="checkbox" class="sp-switch" data-pref-bool="${esc(key)}" ${on ? 'checked' : ''}></label>`;
  }

  async renderDevices() {
    const { inputs, outputs, cameras } = await listDevices();
    const p = this.prefs.get();
    const needsPermission = [...inputs, ...cameras].some((d) => !d.label);
    this.el.querySelector('[data-allow]').hidden = !needsPermission;

    const fill = (select, list, current, fallbackName) => {
      const options = [`<option value="">Padrão do sistema</option>`]
        .concat(list.filter((d) => d.deviceId && d.deviceId !== 'default')
          .map((d, i) => `<option value="${esc(d.deviceId)}" ${d.deviceId === current ? 'selected' : ''}>${esc(d.label || `${fallbackName} ${i + 1}`)}</option>`));
      select.innerHTML = options.join('');
    };
    fill(this.el.querySelector('#spSetInput'), inputs, p.inputDeviceId, 'Microfone');
    fill(this.el.querySelector('#spSetCamera'), cameras, p.cameraDeviceId, 'Câmera');

    const outSelect = this.el.querySelector('#spSetOutput');
    const outHint = this.el.querySelector('[data-output-hint]');
    if (this.caps.outputSelection && outputs.length) {
      fill(outSelect, outputs, p.outputDeviceId, 'Saída');
      outSelect.disabled = false;
      outHint.textContent = this.caps.isMobile
        ? 'No celular o navegador mostra só as saídas que o sistema libera.'
        : '';
    } else {
      outSelect.innerHTML = '<option value="">Escolhida pelo sistema</option>';
      outSelect.disabled = true;
      outHint.textContent = this.caps.isMobile
        ? 'No celular, o navegador não deixa o site escolher entre alto-falante e o "do ouvido": use o botão de alto-falante do próprio aparelho, um fone ou Bluetooth. A escolha direto aqui vem no app Android do MSY Space.'
        : 'Este navegador não deixa escolher a saída. No Chrome, Edge ou Brave do computador essa opção aparece.';
    }
  }

  async onChangeField(e) {
    const t = e.target;
    try {
      if (t.dataset.pref === 'inputDeviceId') {
        const prefs = this.prefs.update({ inputDeviceId: t.value || undefined });
        if (this.testStream) await this.startMicTest();
        if (this.voice.active) { await this.voice.changeInputDevice(prefs); toast('Microfone trocado.'); }
      }
      if (t.dataset.pref === 'outputDeviceId') {
        this.prefs.update({ outputDeviceId: t.value || undefined });
        if (this.voice.active) await this.voice.changeOutputDevice(t.value || undefined);
        toast('Saída de áudio trocada.');
      }
      if (t.dataset.pref === 'cameraDeviceId') {
        this.prefs.update({ cameraDeviceId: t.value || undefined });
        // Câmera ligada: desliga e liga de novo já com a nova.
        if (this.voice.snapshot?.local.camera) { this.voice.toggleCamera(); setTimeout(() => this.voice.toggleCamera(), 400); }
      }
      if (t.dataset.prefBool) {
        const prefs = this.prefs.update({ [t.dataset.prefBool]: t.checked });
        if (this.voice.active) await this.voice.changeInputDevice(prefs);
        if (this.testStream) await this.startMicTest();
      }
    } catch (err) {
      console.error('[MSY][space] Falha ao trocar dispositivo:', err);
      toast(err?.message || 'Não foi possível trocar o dispositivo.', 'error');
    }
  }

  async onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (e.target === this.el) return this.close();
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'close') this.close();
    if (act === 'allow') await this.askPermission();
    if (act === 'mic-test') this.testStream ? this.stopMicTest() : await this.startMicTest();
    if (act === 'sound-test') await this.playTestSound();
  }

  async askPermission() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch (err) {
      console.warn('[MSY][space] Permissão de dispositivos negada:', err);
      toast('O navegador não liberou o acesso. Libere no cadeado da barra de endereço.', 'error');
    }
    this.renderDevices();
  }

  async startMicTest() {
    this.stopMicTest();
    const p = this.prefs.get();
    try {
      this.testStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: p.inputDeviceId ? { exact: p.inputDeviceId } : undefined,
          noiseSuppression: p.noiseSuppression ?? true,
          echoCancellation: p.echoCancellation ?? true,
          autoGainControl: p.autoGainControl ?? true,
        },
      });
    } catch (err) {
      console.warn('[MSY][space] Teste de microfone falhou:', err);
      toast('Não foi possível abrir esse microfone.', 'error');
      return;
    }
    this.meterCtx = new AudioContext();
    const analyser = this.meterCtx.createAnalyser();
    analyser.fftSize = 512;
    this.meterCtx.createMediaStreamSource(this.testStream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const bar = this.el.querySelector('[data-meter]');
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      bar.style.width = `${Math.min(100, Math.round((peak / 128) * 160))}%`;
      this.raf = requestAnimationFrame(tick);
    };
    tick();
    this.el.querySelector('[data-act="mic-test"]').innerHTML = `${icon('fa-stop')} Parar teste`;
    this.renderDevices(); // depois da permissão os nomes aparecem
  }

  stopMicTest() {
    cancelAnimationFrame(this.raf);
    this.testStream?.getTracks().forEach((t) => t.stop());
    this.testStream = null;
    this.meterCtx?.close().catch(() => undefined);
    this.meterCtx = null;
    const bar = this.el?.querySelector('[data-meter]');
    if (bar) bar.style.width = '0%';
    const btn = this.el?.querySelector('[data-act="mic-test"]');
    if (btn) btn.innerHTML = `${icon('fa-wave-square')} Testar microfone`;
  }

  /** Bipe curto tocado na saída escolhida. */
  async playTestSound() {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(dest);
    const audio = new Audio();
    audio.srcObject = dest.stream;
    const sink = this.prefs.get().outputDeviceId;
    if (sink && typeof audio.setSinkId === 'function') await audio.setSinkId(sink).catch(() => undefined);
    await audio.play().catch(() => undefined);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
    setTimeout(() => { audio.srcObject = null; ctx.close().catch(() => undefined); }, 900);
  }

  close() {
    this.stopMicTest();
    navigator.mediaDevices?.removeEventListener?.('devicechange', this.onDeviceChange);
    this.prefs.flush();
    this.el.remove();
    open = null;
  }
}
