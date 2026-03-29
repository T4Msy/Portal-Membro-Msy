/* ============================================================
   MSY PORTAL — PUSH.JS
   Web Push Notifications | Todos os dispositivos e plataformas
   ============================================================ */

'use strict';

/* ── Configuração VAPID ──────────────────────────────────────
   Gere suas chaves VAPID em: https://vapidkeys.com/
   ou via: npx web-push generate-vapid-keys
   A PUBLIC_KEY vai aqui. A PRIVATE_KEY fica no seu backend/Edge Function.
────────────────────────────────────────────────────────────── */
const PUSH_CONFIG = {
  VAPID_PUBLIC_KEY: 'COLOQUE-SUA-VAPID-PUBLIC-KEY-AQUI',

  // Edge Function que envia push notifications
  PUSH_ENDPOINT: `${MSY_CONFIG.SUPABASE_URL}/functions/v1/send-push`,
};

/* ============================================================
   PushManager — gerencia registro e preferências
   ============================================================ */
const PushManager = {

  /* Converte base64 para Uint8Array (necessário para VAPID) */
  _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = window.atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  },

  /* Detecta label do dispositivo para exibição na UI */
  _getDeviceLabel() {
    const ua = navigator.userAgent;
    let browser = 'Navegador';
    let os = 'Desktop';

    if (/CriOS/i.test(ua)) browser = 'Chrome';
    else if (/FxiOS/i.test(ua)) browser = 'Firefox';
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
    else if (/Chrome/i.test(ua)) browser = 'Chrome';
    else if (/Firefox/i.test(ua)) browser = 'Firefox';
    else if (/Edge/i.test(ua)) browser = 'Edge';

    if (/iPhone|iPad/i.test(ua)) os = 'iOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Mac/i.test(ua)) os = 'macOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

    return `${browser}/${os}`;
  },

  /* Verifica se push é suportado neste browser */
  isSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },

  /* Retorna o status atual da permissão */
  getPermissionStatus() {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission; // 'default' | 'granted' | 'denied'
  },

  /* Registra o service worker */
  async registerSW() {
    if (!this.isSupported()) throw new Error('Push não suportado neste browser');
    return await navigator.serviceWorker.register('/sw.js');
  },

  /* Solicita permissão e cria subscription */
  async subscribe(userId) {
    if (!this.isSupported()) throw new Error('Push não suportado');

    const reg = await this.registerSW();

    // Solicita permissão ao usuário
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Permissão negada pelo usuário');

    // Cria subscription no browser
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: this._urlBase64ToUint8Array(PUSH_CONFIG.VAPID_PUBLIC_KEY),
    });

    const subJSON  = sub.toJSON();
    const deviceLabel = this._getDeviceLabel();

    // Salva no Supabase
    const { error } = await db.from('push_subscriptions').upsert({
      user_id:      userId,
      endpoint:     subJSON.endpoint,
      p256dh:       subJSON.keys.p256dh,
      auth_key:     subJSON.keys.auth,
      device_label: deviceLabel,
    }, { onConflict: 'user_id,endpoint' });

    if (error) throw new Error('Erro ao salvar subscription: ' + error.message);

    return { sub, deviceLabel };
  },

  /* Remove subscription do browser e do banco */
  async unsubscribe(userId) {
    if (!this.isSupported()) return;

    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!reg) return;

    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    const endpoint = sub.endpoint;
    await sub.unsubscribe();

    // Remove do Supabase
    await db.from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint);
  },

  /* Verifica se este browser já tem subscription ativa */
  async isSubscribed() {
    if (!this.isSupported()) return false;
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!reg) return false;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch { return false; }
  },

  /* Envia push para um usuário via Edge Function */
  async sendToUser(userId, { title, body, url, icon }) {
    try {
      await fetch(PUSH_CONFIG.PUSH_ENDPOINT, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${MSY_CONFIG.SUPABASE_ANON_KEY}`,
          'apikey':          MSY_CONFIG.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ userId, title, body, url, icon }),
      });
    } catch (err) {
      console.warn('[Push] Falha ao enviar push:', err);
    }
  },

  /* Envia push para todos os membros (diretoria) */
  async sendToAll({ title, body, url, icon }) {
    try {
      await fetch(PUSH_CONFIG.PUSH_ENDPOINT, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${MSY_CONFIG.SUPABASE_ANON_KEY}`,
          'apikey':          MSY_CONFIG.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ all: true, title, body, url, icon }),
      });
    } catch (err) {
      console.warn('[Push] Falha ao enviar push em massa:', err);
    }
  },
};

/* ============================================================
   NotifPrefs — salva preferências de notificação no perfil
   ============================================================ */
const NotifPrefs = {

  /* Salva preferências no banco */
  async save(userId, { notif_push, notif_email, notif_email_address }) {
    const { error } = await db.from('profiles').update({
      notif_push:          notif_push  ?? true,
      notif_email:         notif_email ?? false,
      notif_email_address: notif_email_address || null,
    }).eq('id', userId);
    if (error) throw error;
  },

  /* Wrapper unificado: dispara notify_member + push + email conforme prefs */
  async dispatch(targetUserId, { message, type, icon, link, channels }) {
    // 1. Sempre grava no portal (tabela notifications)
    try {
      await db.rpc('notify_member', {
        p_user_id: targetUserId,
        p_message: message,
        p_type:    type    || 'info',
        p_icon:    icon    || '🔔',
        p_link:    link    || null,
      });
    } catch (_) {
      /* RPC opcional — falha silenciosa (compat. cliente Supabase sem .catch na cadeia) */
    }

    if (!channels || channels.length === 0) return;

    // Busca prefs do destinatário (se não for broadcast)
    if (targetUserId) {
      const { data: prefs } = await db.from('profiles')
        .select('notif_push, notif_email, notif_email_address, name')
        .eq('id', targetUserId)
        .single();

      if (prefs?.notif_push && channels.includes('push')) {
        await PushManager.sendToUser(targetUserId, {
          title: 'MSY Portal',
          body:  message,
          url:   link ? `/${link}` : '/dashboard.html',
          icon:  icon,
        });
      }

      // Email: o envio real requer backend/Edge Function com SMTP
      // A flag é gravada no banco para que o Edge Function processe
      if (prefs?.notif_email && channels.includes('email')) {
        await db.from('notifications')
          .update({ email_sent: false, channels: ['portal', 'email'] })
          .eq('user_id', targetUserId)
          .order('created_at', { ascending: false })
          .limit(1);
        // O Edge Function `send-email` monitora email_sent=false e despacha
      }
    } else {
      // Broadcast: send push to all members
      if (channels.includes('push')) {
        await PushManager.sendToAll({
          title: 'MSY Portal',
          body:  message,
          url:   link ? `/${link}` : '/dashboard.html',
        });
      }
    }
  },
};

/* ============================================================
   Inicialização automática do SW (registra em background)
   ============================================================ */
if (PushManager.isSupported()) {
  navigator.serviceWorker.register('/sw.js').catch(err => {
    console.warn('[MSY] SW não registrado:', err);
  });
}
