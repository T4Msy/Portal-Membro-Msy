/* ============================================================
   MSY PORTAL — PUSH.JS
   Web Push Notifications | Todos os dispositivos e plataformas
   ============================================================ */

   'use strict';

   const PUSH_CONFIG = {
     VAPID_PUBLIC_KEY:  'BLhU7dYmzQxxgCAmvSV8pN1oZODjoSmHjSEi0EIS-rbG3WcH6o-GjaoYvVWGyhtGmVts1_plszGPJMFw_3eeFpI',
     PUSH_ENDPOINT:    `${MSY_CONFIG.SUPABASE_URL}/functions/v1/send-push`,
     EMAIL_ENDPOINT:   `${MSY_CONFIG.SUPABASE_URL}/functions/v1/send-email`,
     SUPABASE_ANON_KEY: MSY_CONFIG.SUPABASE_ANON_KEY,
   };
   
   /* ============================================================
      PushManager — gerencia registro e preferências
      ============================================================ */
   /** @global {object} PushManager — gerencia subscrição de Web Push (VAPID).
    *  Usa service worker em /sw.js. Credenciais via PUSH_CONFIG (derivado de MSY_CONFIG). */
   const PushManager = {
   
     _urlBase64ToUint8Array(base64String) {
       const padding = '='.repeat((4 - base64String.length % 4) % 4);
       const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
       const raw     = window.atob(base64);
       return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
     },
   
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
   
     isSupported() {
       return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
     },
   
     getPermissionStatus() {
       if (!this.isSupported()) return 'unsupported';
       return Notification.permission;
     },
   
     async registerSW() {
       if (!this.isSupported()) throw new Error('Push não suportado neste browser');
       return await navigator.serviceWorker.register('/sw.js');
     },
   
     async subscribe(userId) {
       if (!this.isSupported()) throw new Error('Push não suportado');
   
       const reg = await this.registerSW();
   
       const permission = await Notification.requestPermission();
       if (permission !== 'granted') throw new Error('Permissão negada pelo usuário');
   
       const sub = await reg.pushManager.subscribe({
         userVisibleOnly:      true,
         applicationServerKey: this._urlBase64ToUint8Array(PUSH_CONFIG.VAPID_PUBLIC_KEY),
       });
   
       const subJSON     = sub.toJSON();
       const deviceLabel = this._getDeviceLabel();
   
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
   
     async unsubscribe(userId) {
       if (!this.isSupported()) return;
   
       const reg = await navigator.serviceWorker.getRegistration('/sw.js');
       if (!reg) return;
   
       const sub = await reg.pushManager.getSubscription();
       if (!sub) return;
   
       const endpoint = sub.endpoint;
       await sub.unsubscribe();
   
       await db.from('push_subscriptions')
         .delete()
         .eq('user_id', userId)
         .eq('endpoint', endpoint);
     },
   
     async isSubscribed() {
       if (!this.isSupported()) return false;
       try {
         const reg = await navigator.serviceWorker.getRegistration('/sw.js');
         if (!reg) return false;
         const sub = await reg.pushManager.getSubscription();
         return !!sub;
       } catch { return false; }
     },
   
     _headers() {
       return {
         'Content-Type':  'application/json',
         'Authorization': `Bearer ${PUSH_CONFIG.SUPABASE_ANON_KEY}`,
         'apikey':         PUSH_CONFIG.SUPABASE_ANON_KEY,
       };
     },
   
     async sendToUser(userId, { title, body, url, icon }) {
       try {
         await fetch(PUSH_CONFIG.PUSH_ENDPOINT, {
           method:  'POST',
           headers: this._headers(),
           body:    JSON.stringify({ userId, title, body, url, icon }),
         });
       } catch (err) {
         console.warn('[Push] Falha ao enviar push:', err);
       }
     },
   
     async sendToAll({ title, body, url, icon }) {
       try {
         await fetch(PUSH_CONFIG.PUSH_ENDPOINT, {
           method:  'POST',
           headers: this._headers(),
           body:    JSON.stringify({ all: true, title, body, url, icon }),
         });
       } catch (err) {
         console.warn('[Push] Falha ao enviar push em massa:', err);
       }
     },
   };
   
   /* ============================================================
      EmailManager — envia email via Edge Function send-email
      ============================================================ */
   /** @global {object} EmailManager — envia emails via Edge Function send-email (Resend API). */
   const EmailManager = {
   
     _headers() {
       return {
         'Content-Type':  'application/json',
         'Authorization': `Bearer ${PUSH_CONFIG.SUPABASE_ANON_KEY}`,
         'apikey':         PUSH_CONFIG.SUPABASE_ANON_KEY,
       };
     },
   
     async sendToUser(userId, { subject, message }) {
       try {
         await fetch(PUSH_CONFIG.EMAIL_ENDPOINT, {
           method:  'POST',
           headers: this._headers(),
           body:    JSON.stringify({ userId, subject, message }),
         });
       } catch (err) {
         console.warn('[Email] Falha ao enviar email:', err);
       }
     },
   
     async sendToAll({ subject, message }) {
       try {
         await fetch(PUSH_CONFIG.EMAIL_ENDPOINT, {
           method:  'POST',
           headers: this._headers(),
           body:    JSON.stringify({ all: true, subject, message }),
         });
       } catch (err) {
         console.warn('[Email] Falha ao enviar email em massa:', err);
       }
     },
   };
   
   /* ============================================================
      NotifPrefs — salva preferências e despacha notificações
      ============================================================ */
   /** @global {object} NotifPrefs — salva preferências de notificação do usuário
    *  e despacha notificações via push, email ou in-app. */
   const NotifPrefs = {
   
     async save(userId, { notif_push, notif_email, notif_email_address }) {
       const { error } = await db.from('profiles').update({
         notif_push:          notif_push  ?? true,
         notif_email:         notif_email ?? false,
         notif_email_address: notif_email_address || null,
       }).eq('id', userId);
       if (error) throw error;
     },
   
     async dispatch(targetUserId, { message, type, icon, link, channels }) {
       // 1. Sempre grava no portal (tabela notifications)
       try {
         await db.rpc('notify_member', {
           p_user_id: targetUserId,
           p_message: message,
           p_type:    type || 'info',
           p_icon:    icon || '🔔',
           p_link:    link || null,
         });
       } catch (_) {}
   
       if (!channels || channels.length === 0) return;
   
       if (targetUserId) {
         // Notificação para um membro específico
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
   
         if (prefs?.notif_email && channels.includes('email')) {
           await EmailManager.sendToUser(targetUserId, {
             subject: 'Notificação — MSY Portal',
             message: message,
           });
         }
   
       } else {
         // Broadcast para todos os membros
         if (channels.includes('push')) {
           await PushManager.sendToAll({
             title: 'MSY Portal',
             body:  message,
             url:   link ? `/${link}` : '/dashboard.html',
           });
         }
   
         if (channels.includes('email')) {
           await EmailManager.sendToAll({
             subject: 'Notificação — MSY Portal',
             message: message,
           });
         }
       }
     },
   };
   
   /* ============================================================
      Inicialização automática do SW
      ============================================================ */
   if (PushManager.isSupported()) {
     navigator.serviceWorker.register('/sw.js').catch(err => {
       console.warn('[MSY] SW não registrado:', err);
     });
   }