/**
 * MSY Realtime — atualizações em tempo real para notificações e comunicados.
 * Classic script; carregado após app.js. Usa `db` do escopo global.
 *
 * Comportamento:
 *  - notifications INSERT  → atualiza badge + prepende item no dropdown
 *  - comunicados INSERT    → exibe toast informativo
 *
 * Inicializado automaticamente no DOMContentLoaded.
 * Limpeza automática via beforeunload.
 */
(function () {
  'use strict';

  let _channel = null;

  async function init() {
    if (typeof db === 'undefined') return;

    const { data: { session } } = await db.auth.getSession();
    if (!session?.user) return;

    const userId = session.user.id;

    _channel = db
      .channel('msy-realtime-global')

      // ── Nova notificação para este usuário ──────────────
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        _handleNewNotif(payload.new);
      })

      // ── Novo comunicado publicado ────────────────────────
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'comunicados',
      }, (payload) => {
        _handleNewComunicado(payload.new);
      })

      // ── Mudança de tier/status no próprio perfil ─────────
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'profiles',
        filter: `id=eq.${userId}`,
      }, (payload) => {
        _handleProfileChange(payload.old, payload.new);
      })

      // ── Mudança de permissões do próprio membro ──────────
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'member_permissions',
        filter: `user_id=eq.${userId}`,
      }, () => {
        _warnPermissionChange();
      })

      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[MSY Realtime] Erro no canal — reconectando em 10s...');
          setTimeout(init, 10_000);
        }
      });
  }

  function _handleNewNotif(notif) {
    // Atualizar badge
    const badge = document.querySelector('.notif-count');
    if (badge) {
      const current = parseInt(badge.textContent, 10) || 0;
      badge.textContent = current + 1;
    } else {
      const bell = document.querySelector('.notif-bell');
      if (bell && !bell.querySelector('.notif-count')) {
        const span = document.createElement('span');
        span.className = 'notif-count';
        span.textContent = '1';
        bell.appendChild(span);
      }
    }

    // Prepender no dropdown (se existir e estiver aberto)
    const list = document.querySelector('#notifDropdown');
    if (list) {
      const emptyMsg = list.querySelector('[style*="Sem notificações"]');
      if (emptyMsg) emptyMsg.remove();

      const item = document.createElement('div');
      item.className = 'notif-item unread';
      item.dataset.id = notif.id;

      const escFn = typeof Utils !== 'undefined' ? Utils.escapeHtml : (s) => String(s).replace(/</g, '&lt;');
      const fmtFn = typeof Utils !== 'undefined' ? Utils.formatDate : (s) => new Date(s).toLocaleDateString('pt-BR');

      item.innerHTML = `
        <div class="notif-item-icon">${notif.icon || '🔔'}</div>
        <div class="notif-item-text">
          <div class="notif-item-msg">${escFn(notif.message || '')}</div>
          <div class="notif-item-time">${fmtFn(notif.created_at)}</div>
        </div>
      `;

      const header = list.querySelector('.notif-dropdown-header');
      if (header) header.after(item);
      else list.prepend(item);
    }

    // Toast discreto
    if (typeof Utils !== 'undefined') {
      Utils.showToast(`${notif.icon || '🔔'} ${notif.message || 'Nova notificação'}`, 'info');
    }
  }

  function _handleNewComunicado(com) {
    if (typeof Utils === 'undefined') return;
    const titulo = com.title || 'Novo comunicado';
    Utils.showToast(`📢 ${titulo} — acesse Comunicados para ler.`, 'info');
  }

  function _handleProfileChange(oldRow, newRow) {
    const tierChanged   = oldRow && newRow && oldRow.tier   !== newRow.tier;
    const statusChanged = oldRow && newRow && oldRow.status !== newRow.status;

    if (tierChanged || statusChanged) {
      _showReloadBanner(
        statusChanged && newRow.status === 'inativo'
          ? 'Sua conta foi desativada. Faça login novamente.'
          : 'Seu cargo foi alterado. Recarregue para aplicar as mudanças.',
      );
    }
  }

  function _warnPermissionChange() {
    _showReloadBanner('Suas permissões foram atualizadas. Recarregue para aplicar.');
  }

  function _showReloadBanner(msg) {
    const existing = document.getElementById('msy-reload-banner');
    if (existing) return;

    const banner = document.createElement('div');
    banner.id = 'msy-reload-banner';
    banner.style.cssText = [
      'position:fixed;top:0;left:0;right:0;z-index:99999',
      'background:#b91c1c;color:#fff;font-size:0.85rem',
      'padding:10px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px',
      'box-shadow:0 2px 8px rgba(0,0,0,0.5)',
    ].join(';');

    banner.innerHTML = `
      <span>⚠️ ${msg}</span>
      <button onclick="location.reload()"
        style="background:#fff;color:#b91c1c;border:none;border-radius:6px;padding:5px 14px;font-size:0.82rem;font-weight:700;cursor:pointer">
        Recarregar
      </button>
    `;
    document.body.prepend(banner);
  }

  function destroy() {
    if (_channel) {
      db.removeChannel(_channel);
      _channel = null;
    }
  }

  window.MSYRealtime = { init, destroy };

  document.addEventListener('DOMContentLoaded', () => {
    init().catch((e) => console.warn('[MSY Realtime] Falha na inicialização:', e));
  });

  window.addEventListener('beforeunload', destroy);
})();
