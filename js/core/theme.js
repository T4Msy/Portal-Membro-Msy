/**
 * MSYTheme — tema claro/escuro com persistência em localStorage.
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
    _syncThemeControls(theme);
    window.dispatchEvent(new CustomEvent('msy:themechange', { detail: { theme } }));
  }

  function _syncThemeControls(theme = _getTheme()) {
    document.querySelectorAll('[data-msy-theme-option]').forEach((btn) => {
      const active = btn.dataset.msyThemeOption === theme;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function bindControls(root = document) {
    root.querySelectorAll('[data-msy-theme-option]').forEach((btn) => {
      if (btn.dataset.themeBound === 'true') return;
      btn.dataset.themeBound = 'true';
      btn.addEventListener('click', () => _setTheme(btn.dataset.msyThemeOption));
    });
    _syncThemeControls();
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
    bindControls();
  });

  window.MSYTheme = { getTheme: _getTheme, setTheme: _setTheme, bindControls, syncControls: _syncThemeControls };
})();
