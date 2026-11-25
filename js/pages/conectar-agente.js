/* ============================================================
   MSY PORTAL — CONECTAR-AGENTE.JS
   Conecta o Agente MSY (plugin do Claude Code/Codex) à conta do membro.

   Fluxo: o comando `msy login` no computador do membro sobe um servidor em
   127.0.0.1:<porta> e abre esta página com ?porta=…&estado=…&computador=….
   O membro confirma a senha AQUI. Criamos uma sessão NOVA num cliente
   separado (não mexe na sessão do navegador) e entregamos o refresh token
   ao servidor local pelo fragmento (#), que não vai em requisição HTTP.
   O agente troca esse token na hora, então o que passou pelo navegador
   deixa de valer.

   Segurança: o destino é sempre http://127.0.0.1:<porta>/callback, com
   porta validada; nunca uma URL vinda do link (sem redirecionamento aberto).
   ============================================================ */
(function () {
  'use strict';

  var PORT_MIN = 1024;
  var PORT_MAX = 65535;
  var STATE_RE = /^[0-9a-f]{32,128}$/;

  function show(id) {
    ['stateLoading', 'stateInvalid', 'stateForm', 'stateDone'].forEach(function (s) {
      var el = document.getElementById(s);
      if (el) el.hidden = s !== id;
    });
  }

  function readRequest() {
    var q = new URLSearchParams(location.search);
    var port = Number(q.get('porta'));
    var state = String(q.get('estado') || '');
    if (!Number.isInteger(port) || port < PORT_MIN || port > PORT_MAX) return null;
    if (!STATE_RE.test(state)) return null;
    var computer = String(q.get('computador') || 'seu computador').replace(/[^\w .\-]/g, '').slice(0, 60) || 'seu computador';
    return { port: port, state: state, computer: computer };
  }

  function showError(msg) {
    var box = document.getElementById('agentError');
    document.getElementById('agentErrorMsg').textContent = msg;
    box.classList.add('show');
  }

  async function init() {
    var req = readRequest();
    if (!req || !window.supabase || typeof MSY_CONFIG === 'undefined') {
      if (!window.supabase) console.error('[MSY][conectar-agente] Supabase não carregou');
      show('stateInvalid');
      return;
    }
    // Tira os parâmetros da barra de endereço (o estado não deve ficar no histórico).
    history.replaceState(null, '', location.pathname);

    document.getElementById('agentComputer').textContent = req.computer;
    var emailInput = document.getElementById('agentEmail');

    // Se o membro já está logado no portal, preenche o e-mail (a sessão do navegador não é usada nem alterada).
    try {
      var portalDb = window.supabase.createClient(MSY_CONFIG.SUPABASE_URL, MSY_CONFIG.SUPABASE_ANON_KEY);
      var res = await portalDb.auth.getSession();
      var email = res && res.data && res.data.session && res.data.session.user && res.data.session.user.email;
      if (email) {
        emailInput.value = email;
        emailInput.readOnly = true;
      }
    } catch (err) {
      console.error('[MSY][conectar-agente] sessão do navegador', err);
    }

    show('stateForm');
    (emailInput.value ? document.getElementById('agentPass') : emailInput).focus();

    var form = document.getElementById('agentForm');
    var btn = document.getElementById('agentBtn');
    var busy = false;

    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (busy) return;
      document.getElementById('agentError').classList.remove('show');
      var mail = emailInput.value.trim();
      var pass = document.getElementById('agentPass').value;
      if (!mail || !pass) { showError('Preencha e-mail e senha.'); return; }

      busy = true;
      btn.disabled = true;
      btn.textContent = 'Conectando…';
      try {
        // Cliente isolado: não grava nada no navegador e não renova sozinho.
        var agentDb = window.supabase.createClient(MSY_CONFIG.SUPABASE_URL, MSY_CONFIG.SUPABASE_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'msy-agente-conexao' },
        });
        var out = await agentDb.auth.signInWithPassword({ email: mail, password: pass });
        if (out.error) throw out.error;
        var token = out.data && out.data.session && out.data.session.refresh_token;
        if (!token) throw new Error('sem sessão');

        show('stateDone');
        var hash = new URLSearchParams({ estado: req.state, token: token }).toString();
        location.replace('http://127.0.0.1:' + req.port + '/callback#' + hash);
      } catch (err) {
        console.error('[MSY][conectar-agente] login', err && err.message);
        var invalid = err && /invalid|credentials/i.test(String(err.message));
        showError(invalid ? 'E-mail ou senha inválidos.' : 'Não foi possível conectar agora. Tente novamente.');
        busy = false;
        btn.disabled = false;
        btn.textContent = 'Conectar agente';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
