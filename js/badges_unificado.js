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

  /* -- METADADOS DAS INSIGNIAS DE CONSTANCIA ------------------ */
  const CONSTANCIA_META = {
    semanal: [
      {
        key: 'constancia-semanal-5',
        threshold: 5,
        label: 'Chama da Constancia',
        icon: '◆',
        image: 'icons/badges/constancia-semanal-5.png',
        color: '#f59e0b',
        desc: '1º em 5 relatorios semanais seguidos',
      },
      {
        key: 'constancia-semanal-10',
        threshold: 10,
        label: 'Estandarte da Soberania',
        icon: '◆',
        image: 'icons/badges/constancia-semanal-10.png',
        color: '#facc15',
        desc: '1º em 10 relatorios semanais seguidos',
      },
      {
        key: 'constancia-semanal-20',
        threshold: 20,
        label: 'Coroa da Supremacia Semanal',
        icon: '◆',
        image: 'icons/badges/constancia-semanal-20.png',
        color: '#f97316',
        desc: '1º em 20 relatorios semanais seguidos',
      },
    ],
    mensal: [
      {
        key: 'constancia-mensal-3',
        threshold: 3,
        label: 'Pilar da Constancia',
        icon: '◆',
        image: 'icons/badges/constancia-mensal-3.png',
        color: '#c9a84c',
        desc: '1º em 3 relatorios mensais seguidos',
      },
      {
        key: 'constancia-mensal-6',
        threshold: 6,
        label: 'Trono da Persistencia',
        icon: '◆',
        image: 'icons/badges/constancia-mensal-6.png',
        color: '#e11d48',
        desc: '1º em 6 relatorios mensais seguidos',
      },
      {
        key: 'constancia-mensal-12',
        threshold: 12,
        label: 'Dinastia Sangrenta',
        icon: '◆',
        image: 'icons/badges/constancia-mensal-12.png',
        color: '#dc2626',
        desc: '1º em 12 relatorios mensais seguidos',
      },
    ],
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
    if (typeof global.MSYNormalizeRankingName === 'function') {
      return global.MSYNormalizeRankingName(n);
    }
    const raw = String(n || '');
    let base = raw
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u200B-\u200D\uFE0E\uFE0F\uFEFF]/g, '')
      .toLowerCase();
    try {
      base = base.replace(/\p{Extended_Pictographic}/gu, '').replace(/[^\p{L}\p{N}]+/gu, '');
    } catch (_) {
      base = base.replace(/[^a-z0-9]+/gi, '');
    }
    return base || raw.toLowerCase().trim().replace(/\s+/g, ' ');
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

  let _constanciaCache   = null;
  let _constanciaCacheTs = 0;
  const CONSTANCIA_TTL   = 3 * 60 * 1000;

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

  /* -- FONTE 3: CONSTANCIA EM RELATORIOS ---------------------- */

  function _emptyStreak() {
    return { current: 0, best: 0, currentStart: null, currentEnd: null, bestStart: null, bestEnd: null };
  }

  function _blankConstanciaSummary() {
    return { semanal: _emptyStreak(), mensal: _emptyStreak() };
  }

  function _periodRef(row) {
    return row?.week_start || row?.created_at || row?.week_end || '';
  }

  function _periodLabel(row) {
    if (!row) return '';
    if (row.week_start && row.week_end) return `${row.week_start} a ${row.week_end}`;
    return row.week_start || row.week_end || '';
  }

  function _makeProfileIndexes(profiles = []) {
    const byId = new Map();
    const byName = new Map();
    for (const p of profiles || []) {
      if (!p?.id) continue;
      byId.set(p.id, p);
      const norm = normalizeName(p.name);
      if (norm && !byName.has(norm)) byName.set(norm, p);
    }
    return { byId, byName };
  }

  function _resolveRankingEntry(entry, indexes) {
    const rawUserId = entry?.user_id || entry?.userId || entry?.profile_id || null;
    const rawName = entry?.name || entry?.nome || '';
    const normName = normalizeName(rawName);
    const profileById = rawUserId ? indexes.byId.get(rawUserId) : null;
    const profileByName = normName ? indexes.byName.get(normName) : null;
    const profile = profileById || profileByName || null;
    const userId = rawUserId || profile?.id || null;
    const key = userId ? `id:${userId}` : (normName ? `name:${normName}` : '');
    if (!key) return null;
    return {
      key,
      user_id: userId,
      name: profile?.name || rawName || 'Membro',
      initials: profile?.initials || null,
      color: profile?.color || null,
      role: profile?.role || null,
      avatar_url: profile?.avatar_url || null,
    };
  }

  function _winnersFromRanking(row, indexes) {
    const bestByKey = new Map();
    for (const entry of (row?.entries || [])) {
      const messages = parseInt(entry?.messages ?? entry?.mensagens, 10) || 0;
      if (messages <= 0) continue;
      const participant = _resolveRankingEntry(entry, indexes);
      if (!participant) continue;
      const current = bestByKey.get(participant.key);
      if (!current || messages > current.messages) {
        bestByKey.set(participant.key, { ...participant, messages });
      }
    }
    const entries = Array.from(bestByKey.values());
    const max = entries.reduce((acc, entry) => Math.max(acc, entry.messages || 0), 0);
    return entries.filter(entry => entry.messages === max && max > 0);
  }

  function _ensureConstanciaPerson(map, participant) {
    if (!map.has(participant.key)) {
      map.set(participant.key, {
        key: participant.key,
        user_id: participant.user_id || null,
        name: participant.name,
        initials: participant.initials || null,
        color: participant.color || null,
        role: participant.role || null,
        avatar_url: participant.avatar_url || null,
        semanal: _emptyStreak(),
        mensal: _emptyStreak(),
        achievements: { semanal: {}, mensal: {} },
      });
    }
    const person = map.get(participant.key);
    if (!person.user_id && participant.user_id) person.user_id = participant.user_id;
    if (participant.name) person.name = participant.name;
    if (participant.initials) person.initials = participant.initials;
    if (participant.color) person.color = participant.color;
    if (participant.role) person.role = participant.role;
    if (participant.avatar_url) person.avatar_url = participant.avatar_url;
    return person;
  }

  function _applyStreakWin(person, tipo, row) {
    const streak = person[tipo];
    const label = _periodLabel(row);
    if (streak.current === 0) streak.currentStart = label;
    streak.current += 1;
    streak.currentEnd = label;
    for (const meta of (CONSTANCIA_META[tipo] || [])) {
      if (streak.current === meta.threshold) {
        person.achievements[tipo][meta.threshold] = (person.achievements[tipo][meta.threshold] || 0) + 1;
      }
    }
    if (streak.current > streak.best) {
      streak.best = streak.current;
      streak.bestStart = streak.currentStart;
      streak.bestEnd = streak.currentEnd;
    }
  }

  function _calcTipoConstancia(rankings, tipo, indexes, people) {
    const active = new Set();
    const ordered = (rankings || [])
      .filter(row => ((!row.tipo || row.tipo === 'semanal') ? 'semanal' : 'mensal') === tipo)
      .slice()
      .sort((a, b) => {
        const byDate = String(_periodRef(a)).localeCompare(String(_periodRef(b)));
        if (byDate !== 0) return byDate;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });

    for (const row of ordered) {
      const winners = _winnersFromRanking(row, indexes);
      if (!winners.length) continue;
      const winnerKeys = new Set(winners.map(w => w.key));

      for (const key of Array.from(active)) {
        if (!winnerKeys.has(key)) {
          const person = people.get(key);
          if (person) person[tipo].current = 0;
          active.delete(key);
        }
      }

      for (const winner of winners) {
        const person = _ensureConstanciaPerson(people, winner);
        _applyStreakWin(person, tipo, row);
        active.add(winner.key);
      }
    }
  }

  function _sortConstanciaList(list, tipo) {
    return list.slice().sort((a, b) => {
      if ((b[tipo]?.best || 0) !== (a[tipo]?.best || 0)) return (b[tipo]?.best || 0) - (a[tipo]?.best || 0);
      if ((b[tipo]?.current || 0) !== (a[tipo]?.current || 0)) return (b[tipo]?.current || 0) - (a[tipo]?.current || 0);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }

  async function _buildRankingConstanciaSummary() {
    const [rankRes, profRes] = await Promise.all([
      db.from('weekly_rankings')
        .select('id,tipo,week_start,week_end,created_at,entries')
        .order('week_start', { ascending: true }),
      db.from('profiles')
        .select('id,name,role,initials,color,avatar_url'),
    ]);
    if (rankRes.error) throw rankRes.error;
    if (profRes.error) throw profRes.error;

    const indexes = _makeProfileIndexes(profRes.data || []);
    const people = new Map();
    _calcTipoConstancia(rankRes.data || [], 'semanal', indexes, people);
    _calcTipoConstancia(rankRes.data || [], 'mensal', indexes, people);

    const all = Array.from(people.values());
    return {
      updatedAt: new Date().toISOString(),
      all,
      semanal: _sortConstanciaList(all.filter(p => (p.semanal?.best || 0) > 0), 'semanal'),
      mensal: _sortConstanciaList(all.filter(p => (p.mensal?.best || 0) > 0), 'mensal'),
      byUser: all.reduce((acc, person) => {
        if (person.user_id) acc[person.user_id] = person;
        return acc;
      }, {}),
    };
  }

  async function _getRankingConstanciaSummary(noCache = false) {
    const agora = Date.now();
    if (!noCache && _constanciaCache && (agora - _constanciaCacheTs) < CONSTANCIA_TTL) {
      return _constanciaCache;
    }
    try {
      _constanciaCache = await _buildRankingConstanciaSummary();
      _constanciaCacheTs = agora;
      return _constanciaCache;
    } catch (e) {
      console.warn('[MSYBadges] Erro ao calcular constancia:', e);
      return { updatedAt: null, all: [], semanal: [], mensal: [], byUser: {} };
    }
  }

  async function _fetchConstancia(userId, noCache = false) {
    const summary = await _getRankingConstanciaSummary(noCache);
    const person = summary.byUser?.[userId] || _blankConstanciaSummary();
    const badges = [];

    for (const tipo of ['semanal', 'mensal']) {
      const streak = person[tipo] || _emptyStreak();
      for (const meta of CONSTANCIA_META[tipo]) {
        if ((streak.best || 0) < meta.threshold) continue;
        badges.push({
          key: meta.key,
          label: meta.label,
          icon: meta.icon,
          image: meta.image,
          color: meta.color,
          desc: meta.desc,
          origem: 'constancia',
          meta: {
            tipo,
            marco: meta.threshold,
            melhorSequencia: streak.best || 0,
            sequenciaAtual: streak.current || 0,
            periodo: streak.bestStart && streak.bestEnd ? `${streak.bestStart} ate ${streak.bestEnd}` : '',
            tooltip: `1º lugar em ${meta.threshold} relatorios ${tipo === 'mensal' ? 'mensais' : 'semanais'} seguidos. Melhor sequencia: ${streak.best || 0}. Sequencia atual: ${streak.current || 0}.`,
          },
        });
      }
    }

    return badges;
  }

  /* -- FONTE 4: ICM ------------------------------------------- */

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

      const [recordes, constancia, premiacoes, icm] = await Promise.all([
        _fetchRecordes(userId),
        _fetchConstancia(userId, noCache),
        _fetchPremiacao(userId),
        _fetchICM(userId),
      ]);

      // Deduplicar por key (ICM nunca sobrescreve premiação ou recorde)
      const seen  = new Set();
      const final = [];
      for (const b of [...recordes, ...constancia, ...premiacoes, ...icm]) {
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
      _constanciaCache   = null;
      _constanciaCacheTs = 0;
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

    CONSTANCIA_META,

    async getRankingStreakSummary(noCache = false) {
      return _getRankingConstanciaSummary(noCache);
    },

    async getRankingStreakBadges(userId, noCache = false) {
      return _fetchConstancia(userId, noCache);
    },

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
    const glowStyle   = (b.origem === 'recorde' || b.origem === 'constancia')
      ? `filter:drop-shadow(0 0 6px ${b.color}88);`
      : '';
    const visual = b.image
      ? `<img class="badge-icon-img" src="${_esc(b.image)}" alt="" loading="lazy">`
      : b.icon;

    if (compact) {
      // Layout compacto — mostra xN para premiações, label para outros
      const qtdStr = b.origem === 'premiacao' && b.meta?.quantidade > 0
        ? `×${b.meta.quantidade}` : _origemLabel(b);
      return `
        <div class="badge-item badge-${_esc(b.origem)}" title="${_esc(tooltipText)}" style="--badge-color:${b.color}">
          <div class="badge-icon" style="${glowStyle}">${visual}</div>
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
      <div class="badge-item badge-${_esc(b.origem)}" title="${_esc(tooltipText)}" style="--badge-color:${b.color}">
        <div class="badge-icon" style="${glowStyle}">${visual}</div>
        <div class="badge-info">
          <div class="badge-titulo">${_esc(b.label)}</div>
          <div class="badge-qtd" style="color:${b.color}">${extraInfo}</div>
        </div>
      </div>`;
  }

  function _origemLabel(b) {
    if (b.origem === 'recorde')    return 'Recorde';
    if (b.origem === 'constancia') return b.desc || (b.meta?.tipo === 'mensal' ? 'Constancia Mensal' : 'Constancia Semanal');
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
