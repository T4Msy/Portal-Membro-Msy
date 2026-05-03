/* ============================================================
   MSY PORTAL — PAYMENTS.JS
   Integração Mercado Pago | Mensalidade Masayoshi Order
   ============================================================ */

'use strict';

/* ── Configuração ────────────────────────────────────────────
   Preencha com suas credenciais do Mercado Pago.
   Acesse: https://www.mercadopago.com.br/developers/panel
   ─────────────────────────────────────────────────────────── */
const MP_CONFIG = {
  // URL base do seu site (para redirect após pagamento)
  BASE_URL: 'https://t4msy.github.io/Portal-Membro-Msy',

  VALOR_MENSALIDADE: 10.00,
  DESCRICAO: 'Mensalidade MSY – Masayoshi Order',

  // Edge Function que cria a preferência com segurança (ACCESS_TOKEN fica no servidor)
  EDGE_CREATE_PREF: `${MSY_CONFIG.SUPABASE_URL}/functions/v1/create-mp-preference`,
};

/* ============================================================
   MercadoPago SDK Loader
   ============================================================ */
const PaymentSDK = {
  _loaded: false,
  async load() {
    if (this._loaded) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://sdk.mercadopago.com/js/v2';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Falha ao carregar SDK do Mercado Pago'));
      document.head.appendChild(s);
    });
    this._loaded = true;
  }
};

/* ============================================================
   Payments — Métodos principais
   ============================================================ */
const Payments = {

  /* Retorna o mês de referência atual no formato AAAA-MM */
  getMesAtual() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  },

  /* Formata mês para exibição: '2026-03' → 'Março/2026' */
  formatMes(mesRef) {
    if (!mesRef) return '—';
    const [year, month] = mesRef.split('-');
    const meses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${meses[parseInt(month)]}/${year}`;
  },

  /* Busca status da mensalidade do usuário no mês atual */
  async getStatusAtual(userId) {
    const mesAtual = this.getMesAtual();
    const { data, error } = await db
      .from('mensalidades')
      .select('*')
      .eq('user_id', userId)
      .eq('mes_referencia', mesAtual)
      .maybeSingle();

    if (error) {
      console.error('[Payments] Erro ao buscar mensalidade:', error);
      return null;
    }
    return data; // null = não existe registro (pendente)
  },

  /* Busca status de TODOS os membros ativos (para painel Diretoria) */
  async getStatusTodos() {
    const mesAtual = this.getMesAtual();

    // Busca membros ativos com suas mensalidades do mês
    const { data: members, error: mErr } = await db
      .from('profiles')
      .select('id, name, role, tier, avatar_url, color, initials')
      .eq('status', 'ativo')
      .order('name');

    if (mErr || !members) return [];

    const { data: mensalidades } = await db
      .from('mensalidades')
      .select('user_id, status, data_pagamento')
      .eq('mes_referencia', mesAtual);

    const mensMap = {};
    (mensalidades || []).forEach(m => { mensMap[m.user_id] = m; });

    return members.map(m => ({
      ...m,
      mensalidade: mensMap[m.id] || null,
      status_mensalidade: mensMap[m.id]?.status || 'pendente',
    }));
  },

  /* ──────────────────────────────────────────────────────────
     Criar preferência de pagamento via Mercado Pago (backend)
     ──────────────────────────────────────────────────────────
     ⚠️  O ACCESS_TOKEN nunca deve ficar exposto no frontend.
         Em produção, mova esta lógica para um Supabase Edge
         Function ou servidor backend próprio.
         Para fins de desenvolvimento, a chamada está aqui.
  ────────────────────────────────────────────────────────── */
  async criarPreferencia(profile) {
    const mesAtual = this.getMesAtual();

    // Busca a sessão atual para enviar o token de autenticação
    const { data: { session } } = await db.auth.getSession();
    if (!session) throw new Error('Sessão expirada. Faça login novamente.');

    // Chama a Edge Function — o ACCESS_TOKEN fica seguro no servidor
    const resp = await fetch(MP_CONFIG.EDGE_CREATE_PREF, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        baseUrl:  MP_CONFIG.BASE_URL,
        mesAtual,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      let msg = `HTTP ${resp.status}`;
      try { const j = JSON.parse(text); msg = j.error || j.message || msg; } catch (_) { if (text) msg = text.slice(0, 120); }
      console.error('[Payments] Edge Function erro:', resp.status, text);
      throw new Error(msg);
    }

    return await resp.json(); // { id, init_point, sandbox_init_point }
  },

  /* Salva preferência de pagamento no banco antes do redirect */
  async salvarPreferencia(userId, preferenceId) {
    const mesAtual = this.getMesAtual();

    // Verifica se já existe registro no mês
    const { data: existente } = await db
      .from('mensalidades')
      .select('id')
      .eq('user_id', userId)
      .eq('mes_referencia', mesAtual)
      .maybeSingle();

    if (existente) {
      // Atualiza preferência existente
      await db.from('mensalidades')
        .update({ mp_preference_id: preferenceId, status: 'pendente', updated_at: new Date().toISOString() })
        .eq('id', existente.id);
    } else {
      // Cria novo registro
      await db.from('mensalidades').insert({
        user_id:         userId,
        mes_referencia:  mesAtual,
        status:          'pendente',
        mp_preference_id: preferenceId,
        valor:           MP_CONFIG.VALOR_MENSALIDADE,
      });
    }
  },

  /* Confirma pagamento aprovado (chamado no retorno do MP) */
  async confirmarPagamento(userId, paymentId, mesRef) {
    const { data: existente } = await db
      .from('mensalidades')
      .select('id')
      .eq('user_id', userId)
      .eq('mes_referencia', mesRef)
      .maybeSingle();

    const payload = {
      status:         'pago',
      data_pagamento: new Date().toISOString(),
      mp_payment_id:  paymentId,
      mes_referencia: mesRef,
      updated_at:     new Date().toISOString(),
    };

    if (existente) {
      await db.from('mensalidades').update(payload).eq('id', existente.id);
    } else {
      await db.from('mensalidades').insert({
        user_id:   userId,
        valor:     MP_CONFIG.VALOR_MENSALIDADE,
        ...payload,
      });
    }

    // Notificação interna
    await db.rpc('notify_member', {
      p_user_id: userId,
      p_message: `✅ Mensalidade de ${this.formatMes(mesRef)} confirmada!`,
      p_type:    'success',
      p_icon:    '💳',
      p_link:    'mensalidade.html',
    }).catch(err => console.error('[MSY] Erro ao enviar notificação de mensalidade:', err));
  },

  /* Inicia fluxo completo de pagamento */
  async iniciarPagamento(profile) {
    const btn = document.getElementById('btnPagarMensalidade');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Aguarde...';
    }

    try {
      const pref = await this.criarPreferencia(profile);
      await this.salvarPreferencia(profile.id, pref.id);

      // Redireciona para checkout (sandbox ou produção)
      const url = pref.init_point;
      window.location.href = url;
    } catch (err) {
      console.error('[Payments]', err);
      Utils.showToast(`Erro: ${err.message || 'Tente novamente.'}`, 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-brands fa-pix"></i> Pagar Mensalidade — R$10,00';
      }
    }
  },

  /* Processa retorno da URL do Mercado Pago */
  async processarRetorno(profile) {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');

    if (!status) return false; // Acesso normal, não é retorno

    // Limpa URL imediatamente
    window.history.replaceState({}, '', 'mensalidade.html');

    if (status === 'success') {
      const paymentId = params.get('payment_id') || params.get('collection_id') || 'manual';
      const mesRef    = params.get('mes') || this.getMesAtual();
      await this.confirmarPagamento(profile.id, paymentId, mesRef);
      Utils.showToast('🎉 Pagamento confirmado! Mensalidade quitada.', 'success');
      return 'success';
    }

    if (status === 'pending') {
      Utils.showToast('⏳ Pagamento em processamento. Aguarde a confirmação.', 'info');
      return 'pending';
    }

    if (status === 'failure') {
      Utils.showToast('❌ Pagamento não concluído. Tente novamente.', 'error');
      return 'failure';
    }

    return false;
  },
};
