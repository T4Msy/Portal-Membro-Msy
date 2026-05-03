/**
 * MSYConfirm — substitui confirmacao nativa do navegador por modal visual premium.
 * Classic script, carregado após app.js.
 *
 * API:
 *   await MSYConfirm.show('Mensagem')                          → true | false
 *   await MSYConfirm.show('Mensagem', { title, type, danger }) → true | false
 *
 * type: 'danger' | 'warn' | 'info' (default: 'danger' para confirmações destrutivas)
 */
const MSYConfirm = (() => {
  'use strict';

  const ICON_MAP = {
    danger: '<i class="fa-solid fa-triangle-exclamation"></i>',
    warn:   '<i class="fa-solid fa-circle-exclamation"></i>',
    info:   '<i class="fa-solid fa-circle-question"></i>',
  };

  let _overlay = null;
  let _resolve  = null;
  let _cleanup  = null;
  let _previousFocus = null;

  function _ensureDOM() {
    if (_overlay) return;

    _overlay = document.createElement('div');
    _overlay.id = 'msy-confirm-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-labelledby', 'msy-confirm-title');
    _overlay.setAttribute('aria-describedby', 'msy-confirm-body');

    _overlay.innerHTML = `
      <div id="msy-confirm-box">
        <div id="msy-confirm-header">
          <div id="msy-confirm-icon" class="danger"></div>
          <div id="msy-confirm-title"></div>
        </div>
        <div id="msy-confirm-body"></div>
        <div id="msy-confirm-footer">
          <button class="btn btn-ghost btn-sm" id="msy-confirm-cancel">Cancelar</button>
          <button class="btn btn-primary btn-sm" id="msy-confirm-ok">Confirmar</button>
        </div>
      </div>
    `;

    document.body.appendChild(_overlay);

    _overlay.addEventListener('click', (e) => {
      if (e.target === _overlay) _dismiss(false);
    });

    document.getElementById('msy-confirm-cancel').addEventListener('click', () => _dismiss(false));
    document.getElementById('msy-confirm-ok').addEventListener('click', () => _dismiss(true));
  }

  function _dismiss(result) {
    if (!_overlay) return;
    _overlay.classList.remove('open');
    document.removeEventListener('keydown', _onKey);
    if (_cleanup) { _cleanup(); _cleanup = null; }
    if (_resolve) { _resolve(result); _resolve = null; }
    if (_previousFocus && typeof _previousFocus.focus === 'function') {
      _previousFocus.focus();
    }
    _previousFocus = null;
  }

  function _onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); _dismiss(false); }
    if (e.key === 'Enter')  { e.preventDefault(); _dismiss(true);  }
    if (e.key !== 'Tab' || !_overlay?.classList.contains('open')) return;

    const focusables = [..._overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.disabled && el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /**
   * @param {string} message
   * @param {{ title?: string, type?: 'danger'|'warn'|'info', confirmText?: string, cancelText?: string }} [opts]
   * @returns {Promise<boolean>}
   */
  function show(message, {
    title       = 'Confirmar ação',
    type        = 'danger',
    confirmText = 'Confirmar',
    cancelText  = 'Cancelar',
  } = {}) {
    return new Promise((resolve) => {
      _ensureDOM();

      document.getElementById('msy-confirm-icon').className = type;
      document.getElementById('msy-confirm-icon').innerHTML  = ICON_MAP[type] || ICON_MAP.danger;
      document.getElementById('msy-confirm-title').textContent = title;
      document.getElementById('msy-confirm-body').textContent  = message;

      const okBtn  = document.getElementById('msy-confirm-ok');
      const canBtn = document.getElementById('msy-confirm-cancel');
      okBtn.textContent  = confirmText;
      canBtn.textContent = cancelText;

      okBtn.className = type === 'danger'
        ? 'btn btn-primary btn-sm'
        : 'btn btn-gold btn-sm';

      _resolve = resolve;
      _previousFocus = document.activeElement;

      _overlay.classList.add('open');
      document.addEventListener('keydown', _onKey);

      requestAnimationFrame(() => {
        okBtn.focus();
      });
    });
  }

  return { show };
})();

window.MSYConfirm = MSYConfirm;
