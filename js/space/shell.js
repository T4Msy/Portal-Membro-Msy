// Chamada persistente (pedido do dono: a chamada continua enquanto a pessoa usa o portal).
//
// O portal é multipágina: clicar em "Atividades" recarregaria a página e derrubaria a chamada.
// Durante uma chamada, os cliques em links do portal não trocam a página: a janela principal
// (que segura a chamada) mostra a outra página num <iframe> de tela cheia. O cartão flutuante
// (CallDock) fica por cima. Ao sair da chamada, a página do iframe vira a página normal.
// Mesmo domínio → mesma sessão de login; as outras páginas não precisam saber de nada disso.
// Detalhes: docs/msy-space/README.md ("Chamada persistente").

const SPACE_PAGE = 'space.html';

function samePortalPage(url) {
  return url.origin === location.origin && /\.html$/.test(url.pathname) && !url.pathname.endsWith('/offline.html');
}

export class CallShell {
  constructor({ voice, onShowSpace, onShellChange }) {
    this.voice = voice;
    this.onShowSpace = onShowSpace;
    this.onShellChange = onShellChange;
    this.frame = null;
    this.on = false;
    this.spaceUrl = location.pathname + location.search + location.hash;
  }

  install() {
    // Captura antes dos handlers da página: só age com chamada ativa.
    document.addEventListener('click', (e) => this.interceptClick(e, document), true);
    window.addEventListener('beforeunload', (e) => {
      if (!this.voice.active) return;
      e.preventDefault();
      e.returnValue = 'Você está numa chamada do MSY Space. Sair da página encerra a chamada.';
    });
    this.voice.addEventListener('change', () => {
      // A chamada acabou com a moldura aberta: a página do portal vira a página de verdade.
      if (this.on && !this.voice.active) {
        const href = this.frameHref();
        if (href) location.replace(href);
      }
    });
  }

  /** Link clicado: com chamada ativa, abre dentro da moldura em vez de trocar a página. */
  interceptClick(e, doc) {
    if (!this.voice.active || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    let url;
    try { url = new URL(a.getAttribute('href'), doc.location.href); } catch { return; }
    if (!samePortalPage(url)) return;
    e.preventDefault();
    e.stopPropagation();
    if (url.pathname.endsWith(`/${SPACE_PAGE}`)) this.showSpace();
    else this.open(url.href);
  }

  open(href) {
    if (!this.frame) {
      this.frame = document.createElement('iframe');
      this.frame.className = 'sp-shell-frame';
      this.frame.title = 'Portal MSY';
      this.frame.setAttribute('allow', 'clipboard-write; fullscreen');
      this.frame.addEventListener('load', () => this.onFrameLoad());
      document.body.appendChild(this.frame);
    }
    if (this.frameHref() !== href) this.frame.src = href;
    this.setOn(true);
  }

  showSpace() {
    this.setOn(false);
    history.replaceState(null, '', this.spaceUrl);
    document.title = 'MSY Portal — MSY Space';
    this.onShowSpace?.();
  }

  setOn(on) {
    this.on = on;
    document.documentElement.classList.toggle('sp-shell-on', on);
    this.onShellChange?.(on);
  }

  frameHref() {
    try { return this.frame?.contentWindow?.location.href || null; } catch { return null; }
  }

  onFrameLoad() {
    let doc;
    try { doc = this.frame.contentDocument; } catch { return; }
    if (!doc) return;
    const href = this.frameHref();
    // Saiu do portal (logout): encerra a chamada e segue para o login de verdade.
    if (href && /\/login\.html/.test(href)) {
      this.voice.leave();
      location.replace(href);
      return;
    }
    // Endereço e título acompanham a página aberta (recarregar abre essa página normalmente).
    if (this.on && href) {
      const url = new URL(href);
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    document.title = doc.title || document.title;
    // Links dentro da moldura: "MSY Space" volta para a sala; o resto navega na própria moldura.
    doc.addEventListener('click', (e) => {
      if (!this.voice.active) return;
      const a = e.target.closest?.('a[href]');
      if (!a) return;
      let url;
      try { url = new URL(a.getAttribute('href'), doc.location.href); } catch { return; }
      if (samePortalPage(url) && url.pathname.endsWith(`/${SPACE_PAGE}`)) {
        e.preventDefault();
        e.stopPropagation();
        this.showSpace();
      }
    }, true);
  }
}
