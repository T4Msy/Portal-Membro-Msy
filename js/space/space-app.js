// Entrada da página MSY Space (space.html). Visão geral: docs/msy-space/README.md
import { Workspace } from './workspace.js';
import { OnlinePresence } from './online.js';
import { SpacePrefs } from './prefs.js';
import { VoiceController } from './voice-controller.js';
import { CallShell } from './shell.js';
import { SpaceNav } from './ui/nav.js';
import { ChatView } from './ui/chat.js';
import { VoiceRoomView } from './ui/voice-room.js';
import { CallDock } from './ui/call-dock.js';
import { CallPip } from './ui/call-pip.js';
import { esc, icon, toast } from './ui/dom.js';
import { followVisualViewport } from './ui/viewport.js';
import { openProfileCard } from './ui/profile.js?v=20261023-avatar8mb';

const { Auth } = window.MSY;
const LAST_CHANNEL_KEY = 'msy_space_last_channel';

async function initSpace() {
  followVisualViewport();
  // Experiência imersiva (como a Supervisão): login do portal + checagem de acesso, sem a sidebar do portal.
  const profile = await Auth.requireAuth();
  if (!profile) return; // sem sessão: o portal já mandou para o login
  if (!await MSYTabAccess.canAccess('space', profile)) {
    window.location.replace('dashboard.html');
    return;
  }
  const content = document.getElementById('spaceApp');
  document.addEventListener('click', (event) => {
    if (event.target.closest('.sp-profile-modal')) return;
    const target = event.target.closest('[data-space-user]');
    if (!target || !target.dataset.spaceUser) return;
    event.stopPropagation();
    const person = workspace.profile(target.dataset.spaceUser);
    if (person) openProfileCard({ profile: person, ownProfile: person.id === profile.id, workspace });
  }, true);
  document.addEventListener('keydown', (event) => {
    if ((event.key !== 'Enter' && event.key !== ' ') || !event.target.matches('.sp-avatar[data-space-user]')) return;
    event.preventDefault();
    event.target.click();
  });
  const warpStarted = Date.now();

  const workspace = new Workspace(profile);
  const prefs = new SpacePrefs(profile.id);
  try {
    await Promise.all([workspace.load(), prefs.load()]);
  } catch (err) {
    console.error('[MSY][space] Erro ao carregar:', err);
    content.innerHTML = `<div class="sp-fatal">${icon('fa-triangle-exclamation')}<p>Erro ao carregar o MSY Space. Tente recarregar a página.</p><a class="btn btn-ghost" href="dashboard.html">Voltar ao Portal</a></div>`;
    return;
  }
  // A animação de entrada dura pelo menos um instante (sensação de "entrar em outro lugar").
  await new Promise((r) => setTimeout(r, Math.max(0, 900 - (Date.now() - warpStarted))));

  const online = new OnlinePresence(profile.id);
  online.start();
  workspace.subscribe();
  const voice = new VoiceController({ me: profile, prefs, online, workspace, toast });
  const pip = new CallPip({ voice, workspace, me: profile });

  content.innerHTML = `
    <div class="sp-app sp-enter">
      <nav class="sp-rail" aria-label="MSY Space">
        <span class="sp-rail-logo" title="MSY Space"><i class="fa-solid fa-satellite-dish"></i></span>
        <span class="sp-rail-sep"></span>
        <span class="sp-grow"></span>
        <a class="sp-rail-btn" href="dashboard.html" title="Voltar ao Portal" aria-label="Voltar ao Portal"><i class="fa-solid fa-house"></i></a>
      </nav>
      <aside class="sp-nav" aria-label="Canais do MSY Space"></aside>
      <div class="sp-nav-backdrop" data-close-nav></div>
      <section class="sp-main"></section>
    </div>`;
  const app = content.querySelector('.sp-app');
  const main = content.querySelector('.sp-main');
  const toggleNav = () => app.classList.toggle('is-nav-open');
  content.querySelector('[data-close-nav]').addEventListener('click', () => app.classList.remove('is-nav-open'));

  let view = null;
  let selectedId = null;
  let shellOn = false;

  const select = (id) => {
    const channel = workspace.getChannel(id);
    if (!channel) return;
    app.classList.remove('is-nav-open');
    if (shellOn) shell.showSpace();
    if (selectedId === id && view) return;
    view?.destroy();
    selectedId = id;
    nav.select(id);
    try { localStorage.setItem(LAST_CHANNEL_KEY, id); } catch { /* sem storage */ }
    history.replaceState(null, '', `space.html#c=${id}`);
    shell.spaceUrl = `space.html#c=${id}`;
    const ctx = { workspace, voice, online, pip, me: profile, onToggleNav: toggleNav, onLeftRoom: (closed) => { if (closed) showFirst(); } };
    view = channel.kind === 'voice' ? new VoiceRoomView(main, channel, ctx) : new ChatView(main, channel, ctx);
    view.mount();
    dock.render();
  };

  const showFirst = () => {
    const { groups } = workspace.grouped();
    const first = groups.flatMap((g) => g.channels).find((c) => c.kind === 'text') || workspace.channels[0];
    if (first) select(first.id);
    else main.innerHTML = `<div class="sp-lobby"><div class="sp-lobby-orb">${icon('fa-satellite-dish')}</div><h2>Nenhum canal ainda</h2><p class="sp-muted">A gestão do Space ainda não criou canais.</p></div>`;
  };

  const nav = new SpaceNav(content.querySelector('.sp-nav'), { workspace, voice, online, me: profile, onSelect: select });
  nav.mount();

  const shell = new CallShell({
    voice,
    onShowSpace: () => { if (voice.channelId) select(voice.channelId); dock.render(); },
    onShellChange: (on) => { shellOn = on; dock.render(); },
  });
  shell.install();

  const dock = new CallDock({
    voice, workspace, pip, me: profile,
    // A sala está na tela quando a moldura está fechada e o canal aberto é o da chamada.
    isRoomVisible: () => !shellOn && selectedId === voice.channelId,
    onOpenRoom: () => { if (shellOn) shell.showSpace(); else if (voice.channelId) select(voice.channelId); },
  });

  // Canal sumiu (sala encerrada / acesso removido): volta para um canal válido.
  workspace.addEventListener('change', () => {
    if (selectedId && !workspace.getChannel(selectedId)) showFirst();
  });

  // Abrir: link de sala (?sala=CODIGO), canal do endereço (#c=id), último canal ou o primeiro.
  const params = new URLSearchParams(location.search);
  const fromHash = /^#c=([0-9a-f-]{36})$/i.exec(location.hash)?.[1];
  const last = (() => { try { return localStorage.getItem(LAST_CHANNEL_KEY); } catch { return null; } })();
  if (params.get('sala')) {
    history.replaceState(null, '', 'space.html');
    await nav.joinByCode(params.get('sala'));
  }
  if (!selectedId) {
    const target = [fromHash, last].find((id) => id && workspace.getChannel(id));
    if (target) select(target); else showFirst();
  }

  window.addEventListener('pagehide', () => { online.stop(); workspace.close(); prefs.flushOnExit(); });
  // Aba indo para o fundo (no celular pode nunca mais voltar): grava as preferências pendentes.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') prefs.flushOnExit(); });
}

// Voltou pelo "voltar" do navegador (página restaurada do cache): as conexões em tempo real
// foram encerradas ao sair, então abre de novo do zero.
window.addEventListener('pageshow', (e) => { if (e.persisted) window.location.reload(); });

initSpace().catch((err) => {
  console.error('[MSY][space] Falha ao iniciar:', err);
  const content = document.getElementById('spaceApp');
  if (content) content.innerHTML = `<div class="sp-fatal"><p>${esc("Erro ao abrir o MSY Space. Tente recarregar a página.")}</p><a class="btn btn-ghost" href="dashboard.html">Voltar ao Portal</a></div>`;
});
