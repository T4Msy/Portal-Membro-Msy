/**
 * MSYTheme — toggle claro/escuro com persistência em localStorage.
 * Classic script. Aplica o tema antes do render para evitar flash.
 *
 * Usa: document.documentElement.dataset.theme = 'light' | 'dark'
 */
(function () {
  'use strict';

  const KEY      = 'msy_theme';
  const DARK_KEY = 'dark';
  const LIGHT_KEY = 'light';

  /* ── Aplicar tema imediatamente (antes do DOMContentLoaded) ── */
  const saved = safeGetTheme();
  if (saved === LIGHT_KEY) {
    document.documentElement.setAttribute('data-theme', LIGHT_KEY);
  }

  function safeGetTheme() {
    try {
      return localStorage.getItem(KEY);
    } catch (err) {
      console.warn('[MSY][theme] LocalStorage indisponivel:', err);
      return null;
    }
  }

  function _getTheme() {
    return document.documentElement.getAttribute('data-theme') === LIGHT_KEY
      ? LIGHT_KEY
      : DARK_KEY;
  }

  function _setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch (err) {
      console.warn('[MSY][theme] Falha ao persistir tema:', err);
    }
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.setAttribute('content', theme === LIGHT_KEY ? '#f5f3ef' : '#07070a');
    });
    _updateToggleBtn(theme);
  }

  function _updateToggleBtn(theme) {
    const btn = document.getElementById('msy-theme-toggle');
    if (!btn) return;
    const isDark = theme === DARK_KEY;
    btn.innerHTML      = isDark
      ? '<i class="fa-solid fa-sun"></i>'
      : '<i class="fa-solid fa-moon"></i>';
    btn.title          = isDark ? 'Ativar modo claro' : 'Ativar modo escuro';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', isDark ? 'false' : 'true');
  }

  function _injectToggleBtn() {
    if (document.getElementById('msy-theme-toggle')) return;
    const btn = document.createElement('button');
    btn.id = 'msy-theme-toggle';
    btn.setAttribute('tabindex', '0');
    document.body.appendChild(btn);
    _updateToggleBtn(_getTheme());

    btn.addEventListener('click', () => {
      const next = _getTheme() === DARK_KEY ? LIGHT_KEY : DARK_KEY;
      _setTheme(next);
    });
  }

  /* ── Registrar Service Worker (PWA caching) ─────────────── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .catch((err) => {
          console.warn('[MSY][pwa] Falha ao registrar service worker:', err);
        });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.page === 'login') return;
    _injectToggleBtn();
    _updateToggleBtn(_getTheme());
  });

  window.MSYTheme = { getTheme: _getTheme, setTheme: _setTheme };
})();
