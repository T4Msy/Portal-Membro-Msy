/* ============================================================
   MSY PORTAL — ICM_PERFIL.JS
   Injeta seção ICM³ na página de perfil (perfil.html).
   
   Estratégia: usa MutationObserver para detectar quando
   o pageContent for populado pelo app.js e então injeta
   a seção ICM no card lateral esquerdo (profile-avatar-card).
   ============================================================ */

(function() {
  'use strict';

  /* Sigils dos espectros para exibição visual */
  const ESPECTRO_META = {
    CORVUS:  { sigil:'◈', color:'#8b5cf6' },
    FENRIR:  { sigil:'⚡', color:'#ef4444' },
    AEGIS:   { sigil:'⬡', color:'#3b82f6' },
    VORTEX:  { sigil:'◉', color:'#10b981' },
    TITAN:   { sigil:'▲', color:'#f59e0b' },
    CIPHER:  { sigil:'⊕', color:'#06b6d4' },
    SPECTER: { sigil:'◬', color:'#6b7280' },
  };

  /* Mapeia score → tier de insígnia */
  function getScoreBadge(score) {
    if (score >= 80) return { label:'ELITE',    color:'#c9a84c', icon:'👑' };
    if (score >= 70) return { label:'AGENTE',   color:'#3b82f6', icon:'⚡' };
    if (score >= 60) return { label:'OPERADOR', color:'#10b981', icon:'🔰' };
    return null;
  }

  /* Formata timestamp ISO para exibição */
  function formatICMDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'short', year: 'numeric'
      });
    } catch(e) { return '—'; }
  }

  /* Constrói o HTML da seção ICM */
  function buildICMSection(icm) {
    const dom  = ESPECTRO_META[icm.dominante]  || { sigil:'◈', color:'#c9a84c' };
    const sec  = ESPECTRO_META[icm.secundario] || { sigil:'◉', color:'#6b7280' };
    const tier = getScoreBadge(icm.score);
    const date = formatICMDate(icm.timestamp);

    const tierHtml = tier
      ? `<div style="display:inline-flex;align-items:center;gap:5px;background:rgba(${hexToRgb(tier.color)},0.1);
               border:1px solid rgba(${hexToRgb(tier.color)},0.3);border-radius:20px;
               padding:3px 10px;font-size:.7rem;font-weight:700;color:${tier.color};
               letter-spacing:.06em;margin-top:4px">
           ${tier.icon} ${tier.label}
         </div>`
      : '';

    return `
      <div id="icm-perfil-section" style="margin-top:16px;border-top:1px solid var(--border-faint);padding-top:16px">

        <!-- Título -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="font-family:'Cinzel',serif;font-size:.8rem;color:var(--gold);letter-spacing:.08em;text-transform:uppercase">
            <i class="fa-solid fa-brain" style="margin-right:6px"></i>ICM³
          </div>
          <a href="icm.html" style="font-size:.72rem;color:var(--text-3);transition:color .2s"
             onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color='var(--text-3)'">
            Refazer →
          </a>
        </div>

        <!-- Score principal -->
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px">
          <div style="
            width:64px;height:64px;border-radius:50%;flex-shrink:0;
            border:2px solid rgba(204,0,0,0.4);
            background:radial-gradient(circle, rgba(204,0,0,0.12) 0%, transparent 70%);
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            font-family:'Share Tech Mono',monospace
          ">
            <span style="font-size:1.3rem;font-weight:700;color:#cc0000;line-height:1">${icm.score}</span>
            <span style="font-size:.55rem;color:var(--text-3);letter-spacing:.06em">ICM³</span>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-family:'Cinzel',serif;font-size:.72rem;color:var(--text-1);font-weight:600;
                        letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;overflow:hidden;
                        text-overflow:ellipsis">
              ${escapeHtmlLocal(icm.classificacao || '—')}
            </div>
            ${tierHtml}
            <div style="font-size:.68rem;color:var(--text-3);margin-top:4px">
              <i class="fa-regular fa-calendar" style="margin-right:3px"></i>${date}
            </div>
          </div>
        </div>

        <!-- Espectros -->
        <div style="display:flex;gap:6px;margin-bottom:10px">
          <div style="
            flex:1;padding:8px 10px;border-radius:8px;
            background:rgba(${hexToRgb(dom.color)},0.07);
            border:1px solid rgba(${hexToRgb(dom.color)},0.25)
          ">
            <div style="font-size:.6rem;color:var(--text-3);text-transform:uppercase;
                        letter-spacing:.08em;margin-bottom:3px">Dominante</div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:1rem;color:${dom.color}">${dom.sigil}</span>
              <span style="font-size:.78rem;font-weight:600;color:${dom.color};
                           letter-spacing:.04em;text-transform:uppercase">
                ${escapeHtmlLocal(icm.dominante)}
              </span>
            </div>
          </div>
          <div style="
            flex:1;padding:8px 10px;border-radius:8px;
            background:rgba(${hexToRgb(sec.color)},0.05);
            border:1px solid rgba(${hexToRgb(sec.color)},0.2)
          ">
            <div style="font-size:.6rem;color:var(--text-3);text-transform:uppercase;
                        letter-spacing:.08em;margin-bottom:3px">Secundário</div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:1rem;color:${sec.color}">${sec.sigil}</span>
              <span style="font-size:.78rem;font-weight:600;color:${sec.color};
                           letter-spacing:.04em;text-transform:uppercase">
                ${escapeHtmlLocal(icm.secundario)}
              </span>
            </div>
          </div>
        </div>

        <!-- Dimensões mini -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
          ${buildDimBar('Decisão',    icm.dimensoes?.decisao    || 0, '#ef4444')}
          ${buildDimBar('Lógica',     icm.dimensoes?.logica     || 0, '#3b82f6')}
          ${buildDimBar('Sagacidade', icm.dimensoes?.sagacidade || 0, '#8b5cf6')}
          ${buildDimBar('Maturidade', icm.dimensoes?.maturidade || 0, '#10b981')}
        </div>

      </div>
    `;
  }

  /* HTML de uma barra de dimensão mini */
  function buildDimBar(label, value, color) {
    return `
      <div style="padding:5px 8px;background:rgba(255,255,255,0.02);border-radius:6px;
                  border:1px solid var(--border-faint)">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="font-size:.62rem;color:var(--text-3)">${label}</span>
          <span style="font-size:.62rem;color:${color};font-weight:600">${value}%</span>
        </div>
        <div style="height:3px;background:rgba(255,255,255,0.05);border-radius:2px">
          <div style="height:3px;width:${value}%;background:${color};border-radius:2px;transition:width .6s ease"></div>
        </div>
      </div>
    `;
  }

  /* HTML do botão "Realizar ICM" quando não há resultado */
  function buildICMCTA() {
    return `
      <div id="icm-perfil-section" style="margin-top:16px;border-top:1px solid var(--border-faint);padding-top:16px">
        <div style="font-family:'Cinzel',serif;font-size:.8rem;color:var(--gold);letter-spacing:.08em;
                    text-transform:uppercase;margin-bottom:12px">
          <i class="fa-solid fa-brain" style="margin-right:6px"></i>ICM³
        </div>
        <div style="text-align:center;padding:16px 8px">
          <div style="font-size:1.8rem;margin-bottom:8px;opacity:.4">🧠</div>
          <div style="font-size:.78rem;color:var(--text-3);margin-bottom:12px;line-height:1.5">
            Você ainda não realizou o Índice de Capacidade Masayoshi.
          </div>
          <a href="icm.html" style="
            display:inline-flex;align-items:center;gap:7px;
            background:rgba(204,0,0,0.1);border:1px solid rgba(204,0,0,0.3);
            border-radius:8px;padding:8px 16px;
            font-size:.75rem;font-weight:600;color:#cc0000;
            text-decoration:none;letter-spacing:.04em;text-transform:uppercase;
            transition:all .2s
          "
          onmouseover="this.style.background='rgba(204,0,0,0.18)'"
          onmouseout="this.style.background='rgba(204,0,0,0.1)'">
            <i class="fa-solid fa-brain"></i> Realizar ICM³
          </a>
        </div>
      </div>
    `;
  }

  /* Helper: hex → rgb para usar em rgba() */
  function hexToRgb(hex) {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!r) return '201,168,76';
    return `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}`;
  }

  /* Usa Utils.escapeHtml de app.js (sempre carregado antes) */
  const escapeHtmlLocal = str => Utils.escapeHtml(str);

  /* Injeta a seção no card de avatar do perfil */
  function injectICMSection(icm) {
    // Remove seção anterior se já existir (re-render)
    const old = document.getElementById('icm-perfil-section');
    if (old) old.remove();

    // Localiza o container de insígnias no card do perfil
    const badgesContainer = document.getElementById('profileBadgesContainer');
    if (!badgesContainer) return;

    // Insere após a seção de insígnias (encontra o pai do container)
    const badgesSection = badgesContainer.closest('div[style*="border-top"]') || badgesContainer.parentElement;
    if (!badgesSection) return;

    const html  = icm && icm.score ? buildICMSection(icm) : buildICMCTA();
    const temp  = document.createElement('div');
    temp.innerHTML = html;
    const node = temp.firstElementChild;

    // Insere após a seção de insígnias
    badgesSection.parentNode.insertBefore(node, badgesSection.nextSibling);
  }

  /* Observa o pageContent até o perfil ser renderizado */
  function waitForPerfil() {
    const pageContent = document.getElementById('pageContent');
    if (!pageContent) return;

    const observer = new MutationObserver(async (mutations, obs) => {
      const badgesContainer = document.getElementById('profileBadgesContainer');
      if (!badgesContainer) return;

      // Perfil foi renderizado — para de observar
      obs.disconnect();

      // Aguarda insígnias carregarem (pequeno delay)
      setTimeout(async () => {
        try {
          if (typeof db === 'undefined' || typeof Auth === 'undefined') return;

          const { data: session } = await supabase.auth.getUser();
          if (!session?.user) return;

          const { data: prof } = await db
            .from('profiles')
            .select('icm')
            .eq('id', session.user.id)
            .single();

          injectICMSection(prof?.icm || null);
        } catch(e) {
          console.warn('[ICM Perfil] Erro ao carregar dados ICM:', e);
          injectICMSection(null);
        }
      }, 300);
    });

    observer.observe(pageContent, { childList: true, subtree: true });
  }

  /* Inicializa quando o DOM estiver pronto */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForPerfil);
  } else {
    waitForPerfil();
  }

})();
