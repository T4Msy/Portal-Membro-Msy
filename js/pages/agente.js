/* ============================================================
   MSY PORTAL — PÁGINA AGENTE MSY
   Membro: apps em que conectou o agente e o histórico do que o agente
   fez com a conta dele. Diretoria: o mesmo para toda a Ordem.
   Fontes: agent_sessions, agent_audit e bot_messages (via = agente).
   As policies do banco já limitam cada um ao que pode ver.
   ============================================================ */

const { db, Utils, renderSidebar, renderTopBar } = window.MSY;
const esc = value => Utils.escapeHtml(String(value ?? ''));

const PAGE = 60;

const ACOES = {
  enviar_whatsapp: ['fa-brands fa-whatsapp', 'Mensagem no WhatsApp'],
  disparo: ['fa-solid fa-paper-plane', 'Disparo no privado'],
  corvus: ['fa-solid fa-crow', 'Mudou o Corvus'],
  criar_atividade: ['fa-solid fa-list-check', 'Criou atividade'],
  registrar_observacao: ['fa-solid fa-eye', 'Observação na Supervisão'],
  criar_evento: ['fa-solid fa-calendar-plus', 'Criou evento'],
  editar_evento: ['fa-solid fa-calendar-days', 'Editou evento'],
  responder_evento: ['fa-solid fa-calendar-check', 'Respondeu evento'],
  registrar_presenca: ['fa-solid fa-user-check', 'Registrou presença'],
  revisar_justificativa: ['fa-solid fa-scale-balanced', 'Revisou justificativa'],
  relatorio_evento: ['fa-solid fa-file-lines', 'Relatório de evento'],
  publicar_comunicado: ['fa-solid fa-bullhorn', 'Publicou comunicado'],
  publicar_jornal: ['fa-solid fa-newspaper', 'Publicou no Jornal'],
  aviso_jornal: ['fa-solid fa-scroll', 'Aviso no letreiro'],
};

const DETALHES = {
  acao: 'ação', enviados: 'enviados', falhas: 'falhas', membro: 'membro', titulo: 'título', ativo: 'ativo',
  antilink: 'antilink', boasVindas: 'boas-vindas', chave: 'automação', presentes: 'presentes', ausentes: 'ausentes',
};

function detailText(detail) {
  if (!detail || typeof detail !== 'object') return '';
  return Object.entries(detail)
    .filter(([k, v]) => v !== null && v !== undefined && v !== '' && k !== 'grupo')
    .slice(0, 6)
    .map(([k, v]) => `${DETALHES[k] || k}: ${Array.isArray(v) ? v.length : typeof v === 'object' ? '…' : v === true ? 'sim' : v === false ? 'não' : v}`)
    .join(' · ');
}

async function loadNames(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data } = await db.from('profiles').select('id,name').in('id', unique);
  return new Map((data || []).map((p) => [p.id, p.name]));
}

async function initAgente() {
  const profile = await renderSidebar('agente');
  if (!profile) return;
  await renderTopBar('Agente MSY', profile);
  const ehDiretoria = profile.tier === 'diretoria';
  const content = document.getElementById('pageContent');

  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-header-title">Agente MSY</div>
        <div class="page-header-sub">${ehDiretoria
          ? 'Onde o agente está conectado e tudo o que ele fez no portal e no WhatsApp, de toda a Ordem.'
          : 'Onde você conectou o agente e tudo o que ele fez com a sua conta.'}</div>
      </div>
    </div>
    <div class="ag-grid">
      <div class="ag-card">
        <div class="ag-card-title"><i class="fa-solid fa-plug"></i> Apps conectados</div>
        <p class="ag-text">O agente faz no portal só o que a sua conta pode. Para conectar, adicione o conector
          <strong>Agente MSY</strong> no Claude ou rode <code>msy login</code> no computador.</p>
        <div class="ag-apps" id="agApps"><div class="ag-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando…</div></div>
      </div>
      <div class="ag-card">
        <div class="ag-card-title"><i class="fa-solid fa-clock-rotate-left"></i> Histórico</div>
        <div class="ag-toolbar">
          <select id="agFiltro" aria-label="Filtrar por tipo">
            <option value="">Tudo</option>
            ${Object.entries(ACOES).map(([k, [, label]]) => `<option value="${k}">${esc(label)}</option>`).join('')}
          </select>
          ${ehDiretoria ? '<select id="agQuem" aria-label="Filtrar por membro"><option value="">Toda a Ordem</option></select>' : ''}
        </div>
        <div class="ag-list" id="agList"><div class="ag-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando…</div></div>
        <button class="btn btn-secondary ag-more" id="agMore" hidden>Ver mais</button>
      </div>
    </div>`;

  const own = (q, col) => (ehDiretoria ? q : q.eq(col, profile.id));

  // Apps conectados: uma linha por app, com a conexão mais recente.
  try {
    const { data, error } = await own(db.from('agent_sessions').select('user_id,app,created_at').order('created_at', { ascending: false }).limit(500), 'user_id');
    if (error) throw error;
    const names = ehDiretoria ? await loadNames((data || []).map((s) => s.user_id)) : new Map();
    const byKey = new Map();
    for (const s of data || []) {
      const key = `${ehDiretoria ? s.user_id : ''}|${s.app || 'Agente MSY'}`;
      if (!byKey.has(key)) byKey.set(key, { ...s, n: 0 });
      byKey.get(key).n += 1;
    }
    const apps = [...byKey.values()];
    document.getElementById('agApps').innerHTML = apps.length ? apps.map((a) => `
      <div class="ag-app">
        <span class="ag-icon"><i class="fa-solid fa-robot"></i></span>
        <div class="ag-body">
          <div class="ag-line">${esc(a.app || 'Agente MSY')}${ehDiretoria ? ` · ${esc(names.get(a.user_id) || 'membro')}` : ''}</div>
          <div class="ag-sub">Última conexão ${esc(Utils.formatDateTime(a.created_at))} · ${a.n} ${a.n === 1 ? 'conexão' : 'conexões'}</div>
        </div>
      </div>`).join('') : '<div class="ag-empty">Nenhum app conectado ainda.</div>';
    if (ehDiretoria) {
      const sel = document.getElementById('agQuem');
      [...names.entries()].sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, name]) => sel.insertAdjacentHTML('beforeend', `<option value="${esc(id)}">${esc(name)}</option>`));
    }
  } catch (err) {
    console.error('[MSY][agente] apps', err);
    document.getElementById('agApps').innerHTML = '<div class="ag-empty">Não consegui carregar os apps agora.</div>';
  }

  // Histórico: ações registradas pelo agente + mensagens de WhatsApp enviadas por ele.
  let limit = PAGE;
  async function loadHistory() {
    const list = document.getElementById('agList');
    const filtro = document.getElementById('agFiltro').value;
    const quem = ehDiretoria ? document.getElementById('agQuem').value : profile.id;
    try {
      let audit = [];
      let msgs = [];
      if (filtro !== 'enviar_whatsapp') {
        let q = db.from('agent_audit').select('id,user_id,tool,target,detail,ok,app,created_at').order('created_at', { ascending: false }).limit(limit);
        if (filtro) q = q.eq('tool', filtro);
        if (quem) q = q.eq('user_id', quem);
        const { data, error } = await q;
        if (error) throw error;
        audit = (data || []).map((a) => ({ ...a, kind: 'audit' }));
      }
      if (!filtro || filtro === 'enviar_whatsapp') {
        let q = db.from('bot_messages').select('id,sent_by,target_type,target_name,message,ok,error,app,created_at').eq('via', 'agente').order('created_at', { ascending: false }).limit(limit);
        if (quem) q = q.eq('sent_by', quem);
        const { data } = await q; // só quem usa o bot lê esta tabela; para os outros vem vazio
        msgs = (data || []).map((m) => ({ ...m, user_id: m.sent_by, tool: 'enviar_whatsapp', kind: 'msg' }));
      }
      const rows = [...audit, ...msgs].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit);
      const names = ehDiretoria ? await loadNames(rows.map((r) => r.user_id)) : new Map();
      list.innerHTML = rows.length ? rows.map((r) => {
        const [icon, label] = ACOES[r.tool] || ['fa-solid fa-robot', r.tool];
        const failed = r.ok === false;
        const who = ehDiretoria ? `${esc(names.get(r.user_id) || 'membro')} · ` : '';
        const line = r.kind === 'msg'
          ? `${label} ${r.target_type === 'grupo' ? 'no grupo' : 'para'} ${esc(r.target_name || '—')}`
          : `${esc(label)}${r.detail?.membro ? ` · ${esc(r.detail.membro)}` : ''}`;
        const detail = r.kind === 'msg'
          ? `${esc(String(r.message || '').slice(0, 220))}${failed && r.error ? `\nFalhou: ${esc(r.error)}` : ''}`
          : esc(detailText(r.detail));
        return `
          <div class="ag-item">
            <span class="ag-icon ${failed ? 'fail' : r.kind === 'msg' ? 'whats' : ''}"><i class="${icon}"></i></span>
            <div class="ag-body">
              <div class="ag-line">${line}${failed ? ' · <span style="color:#ef4444">falhou</span>' : ''}</div>
              <div class="ag-sub">${who}${esc(Utils.formatDateTime(r.created_at))}${r.app ? ` · ${esc(r.app)}` : ''}</div>
              ${detail ? `<div class="ag-detail">${detail}</div>` : ''}
            </div>
          </div>`;
      }).join('') : '<div class="ag-empty">Nada por aqui ainda. Quando o agente publicar, criar ou enviar algo pela sua conta, aparece aqui.</div>';
      document.getElementById('agMore').hidden = rows.length < limit;
    } catch (err) {
      console.error('[MSY][agente] histórico', err);
      list.innerHTML = '<div class="ag-empty">Não consegui carregar o histórico agora.</div>';
    }
  }

  document.getElementById('agFiltro').addEventListener('change', () => { limit = PAGE; loadHistory(); });
  document.getElementById('agQuem')?.addEventListener('change', () => { limit = PAGE; loadHistory(); });
  document.getElementById('agMore').addEventListener('click', () => { limit += PAGE; loadHistory(); });
  await loadHistory();
}

initAgente();
