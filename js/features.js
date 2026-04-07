/* ============================================================
   MSY PORTAL — FEATURES.JS
   Controle de visibilidade de funcionalidades por cargo.
   
   Uso:
     - Adicione <script src="js/features.js"></script> ANTES de app.js
       (ou logo depois de config.js)
     - Para desativar uma aba para membros comuns:
         MSY_FEATURES.icm = false;
   ============================================================ */

const MSY_FEATURES = {
  // ── Abas do menu ─────────────────────────────────────────
  // true  = visível para todos
  // false = oculto para membros comuns (diretoria sempre vê)
  icm:         true,
  biblioteca:  true,
  premiacoes:  true,
  ranking:     true,
  ordem:       true,
  tecnologias: true,
  feed:        true,
  presencas:   true,
  eventos:     true,
  membros:     true,
  comunicados: true,
  atividades:  true,
  mensalidade: true,
};

/* ── Helpers públicos ─────────────────────────────────────── */

const Features = {
  /**
   * Retorna true se a feature está liberada para o perfil dado.
   * Diretoria sempre tem acesso, independente da flag.
   * @param {string} featureKey  - chave em MSY_FEATURES
   * @param {object} profile     - profile do usuário (com .tier)
   */
  isEnabled(featureKey, profile) {
    const isAdmin = profile?.tier === 'diretoria';
    if (isAdmin) return true;
    return MSY_FEATURES[featureKey] !== false;
  },

  /**
   * Filtra array de itens de navegação, removendo os desativados
   * para membros comuns.
   * @param {Array}  navItems  - array { page, icon, label, badge? }
   * @param {object} profile
   */
  filterNav(navItems, profile) {
    return navItems.filter(item => this.isEnabled(item.page, profile));
  },

  /**
   * Guarda acesso direto a uma página.
   * Chame no topo de cada initPage() que deve ser protegida.
   * Redireciona para dashboard se a feature estiver desativada.
   * @param {string} featureKey
   * @param {object} profile
   * @param {string} redirectTo  - URL de redirecionamento (default: dashboard.html)
   */
  guardPage(featureKey, profile, redirectTo = 'dashboard.html') {
    if (!this.isEnabled(featureKey, profile)) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  },
};
