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
import { esc, icon, toast } from './ui/dom.js';

const { renderSidebar, renderTopBar } = window.MSY;
const LAST_CHANNEL_KEY = 'msy_space_last_channel';

async function initSpace() {
  const profile = await renderSidebar('space');
  if (!profile) return; // sem acesso: o portal já redirecionou
  await renderTopBar('MSY Space', profile);

  const content = document.getElementById('pageContent');
  content.classList.add('sp-page');
  content.innerHTML = `<div class="loading-container">${icon('fa-circle-notch fa-spin')} Carregando o MSY Space...</div>`;

  const workspace = new Workspace(profile);
  const prefs = new SpacePrefs(profile.id);
  try {
    await Promise.all([workspace.load(), prefs.load()]);
  } catch (err) {
    console.error('[MSY][space] Erro ao carregar:', err);
    content.innerHTML = '<div class="empty-state">Erro ao carregar o MSY Space. Tente recarregar a página.</div>';
    return;
  }

  const online = new OnlinePresence(profile.id);
  online.start();
  workspace.subscribe();
  const voice = new VoiceController({ me: profile, prefs, online, workspace, toast });

  content.innerHTML = `
    <div class="sp-app">
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
    const ctx = { workspace, voice, online, me: profile, onToggleNav: toggleNav, onLeftRoom: (closed) => { if (closed) showFirst(); } };
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
    voice, workspace, me: profile,
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

  window.addEventListener('pagehide', () => { online.stop(); workspace.close(); prefs.flush(); });
}

initSpace().catch((err) => {
  console.error('[MSY][space] Falha ao iniciar:', err);
  const content = document.getElementById('pageContent');
  if (content) content.innerHTML = `<div class="empty-state">${esc('Erro ao abrir o MSY Space. Tente recarregar a página.')}</div>`;
});
