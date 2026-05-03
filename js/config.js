/* ============================================================
   MSY PORTAL — CONFIG.JS
   Configure aqui as credenciais do Supabase.
   Encontre em: Supabase Dashboard > Project Settings > API
   ============================================================ */

const MSY_CONFIG = {
  // ── Supabase ──────────────────────────────────────────────
  SUPABASE_URL:     'https://lldzgkxpoyqauxdcjyaw.supabase.co',   // Project URL
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsZHpna3hwb3lxYXV4ZGNqeWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1OTg4OTgsImV4cCI6MjA4OTE3NDg5OH0.HlYCSLVnDF2FlASgUCSyfd3ZMi1VJXCxHszOhwBy9KQ',               // anon public key

  // ── n8n Webhooks (preencha após criar os workflows) ───────
  N8N_WEBHOOKS: {
    NEW_MEMBER_NOTIFY:    'https://seu-n8n.com/webhook/new-member',
    ACTIVITY_SUBMITTED:   'https://seu-n8n.com/webhook/activity-submitted',
    COMUNICADO_PUBLISHED: 'https://seu-n8n.com/webhook/comunicado-published',
  },

  // ── Mercado Pago ──────────────────────────────────────────
  // Acesse: https://www.mercadopago.com.br/developers/panel
  // O access token nunca deve ficar no frontend. Use Edge Function/backend.
  MP_PUBLIC_KEY:   'TEST-COLOQUE-SUA-PUBLIC-KEY',   // Chave pública

  // ── App ───────────────────────────────────────────────────
  APP_NAME: 'MSY Portal',
  VERSION:  '2.0.0',
};

// Previne acesso se não configurado
if (
  MSY_CONFIG.SUPABASE_URL.includes('SEU-PROJETO') ||
  MSY_CONFIG.SUPABASE_ANON_KEY.includes('SUA-ANON')
) {
  console.warn('[MSY] ⚠️  Configure o config.js com suas credenciais do Supabase.');
}
