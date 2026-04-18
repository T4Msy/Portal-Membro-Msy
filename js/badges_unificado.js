/* ============================================================
   MSY PORTAL — BADGES_UNIFICADO.JS
   Sistema Unificado de Insígnias — Fonte Única de Verdade
   ============================================================

   ARQUITETURA:
   ─────────────────────────────────────────────────────────
   Esta é a ÚNICA fonte de verdade do sistema de insígnias.
   Nenhum componente deve montar insígnias manualmente.

   FONTES SUPORTADAS:
     1. Premiações   → RPC get_member_badges (tabela premiações)
     2. Recordes     → tabela msy_recordes_top3 (Trono dos Recordes)
     3. ICM          → campo profiles.icm (selecionadas pelo membro)

   FORMATO PADRÃO DE INSÍGNIA:
     {
       key:    string   — identificador único (ex: 'corvus', 'semanal-1')
       label:  string   — nome legível (ex: 'Corvus', 'Soberania Semanal')
       icon:   string   — emoji ou sigil (ex: '◈', '⚡')
       color:  string   — cor CSS hex ou var() (ex: '#8b5cf6')
       desc:   string   — descrição curta
       origem: string   — 'premiacao' | 'recorde' | 'icm'
       meta:   object   — dados extras (quantidade, tooltip, etc)
     }

   API PÚBLICA:
     MSYBadges.getAll(userId)        → Promise<Badge[]>  (todas as fontes)
     MSYBadges.render(userId, elId)  → void (renderiza no container)
     MSYBadges.getMeta(key)          → object (metadados de uma insígnia)
     MSYBadges.clearCache(userId)    → void (limpa cache desse userId)

   ============================================================ */

'use strict';

(function(global) {

  /* ── METADADOS DAS INSÍGNIAS ICM ─────────────────────────── */
  const ICM_META = {
    corvus:   { label: 'Corvus',               icon: '🐦‍⬛', color: '#8b5cf6', desc: 'Estrategista das Sombras'  },
    fenrir:   { label: 'Fenrir',               icon: '🐺', color: '#ef4444', desc: 'Ruptor de Paradigmas'     },
    aegis:    { label: 'Aegis',                icon: '⬡', color: '#3b82f6', desc: 'Guardião da Estrutura'    },
    vortex:   { label: 'Vortex',               icon: '◉', color: '#10b981', desc: 'Núcleo de Influência'     },
    titan:    { label: 'Titan',                icon: '▲', color: '#f59e0b', desc: 'Executor de Força'        },
    cipher:   { label: 'Cipher',               icon: '🎯', color: '#06b6d4', desc: 'Decodificador de Sistemas'},
    specter:  { label: 'Specter',              icon: '◬', color: '#6b7280', desc: 'Operador Silencioso'      },
    elite:    { label: 'Elite da Ordem',       icon: '👑', color: '#c9a84c', desc: 'ICM ≥ 80'               },
    agente:   { label: 'Agente da Ordem',      icon: '🔵', color: '#3b82f6', desc: 'ICM ≥ 70'               },
    operador: { label: 'Operador Estratégico', icon: '🔰', color: '#10b981', desc: 'ICM ≥ 60'               },
  };

  /* ── METADADOS DAS INSÍGNIAS DE RECORDE ─────────────────── */
  const RECORDE_META = {
    semanal: { icon: '⚡', label: 'Soberania Semanal', color: '#f59e0b' },
    mensal:  { icon: '🩸', label: 'Domínio Mensal',    color: '#cc0000' },
    diario:  { icon: '🔱', label: 'Marca Perpétua',    color: '#8b5cf6' },
  };

  /* ── METADADOS DAS INSÍGNIAS DE PREMIAÇÃO ───────────────── */
  const PREMIACAO_COLORS = {
    'Semanal':  '#3b82f6',
    'Mensal':   '#c9a84c',
    'Anual':    '#cc0000',
    'Especial': '#8b5cf6',
  };

  /* ── CACHE POR USUÁRIO (sessão) ──────────────────────────── */
  const _cache    = {};   // { [userId]: Badge[] }
  const _cacheTs  = {};   // { [userId]: timestamp }
  const CACHE_TTL = 3 * 60 * 1000; // 3 minutos

  /* ── HELPERS ─────────────────────────────────────────────── */

  function normalizeName(n) {
    return (n || '').toLowerCase().trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  /* ── FONTE 1: PREMIAÇÕES ─────────────────────────────────── */
  async function _fetchPremiacao(userId) {
    try {
      const { data, error } = await db.rpc('get_member_badges', { p_user_id: userId });
      if (error || !data) return [];
      return data.map(b => ({
        key:    `premiacao-${b.titulo.toLowerCase().replace(/\s+/g, '-')}`,
        label:  b.titulo,
        icon:   b.icone || '🏆',
        color:  PREMIACAO_COLORS[b.importancia] || '#c9a84c',
        desc:   `${b.quantidade}× conquistada`,
        origem: 'premiacao',
        meta:   {
          quantidade: b.quantidade,
          importancia: b.importancia,
          periodos:   b.periodos || [],
          tooltip:    (b.periodos || []).slice(0, 5).join(' · '),
        },
      }));
    } catch (e) {
      console.warn('[MSYBadges] Erro ao buscar premiações:', e);
      return [];
    }
  }

  /* ── FONTE 2: RECORDES ───────────────────────────────────── */

  // Cache global de recordes (compartilhado entre chamadas)
  let _recordesCache    = null;
  let _recordesCacheTs  = 0;
  const RECORDES_TTL    = 5 * 60 * 1000;

  async function _fetchRecordesTop3() {
    const agora = Date.now();
    if (_recordesCache && (agora - _recordesCacheTs) < RECORDES_TTL) {
      return _recordesCache;
    }
    try {
      const { data } = await db.from('msy_recordes_top3')
        .select('tipo, posicao, nome, mensagens, periodo, data_ref')
        .order('tipo').order('posicao');

      const top3 = { semanal: [], mensal: [], diario: [] };
      for (const row of (data || [])) {
        if (top3[row.tipo]) top3[row.tipo].push(row);
      }
      _recordesCache   = top3;
      _recordesCacheTs = agora;
      return top3;
    } catch (e) {
      console.warn('[MSYBadges] Erro ao buscar recordes:', e);
      return { semanal: [], mensal: [], diario: [] };
    }
  }

  async function _fetchRecordes(userId) {
    try {
      const { data: prof } = await db.from('profiles')
        .select('name').eq('id', userId).limit(1);
      if (!prof || prof.length === 0) return [];
      const nomeNorm = normalizeName(prof[0].name);

      const top3 = await _fetchRecordesTop3();
      const insignias = [];

      for (const [tipo, meta] of Object.entries(RECORDE_META)) {
        const lista   = (top3[tipo] || []);
        const entrada = lista.find(r => r.posicao === 1 && normalizeName(r.nome) === nomeNorm);
        if (!entrada) continue;

        insignias.push({
          key:    `recorde-${tipo}`,
          label:  meta.label,
          icon:   meta.icon,
          color:  meta.color,
          desc:   `1º lugar no Trono dos Recordes`,
          origem: 'recorde',
          meta:   {
            tipo,
            posicao:   1,
            mensagens: entrada.mensagens,
            tooltip:   `1º lugar no Trono dos Recordes (${tipo}) — ${Number(entrada.mensagens).toLocaleString('pt-BR')} mensagens`,
          },
        });
      }

      return insignias;
    } catch (e) {
      console.warn('[MSYBadges] Erro ao buscar recordes do membro:', e);
      return [];
    }
  }

  /* ── FONTE 3: ICM ────────────────────────────────────────── */

  /**
   * Deriva as insígnias que um resultado ICM desbloqueia.
   * Retorna TODAS as insígnias disponíveis (não apenas as selecionadas).
   */
  function _icmParaBadges(icm) {
    if (!icm || !icm.score) return [];
    const badges = [];

    // Espectro dominante
    if (icm.dominante) {
      const key  = icm.dominante.toLowerCase();
      const meta = ICM_META[key];
      if (meta) badges.push({
        key:    `icm-${key}`,
        label:  meta.label,
        icon:   meta.icon,
        color:  meta.color,
        desc:   meta.desc,
        origem: 'icm',
        meta:   { subtipo: 'espectro', icmKey: key, role: 'dominante' },
      });
    }

    // Espectro secundário (apenas se diferente do dominante)
    if (icm.secundario && icm.secundario.toLowerCase() !== icm.dominante?.toLowerCase()) {
      const key  = icm.secundario.toLowerCase();
      const meta = ICM_META[key];
      if (meta) badges.push({
        key:    `icm-${key}`,
        label:  meta.label,
        icon:   meta.icon,
        color:  meta.color,
        desc:   meta.desc,
        origem: 'icm',
        meta:   { subtipo: 'espectro', icmKey: key, role: 'secundario' },
      });
    }

    // Tier por score
    let tierKey = null;
    if      (icm.score >= 80) tierKey = 'elite';
    else if (icm.score >= 70) tierKey = 'agente';
    else if (icm.score >= 60) tierKey = 'operador';

    if (tierKey) {
      const meta = ICM_META[tierKey];
      badges.push({
        key:    `icm-${tierKey}`,
        label:  meta.label,
        icon:   meta.icon,
        color:  meta.color,
        desc:   meta.desc,
        origem: 'icm',
        meta:   { subtipo: 'tier', icmKey: tierKey, score: icm.score },
      });
    }

    return badges;
  }

  /**
   * Busca ICM do perfil e filtra apenas as insígnias selecionadas pelo membro.
   * Se selected_badges não existe, exibe todas as disponíveis.
   */
  async function _fetchICM(userId) {
    try {
      const { data } = await db.from('profiles')
        .select('icm, selected_badges')
        .eq('id', userId)
        .single();

      const icm             = data?.icm || null;
      const selectedBadges  = data?.selected_badges || null;
      const disponiveis     = _icmParaBadges(icm);

      if (disponiveis.length === 0) return [];

      // Se o membro nunca configurou seleção → exibe todas disponíveis
      if (!selectedBadges || !Array.isArray(selectedBadges)) return disponiveis;

      // Se configurou seleção vazia → não exibe nada do ICM
      if (selectedBadges.length === 0) return [];

      // Filtra pelas selecionadas
      return disponiveis.filter(b => selectedBadges.includes(b.meta?.icmKey));
    } catch (e) {
      console.warn('[MSYBadges] Erro ao buscar ICM do membro:', e);
      return [];
    }
  }

  /* ── API PÚBLICA ─────────────────────────────────────────── */

  const MSYBadges = {

    /**
     * Retorna TODAS as insígnias unificadas de um usuário.
     * Ordem: Recordes → Premiações → ICM
     *
     * @param  {string}  userId   — UUID do membro
     * @param  {boolean} noCache  — forçar reconsulta mesmo em cache
     * @returns {Promise<Badge[]>}
     */
    async getAll(userId, noCache = false) {
      if (!userId) return [];

      const agora = Date.now();
      if (!noCache && _cache[userId] && (agora - (_cacheTs[userId] || 0)) < CACHE_TTL) {
        return _cache[userId];
      }

      const [recordes, premiacoes, icm] = await Promise.all([
        _fetchRecordes(userId),
        _fetchPremiacao(userId),
        _fetchICM(userId),
      ]);

      // Deduplicar por key (ICM nunca sobrescreve premiação ou recorde)
      const seen  = new Set();
      const final = [];
      for (const b of [...recordes, ...premiacoes, ...icm]) {
        if (!seen.has(b.key)) {
          seen.add(b.key);
          final.push(b);
        }
      }

      _cache[userId]   = final;
      _cacheTs[userId] = agora;
      return final;
    },

    /**
     * Retorna as insígnias ICM disponíveis (não filtradas pela seleção).
     * Usado na tela de configuração do perfil.
     *
     * @param  {object} icmData — objeto icm do perfil
     * @returns {Badge[]}
     */
    getICMDisponiveis(icmData) {
      return _icmParaBadges(icmData);
    },

    /**
     * Retorna metadados de uma insígnia ICM pela key interna.
     *
     * @param  {string} key — ex: 'corvus', 'elite'
     * @returns {object|null}
     */
    getMeta(key) {
      return ICM_META[key] || null;
    },

    /**
     * Limpa o cache de um usuário específico (ou de todos se omitido).
     *
     * @param {string} [userId]
     */
    clearCache(userId) {
      if (userId) {
        delete _cache[userId];
        delete _cacheTs[userId];
      } else {
        Object.keys(_cache).forEach(k => delete _cache[k]);
        Object.keys(_cacheTs).forEach(k => delete _cacheTs[k]);
      }
      // Limpa também o cache de recordes para forçar atualização
      _recordesCache   = null;
      _recordesCacheTs = 0;
    },

    /**
     * Renderiza as insígnias de um usuário em um container DOM.
     * Substitui renderBadgesNoPerfil e renderBadgesMembro.
     *
     * @param {string}  userId      — UUID do membro
     * @param {string}  containerId — ID do elemento DOM
     * @param {object}  [opts]
     * @param {boolean} [opts.compact=false]  — layout compacto (modal)
     * @param {boolean} [opts.noCache=false]  — forçar reconsulta
     */
    async render(userId, containerId, opts = {}) {
      const container = document.getElementById(containerId);
      if (!container) return;

      const compact = opts.compact || false;

      // Loading state
      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:${compact ? '8px 0' : '20px'};
                    color:var(--text-3);font-size:.8rem;">
          <i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i>
          Carregando insígnias...
        </div>`;

      const badges = await this.getAll(userId, opts.noCache);

      if (badges.length === 0) {
        container.innerHTML = `
          <div style="text-align:center;padding:${compact ? '8px 0' : '28px'};color:var(--text-3);">
            ${compact ? '' : '<div style="font-size:2rem;margin-bottom:8px">🎖️</div>'}
            <div style="font-size:${compact ? '.8rem' : '.82rem'};font-style:italic;">
              Nenhuma insígnia conquistada ainda.
            </div>
          </div>`;
        return;
      }

      const gap  = compact ? '8px' : '12px';
      const html = badges.map(b => _renderBadgeItem(b, compact)).join('');

      container.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:${gap};padding:4px 0;">
          ${html}
        </div>`;
    },

    /* Expõe ICM_META para uso externo (renderICMBadgesSection no app.js) */
    ICM_META,

    /**
     * Calcula o total ponderado de insígnias e retorna o nível FIFA.
     * total: premiacoes contam pela quantidade, outros contam 1
     * Retorna: { total, nivel } onde nivel = 'comum'|'raro'|'epico'|'lendario'
     */
    async getCardLevel(userId) {
      const badges = await this.getAll(userId);
      let total = 0;
      badges.forEach(b => {
        total += (b.origem === 'premiacao' && b.meta?.quantidade) ? b.meta.quantidade : 1;
      });
      let nivel = 'comum';
      if      (total >= 100) nivel = 'lendario';
      else if (total >= 50)  nivel = 'epico';
      else if (total >= 10)  nivel = 'raro';
      return { total, nivel, badges };
    },
  };

  /* ── RENDER INTERNO DE UM ITEM ───────────────────────────── */
  function _renderBadgeItem(b, compact) {
    const tooltipText = b.meta?.tooltip || b.desc || '';
    const glowStyle   = b.origem === 'recorde'
      ? `filter:drop-shadow(0 0 6px ${b.color}88);`
      : '';

    if (compact) {
      // Layout compacto — mostra xN para premiações, label para outros
      const qtdStr = b.origem === 'premiacao' && b.meta?.quantidade > 0
        ? `×${b.meta.quantidade}` : _origemLabel(b);
      return `
        <div class="badge-item" title="${_esc(tooltipText)}" style="--badge-color:${b.color}">
          <div class="badge-icon" style="${glowStyle}">${b.icon}</div>
          <div class="badge-info">
            <div class="badge-titulo">${_esc(b.label)}</div>
            <div class="badge-qtd" style="color:${b.color}">${qtdStr}</div>
          </div>
        </div>`;
    }

    // Layout completo para perfil
    const extraInfo = b.origem === 'premiacao'
      ? `${b.meta.quantidade}×`
      : _origemLabel(b);

    return `
      <div class="badge-item" title="${_esc(tooltipText)}" style="--badge-color:${b.color}">
        <div class="badge-icon" style="${glowStyle}">${b.icon}</div>
        <div class="badge-info">
          <div class="badge-titulo">${_esc(b.label)}</div>
          <div class="badge-qtd" style="color:${b.color}">${extraInfo}</div>
        </div>
      </div>`;
  }

  function _origemLabel(b) {
    if (b.origem === 'recorde')    return 'Recorde';
    if (b.origem === 'icm')        return b.meta?.subtipo === 'tier' ? 'ICM' : 'Espectro ICM';
    if (b.origem === 'premiacao')  return b.meta?.importancia || 'Premiação';
    return '';
  }

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── EXPORTAR PARA ESCOPO GLOBAL ─────────────────────────── */
  global.MSYBadges = MSYBadges;

  // Retrocompatibilidade: expõe calcInsigniasRecordes para código legado
  global.calcInsigniasRecordes = async function(userId) {
    const badges = await MSYBadges.getAll(userId);
    return badges
      .filter(b => b.origem === 'recorde')
      .map(b => ({
        emoji:   b.icon,
        titulo:  b.label,
        cor:     b.color,
        tooltip: b.meta?.tooltip || b.desc,
      }));
  };

  // Retrocompatibilidade: expõe renderBadgesNoPerfil para código legado
  global.renderBadgesNoPerfil = async function(userId, containerId) {
    return MSYBadges.render(userId, containerId, { compact: false });
  };

  // Retrocompatibilidade: expõe renderBadgesMembro para código legado
  global.renderBadgesMembro = async function(userId, containerId) {
    return MSYBadges.render(userId, containerId, { compact: true });
  };

})(window);
