/* ============================================================
   MSY PORTAL — CONFIG.EXAMPLE.JS
   Copie para js/config.js em ambientes novos e preencha apenas
   valores publicos seguros para o frontend.
   ============================================================ */

const MSY_CONFIG = {
  // Supabase public project URL and anon key. A anon key is public by design.
  SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'SUA-ANON-PUBLIC-KEY',

  // Webhooks publicos opcionais. Segredos devem ficar no backend.
  N8N_WEBHOOKS: {
    NEW_MEMBER_NOTIFY: 'https://seu-n8n.com/webhook/new-member',
    ACTIVITY_SUBMITTED: 'https://seu-n8n.com/webhook/activity-submitted',
    COMUNICADO_PUBLISHED: 'https://seu-n8n.com/webhook/comunicado-published',
  },

  // Chave publica do Mercado Pago. O access token nunca vai no frontend.
  MP_PUBLIC_KEY: 'TEST-COLOQUE-SUA-PUBLIC-KEY',

  APP_NAME: 'MSY Portal',
  VERSION: '2.0.0',
};

if (
  MSY_CONFIG.SUPABASE_URL.includes('SEU-PROJETO') ||
  MSY_CONFIG.SUPABASE_ANON_KEY.includes('SUA-ANON')
) {
  console.warn('[MSY] Configure o config.js com as credenciais publicas do Supabase.');
}
