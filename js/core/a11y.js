/**
 * MSYA11y — melhorias leves para conteudo dinamico legado.
 * Classic script; nao altera regras de negocio.
 */
(function () {
  'use strict';

  const ICON_LABELS = [
    ['trash', 'Excluir'],
    ['xmark', 'Fechar'],
    ['times', 'Fechar'],
    ['pen', 'Editar'],
    ['eye', 'Visualizar'],
    ['download', 'Baixar'],
    ['check', 'Confirmar'],
    ['plus', 'Adicionar'],
    ['bell', 'Notificacoes'],
    ['bars', 'Abrir menu'],
    ['moon', 'Ativar modo escuro'],
    ['sun', 'Ativar modo claro'],
    ['magnifying-glass', 'Buscar'],
    ['arrow-left', 'Voltar'],
    ['rotate-left', 'Desfazer'],
  ];

  function enhance(root = document) {
    addSkipLink();
    enhanceButtons(root);
    enhanceInputs(root);
    enhanceImages(root);
    enhanceDialogs(root);
    enhanceTables(root);
  }

  function addSkipLink() {
    if (document.querySelector('.skip-link') || !document.querySelector('main')) return;
    const link = document.createElement('a');
    link.className = 'skip-link';
    link.href = '#pageContent';
    link.textContent = 'Pular para o conteudo';
    document.body.prepend(link);
  }

  function enhanceButtons(root) {
    root.querySelectorAll('button, [role="button"], a').forEach((el) => {
      if (!isInteractive(el)) return;
      if (!el.getAttribute('aria-label') && isIconOnly(el)) {
        el.setAttribute('aria-label', getLabel(el));
      }
      if (el.tagName === 'BUTTON' && !el.getAttribute('type')) {
        el.setAttribute('type', 'button');
      }
    });
  }

  function enhanceInputs(root) {
    root.querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.id && document.querySelector(`label[for="${cssEscape(el.id)}"]`)) return;
      if (el.getAttribute('aria-label')) return;
      const label = el.closest('.form-group')?.querySelector('.form-label')?.textContent?.trim()
        || el.placeholder
        || el.name
        || 'Campo';
      el.setAttribute('aria-label', label);
    });
  }

  function enhanceImages(root) {
    root.querySelectorAll('img:not([alt])').forEach((img) => {
      const label = img.closest('[data-name]')?.getAttribute('data-name')
        || img.closest('[title]')?.getAttribute('title')
        || img.closest('.avatar')?.getAttribute('title')
        || '';
      img.setAttribute('alt', label);
    });
  }

  function enhanceDialogs(root) {
    root.querySelectorAll('.modal, .modal-overlay').forEach((el) => {
      if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    });

    root.querySelectorAll('.modal-close:not([aria-label])').forEach((btn) => {
      btn.setAttribute('aria-label', 'Fechar modal');
    });
  }

  function enhanceTables(root) {
    root.querySelectorAll('table').forEach((table) => {
      if (table.closest('.table-scroll-wrap')) return;
      const wrap = document.createElement('div');
      wrap.className = 'table-scroll-wrap';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  function isInteractive(el) {
    return el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button';
  }

  function isIconOnly(el) {
    const text = Array.from(el.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent.trim())
      .join('');
    return !text && !!el.querySelector('i, svg');
  }

  function getLabel(el) {
    const explicit = el.getAttribute('title') || el.dataset.label;
    if (explicit) return explicit;
    const icon = el.querySelector('i[class*="fa-"]');
    const cls = icon?.className || el.className || '';
    const match = ICON_LABELS.find(([needle]) => String(cls).includes(needle));
    return match ? match[1] : 'Acao';
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/"/g, '\\"');
  }

  function observeDynamicContent() {
    const target = document.getElementById('pageContent') || document.body;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) enhance(node);
        });
      }
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const openModal = document.querySelector('.modal-overlay.open, .modal.open, #msy-confirm-overlay.open');
    const closeBtn = openModal?.querySelector('.modal-close, [data-close], #msy-confirm-cancel');
    if (closeBtn) closeBtn.click();
  });

  document.addEventListener('DOMContentLoaded', () => {
    enhance();
    observeDynamicContent();
  });

  window.MSYA11y = { enhance };
})();
