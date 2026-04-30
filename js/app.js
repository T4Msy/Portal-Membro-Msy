/* ============================================================
   MSY PORTAL — APP.JS v2.1
   Supabase Integration | Vanilla JS
   ============================================================ */

   'use strict';


   const { createClient } = supabase;
   const db = createClient(MSY_CONFIG.SUPABASE_URL, MSY_CONFIG.SUPABASE_ANON_KEY);

   /* ============================================================
      VIEW MODE — Simulação de visão de membro para admins
      ============================================================ */
   const ViewMode = {
     STORAGE_KEY: 'msy_view_as_member',

     isActive() {
       return sessionStorage.getItem(this.STORAGE_KEY) === '1';
     },

     activate() {
       sessionStorage.setItem(this.STORAGE_KEY, '1');
     },

     deactivate() {
       sessionStorage.removeItem(this.STORAGE_KEY);
     },

     /* Retorna o perfil modificado — tier 'membro' quando em modo visualização */
     maskProfile(profile) {
       if (!this.isActive()) return profile;
       return {
         ...profile,
         tier: 'membro',
         _originalTier: profile.tier,
         _viewMode: true,
       };
     },

     /* Injeta banner + botão "Voltar ao modo admin" no topo da página */
     injectBanner() {
       if (!this.isActive()) return;
       if (document.getElementById('viewModeBanner')) return;

       const banner = document.createElement('div');
       banner.id = 'viewModeBanner';
       banner.innerHTML = `
         <div style="
           position:fixed;bottom:0;left:0;right:0;z-index:9990;
           background:linear-gradient(135deg,rgba(201,168,76,.18),rgba(180,83,9,.15));
           border-top:1px solid rgba(201,168,76,.4);
           padding:10px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;
           backdrop-filter:blur(12px);
         ">
           <div style="display:flex;align-items:center;gap:10px">
             <div style="width:28px;height:28px;background:rgba(201,168,76,.2);border:1px solid rgba(201,168,76,.4);border-radius:50%;display:flex;align-items:center;justify-content:center;">
               <i class="fa-solid fa-eye" style="color:var(--gold);font-size:.7rem"></i>
             </div>
             <div>
               <div style="font-size:.75rem;font-weight:700;color:var(--gold);letter-spacing:.06em">MODO VISUALIZAÇÃO COMO MEMBRO</div>
               <div style="font-size:.65rem;color:var(--text-3)">Você está vendo o portal como um membro comum. Suas permissões reais não foram alteradas.</div>
             </div>
           </div>
           <button id="exitViewModeBtn" style="
             background:linear-gradient(135deg,rgba(201,168,76,.2),rgba(201,168,76,.1));
             border:1px solid rgba(201,168,76,.5);border-radius:6px;
             color:var(--gold);font-size:.75rem;font-weight:700;padding:7px 14px;
             cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:7px;
             transition:all .2s;letter-spacing:.04em;
           " onmouseover="this.style.background='rgba(201,168,76,.3)'" onmouseout="this.style.background='linear-gradient(135deg,rgba(201,168,76,.2),rgba(201,168,76,.1))'">
             <i class="fa-solid fa-shield-halved"></i> Voltar ao Modo Admin
           </button>
         </div>`;
       document.body.appendChild(banner);

       document.getElementById('exitViewModeBtn').addEventListener('click', () => {
         ViewMode.deactivate();
         window.location.reload();
       });
     },
   };
   
   /* ============================================================
      AUTH
      ============================================================ */
   const Auth = {
     async getSession() {
       const { data: { session } } = await db.auth.getSession();
       return session;
     },
     async getProfile() {
       const session = await this.getSession();
       if (!session) return null;
       const { data } = await db.from('profiles').select('*').eq('id', session.user.id).single();
       return data;
     },
     async login(email, password) {
       const { data, error } = await db.auth.signInWithPassword({ email, password });
       if (error) throw error;
       return data;
     },
     async logout() {
       await db.auth.signOut();
       window.location.href = 'login.html';
     },
     async requireAuth() {
       const session = await this.getSession();
       if (!session) { window.location.href = 'login.html'; return null; }
       const profile = await this.getProfile();
       if (!profile || profile.status === 'pendente') { await this.logout(); return null; }
       return profile;
     },
     async isDiretoria() {
       const profile = await this.getProfile();
       return profile?.tier === 'diretoria';
     }
   };
   
   /* ============================================================
      UTILS
      ============================================================ */
   const Utils = {
     formatDate(dateStr) {
       if (!dateStr) return '—';
       const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
       return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
     },
     formatDateTime(dateStr) {
       if (!dateStr) return '—';
       const d = new Date(dateStr);
       return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
         + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
     },
     daysDiff(dateStr) {
       const now    = new Date(); now.setHours(0,0,0,0);
       const target = new Date(dateStr + 'T00:00:00');
       return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
     },
     isDeadlinePassed(act) {
       const now = new Date();
       if (act.closes_at) return new Date(act.closes_at) < now;
       const deadline = new Date(act.deadline + 'T23:59:59');
       return deadline < now;
     },
     hasExtendedDeadline(act) {
       if (!act.extended_deadline) return false;
       const now = new Date();
       const ext = new Date(act.extended_deadline + 'T23:59:59');
       return ext >= now;
     },
     isActivityOpen(act) {
       const now = new Date();
       if (act.opens_at && new Date(act.opens_at) > now) return false;
       if (act.closes_at) {
         if (new Date(act.closes_at) < now) {
           return this.hasExtendedDeadline(act);
         }
       } else {
         const deadline = new Date(act.deadline + 'T23:59:59');
         if (deadline < now) return this.hasExtendedDeadline(act);
       }
       return true;
     },
     statusBadge(status) {
       const map = { 'Pendente':'badge-pending','Em andamento':'badge-progress','Concluída':'badge-done','Cancelada':'badge-red' };
       return `<span class="badge ${map[status]||'badge-gold'}">${status}</span>`;
     },
     tierBadge(tier) {
       return tier === 'diretoria'
         ? `<span class="badge badge-red">Diretoria</span>`
         : `<span class="badge badge-gold">Membro</span>`;
     },
     techStatusBadge(status) {
       const map = { 'Online':'badge-done','Beta':'badge-progress','Em breve':'badge-pending' };
       return `<span class="badge ${map[status]||'badge-gold'}">${status}</span>`;
     },
     escapeHtml(text) {
       const d = document.createElement('div');
       d.textContent = String(text || '');
       return d.innerHTML;
     },
     showToast(msg, type = 'success') {
       let toast = document.getElementById('msy-toast');
       if (!toast) {
         toast = document.createElement('div');
         toast.id = 'msy-toast';
         toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;background:var(--black-3);border:1px solid var(--border-gold);border-radius:var(--radius);padding:12px 18px;font-size:0.85rem;color:var(--text-1);box-shadow:var(--shadow-deep);display:flex;align-items:center;gap:10px;max-width:340px;transform:translateY(80px);opacity:0;transition:all 0.3s var(--ease);`;
         document.body.appendChild(toast);
       }
       const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
       toast.innerHTML = `${icon} ${Utils.escapeHtml(msg)}`;
       toast.style.borderColor = type === 'error' ? 'var(--border-red)' : 'var(--border-gold)';
       requestAnimationFrame(() => { toast.style.transform = 'translateY(0)'; toast.style.opacity = '1'; });
       clearTimeout(toast._t);
       toast._t = setTimeout(() => { toast.style.transform = 'translateY(80px)'; toast.style.opacity = '0'; }, 3500);
     },
     showLoading(el, msg = 'Carregando...') {
       el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-3);flex-direction:column;gap:12px"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:1.5rem;color:var(--gold)"></i><span style="font-size:0.82rem">${msg}</span></div>`;
     },
     getInitials(name) {
       return (name || '??').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
     }
   };
   
   /* ============================================================
      SIDEBAR
      ============================================================ */
   async function renderSidebar(activePage) {
     const profileRaw = await Auth.requireAuth();
     if (!profileRaw) return;

     /* Aplicar ViewMode: mascara tier se admin estiver em modo visualizacao */
     const profile = ViewMode.maskProfile(profileRaw);
     const isRealAdmin = profileRaw.tier === 'diretoria';

     /* Injetar banner de ViewMode se ativo */
     if (ViewMode.isActive()) ViewMode.injectBanner();

     const sidebar = document.getElementById('sidebar');
     if (!sidebar) return;
   
     const isDiretoria = profile.tier === 'diretoria';
   
     const { count: actBadgeCount } = await db.from('activities')
       .select('id', { count: 'exact', head: true })
       .eq('assigned_to', profile.id)
       .in('status', ['Pendente', 'Em andamento']);
     const actBadge = actBadgeCount > 0 ? actBadgeCount : '';
   
     const nav = [
       { page: 'dashboard',   icon: 'fa-solid fa-gauge',         label: 'Dashboard' },
       { page: 'atividades',  icon: 'fa-solid fa-list-check',    label: 'Atividades', badge: actBadge },
       { page: 'comunicados', icon: 'fa-solid fa-bullhorn',      label: 'Comunicados' },
       { page: 'membros',     icon: 'fa-solid fa-users',         label: 'Membros' },
       { page: 'eventos',     icon: 'fa-solid fa-calendar-days', label: 'Eventos' },
       { page: 'reunioes',    icon: 'fa-solid fa-handshake',     label: 'Reuniões' },
       { page: 'ranking',     icon: 'fa-solid fa-ranking-star',  label: 'Ranking' },
       { page: 'feed',        icon: 'fa-solid fa-rss',           label: 'Feed' },
       { page: 'biblioteca',  icon: 'fa-solid fa-book-open',     label: 'Biblioteca' },
       { page: 'premiacoes',  icon: 'fa-solid fa-trophy',        label: 'Premiações' },
       { page: 'ordem',       icon: 'fa-solid fa-crown',         label: 'Estrutura' },
       { page: 'tecnologias', icon: 'fa-solid fa-microchip',     label: 'Tecnologias' },
       { page: 'mensalidade', icon: 'fa-solid fa-credit-card',   label: 'Mensalidade' },
       { page: 'icm',         icon: 'fa-solid fa-brain',         label: 'ICM' },
       { page: 'perfil',      icon: 'fa-solid fa-circle-user',   label: 'Meu Perfil' },
     ].filter(item => item.page === 'perfil' || (typeof Features !== 'undefined' ? Features.isEnabled(item.page, profile) : true));
   
     sidebar.innerHTML = `
       <div class="sidebar-logo">
         <span class="sidebar-logo-mark">MSY</span>
         <div class="sidebar-logo-sep"><span class="sidebar-logo-diamond"></span></div>
         <span class="sidebar-logo-sub">Masayoshi Order</span>
       </div>
       <nav class="sidebar-nav">
         <div class="sidebar-section-label">Navegação</div>
         ${nav.map(item => `
           <a href="${item.page}.html" class="nav-item ${activePage === item.page ? 'active' : ''}">
             <i class="${item.icon}"></i>
             <span>${item.label}</span>
             ${item.badge ? `<span class="nav-badge">${item.badge}</span>` : ''}
           </a>
         `).join('')}
         ${isDiretoria ? `
           <div class="sidebar-section-label" style="margin-top:8px">Diretoria</div>
           <a href="admin.html" class="nav-item ${activePage === 'admin' ? 'active' : ''}">
             <i class="fa-solid fa-shield-halved" style="color:var(--gold)"></i>
             <span>Administração</span>
           </a>
           <a href="desempenho.html" class="nav-item ${activePage === 'desempenho' ? 'active' : ''}">
             <i class="fa-solid fa-chart-line" style="color:var(--gold)"></i>
             <span>Desempenho</span>
           </a>
         ` : `
           <a href="onboarding.html" class="nav-item ${activePage === 'onboarding' ? 'active' : ''}" style="margin-top:8px">
             <i class="fa-solid fa-rocket" style="color:var(--gold)"></i>
             <span>Integração</span>
           </a>
         `}
         ${isRealAdmin && !ViewMode.isActive() ? `
           <div style="margin-top:12px;padding:0 8px">
             <button id="viewAsMemberBtn" style="
               width:100%;background:rgba(201,168,76,.07);border:1px solid rgba(201,168,76,.22);
               border-radius:7px;padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:9px;
               color:var(--text-3);font-size:.75rem;font-weight:600;letter-spacing:.04em;
               transition:all .2s;text-align:left;
             " onmouseover="this.style.background='rgba(201,168,76,.14)';this.style.color='var(--gold)'"
                onmouseout="this.style.background='rgba(201,168,76,.07)';this.style.color='var(--text-3)'">
               <i class="fa-solid fa-eye" style="font-size:.7rem"></i>
               <span>Visualizar como Membro</span>
             </button>
           </div>
         ` : ''}
       </nav>
       <div class="sidebar-footer">
         <a href="perfil.html" class="sidebar-user" style="text-decoration:none" title="Meu Perfil">
           <div class="avatar" style="background:linear-gradient(135deg,${profile.color||'#7f1d1d'},#1a1a1a)">
             ${profile.avatar_url ? `<img src="${profile.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : (profile.initials || Utils.getInitials(profile.name))}
           </div>
           <div class="sidebar-user-info">
             <div class="sidebar-user-name">${Utils.escapeHtml(profile.name)}</div>
             <div class="sidebar-user-role">${Utils.escapeHtml(profile.role)}</div>
           </div>
           <i class="fa-solid fa-pen" style="color:var(--text-3);font-size:.65rem;flex-shrink:0"></i>
         </a>
         <button class="logout-btn" id="logoutBtn">
           <i class="fa-solid fa-right-from-bracket"></i> Sair da Ordem
         </button>
       </div>
     `;
   
     document.getElementById('logoutBtn').addEventListener('click', () => Auth.logout());

     document.getElementById('viewAsMemberBtn')?.addEventListener('click', () => {
       if (confirm('Ativar modo de visualização como membro?\n\nVocê verá o portal exatamente como um membro comum, sem permissões administrativas.\n\nSuas permissões reais não serão alteradas.')) {
         ViewMode.activate();
         window.location.reload();
       }
     });

     return profile;
   }
   
   /* ============================================================
      TOP BAR
      ============================================================ */
   async function renderTopBar(pageTitle, profile) {
     const topbar = document.getElementById('topbar');
     if (!topbar || !profile) return;
   
     const { data: notifs } = await db.from('notifications')
       .select('*').eq('user_id', profile.id)
       .is('deleted_at', null)
       .order('created_at', { ascending: false }).limit(6);
   
     const unread = (notifs || []).filter(n => !n.read).length;
   
     topbar.innerHTML = `
       <div class="topbar-left">
         <button class="sidebar-toggle" id="sidebarToggle"><i class="fa-solid fa-bars"></i></button>
         <div class="topbar-page-title">${pageTitle}</div>
       </div>
       <div class="topbar-right">
         <a href="busca.html" class="topbar-search-btn" title="Busca Global">
           <i class="fa-solid fa-magnifying-glass"></i>
         </a>
         <div class="notif-bell-wrap">
           <button class="notif-bell" id="notifBell" aria-label="Notificações">
             <i class="fa-solid fa-bell"></i>
             ${unread > 0 ? `<span class="notif-count">${unread}</span>` : ''}
           </button>
           <div class="notif-dropdown" id="notifDropdown">
             <div class="notif-dropdown-header">
               <span class="notif-dropdown-title"><i class="fa-solid fa-bell"></i> Notificações</span>
               <button class="btn btn-ghost btn-sm" id="markAllRead">Marcar lidas</button>
             </div>
             ${(notifs || []).length === 0
               ? `<div style="padding:20px;text-align:center;color:var(--text-3);font-size:0.82rem">Sem notificações</div>`
               : (notifs || []).map(n => `
                 <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
                   <div class="notif-item-icon">${n.icon || '🔔'}</div>
                   <div class="notif-item-text">
                     <div class="notif-item-msg">${Utils.escapeHtml(n.message)}</div>
                     <div class="notif-item-time">${Utils.formatDate(n.created_at)}</div>
                   </div>
                 </div>`).join('')
             }
           </div>
         </div>
         <a href="perfil.html" class="topbar-user" style="text-decoration:none" title="Meu Perfil">
           <div class="topbar-user-info">
             <span class="topbar-user-name">${Utils.escapeHtml(profile.name)}</span>
             <span class="topbar-user-role">${Utils.escapeHtml(profile.role)}</span>
           </div>
           <div class="avatar" style="background:linear-gradient(135deg,${profile.color||'#7f1d1d'},#1a1a1a)">
             ${profile.avatar_url ? `<img src="${profile.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : (profile.initials || Utils.getInitials(profile.name))}
           </div>
         </a>
       </div>
     `;
   
     document.getElementById('notifBell').addEventListener('click', e => {
       e.stopPropagation();
       document.getElementById('notifDropdown').classList.toggle('open');
     });
     document.addEventListener('click', () => document.getElementById('notifDropdown')?.classList.remove('open'));
     document.getElementById('notifDropdown').addEventListener('click', e => e.stopPropagation());
   
     document.getElementById('markAllRead').addEventListener('click', async () => {
       await db.from('notifications').update({ read: true }).eq('user_id', profile.id).eq('read', false).is('deleted_at', null);
       topbar.querySelector('.notif-count')?.remove();
       topbar.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
     });
   
     const toggle = document.getElementById('sidebarToggle');
     const sidebar = document.getElementById('sidebar');
     const overlay = document.getElementById('sidebarOverlay');
     toggle?.addEventListener('click', () => { sidebar?.classList.toggle('open'); overlay?.classList.toggle('visible'); });
     overlay?.addEventListener('click', () => { sidebar?.classList.remove('open'); overlay?.classList.remove('visible'); });
   }
   
   /* ============================================================
      PAGE: LOGIN
      ============================================================ */
   async function initLogin() {
     const session = await Auth.getSession();
     if (session) { window.location.href = 'dashboard.html'; return; }
   
     const form     = document.getElementById('loginForm');
     const errorEl  = document.getElementById('loginError');
     const loginBtn = document.getElementById('loginBtn');
     if (!form) return;
   
     /* ── Verifica se voltou do link de reset de senha ─────── */
     const urlHash = new URLSearchParams(window.location.hash.replace('#', '?'));
     if (urlHash.get('type') === 'recovery') {
       showResetForm();
       return;
     }
   
     async function doLogin() {
       const email = document.getElementById('loginEmail').value.trim();
       const pass  = document.getElementById('loginPass').value;
       loginBtn.disabled = true; loginBtn.textContent = 'Verificando...';
       errorEl.classList.remove('show');
       try {
         await Auth.login(email, pass);
         const profile = await Auth.getProfile();
         if (!profile || profile.status === 'pendente') {
           await db.auth.signOut();
           document.getElementById('loginErrorMsg').textContent = 'Acesso pendente. Aguarde aprovação da Diretoria.';
           errorEl.classList.add('show');
           loginBtn.disabled = false; loginBtn.textContent = 'Entrar na Ordem';
           return;
         }
         loginBtn.textContent = 'Acesso concedido...';
         loginBtn.style.background = 'linear-gradient(135deg,#15803d,#16a34a)';
         setTimeout(() => { window.location.href = 'dashboard.html'; }, 600);
       } catch (err) {
         document.getElementById('loginErrorMsg').textContent = 'Credenciais inválidas. Verifique e tente novamente.';
         errorEl.classList.add('show');
         loginBtn.disabled = false; loginBtn.textContent = 'Entrar na Ordem';
         document.getElementById('loginPass').value = '';
       }
     }
   
     loginBtn.addEventListener('click', doLogin);
     form.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
   
     /* ── Link "Esqueci minha senha" ───────────────────────── */
     document.getElementById('forgotLink')?.addEventListener('click', (e) => {
       e.preventDefault();
       showForgotForm();
     });
   
     /* ── Exibe formulário de recuperação de senha ─────────── */
     function showForgotForm() {
       const card = document.querySelector('.login-card');
       card.innerHTML = `
         <div class="login-logo">
           <span class="login-logo-mark">MSY</span>
           <div class="login-logo-sep"><span>Masayoshi Order</span></div>
           <span class="login-logo-sub">Recuperação de Acesso</span>
         </div>
         <div class="login-title" style="font-size:1.1rem">Redefinir Senha</div>
         <p style="font-size:0.82rem;color:var(--text-3);margin-bottom:18px;line-height:1.6">
           Informe seu e-mail de acesso. Enviaremos um link para redefinir sua senha.
         </p>
         <div class="login-error" id="forgotError" style="display:none">
           <i class="fa-solid fa-triangle-exclamation"></i>
           <span id="forgotErrorMsg"></span>
         </div>
         <div class="login-success" id="forgotSuccess" style="display:none;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:var(--radius);padding:12px 16px;font-size:0.83rem;color:#4ade80;margin-bottom:14px;display:flex;align-items:center;gap:8px">
           <i class="fa-solid fa-circle-check"></i>
           <span id="forgotSuccessMsg"></span>
         </div>
         <div class="form-group" style="margin-bottom:16px">
           <label class="form-label"><i class="fa-solid fa-at"></i> E-mail</label>
           <input class="form-input" type="email" id="forgotEmail" placeholder="seu@msy.com" autofocus>
         </div>
         <button class="login-btn" type="button" id="forgotBtn">Enviar link de redefinição</button>
         <div style="text-align:center;margin-top:14px">
           <a href="#" id="backToLogin" style="font-size:0.8rem;color:var(--text-3);transition:color var(--t1) var(--ease)"
              onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color='var(--text-3)'">
             <i class="fa-solid fa-arrow-left" style="margin-right:4px"></i>Voltar ao login
           </a>
         </div>
       `;
   
       document.getElementById('backToLogin').addEventListener('click', (e) => {
         e.preventDefault();
         window.location.reload();
       });
   
       document.getElementById('forgotBtn').addEventListener('click', async () => {
         const email   = document.getElementById('forgotEmail').value.trim();
         const btn     = document.getElementById('forgotBtn');
         const errEl   = document.getElementById('forgotError');
         const succEl  = document.getElementById('forgotSuccess');
   
         errEl.style.display  = 'none';
         succEl.style.display = 'none';
   
         if (!email) {
           document.getElementById('forgotErrorMsg').textContent = 'Digite seu e-mail.';
           errEl.style.display = 'flex';
           return;
         }
   
         btn.disabled = true;
         btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando...';
   
         const { error } = await db.auth.resetPasswordForEmail(email, {
           redirectTo: window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '') + '/login.html',
         });
   
         if (error) {
           document.getElementById('forgotErrorMsg').textContent = 'Erro ao enviar. Verifique o e-mail e tente novamente.';
           errEl.style.display = 'flex';
           btn.disabled = false;
           btn.textContent = 'Enviar link de redefinição';
         } else {
           document.getElementById('forgotSuccessMsg').textContent = 'Link enviado! Verifique seu e-mail (incluindo spam).';
           succEl.style.display = 'flex';
           btn.disabled = true;
           btn.textContent = 'Link enviado';
         }
       });
   
       document.getElementById('forgotEmail').addEventListener('keydown', (e) => {
         if (e.key === 'Enter') document.getElementById('forgotBtn').click();
       });
     }
   
     /* ── Formulário de nova senha (após clicar no link do email) */
     function showResetForm() {
       const card = document.querySelector('.login-card');
       card.innerHTML = `
         <div class="login-logo">
           <span class="login-logo-mark">MSY</span>
           <div class="login-logo-sep"><span>Masayoshi Order</span></div>
           <span class="login-logo-sub">Nova Senha</span>
         </div>
         <div class="login-title" style="font-size:1.1rem">Criar Nova Senha</div>
         <div class="login-error" id="resetError" style="display:none">
           <i class="fa-solid fa-triangle-exclamation"></i>
           <span id="resetErrorMsg"></span>
         </div>
         <div class="form-group" style="margin-bottom:14px">
           <label class="form-label"><i class="fa-solid fa-lock"></i> Nova Senha</label>
           <div class="input-wrap">
             <input class="form-input" type="password" id="resetPass" placeholder="mínimo 6 caracteres" style="padding-right:42px" autofocus>
             <button type="button" class="pw-toggle" id="resetToggle"><i class="fa-regular fa-eye"></i></button>
           </div>
         </div>
         <div class="form-group" style="margin-bottom:18px">
           <label class="form-label"><i class="fa-solid fa-lock"></i> Confirmar Nova Senha</label>
           <input class="form-input" type="password" id="resetConfirm" placeholder="repita a senha">
         </div>
         <button class="login-btn" type="button" id="resetBtn">Salvar nova senha</button>
       `;
   
       document.getElementById('resetToggle').addEventListener('click', () => {
         const inp = document.getElementById('resetPass');
         inp.type = inp.type === 'password' ? 'text' : 'password';
         document.getElementById('resetToggle').innerHTML =
           inp.type === 'password' ? '<i class="fa-regular fa-eye"></i>' : '<i class="fa-regular fa-eye-slash"></i>';
       });
   
       document.getElementById('resetBtn').addEventListener('click', async () => {
         const pass    = document.getElementById('resetPass').value;
         const confirm = document.getElementById('resetConfirm').value;
         const btn     = document.getElementById('resetBtn');
         const errEl   = document.getElementById('resetError');
   
         errEl.style.display = 'none';
   
         if (pass.length < 6) {
           document.getElementById('resetErrorMsg').textContent = 'A senha deve ter pelo menos 6 caracteres.';
           errEl.style.display = 'flex'; return;
         }
         if (pass !== confirm) {
           document.getElementById('resetErrorMsg').textContent = 'As senhas não coincidem.';
           errEl.style.display = 'flex'; return;
         }
   
         btn.disabled = true;
         btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...';
   
         const { error } = await db.auth.updateUser({ password: pass });
   
         if (error) {
           document.getElementById('resetErrorMsg').textContent = 'Erro ao salvar. Solicite um novo link de redefinição.';
           errEl.style.display = 'flex';
           btn.disabled = false;
           btn.textContent = 'Salvar nova senha';
         } else {
           btn.style.background = 'linear-gradient(135deg,#15803d,#16a34a)';
           btn.textContent = 'Senha atualizada! Redirecionando...';
           setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
         }
       });
     }
   }
   
   /* ============================================================
      PAGE: DASHBOARD
      ============================================================ */
   async function initDashboard() {
     const profile = await renderSidebar('dashboard');
     if (!profile) return;
     await renderTopBar('Dashboard', profile);
   
     const content = document.getElementById('pageContent');
     Utils.showLoading(content);
   
     const today = new Date().toISOString().split('T')[0];
   
     const [statsRes, notifsRes, eventsRes, actsRes, rankingRes] = await Promise.all([
       db.rpc('get_member_stats', { p_user_id: profile.id }),
       db.from('notifications').select('*').eq('user_id', profile.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(4),
       db.from('events').select('*').gte('event_date', today).order('event_date', { ascending: true }).limit(3),
       db.from('activities')
         .select('*, assigned_by_profile:assigned_by(name)')
         .eq('assigned_to', profile.id).order('created_at', { ascending: false }).limit(4),
       db.from('weekly_rankings').select('*').eq('tipo','semanal').order('week_start', { ascending: false }).limit(1)
     ]);
   
     const stats   = statsRes.data || { total: 0, pendentes: 0, andamento: 0, concluidas: 0 };
     const notifs  = notifsRes.data || [];
     const events  = eventsRes.data || [];
     const acts    = actsRes.data || [];
     const ranking = rankingRes.data?.[0] || null;
     const top3    = ranking ? (ranking.entries || []).slice(0, 3) : [];
   
     const { count: totalMembers } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'ativo');
   
     const isDiretoria = profile.tier === 'diretoria';
   
     content.innerHTML = `
       <div class="profile-card card-enter">
         <div class="avatar xl" style="background:linear-gradient(135deg,${profile.color||'#7f1d1d'},#1a1a1a);font-size:1.6rem;overflow:hidden">
           ${profile.avatar_url ? `<img src="${profile.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : (profile.initials || Utils.getInitials(profile.name))}
         </div>
         <div class="profile-info">
           <div class="profile-name">${Utils.escapeHtml(profile.name)}</div>
           <div class="profile-role">${Utils.escapeHtml(profile.role)}</div>
           <div class="profile-join"><i class="fa-regular fa-calendar"></i> Membro desde ${Utils.formatDate(profile.join_date)}</div>
           <div class="profile-stats">
             <div class="profile-stat-item"><div class="profile-stat-num">${stats.total||0}</div><div class="profile-stat-lbl">Atividades</div></div>
             <div class="profile-stat-item"><div class="profile-stat-num">${stats.concluidas||0}</div><div class="profile-stat-lbl">Concluídas</div></div>
           </div>
         </div>
         <div>${Utils.tierBadge(profile.tier)}</div>
       </div>
   
       <div class="stats-grid">
         <div class="stat-card red-accent card-enter"><div class="stat-icon red"><i class="fa-solid fa-rotate"></i></div><div class="stat-info"><div class="stat-value">${stats.andamento||0}</div><div class="stat-label">Em Andamento</div></div></div>
         <div class="stat-card gold-accent card-enter"><div class="stat-icon gold"><i class="fa-solid fa-hourglass-half"></i></div><div class="stat-info"><div class="stat-value">${stats.pendentes||0}</div><div class="stat-label">Pendentes</div></div></div>
         <div class="stat-card green-accent card-enter"><div class="stat-icon green"><i class="fa-solid fa-circle-check"></i></div><div class="stat-info"><div class="stat-value">${stats.concluidas||0}</div><div class="stat-label">Concluídas</div></div></div>
         <div class="stat-card blue-accent card-enter"><div class="stat-icon blue"><i class="fa-solid fa-users"></i></div><div class="stat-info"><div class="stat-value">${totalMembers||0}</div><div class="stat-label">Membros Ativos</div></div></div>
       </div>
   
       <div class="dash-grid">
         <div class="card card-enter" id="notifsCard">
           <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
             <div class="card-title" style="margin-bottom:0"><i class="fa-solid fa-bell"></i> Notificações Recentes</div>
             ${notifs.length > 0 ? `<button class="notif-clear-all-btn" id="notifClearAllBtn" title="Limpar todas as notificações"><i class="fa-solid fa-trash-can"></i> Limpar</button>` : ''}
           </div>
           <div class="small-list" id="notifsList">
             ${notifs.length === 0
               ? `<div class="notif-empty-state"><i class="fa-solid fa-bell-slash" style="opacity:.3;font-size:1.1rem"></i><span>Nenhuma notificação recente.</span></div>`
               : notifs.map(n => `
                 <div class="small-list-item notif-item-dash" data-notif-id="${n.id}">
                   <div class="small-list-icon">${n.icon||'🔔'}</div>
                   <div class="small-list-info">
                     <div class="small-list-title">${Utils.escapeHtml(n.message)}</div>
                     <div class="small-list-sub">${Utils.formatDate(n.created_at)}</div>
                   </div>
                   ${!n.read ? '<span class="badge badge-red" style="font-size:.62rem;padding:2px 7px">Nova</span>' : ''}
                   <button class="notif-del-btn" data-notif-id="${n.id}" title="Remover notificação"><i class="fa-solid fa-xmark"></i></button>
                 </div>`).join('')
             }
           </div>
         </div>
   
         <div class="card card-enter">
           <div class="card-title"><i class="fa-solid fa-calendar-days"></i> Próximos Eventos</div>
           <div class="small-list">
             ${events.length === 0
               ? `<div class="empty-state" style="padding:20px"><div class="empty-state-text">Nenhum evento agendado.</div></div>`
               : events.map(ev => `
                 <div class="small-list-item">
                   <div class="small-list-icon" style="background:var(--red-subtle);border:1px solid var(--border-red)">
                     <i class="fa-solid fa-calendar-check" style="color:var(--red-bright)"></i>
                   </div>
                   <div class="small-list-info">
                     <div class="small-list-title">${Utils.escapeHtml(ev.title)}</div>
                     <div class="small-list-sub">${Utils.formatDate(ev.event_date)} · ${ev.event_time}</div>
                   </div>
                   ${ev.mandatory ? '<span class="badge badge-red" style="font-size:.62rem">Obrig.</span>' : ''}
                 </div>`).join('')
             }
           </div>
         </div>
       </div>
   
       <!-- Jornal MSY -->
       <div id="jornalContainer" class="card-enter" style="margin-bottom:8px"></div>
   
       <!-- Top 3 da Semana -->
       <div class="card card-enter" id="top3Card" style="overflow:hidden;padding:0;margin-bottom:8px">
         <!-- Header -->
         <div style="padding:16px 18px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(245,158,11,.12)">
           <div style="display:flex;align-items:center;gap:9px">
             <div style="width:30px;height:30px;background:linear-gradient(135deg,rgba(245,158,11,.25),rgba(180,83,9,.15));border:1px solid rgba(245,158,11,.35);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:.95rem">👑</div>
             <div>
               <div style="font-weight:700;font-size:.82rem;color:var(--text-1);letter-spacing:.06em;text-transform:uppercase">Top 3 da Semana</div>
               ${ranking ? `<div style="font-size:.62rem;color:var(--text-3);letter-spacing:.04em;margin-top:1px">${Utils.formatDate(ranking.week_start)} — ${Utils.formatDate(ranking.week_end)}</div>` : ''}
             </div>
           </div>
           ${isDiretoria ? `<button class="btn btn-ghost btn-sm" id="manageTop3Btn" style="font-size:.7rem"><i class="fa-solid fa-pen"></i> Gerenciar</button>` : ''}
         </div>
   
         ${top3.length === 0
           ? `<div class="empty-state" style="padding:28px"><div class="empty-state-text">Nenhum ranking desta semana ainda.</div></div>`
           : `
           <!-- 1º lugar -->
           <div style="padding:22px 18px 20px;text-align:center;position:relative;background:linear-gradient(180deg,rgba(245,158,11,.09) 0%,rgba(245,158,11,.03) 60%,transparent 100%);overflow:hidden">
             <!-- Glow aura -->
             <div style="position:absolute;top:-30px;left:50%;transform:translateX(-50%);width:160px;height:80px;background:radial-gradient(ellipse,rgba(245,158,11,.18) 0%,transparent 70%);pointer-events:none"></div>
             <!-- Linha decorativa superior -->
             <div style="position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent 0%,rgba(245,158,11,.6) 30%,rgba(245,158,11,.9) 50%,rgba(245,158,11,.6) 70%,transparent 100%)"></div>
             <!-- Número do posto -->
             <div style="position:absolute;top:10px;left:14px;font-size:.6rem;font-weight:800;color:rgba(245,158,11,.35);letter-spacing:.1em;text-transform:uppercase">1°</div>
             <!-- Medalha -->
             <div style="font-size:2rem;margin-bottom:8px;filter:drop-shadow(0 0 8px rgba(245,158,11,.5))">🥇</div>
             <!-- Nome -->
             <div style="font-weight:800;font-size:1.05rem;color:#fff;letter-spacing:.01em;margin-bottom:5px;text-shadow:0 0 20px rgba(245,158,11,.3)">${Utils.escapeHtml(top3[0].name)}</div>
             <!-- Contagem -->
             <div style="display:inline-flex;align-items:center;gap:5px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);border-radius:20px;padding:3px 12px">
               <span style="font-size:.65rem;color:rgba(245,158,11,.7);text-transform:uppercase;letter-spacing:.06em;font-weight:600">${top3[0].messages}</span>
               <span style="font-size:.6rem;color:rgba(245,158,11,.45);letter-spacing:.04em">msgs</span>
             </div>
           </div>
   
           <!-- Divisor decorativo -->
           <div style="position:relative;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.06),transparent);margin:0 18px">
             <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:6px;height:6px;border-radius:50%;background:rgba(245,158,11,.3)"></div>
           </div>
   
           <!-- 2º e 3º lugar -->
           <div style="display:grid;grid-template-columns:1fr 1fr;border-top:none;gap:1px;background:rgba(255,255,255,.05)">
             <!-- 2º -->
             ${top3[1] ? `
             <div style="padding:20px 16px 22px;text-align:center;position:relative;background:linear-gradient(160deg,rgba(156,163,175,.07) 0%,transparent 100%)">
               <div style="position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(156,163,175,.3),transparent)"></div>
               <div style="font-size:.58rem;font-weight:700;color:rgba(156,163,175,.4);letter-spacing:.1em;margin-bottom:10px;text-transform:uppercase">2°</div>
               <div style="font-size:1.6rem;margin-bottom:10px">🥈</div>
               <div style="font-weight:700;font-size:.88rem;color:var(--text-1);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 8px">${Utils.escapeHtml(top3[1].name)}</div>
               <div style="font-size:.7rem;color:rgba(156,163,175,.65);font-weight:600;letter-spacing:.04em">${top3[1].messages} msgs</div>
             </div>` : '<div style="background:transparent"></div>'}
             <!-- 3º -->
             ${top3[2] ? `
             <div style="padding:20px 16px 22px;text-align:center;position:relative;background:linear-gradient(160deg,rgba(180,120,60,.07) 0%,transparent 100%)">
               <div style="position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(180,120,60,.3),transparent)"></div>
               <div style="font-size:.58rem;font-weight:700;color:rgba(180,120,60,.4);letter-spacing:.1em;margin-bottom:10px;text-transform:uppercase">3°</div>
               <div style="font-size:1.6rem;margin-bottom:10px">🥉</div>
               <div style="font-weight:700;font-size:.88rem;color:var(--text-1);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 8px">${Utils.escapeHtml(top3[2].name)}</div>
               <div style="font-size:.7rem;color:rgba(180,120,60,.65);font-weight:600;letter-spacing:.04em">${top3[2].messages} msgs</div>
             </div>` : '<div style="background:transparent"></div>'}
           </div>
           `
         }
       </div>
   
       <div class="card card-enter" style="margin-bottom:8px">
         <div class="card-title" style="justify-content:space-between">
           <span><i class="fa-solid fa-clock-rotate-left"></i> Atividades Recentes</span>
           <a href="atividades.html" class="btn btn-ghost btn-sm">Ver todas <i class="fa-solid fa-arrow-right"></i></a>
         </div>
         <div class="small-list">
           ${acts.length === 0
             ? `<div class="empty-state" style="padding:20px"><div class="empty-state-text">Nenhuma atividade atribuída.</div></div>`
             : acts.map(a => `
               <div class="small-list-item">
                 <div class="small-list-icon" style="background:var(--black-5)">
                   <i class="fa-solid fa-file-lines" style="color:var(--gold)"></i>
                 </div>
                 <div class="small-list-info">
                   <div class="small-list-title">${Utils.escapeHtml(a.title)}</div>
                   <div class="small-list-sub">Limite: ${Utils.formatDate(a.deadline)}</div>
                 </div>
                 ${Utils.statusBadge(a.status)}
               </div>`).join('')
           }
         </div>
       </div>
   
       <!-- Modal Top 3 -->
       <div class="modal-overlay" id="top3Modal">
         <div class="modal">
           <div class="modal-header">
             <div class="modal-title"><i class="fa-solid fa-trophy"></i> Gerenciar Top 3 da Semana</div>
             <button class="modal-close" id="top3ModalClose"><i class="fa-solid fa-xmark"></i></button>
           </div>
           <div class="modal-body" id="top3ModalBody"></div>
           <div class="modal-footer" id="top3ModalFooter"></div>
         </div>
       </div>
     `;
   
     // Inicializar Jornal MSY (definido ao final deste arquivo)
     _initJornalMSY(profile);
   
     // Inicializar sistema de notificações com limpeza
     _initNotifsDash(profile);
   
     if (isDiretoria) {
       document.getElementById('manageTop3Btn')?.addEventListener('click', () => openTop3Modal(ranking));
       const top3Modal = document.getElementById('top3Modal');
       if (top3Modal && top3Modal.parentElement !== document.body) document.body.appendChild(top3Modal);
       document.getElementById('top3ModalClose').addEventListener('click', () => top3Modal.classList.remove('open'));
       top3Modal.addEventListener('click', e => { if (e.target === top3Modal) top3Modal.classList.remove('open'); });
     }
   }
   
   function openTop3Modal(existing) {
     const modal = document.getElementById('top3Modal');
     const body  = document.getElementById('top3ModalBody');
     const footer = document.getElementById('top3ModalFooter');
   
     const entries = existing?.entries || [{name:'',messages:''},{name:'',messages:''},{name:'',messages:''}];
     while (entries.length < 3) entries.push({name:'',messages:''});
   
     const todayStr = new Date().toISOString().split('T')[0];
     const wStart = existing?.week_start || todayStr;
     const wEnd   = existing?.week_end   || todayStr;
   
     body.innerHTML = `
       <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
         <div class="form-group">
           <label class="form-label">Início da Semana</label>
           <input class="form-input" type="date" id="t3-start" value="${wStart}">
         </div>
         <div class="form-group">
           <label class="form-label">Fim da Semana</label>
           <input class="form-input" type="date" id="t3-end" value="${wEnd}">
         </div>
       </div>
       ${[0,1,2].map(i => `
         <div style="display:grid;grid-template-columns:1fr auto;gap:10px;margin-bottom:12px;align-items:end">
           <div class="form-group" style="margin:0">
             <label class="form-label">${i===0?'🥇':i===1?'🥈':'🥉'} ${i+1}º Lugar — Nome</label>
             <input class="form-input" id="t3-name-${i}" placeholder="Nome do membro" value="${Utils.escapeHtml(entries[i]?.name||'')}">
           </div>
           <div class="form-group" style="margin:0">
             <label class="form-label">Mensagens</label>
             <input class="form-input" type="number" id="t3-msgs-${i}" placeholder="0" value="${entries[i]?.messages||''}" style="width:90px">
           </div>
         </div>`).join('')}
     `;
   
     footer.innerHTML = `
       <button class="btn btn-ghost" id="t3-cancel">Cancelar</button>
       <button class="btn btn-primary" id="t3-save"><i class="fa-solid fa-floppy-disk"></i> Salvar Top 3</button>
     `;
   
     modal.classList.add('open');
   
     document.getElementById('t3-cancel').addEventListener('click', () => modal.classList.remove('open'));
     document.getElementById('t3-save').addEventListener('click', async () => {
       const week_start = document.getElementById('t3-start').value;
       const week_end   = document.getElementById('t3-end').value;
       if (!week_start || !week_end) { Utils.showToast('Preencha as datas.','error'); return; }
   
       const newEntries = [0,1,2].map(i => ({
         name:     document.getElementById(`t3-name-${i}`).value.trim(),
         messages: parseInt(document.getElementById(`t3-msgs-${i}`).value) || 0
       })).filter(e => e.name);
   
       const btn = document.getElementById('t3-save');
       btn.disabled = true; btn.textContent = 'Salvando...';
   
       let err;
       if (existing?.id) {
         ({ error: err } = await db.from('weekly_rankings').update({ week_start, week_end, entries: newEntries }).eq('id', existing.id));
       } else {
         const session = await Auth.getSession();
         ({ error: err } = await db.from('weekly_rankings').insert({ week_start, week_end, entries: newEntries, created_by: session.user.id }));
       }
   
       if (!err) {
         modal.classList.remove('open');
         Utils.showToast('Top 3 salvo!');
         setTimeout(() => initDashboard(), 300);
       } else {
         Utils.showToast('Erro ao salvar.', 'error');
         btn.disabled = false; btn.textContent = 'Salvar Top 3';
       }
     });
   }
   
   /* ============================================================
      PAGE: ATIVIDADES
      ============================================================ */
   /* ============================================================
      UTILS: ANEXOS — tipos de arquivo e ícones
      ============================================================ */
   const AnexoUtils = {
     getFileIcon(tipo, nome) {
       if (!tipo && nome) {
         const ext = nome.split('.').pop().toLowerCase();
         if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return { icon: 'fa-solid fa-image', color: '#60a5fa', label: 'Imagem' };
         if (['mp4','mov','avi','mkv','webm'].includes(ext)) return { icon: 'fa-solid fa-film', color: '#a78bfa', label: 'Vídeo' };
         if (['mp3','wav','ogg','aac'].includes(ext)) return { icon: 'fa-solid fa-music', color: '#f472b6', label: 'Áudio' };
         if (ext === 'pdf') return { icon: 'fa-solid fa-file-pdf', color: '#f87171', label: 'PDF' };
         if (['doc','docx'].includes(ext)) return { icon: 'fa-solid fa-file-word', color: '#60a5fa', label: 'Word' };
         if (['xls','xlsx'].includes(ext)) return { icon: 'fa-solid fa-file-excel', color: '#4ade80', label: 'Excel' };
         if (['ppt','pptx'].includes(ext)) return { icon: 'fa-solid fa-file-powerpoint', color: '#fb923c', label: 'PowerPoint' };
         if (['zip','rar','7z','tar'].includes(ext)) return { icon: 'fa-solid fa-file-zipper', color: '#fbbf24', label: 'Arquivo' };
         return { icon: 'fa-solid fa-file', color: 'var(--gold)', label: 'Arquivo' };
       }
       if (!tipo) return { icon: 'fa-solid fa-file', color: 'var(--gold)', label: 'Arquivo' };
       if (tipo.startsWith('image/')) return { icon: 'fa-solid fa-image', color: '#60a5fa', label: 'Imagem' };
       if (tipo.startsWith('video/')) return { icon: 'fa-solid fa-film', color: '#a78bfa', label: 'Vídeo' };
       if (tipo.startsWith('audio/')) return { icon: 'fa-solid fa-music', color: '#f472b6', label: 'Áudio' };
       if (tipo === 'application/pdf') return { icon: 'fa-solid fa-file-pdf', color: '#f87171', label: 'PDF' };
       if (tipo.includes('word')) return { icon: 'fa-solid fa-file-word', color: '#60a5fa', label: 'Word' };
       if (tipo.includes('excel') || tipo.includes('spreadsheet')) return { icon: 'fa-solid fa-file-excel', color: '#4ade80', label: 'Excel' };
       if (tipo.includes('presentation') || tipo.includes('powerpoint')) return { icon: 'fa-solid fa-file-powerpoint', color: '#fb923c', label: 'PowerPoint' };
       if (tipo.includes('zip') || tipo.includes('rar') || tipo.includes('compressed')) return { icon: 'fa-solid fa-file-zipper', color: '#fbbf24', label: 'Arquivo' };
       return { icon: 'fa-solid fa-file', color: 'var(--gold)', label: 'Arquivo' };
     },

     isImage(tipo, nome) {
       if (tipo && tipo.startsWith('image/')) return true;
       if (nome) { const ext = nome.split('.').pop().toLowerCase(); return ['jpg','jpeg','png','gif','webp'].includes(ext); }
       return false;
     },

     formatBytes(bytes) {
       if (!bytes) return '';
       if (bytes < 1024) return bytes + ' B';
       if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
       return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
     }
   };

   async function initAtividades() {
     const profile = await renderSidebar('atividades');
     if (!profile) return;
     await renderTopBar('Atividades', profile);
   
     const content = document.getElementById('pageContent');
     Utils.showLoading(content);
   
     const isDiretoria = profile.tier === 'diretoria';
     // Permissões estendidas: membros com permissão agem como diretoria nas atividades
     const canCriar    = isDiretoria || await MSYPerms.check(profile.id, profile.tier, 'criar_atividades');
     const canGerenciar = isDiretoria || await MSYPerms.checkAny(profile.id, profile.tier, ['gerenciar_atividades','criar_atividades','editar_atividades']);
     const canConcluir  = isDiretoria || await MSYPerms.check(profile.id, profile.tier, 'concluir_atividades');
     let activeFilter = 'Todos';
   
     async function loadActivities() {
       const grid = document.getElementById('activitiesGrid');
       if (!grid) return;
       grid.innerHTML = `<div style="grid-column:1/-1"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i></div></div>`;
   
       let query = db.from('activities')
         .select('*, assigned_by_profile:assigned_by(name,initials,color), assigned_to_profile:assigned_to(name,initials)')
         .order('created_at', { ascending: false });

       if (activeFilter !== 'Todos') query = query.eq('status', activeFilter);

       let { data: acts, error } = await query;

       // Filtra no cliente: mostra atividades do membro OU colaborativas onde ele é membro
       if (!canGerenciar) {
         const { data: collabRows } = await db.from('activity_collaborators').select('activity_id').eq('user_id', profile.id);
         const collabActIds = new Set((collabRows||[]).map(r => r.activity_id));
         acts = (acts||[]).filter(a => a.assigned_to === profile.id || collabActIds.has(a.id));
       }
       if (error) { Utils.showToast('Erro ao carregar atividades.', 'error'); return; }
   
       if (!acts || acts.length === 0) {
         grid.innerHTML = `<div style="grid-column:1/-1" class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-clipboard-check"></i></div><div class="empty-state-text">Nenhuma atividade encontrada.</div></div>`;
         return;
       }
   
       grid.innerHTML = acts.map(act => {
         const diff = Utils.daysDiff(act.deadline);
         const passed = Utils.isDeadlinePassed(act);
         const hasExt = Utils.hasExtendedDeadline(act);
         const urgentClass = diff <= 3 && act.status !== 'Concluída' && !passed ? 'urgent' : '';
   
         let deadlineLabel;
         if (act.status === 'Concluída') deadlineLabel = 'Concluída';
         else if (hasExt) deadlineLabel = `⚠️ Prazo estendido até ${Utils.formatDate(act.extended_deadline)}`;
         else if (passed) deadlineLabel = '🔴 Prazo excedido';
         else if (diff < 0) deadlineLabel = `Vencida há ${Math.abs(diff)} dias`;
         else if (diff === 0) deadlineLabel = 'Vence hoje';
         else deadlineLabel = `${diff} dias restantes`;
   
         return `
           <div class="activity-card card-enter" data-id="${act.id}" data-status="${Utils.escapeHtml(act.status)}">
             <div class="activity-card-header">
               <div class="activity-card-title">${Utils.escapeHtml(act.title)}</div>
               ${Utils.statusBadge(act.status)}
             </div>
             ${isDiretoria ? `<div class="activity-card-meta"><span><i class="fa-solid fa-user"></i> Para: ${Utils.escapeHtml(act.assigned_to_profile?.name||'—')}</span></div>` : ''}
             <div class="activity-card-meta">
               <span><i class="fa-solid fa-user-tie"></i> ${Utils.escapeHtml(act.assigned_by_profile?.name||'—')}</span>
             </div>
             <div class="activity-card-footer">
               <div class="activity-deadline ${urgentClass}" style="${passed && !hasExt ? 'color:var(--red-bright)' : ''}">
                 <i class="fa-solid fa-clock"></i> ${deadlineLabel}
               </div>
               <button class="btn btn-outline btn-sm open-activity" data-id="${act.id}">
                 Detalhes <i class="fa-solid fa-arrow-right"></i>
               </button>
             </div>
           </div>`;
       }).join('');
   
       grid.querySelectorAll('.open-activity').forEach(el => {
         el.addEventListener('click', e => { e.stopPropagation(); openActivityModal(el.dataset.id, acts, profile); });
       });
       grid.querySelectorAll('.activity-card').forEach(card => {
         card.addEventListener('click', () => openActivityModal(card.dataset.id, acts, profile));
       });
     }

     async function loadAnexosView() {
       const grid = document.getElementById('activitiesGrid');
       if (!grid) return;
       grid.innerHTML = `<div style="grid-column:1/-1"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i></div></div>`;

       // Buscar todos os anexos via activity_responses (file_url preenchido)
       let query = db.from('activity_responses')
         .select('id, file_url, file_name, created_at, user_id, activity_id, user:user_id(name,initials,color), activity:activity_id(title,status)')
         .not('file_url', 'is', null)
         .not('file_name', 'is', null)
         .order('created_at', { ascending: false });

       if (!isDiretoria) query = query.eq('user_id', profile.id);

       const { data: anexos, error } = await query;

       if (error) { Utils.showToast('Erro ao carregar anexos.', 'error'); return; }
       if (!anexos || anexos.length === 0) {
         grid.innerHTML = `<div style="grid-column:1/-1" class="empty-state">
           <div class="empty-state-icon"><i class="fa-solid fa-paperclip"></i></div>
           <div class="empty-state-text">Nenhum anexo encontrado.</div>
           <div style="font-size:.78rem;color:var(--text-3);margin-top:6px">Os arquivos enviados nas respostas de atividades aparecerão aqui.</div>
         </div>`;
         return;
       }

       grid.innerHTML = `<div class="anexos-grid">${anexos.map(a => renderAnexoCard(a, isDiretoria, profile)).join('')}</div>`;

       // Bind actions
       grid.querySelectorAll('.anexo-view-btn').forEach(btn => {
         btn.addEventListener('click', e => { e.stopPropagation(); window.open(btn.dataset.url, '_blank'); });
       });
       grid.querySelectorAll('.anexo-download-btn').forEach(btn => {
         btn.addEventListener('click', e => {
           e.stopPropagation();
           const a = document.createElement('a');
           a.href = btn.dataset.url;
           a.download = btn.dataset.name || 'arquivo';
           a.target = '_blank';
           document.body.appendChild(a); a.click(); document.body.removeChild(a);
         });
       });
       if (isDiretoria) {
         grid.querySelectorAll('.anexo-delete-btn').forEach(btn => {
           btn.addEventListener('click', async e => {
             e.stopPropagation();
             if (!confirm(`Excluir o anexo "${btn.dataset.name}"?\n\nO arquivo será removido permanentemente.`)) return;
             btn.disabled = true;
             btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';

             // Extrair o path do storage a partir da URL pública
             const fileUrl = btn.dataset.url || '';
             const storageMarker = '/storage/v1/object/public/activity-files/';
             let storagePath = null;
             if (fileUrl.includes(storageMarker)) {
               storagePath = decodeURIComponent(fileUrl.split(storageMarker)[1]);
             }

             // 1. Apagar do storage
             if (storagePath) {
               const { error: storageErr } = await db.storage.from('activity-files').remove([storagePath]);
               if (storageErr) console.warn('Aviso storage:', storageErr.message);
             }

             // 2. Limpar referência no banco
             const { error } = await db.from('activity_responses')
               .update({ file_url: null, file_name: null })
               .eq('id', btn.dataset.id);

             if (!error) {
               btn.closest('.anexo-card-wrap')?.remove();
               Utils.showToast('✅ Anexo excluído do storage e do banco.');
             } else {
               Utils.showToast('Erro ao remover.', 'error');
               btn.disabled = false;
               btn.innerHTML = '<i class="fa-solid fa-trash"></i>';
             }
           });
         });
       }
     }

     function renderAnexoCard(a, isDiretoria, profile) {
       const fileInfo = AnexoUtils.getFileIcon(null, a.file_name);
       const isImg = AnexoUtils.isImage(null, a.file_name);
       const dateStr = Utils.formatDateTime ? Utils.formatDateTime(a.created_at) : new Date(a.created_at).toLocaleDateString('pt-BR');
       const statusColor = a.activity?.status === 'Concluída' ? '#4ade80' : a.activity?.status === 'Em andamento' ? '#60a5fa' : '#eab308';

       return `
         <div class="anexo-card-wrap">
           <div class="anexo-card card-enter">
             <div class="anexo-card-preview" style="background:linear-gradient(135deg,var(--black-4),var(--black-5))">
               ${isImg
                 ? `<img src="${a.file_url}" alt="${Utils.escapeHtml(a.file_name)}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius) var(--radius) 0 0" onerror="this.parentElement.innerHTML='<i class=\\"fa-solid fa-image\\" style=\\"font-size:2.2rem;color:#60a5fa\\"></i>'">`
                 : `<i class="${fileInfo.icon}" style="font-size:2.8rem;color:${fileInfo.color}"></i>`
               }
               <div class="anexo-type-badge" style="background:${fileInfo.color}22;border-color:${fileInfo.color}44;color:${fileInfo.color}">
                 <i class="${fileInfo.icon}" style="font-size:.6rem"></i> ${fileInfo.label}
               </div>
             </div>
             <div class="anexo-card-body">
               <div class="anexo-card-name" title="${Utils.escapeHtml(a.file_name)}">${Utils.escapeHtml(a.file_name)}</div>
               <div class="anexo-card-meta">
                 <span><i class="fa-solid fa-user" style="font-size:.62rem"></i> ${Utils.escapeHtml(a.user?.name||'—')}</span>
               </div>
               <div class="anexo-card-meta" style="margin-top:4px">
                 <span style="color:${statusColor}">
                   <i class="fa-solid fa-list-check" style="font-size:.62rem"></i>
                   ${Utils.escapeHtml(a.activity?.title||'—')}
                 </span>
               </div>
               <div class="anexo-card-meta" style="margin-top:4px">
                 <span><i class="fa-solid fa-calendar" style="font-size:.62rem"></i> ${dateStr}</span>
               </div>
               <div class="anexo-card-actions">
                 <button class="btn btn-ghost btn-sm anexo-view-btn" data-url="${a.file_url}" title="Visualizar">
                   <i class="fa-solid fa-eye"></i> Ver
                 </button>
                 <button class="btn btn-outline btn-sm anexo-download-btn" data-url="${a.file_url}" data-name="${Utils.escapeHtml(a.file_name)}" title="Download">
                   <i class="fa-solid fa-download"></i>
                 </button>
                 ${isDiretoria ? `<button class="btn btn-ghost btn-sm anexo-delete-btn" data-id="${a.id}" data-name="${Utils.escapeHtml(a.file_name)}" data-url="${a.file_url}" title="Excluir" style="color:var(--red-bright);margin-left:auto">
                   <i class="fa-solid fa-trash"></i>
                 </button>` : ''}
               </div>
             </div>
           </div>
         </div>`;
     }
   
     content.innerHTML = `
       <div class="page-header">
         <div>
           <div class="page-header-title">Atividades</div>
           <div class="page-header-sub" id="pageHeaderSub">${canGerenciar ? 'Gerenciar todas as atividades' : 'Suas tarefas e entregas'}</div>
         </div>
         ${canCriar ? `<button class="btn btn-primary" id="newActivityBtn"><i class="fa-solid fa-plus"></i> Nova Atividade</button>` : ''}
       </div>
       <div class="filters-bar">
         ${['Todos','Pendente','Em andamento','Concluída','Cancelada'].map(f =>
           `<button class="filter-btn ${f==='Todos'?'active':''}" data-filter="${f}">${f}</button>`
         ).join('')}
         <button class="filter-btn filter-btn-anexos" data-filter="__anexos__">
           <i class="fa-solid fa-paperclip" style="font-size:.75rem;margin-right:4px"></i>Anexos
         </button>
       </div>
       <div class="activities-grid" id="activitiesGrid"></div>
       <div class="modal-overlay" id="activityModal">
         <div class="modal">
           <div class="modal-header">
             <div class="modal-title" id="modalTitle"></div>
             <button class="modal-close" id="modalClose"><i class="fa-solid fa-xmark"></i></button>
           </div>
           <div class="modal-body" id="modalBody"></div>
           <div class="modal-footer" id="modalFooter"></div>
         </div>
       </div>
     `;
   
     await loadActivities();
   
     content.querySelectorAll('.filter-btn').forEach(btn => {
       btn.addEventListener('click', () => {
         content.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
         btn.classList.add('active');
         activeFilter = btn.dataset.filter;
         const subEl = document.getElementById('pageHeaderSub');
         if (activeFilter === '__anexos__') {
           if (subEl) subEl.textContent = 'Todos os arquivos enviados nas atividades';
           if (canCriar) document.getElementById('newActivityBtn') && (document.getElementById('newActivityBtn').style.display = 'none');
           loadAnexosView();
         } else {
           if (subEl) subEl.textContent = canGerenciar ? 'Gerenciar todas as atividades' : 'Suas tarefas e entregas';
           if (canCriar) document.getElementById('newActivityBtn') && (document.getElementById('newActivityBtn').style.display = '');
           loadActivities();
         }
       });
     });
   
     if (canCriar) {
       document.getElementById('newActivityBtn')?.addEventListener('click', () => openNewActivityModal(profile, loadActivities));
     }
   
     const modal = document.getElementById('activityModal');
     if (modal && modal.parentElement !== document.body) document.body.appendChild(modal);
     document.getElementById('modalClose').addEventListener('click', () => modal.classList.remove('open'));
     modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
   }
   
   function renderModalAnexos(anexos) {
     if (!anexos || anexos.length === 0) return '';
     const items = anexos.map(a => {
       const ext = (a.file_name||'').split('.').pop().toLowerCase();
       const isImg = ['jpg','jpeg','png','gif','webp'].includes(ext);
       let icon = 'fa-solid fa-file';
       let iconColor = 'var(--gold)';
       if (isImg) { icon = 'fa-solid fa-image'; iconColor = '#60a5fa'; }
       else if (ext === 'pdf') { icon = 'fa-solid fa-file-pdf'; iconColor = '#f87171'; }
       else if (['doc','docx'].includes(ext)) { icon = 'fa-solid fa-file-word'; iconColor = '#60a5fa'; }
       else if (['xls','xlsx'].includes(ext)) { icon = 'fa-solid fa-file-excel'; iconColor = '#4ade80'; }
       else if (['ppt','pptx'].includes(ext)) { icon = 'fa-solid fa-file-powerpoint'; iconColor = '#fb923c'; }
       else if (['mp4','mov','avi','mkv'].includes(ext)) { icon = 'fa-solid fa-film'; iconColor = '#a78bfa'; }
       const safeName = Utils.escapeHtml(a.file_name||'arquivo');
       const safeUser = Utils.escapeHtml(a.user?.name||'—');
       const safeUrl = a.file_url||'';
       return '<div class="modal-anexo-item">' +
         '<div class="modal-anexo-icon" style="background:' + iconColor + '18;border-color:' + iconColor + '33">' +
           '<i class="' + icon + '" style="color:' + iconColor + '"></i>' +
         '</div>' +
         '<div class="modal-anexo-info">' +
           '<div class="modal-anexo-name" title="' + safeName + '">' + safeName + '</div>' +
           '<div class="modal-anexo-meta"><i class="fa-solid fa-user" style="font-size:.6rem"></i> ' + safeUser + '</div>' +
         '</div>' +
         '<div class="modal-anexo-actions">' +
           '<a href="' + safeUrl + '" target="_blank" class="btn btn-ghost btn-sm" title="Visualizar"><i class="fa-solid fa-eye"></i></a>' +
           '<a href="' + safeUrl + '" target="_blank" class="btn btn-outline btn-sm" title="Download" onclick="event.preventDefault();const l=document.createElement(\'a\');l.href=\''+safeUrl+'\';l.download=\''+safeName+'\';document.body.appendChild(l);l.click();document.body.removeChild(l)"><i class="fa-solid fa-download"></i></a>' +
         '</div>' +
       '</div>';
     }).join('');
     return '<div class="divider"></div>' +
       '<div class="modal-anexos-header">' +
         '<i class="fa-solid fa-paperclip" style="color:var(--gold)"></i>' +
         '<span>Anexos da Atividade</span>' +
         '<span class="modal-anexos-count">' + anexos.length + '</span>' +
       '</div>' +
       '<div class="modal-anexos-list">' + items + '</div>';
   }

   async function openActivityModal(id, acts, profile) {
     const act = acts.find(a => a.id === id);
     if (!act) return;
     const modal = document.getElementById('activityModal');
     const isDiretoria = profile.tier === 'diretoria';
     const diff = Utils.daysDiff(act.deadline);
   
     const passed  = Utils.isDeadlinePassed(act);
     const hasExt  = Utils.hasExtendedDeadline(act);
     const canSubmit = Utils.isActivityOpen(act);
     // Busca co-membros via junction table
     const { data: collabRows } = await db.from('activity_collaborators').select('user_id').eq('activity_id', id);
     const collabMembers   = (collabRows||[]).map(r => r.user_id);
     const isCollaborative = collabMembers.length > 0;
     const isOwner = act.assigned_to === profile.id || collabMembers.includes(profile.id);
     const isLateSubmission = passed && hasExt && canSubmit;
   
     document.getElementById('modalTitle').textContent = act.title;
   
     const { data: responses } = await db
       .from('activity_responses')
       .select('*, user:user_id(name,initials,color)')
       .eq('activity_id', id)
       .order('created_at', { ascending: false });

     // Respostas com anexos
     const anexosDaAtividade = (responses||[]).filter(r => r.file_url && r.file_name);

     let deadlineLabel;
     if (hasExt) deadlineLabel = `⚠️ Prazo estendido até ${Utils.formatDate(act.extended_deadline)}`;
     else if (passed) deadlineLabel = '🔴 Prazo excedido';
     else if (diff < 0) deadlineLabel = `Vencida há ${Math.abs(diff)} dias`;
     else if (diff === 0) deadlineLabel = 'Vence hoje';
     else deadlineLabel = `${diff} dias restantes`;
   
     // Scheduling label
     let scheduleInfo = '';
     if (act.opens_at || act.closes_at) {
       scheduleInfo = `
         <div class="modal-detail-row">
           <i class="fa-solid fa-calendar-clock"></i>
           <span class="modal-detail-label">Disponível:</span>
           <span>${act.opens_at ? Utils.formatDateTime(act.opens_at) : 'Agora'} → ${act.closes_at ? Utils.formatDateTime(act.closes_at) : Utils.formatDate(act.deadline)}</span>
         </div>`;
     }
   
     document.getElementById('modalBody').innerHTML = `
       <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
         ${Utils.statusBadge(act.status)}
         <span class="badge badge-gold">${act.priority}</span>
         ${passed && !hasExt ? '<span class="badge badge-red">Prazo Excedido</span>' : ''}
         ${isLateSubmission ? '<span class="badge" style="background:rgba(234,179,8,.15);color:#eab308;border:1px solid rgba(234,179,8,.3)">Prazo Estendido</span>' : ''}
       </div>
       <div class="modal-detail-row">
         <i class="fa-solid fa-user"></i>
         <span class="modal-detail-label">Atribuído por:</span>
         <span>${Utils.escapeHtml(act.assigned_by_profile?.name||'—')}</span>
       </div>
       ${isCollaborative ? `
       <div class="modal-detail-row" style="align-items:flex-start">
         <i class="fa-solid fa-users" style="color:var(--gold)"></i>
         <span class="modal-detail-label">Colaborativa</span>
         <span id="collab-members-row" style="font-size:.8rem;color:var(--text-2)">Carregando membros...</span>
       </div>` : ''}
       <div class="modal-detail-row">
         <i class="fa-solid fa-clock"></i>
         <span class="modal-detail-label">Prazo:</span>
         <span style="color:${passed && !hasExt ? 'var(--red-bright)' : diff <= 3 && !passed ? 'var(--red-bright)' : 'inherit'}">
           ${Utils.formatDate(act.deadline)} · ${deadlineLabel}
         </span>
       </div>
       ${scheduleInfo}
       <div class="divider"></div>
       <div style="font-size:.8rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Descrição</div>
       <div class="modal-description">${Utils.escapeHtml(act.description)}</div>

       ${renderModalAnexos(anexosDaAtividade)}

       ${responses && responses.length > 0 ? `
         <div class="divider"></div>
         <div style="font-size:.8rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">Respostas (${responses.length})</div>
         ${responses.map(r => {
           const canSeeFile = isDiretoria || r.user_id === profile.id;
           const canEditResp = r.user_id === profile.id && !passed;
           return `
             <div style="background:var(--black-4);border:1px solid var(--border-faint);border-radius:var(--radius);padding:12px;margin-bottom:8px" id="resp-${r.id}">
               <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                 <div class="avatar" style="width:28px;height:28px;font-size:.65rem;background:linear-gradient(135deg,${r.user?.color||'#333'},#1a1a1a)">${r.user?.initials||'?'}</div>
                 <span style="font-size:.8rem;font-weight:600">${Utils.escapeHtml(r.user?.name||'—')}</span>
                 ${r.is_late ? '<span class="badge badge-red" style="font-size:.62rem">Enviado com atraso</span>' : ''}
                 <span style="font-size:.72rem;color:var(--text-3);margin-left:auto">${Utils.formatDateTime(r.created_at)}</span>
                 ${canEditResp || isDiretoria ? `
                   <div style="display:flex;gap:4px">
                     ${canEditResp ? `<button class="btn btn-ghost btn-sm edit-response-btn" data-resp-id="${r.id}" data-resp-text="${Utils.escapeHtml(r.text)}" title="Editar"><i class="fa-solid fa-pen" style="font-size:.7rem"></i></button>` : ''}
                     <button class="btn btn-ghost btn-sm delete-response-btn" data-resp-id="${r.id}" title="Excluir"><i class="fa-solid fa-trash" style="font-size:.7rem;color:var(--red-bright)"></i></button>
                   </div>` : ''}
               </div>
               <div style="font-size:.85rem;color:var(--text-2)" id="resp-text-${r.id}">${Utils.escapeHtml(r.text)}</div>
               ${r.file_url && canSeeFile ? `<a href="${r.file_url}" target="_blank" class="btn btn-ghost btn-sm" style="margin-top:8px"><i class="fa-solid fa-paperclip"></i> ${Utils.escapeHtml(r.file_name||'Arquivo')}</a>` : ''}
             </div>`;
         }).join('')}
       ` : ''}
   
       ${act.status !== 'Concluída' && ((isOwner && canSubmit) || isDiretoria) ? `
         <div class="divider"></div>
         ${isLateSubmission && isOwner ? '<div style="background:rgba(234,179,8,.1);border:1px solid rgba(234,179,8,.3);border-radius:var(--radius);padding:10px;margin-bottom:12px;font-size:.8rem;color:#eab308"><i class="fa-solid fa-triangle-exclamation"></i> Você está enviando <strong>com atraso</strong>. O prazo original expirou.</div>' : ''}
         <div style="font-size:.8rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">${isDiretoria && !isOwner ? 'Resposta da Diretoria' : 'Enviar Resposta'}</div>
         <div class="form-group" style="margin-bottom:12px">
           <label class="form-label">Resposta</label>
           <textarea class="form-input form-textarea" id="responseText" placeholder="${isDiretoria && !isOwner ? 'Feedback ou comentário da Diretoria...' : 'Descreva o que foi feito...'}"></textarea>
         </div>
         <div class="upload-zone" id="uploadZone">
           <div class="upload-zone-icon"><i class="fa-solid fa-cloud-arrow-up"></i></div>
           <div class="upload-zone-text">Clique para anexar arquivo (opcional)</div>
           <div class="upload-zone-hint">PDF, DOC, XLSX, PPTX, PNG, JPG, MP4... — máx. 100MB</div>
           <input type="file" id="fileInput" style="display:none">
         </div>
         <div id="fileChosen" style="font-size:.78rem;color:var(--gold);margin-top:8px;display:none"></div>
       ` : ''}
   
       ${act.status !== 'Concluída' && isOwner && passed && !hasExt ? `
         <div class="divider"></div>
         <div style="background:rgba(185,28,28,.1);border:1px solid var(--border-red);border-radius:var(--radius);padding:14px;text-align:center">
           <i class="fa-solid fa-lock" style="color:var(--red-bright);font-size:1.2rem;display:block;margin-bottom:8px"></i>
           <div style="font-weight:600;color:var(--red-bright);margin-bottom:4px">Prazo Excedido</div>
           <div style="font-size:.8rem;color:var(--text-3)">O prazo para envio desta atividade já passou. Entre em contato com a diretoria caso precise de extensão.</div>
         </div>
       ` : ''}
   
       ${isDiretoria ? `
         <div class="divider"></div>
         <div style="font-size:.8rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Ações da Diretoria</div>
         <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
           ${act.status !== 'Concluída' && act.status !== 'Cancelada' ? `<button class="btn btn-sm btn-outline" id="markDoneBtn"><i class="fa-solid fa-check"></i> Marcar Concluída</button>` : ''}
           ${act.status !== 'Cancelada' ? `<button class="btn btn-sm btn-ghost" id="cancelActBtn" style="color:var(--red-bright)"><i class="fa-solid fa-ban"></i> Cancelar</button>` : ''}
           ${act.status === 'Cancelada' ? `<button class="btn btn-sm btn-outline" id="uncancelActBtn" style="color:#22c55e;border-color:rgba(34,197,94,.35)"><i class="fa-solid fa-rotate-left"></i> Descancelar</button>` : ''}
           <button class="btn btn-sm btn-ghost" id="deleteActBtn" style="color:var(--red-bright);border-color:var(--border-red)"><i class="fa-solid fa-trash"></i> Excluir</button>
         </div>
         ${act.status !== 'Cancelada' ? `
         <div class="form-group" style="margin-bottom:0">
           <label class="form-label"><i class="fa-solid fa-calendar-plus"></i> Estender Prazo</label>
           <div style="display:flex;gap:8px;align-items:center">
             <input class="form-input" type="date" id="extDeadlineInput" value="${act.extended_deadline||''}" min="${new Date().toISOString().split('T')[0]}" style="max-width:200px">
             <button class="btn btn-sm btn-outline" id="extDeadlineBtn">Aplicar</button>
           </div>
           <div style="font-size:.72rem;color:var(--text-3);margin-top:4px">Define um novo prazo de entrega após o original.</div>
         </div>` : ''}
       ` : ''}
     `;
   
     // Submit response
     const canRespond = act.status !== 'Concluída' && ((isOwner && canSubmit) || isDiretoria);
     const submitFooter = canRespond
       ? `<button class="btn btn-ghost" id="cancelModal">Cancelar</button><button class="btn btn-primary" id="submitActivity"><i class="fa-solid fa-paper-plane"></i> Enviar Resposta</button>`
       : `<button class="btn btn-outline" id="cancelModal">Fechar</button>`;
     document.getElementById('modalFooter').innerHTML = submitFooter;
   
     modal.classList.add('open');

     // Carregar nomes dos membros colaborativos
     if (isCollaborative && collabMembers.length) {
       db.from('profiles').select('id,name').in('id', collabMembers).then(({ data: cProfs }) => {
         const el = document.getElementById('collab-members-row');
         if (el) el.textContent = (cProfs||[]).map(p => p.name).join(', ') || '—';
       });
     }
   
     document.getElementById('cancelModal')?.addEventListener('click', () => modal.classList.remove('open'));
   
     // File upload — com drag-and-drop e preview
     const uploadZone = document.getElementById('uploadZone');
     const fileInput = document.getElementById('fileInput');
     const fileChosen = document.getElementById('fileChosen');

     function handleFileSelected(f) {
       if (!f) return;
       const MAX = 100 * 1024 * 1024;
       if (f.size > MAX) { Utils.showToast('Arquivo muito grande. Máximo: 100MB.', 'error'); return; }
       fileChosen.innerHTML = `
         <div style="display:flex;align-items:center;gap:8px;background:var(--black-4);border:1px solid var(--border-gold);border-radius:var(--radius);padding:8px 12px">
           <i class="fa-solid fa-paperclip" style="color:var(--gold)"></i>
           <span style="font-size:.8rem;color:var(--gold);font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</span>
           <span style="font-size:.7rem;color:var(--text-3)">${(f.size/1024).toFixed(0)} KB</span>
           <button id="clearFileBtn" style="background:none;border:none;cursor:pointer;color:var(--text-3);padding:0 2px;font-size:.8rem" title="Remover"><i class="fa-solid fa-xmark"></i></button>
         </div>`;
       fileChosen.style.display = 'block';
       document.getElementById('clearFileBtn')?.addEventListener('click', () => {
         if (fileInput) fileInput.value = '';
         fileChosen.innerHTML = '';
         fileChosen.style.display = 'none';
       });
     }

     uploadZone?.addEventListener('click', () => fileInput?.click());
     fileInput?.addEventListener('change', () => handleFileSelected(fileInput.files[0]));

     // Drag & drop
     uploadZone?.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('upload-zone-active'); });
     uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('upload-zone-active'));
     uploadZone?.addEventListener('drop', e => {
       e.preventDefault();
       uploadZone.classList.remove('upload-zone-active');
       const f = e.dataTransfer.files[0];
       if (f && fileInput) {
         const dt = new DataTransfer(); dt.items.add(f);
         fileInput.files = dt.files;
         handleFileSelected(f);
       }
     });
   
     // Submit response
     document.getElementById('submitActivity')?.addEventListener('click', async () => {
       const text = document.getElementById('responseText')?.value.trim();
       if (!text) { document.getElementById('responseText').style.borderColor = 'var(--red-bright)'; return; }
       const btn = document.getElementById('submitActivity');
       btn.disabled = true;
       btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando...';
   
       let file_url = null, file_name = null;
       const fi = document.getElementById('fileInput');
       if (fi?.files[0]) {
         const file = fi.files[0];
         const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
         const path = `${profile.id}/${id}/${Date.now()}_${sanitizedName}`;
         const { data: upData, error: upErr } = await db.storage.from('activity-files').upload(path, file);
         if (upErr) {
           Utils.showToast(`Erro no upload: ${upErr.message}`, 'error');
           btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar Resposta';
           return;
         }
         if (upData) {
           const { data: urlData } = db.storage.from('activity-files').getPublicUrl(path);
           file_url = urlData.publicUrl; file_name = file.name;
         }
       }
   
       const { error } = await db.from('activity_responses').insert({
         activity_id: id, user_id: profile.id, text, file_url, file_name,
         is_late: isOwner ? isLateSubmission : false
       });
   
       if (!error) {
         if (act.status === 'Pendente') {
           await db.from('activities').update({ status: 'Em andamento' }).eq('id', id);
         }
         // Notifica: se diretoria respondeu, avisa o membro; se membro respondeu, avisa a diretoria
         if (isDiretoria && !isOwner) {
           // Notifica assigned_to + collab_members
           const toNotify = isCollaborative
             ? [...new Set([act.assigned_to, ...collabMembers].filter(u => u && u !== profile.id))]
             : [act.assigned_to].filter(Boolean);
           await Promise.all(toNotify.map(uid =>
             db.rpc('notify_member', { p_user_id: uid, p_message: `A Diretoria comentou na atividade "${act.title}"`, p_type: 'activity', p_icon: '📋' })
           ));
         } else if (isCollaborative) {
           // Notifica os outros membros collab
           const others = [...new Set([act.assigned_to, ...collabMembers].filter(u => u && u !== profile.id))];
           await Promise.all(others.map(uid =>
             db.rpc('notify_member', { p_user_id: uid, p_message: `${profile.name} comentou na atividade colaborativa "${act.title}"`, p_type: 'activity', p_icon: '📋' })
           ));
           await db.rpc('notify_diretoria', {
             p_message: `${profile.name} comentou na atividade colaborativa "${act.title}"`,
             p_type: 'activity', p_icon: '📋'
           });
         } else {
           await db.rpc('notify_diretoria', {
             p_message: `${profile.name} enviou resposta para "${act.title}"`,
             p_type: 'activity', p_icon: '📋'
           });
         }
         modal.classList.remove('open');
         Utils.showToast(isOwner && isLateSubmission ? '⚠️ Resposta enviada com atraso!' : '✅ Resposta enviada com sucesso!');
         setTimeout(() => initAtividades(), 300);
       } else {
         Utils.showToast('Erro ao enviar resposta.', 'error');
         btn.disabled = false; btn.textContent = 'Enviar Resposta';
       }
     });
   
     // Edit response buttons
     document.querySelectorAll('.edit-response-btn').forEach(btn => {
       btn.addEventListener('click', async (e) => {
         e.stopPropagation();
         const respId = btn.dataset.respId;
         const oldText = responses.find(r => r.id === respId)?.text || '';
         const textEl = document.getElementById(`resp-text-${respId}`);
         if (textEl.querySelector('textarea')) return; // already editing
   
         const orig = textEl.textContent;
         textEl.innerHTML = `<textarea class="form-input" style="min-height:80px;margin-bottom:6px">${Utils.escapeHtml(orig)}</textarea>
           <div style="display:flex;gap:6px">
             <button class="btn btn-sm btn-primary save-edit-resp" data-id="${respId}">Salvar</button>
             <button class="btn btn-sm btn-ghost cancel-edit-resp">Cancelar</button>
           </div>`;
   
         textEl.querySelector('.cancel-edit-resp').addEventListener('click', () => {
           textEl.innerHTML = Utils.escapeHtml(orig);
         });
         textEl.querySelector('.save-edit-resp').addEventListener('click', async () => {
           const newText = textEl.querySelector('textarea').value.trim();
           if (!newText) return;
           const { error } = await db.from('activity_responses').update({ text: newText }).eq('id', respId);
           if (!error) {
             textEl.innerHTML = Utils.escapeHtml(newText);
             Utils.showToast('Resposta atualizada!');
           } else Utils.showToast('Erro ao editar.', 'error');
         });
       });
     });
   
     // Delete response buttons
     document.querySelectorAll('.delete-response-btn').forEach(btn => {
       btn.addEventListener('click', async (e) => {
         e.stopPropagation();
         if (!confirm('Excluir esta resposta?')) return;
         const { error } = await db.from('activity_responses').delete().eq('id', btn.dataset.respId);
         if (!error) {
           document.getElementById(`resp-${btn.dataset.respId}`)?.remove();
           Utils.showToast('Resposta excluída.');
         } else Utils.showToast('Erro ao excluir.', 'error');
       });
     });
   
     // Diretoria actions
     document.getElementById('markDoneBtn')?.addEventListener('click', async () => {
       await db.from('activities').update({ status: 'Concluída' }).eq('id', id);
       // Notifica assigned_to + todos collab_members
       const toNotify = isCollaborative
         ? [...new Set([act.assigned_to, ...collabMembers].filter(Boolean))]
         : [act.assigned_to].filter(Boolean);
       await Promise.all(toNotify.map(uid =>
         db.rpc('notify_member', { p_user_id: uid, p_message: `A atividade colaborativa "${act.title}" foi marcada como concluída.`, p_type: 'approval', p_icon: '✅' })
       ));
       modal.classList.remove('open');
       Utils.showToast('Atividade concluída.');
       setTimeout(() => initAtividades(), 300);
     });
   
     document.getElementById('cancelActBtn')?.addEventListener('click', async () => {
       if (!confirm('Cancelar esta atividade?')) return;
       await db.from('activities').update({ status: 'Cancelada' }).eq('id', id);
       modal.classList.remove('open');
       Utils.showToast('Atividade cancelada.');
       setTimeout(() => initAtividades(), 300);
     });
   
     document.getElementById('uncancelActBtn')?.addEventListener('click', async () => {
       if (!confirm('Reativar esta atividade como Pendente?')) return;
       await db.from('activities').update({ status: 'Pendente' }).eq('id', id);
       await db.rpc('notify_member', { p_user_id: act.assigned_to, p_message: `A atividade "${act.title}" foi reativada pela Diretoria.`, p_type: 'activity', p_icon: '🔄' });
       modal.classList.remove('open');
       Utils.showToast('Atividade reativada.');
       setTimeout(() => initAtividades(), 300);
     });
   
     document.getElementById('deleteActBtn')?.addEventListener('click', async () => {
       if (!confirm(`Excluir permanentemente "${act.title}"? Esta ação não pode ser desfeita.`)) return;
       const { error } = await db.from('activities').delete().eq('id', id);
       if (!error) {
         modal.classList.remove('open');
         Utils.showToast('Atividade excluída permanentemente.');
         setTimeout(() => initAtividades(), 300);
       } else {
         Utils.showToast('Erro ao excluir atividade.', 'error');
       }
     });
   
     const extBtn = document.getElementById('extDeadlineBtn');
     if (extBtn) {
       let _extLock = false;
       const applyExtend = async () => {
         if (_extLock) return;
         _extLock = true;
         const val = document.getElementById('extDeadlineInput')?.value;
         if (!val) { Utils.showToast('Selecione uma data.','error'); _extLock = false; return; }
         extBtn.disabled = true;
         extBtn.textContent = '...';
         const { error: extErr } = await db.from('activities')
           .update({ extended_deadline: val })
           .eq('id', id);
         if (!extErr) {
           Utils.showToast('Prazo estendido!');
           document.getElementById('activityModal')?.classList.remove('open');
           setTimeout(() => initAtividades(), 300);
         } else {
           console.error('[MSY] extended_deadline error:', extErr);
           Utils.showToast('Erro ao estender prazo.', 'error');
           extBtn.disabled = false; extBtn.textContent = 'Aplicar';
         }
         _extLock = false;
       };
       extBtn.addEventListener('touchend', (e) => { e.preventDefault(); applyExtend(); }, { passive: false });
       extBtn.addEventListener('click', applyExtend);
     }
   }
   
   function _buildMemberDropdown(members, hiddenId, wrapId, tagsId, phId, dropId, optClass) {
     return `
       <div id="${wrapId}" style="position:relative">
         <div id="${tagsId}" style="display:flex;flex-wrap:wrap;gap:6px;min-height:42px;background:var(--black-3);border:1px solid var(--border-faint);border-radius:var(--radius);padding:8px 10px;cursor:pointer;align-items:center;transition:border-color .15s" onclick="(function(){var d=document.getElementById('${dropId}');d.style.display=d.style.display==='block'?'none':'block'})()">
           <span id="${phId}" style="color:var(--text-3);font-size:.85rem">Selecione os membros...</span>
         </div>
         <div id="${dropId}" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:#0e0e13;border:1px solid rgba(201,168,76,.25);border-radius:var(--radius);z-index:999;max-height:200px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.6)">
           <div style="padding:6px">
             ${(members||[]).map(m => `
               <div class="${optClass}" data-id="${m.id}" data-name="${Utils.escapeHtml(m.name)}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;transition:background .12s" onmouseenter="this.style.background='rgba(201,168,76,.08)'" onmouseleave="this.style.background=this.classList.contains('selected')?'rgba(201,168,76,.1)':'transparent'">
                 <div style="width:16px;height:16px;border-radius:4px;border:1px solid var(--border-faint);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:.65rem" class="na-chk-box-inner"></div>
                 <span style="color:var(--text-1);font-size:.85rem;font-weight:500;flex:1">${Utils.escapeHtml(m.name)}</span>
                 <span style="color:var(--text-3);font-size:.72rem">${Utils.escapeHtml(m.role)}</span>
               </div>`).join('')}
           </div>
         </div>
       </div>
       <input type="hidden" id="${hiddenId}" value="">`;
   }

   function _initMemberDropdown(wrapId, tagsId, phId, dropId, optClass, hiddenId) {
     const tags = document.getElementById(tagsId);
     const drop = document.getElementById(dropId);
     const ph   = document.getElementById(phId);
     if (!tags || !drop) return;
     const selectedIds = new Set();

     function updateTags() {
       tags.querySelectorAll('.na-tag').forEach(t => t.remove());
       ph.style.display = selectedIds.size ? 'none' : '';
       selectedIds.forEach(id => {
         const opt = drop.querySelector(`.${optClass}[data-id="${id}"]`);
         if (!opt) return;
         const tag = document.createElement('span');
         tag.className = 'na-tag';
         tag.dataset.id = id;
         tag.style.cssText = 'display:inline-flex;align-items:center;gap:5px;background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.35);border-radius:20px;padding:3px 10px;font-size:.75rem;color:var(--gold);font-weight:600';
         tag.innerHTML = `${opt.dataset.name} <span class="na-tag-rm" style="cursor:pointer;opacity:.7;margin-left:2px" data-id="${id}">×</span>`;
         tag.querySelector('.na-tag-rm').addEventListener('click', e => {
           e.stopPropagation();
           selectedIds.delete(id);
           const o = drop.querySelector(`.${optClass}[data-id="${id}"]`);
           if (o) { o.classList.remove('selected'); o.querySelector('.na-chk-box-inner').innerHTML=''; o.style.background='transparent'; }
           updateTags();
           document.getElementById(hiddenId).value = [...selectedIds].join(',');
         });
         tags.appendChild(tag);
       });
       document.getElementById(hiddenId).value = [...selectedIds].join(',');
     }

     drop.querySelectorAll(`.${optClass}`).forEach(opt => {
       opt.addEventListener('click', () => {
         const id = opt.dataset.id;
         if (selectedIds.has(id)) {
           selectedIds.delete(id); opt.classList.remove('selected');
           opt.querySelector('.na-chk-box-inner').innerHTML = '';
           opt.style.background = 'transparent';
         } else {
           selectedIds.add(id); opt.classList.add('selected');
           opt.querySelector('.na-chk-box-inner').innerHTML = '<i class="fa-solid fa-check" style="color:var(--gold)"></i>';
           opt.style.background = 'rgba(201,168,76,.1)';
         }
         updateTags();
       });
     });

     document.addEventListener('click', function closeDD(e) {
       if (!document.getElementById(wrapId)?.contains(e.target)) {
         drop.style.display = 'none';
         document.removeEventListener('click', closeDD);
       }
     }, true);
   }

   async function openNewActivityModal(profile, onSuccess) {
     const { data: members } = await db.from('profiles').select('id,name,role').eq('status', 'ativo').order('name');
   
     const modal = document.getElementById('activityModal');
     document.getElementById('modalTitle').textContent = 'Nova Atividade';
     document.getElementById('modalBody').innerHTML = `
       <div class="form-group" style="margin-bottom:14px">
         <label class="form-label">Título *</label>
         <input class="form-input" id="na-title" placeholder="Nome da atividade">
       </div>
       <!-- Tipo de atividade: individual ou colaborativa -->
       <div style="display:flex;gap:8px;margin-bottom:14px">
         <button type="button" id="na-type-individual" class="btn btn-sm btn-outline" style="flex:1;border-color:rgba(201,168,76,.5);color:var(--gold);background:rgba(201,168,76,.1)">
           <i class="fa-solid fa-user"></i> Individual
         </button>
         <button type="button" id="na-type-collab" class="btn btn-sm btn-ghost" style="flex:1">
           <i class="fa-solid fa-users"></i> Colaborativa
         </button>
       </div>

       <!-- Seção individual: multi-envio -->
       <div id="na-section-individual">
         <div class="form-group" style="margin-bottom:14px">
           <label class="form-label">Atribuir para * <span style="font-size:.72rem;color:var(--text-3);font-weight:400">— múltiplos: cria uma cópia para cada</span></label>
           ${_buildMemberDropdown(members, 'na-member-ids', 'na-members-wrap', 'na-members-tags', 'na-members-placeholder', 'na-members-dropdown', 'na-member-opt')}
         </div>
       </div>

       <!-- Seção colaborativa: um membro principal + co-membros -->
       <div id="na-section-collab" style="display:none">
         <div class="form-group" style="margin-bottom:12px">
           <label class="form-label">Responsável principal * <span style="font-size:.72rem;color:var(--text-3);font-weight:400">— quem lidera</span></label>
           <select class="form-input form-select" id="na-collab-owner">
             <option value="">Selecione o responsável...</option>
             ${(members||[]).map(m => `<option value="${m.id}">${Utils.escapeHtml(m.name)} — ${Utils.escapeHtml(m.role)}</option>`).join('')}
           </select>
         </div>
         <div class="form-group" style="margin-bottom:14px">
           <label class="form-label">Co-membros * <span style="font-size:.72rem;color:var(--text-3);font-weight:400">— participam juntos</span></label>
           ${_buildMemberDropdown(members, 'na-collab-ids', 'na-collab-wrap', 'na-collab-tags', 'na-collab-placeholder', 'na-collab-dropdown', 'na-collab-opt')}
         </div>
       </div>
       <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
         <div class="form-group">
           <label class="form-label">Prazo *</label>
           <input class="form-input" type="date" id="na-deadline" min="${new Date().toISOString().split('T')[0]}">
         </div>
         <div class="form-group">
           <label class="form-label">Prioridade</label>
           <select class="form-input form-select" id="na-priority">
             <option value="Baixa">Baixa</option>
             <option value="Média" selected>Média</option>
             <option value="Alta">Alta</option>
           </select>
         </div>
       </div>
       <div class="form-group" style="margin-bottom:14px">
         <label class="form-label">Descrição *</label>
         <textarea class="form-input form-textarea" id="na-desc" placeholder="Instruções detalhadas..."></textarea>
       </div>
       <div style="border-top:1px solid var(--border-faint);padding-top:14px;margin-top:4px">
         <div style="font-size:.78rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px"><i class="fa-solid fa-calendar-clock"></i> Agendamento (opcional)</div>
         <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
           <div class="form-group">
             <label class="form-label">Disponível a partir de</label>
             <input class="form-input" type="datetime-local" id="na-opens">
           </div>
           <div class="form-group">
             <label class="form-label">Fecha para envio em</label>
             <input class="form-input" type="datetime-local" id="na-closes">
           </div>
         </div>
         <div style="font-size:.72rem;color:var(--text-3);margin-top:4px">Se preenchido, a atividade só aceita envios dentro deste período.</div>
       </div>
       <div style="border-top:1px solid var(--border-faint);padding-top:14px;margin-top:4px">
         <div style="font-size:.78rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px"><i class="fa-solid fa-bell"></i> Canais de Notificação</div>
         <div style="font-size:.75rem;color:var(--text-3);margin-bottom:10px">Escolha como o membro será notificado. O sistema respeita as preferências salvas do membro.</div>
         <div style="display:flex;gap:12px;flex-wrap:wrap">
           <label style="display:flex;align-items:center;gap:8px;cursor:pointer;background:var(--black-3);border:1px solid var(--border-faint);border-radius:var(--radius);padding:8px 14px;font-size:.82rem">
             <input type="checkbox" id="na-notif-push" checked style="accent-color:var(--red-bright);width:15px;height:15px">
             <i class="fa-solid fa-mobile-screen" style="color:var(--red-bright)"></i> Push no Dispositivo
           </label>
           <label style="display:flex;align-items:center;gap:8px;cursor:pointer;background:var(--black-3);border:1px solid var(--border-faint);border-radius:var(--radius);padding:8px 14px;font-size:.82rem">
             <input type="checkbox" id="na-notif-email" style="accent-color:#60a5fa;width:15px;height:15px">
             <i class="fa-solid fa-envelope" style="color:#60a5fa"></i> Email
           </label>
         </div>
         <div style="font-size:.68rem;color:var(--text-3);margin-top:8px"><i class="fa-solid fa-circle-info"></i> Canais só são disparados se o membro tiver aquela preferência ativada no perfil.</div>
       </div>
     `;
     document.getElementById('modalFooter').innerHTML = `
       <button class="btn btn-ghost" id="cancelModal">Cancelar</button>
       <button class="btn btn-primary" id="createActivityBtn"><i class="fa-solid fa-plus"></i> Criar Atividade</button>
     `;
     modal.classList.add('open');

     // ── Init dropdowns ──
     _initMemberDropdown('na-members-wrap', 'na-members-tags', 'na-members-placeholder', 'na-members-dropdown', 'na-member-opt', 'na-member-ids');
     _initMemberDropdown('na-collab-wrap', 'na-collab-tags', 'na-collab-placeholder', 'na-collab-dropdown', 'na-collab-opt', 'na-collab-ids');

     // ── Toggle individual / colaborativa ──
     let _isCollab = false;
     const btnInd   = document.getElementById('na-type-individual');
     const btnCollab = document.getElementById('na-type-collab');
     const secInd   = document.getElementById('na-section-individual');
     const secCollab = document.getElementById('na-section-collab');

     btnInd.addEventListener('click', () => {
       _isCollab = false;
       btnInd.style.cssText   = 'flex:1;border-color:rgba(201,168,76,.5);color:var(--gold);background:rgba(201,168,76,.1)';
       btnCollab.style.cssText = 'flex:1;border-color:var(--border-faint);color:var(--text-2);background:transparent';
       secInd.style.display    = '';
       secCollab.style.display = 'none';
     });
     btnCollab.addEventListener('click', () => {
       _isCollab = true;
       btnCollab.style.cssText = 'flex:1;border-color:rgba(201,168,76,.5);color:var(--gold);background:rgba(201,168,76,.1)';
       btnInd.style.cssText    = 'flex:1;border-color:var(--border-faint);color:var(--text-2);background:transparent';
       secCollab.style.display = '';
       secInd.style.display    = 'none';
     });

     document.getElementById('cancelModal').addEventListener('click', () => modal.classList.remove('open'));

     document.getElementById('createActivityBtn').addEventListener('click', async () => {
       const title    = document.getElementById('na-title').value.trim();
       const deadline = document.getElementById('na-deadline').value;
       const priority = document.getElementById('na-priority').value;
       const desc     = document.getElementById('na-desc').value.trim();
       const opens    = document.getElementById('na-opens').value;
       const closes   = document.getElementById('na-closes').value;

       const channels = [];
       if (document.getElementById('na-notif-push')?.checked)  channels.push('push');
       if (document.getElementById('na-notif-email')?.checked) channels.push('email');

       if (!title || !deadline || !desc) {
         Utils.showToast('Preencha título, prazo e descrição.', 'error'); return;
       }

       const btn = document.getElementById('createActivityBtn');

       if (_isCollab) {
         // ── Modo colaborativo: 1 atividade compartilhada ──
         const ownerId   = document.getElementById('na-collab-owner').value;
         const collabIds = (document.getElementById('na-collab-ids').value || '').split(',').filter(Boolean);
         if (!ownerId) { Utils.showToast('Selecione o responsável principal.', 'error'); return; }
         if (!collabIds.length) { Utils.showToast('Selecione ao menos um co-membro.', 'error'); return; }
         if (collabIds.includes(ownerId)) { Utils.showToast('O responsável não pode ser co-membro ao mesmo tempo.', 'error'); return; }

         btn.disabled = true;
         btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Criando...';

         const payload = {
           title, description: desc, assigned_to: ownerId, assigned_by: profile.id, deadline, priority
         };
         if (opens)  payload.opens_at  = new Date(opens).toISOString();
         if (closes) payload.closes_at = new Date(closes).toISOString();

         const { data: newAct, error } = await db.from('activities').insert(payload).select('id').single();

         if (!error && newAct) {
           // Registra co-membros na tabela auxiliar
           await db.from('activity_collaborators').insert(
             collabIds.map(uid => ({ activity_id: newAct.id, user_id: uid }))
           );
           const allMembers = [ownerId, ...collabIds];
           await Promise.all(allMembers.map(uid =>
             NotifPrefs.dispatch(uid, {
               message: `Nova atividade colaborativa: "${title}". Prazo: ${Utils.formatDate(deadline)}`,
               type: 'activity', icon: '🤝', link: 'atividades.html', channels,
             })
           ));
           modal.classList.remove('open');
           Utils.showToast(`Atividade colaborativa criada para ${allMembers.length} membros!`);
           setTimeout(onSuccess, 300);
         } else {
           Utils.showToast('Erro ao criar atividade.', 'error');
           btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-plus"></i> Criar Atividade';
         }

       } else {
         // ── Modo individual: cópia para cada membro selecionado ──
         const memberIds = (document.getElementById('na-member-ids').value || '').split(',').filter(Boolean);
         if (!memberIds.length) { Utils.showToast('Selecione ao menos um membro.', 'error'); return; }

         btn.disabled = true;
         btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Criando${memberIds.length > 1 ? ` (${memberIds.length})` : ''}...`;

         const payloads = memberIds.map(memberId => {
           const p = { title, description: desc, assigned_to: memberId, assigned_by: profile.id, deadline, priority };
           if (opens)  p.opens_at  = new Date(opens).toISOString();
           if (closes) p.closes_at = new Date(closes).toISOString();
           return p;
         });

         const { error } = await db.from('activities').insert(payloads);

         if (!error) {
           await Promise.all(memberIds.map(uid =>
             NotifPrefs.dispatch(uid, {
               message: `Nova atividade atribuída: "${title}". Prazo: ${Utils.formatDate(deadline)}`,
               type: 'activity', icon: '📋', link: 'atividades.html', channels,
             })
           ));
           modal.classList.remove('open');
           Utils.showToast(memberIds.length > 1 ? `Atividade criada para ${memberIds.length} membros!` : 'Atividade criada com sucesso!');
           setTimeout(onSuccess, 300);
         } else {
           Utils.showToast('Erro ao criar atividade.', 'error');
           btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-plus"></i> Criar Atividade';
         }
       }
     });
   }
   
   /* ============================================================
      PAGE: COMUNICADOS
      ============================================================ */
   async function initComunicados() {
     const profile = await renderSidebar('comunicados');
     if (!profile) return;
     await renderTopBar('Comunicados', profile);
   
     const content = document.getElementById('pageContent');
     Utils.showLoading(content);
   
     const isDiretoria = profile.tier === 'diretoria';
     const canPublicar  = isDiretoria || await MSYPerms.check(profile.id, profile.tier, 'publicar_comunicados');
     const canGerenciarCom = isDiretoria || await MSYPerms.check(profile.id, profile.tier, 'gerenciar_comunicados');
   
     async function loadComunicados() {
       const { data: coms, error } = await db.from('comunicados')
         .select('*, author:author_id(name,initials,color)')
         .order('pinned', { ascending: false })
         .order('created_at', { ascending: false });
   
       if (error) { Utils.showToast('Erro ao carregar comunicados.', 'error'); return; }
   
       const catColors = { 'Urgente':'badge-red','Geral':'badge-gold','Tecnologia':'badge-progress','Evento':'badge-done','Regulamento':'badge-pending' };
       const list = document.getElementById('comunList');
       if (!list) return;
   
       list.innerHTML = !coms || coms.length === 0
         ? `<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-bullhorn"></i></div><div class="empty-state-text">Nenhum comunicado ainda.</div></div>`
         : coms.map(c => `
             <div class="comunicado-card ${c.pinned?'pinned':''} card-enter" data-id="${c.id}">
               ${c.pinned ? '<div class="comunicado-pin"><i class="fa-solid fa-thumbtack"></i></div>' : ''}
               ${canGerenciarCom ? `
                 <div style="position:absolute;top:14px;right:${c.pinned?'40px':'14px'};display:flex;gap:6px;z-index:1">
                   <button class="btn btn-ghost btn-sm toggle-pin" data-id="${c.id}" data-pinned="${c.pinned}" title="${c.pinned?'Desafixar':'Fixar'}">
                     <i class="fa-solid fa-thumbtack" style="color:${c.pinned?'var(--gold)':'var(--text-3)'}"></i>
                   </button>
                   <button class="btn btn-ghost btn-sm delete-com" data-id="${c.id}" title="Excluir">
                     <i class="fa-solid fa-trash" style="color:var(--red-bright)"></i>
                   </button>
                 </div>` : ''}
               <div class="comunicado-header">
                 <div class="avatar" style="background:linear-gradient(135deg,${c.author?.color||'#7f1d1d'},#1a1a1a)">${c.author?.initials||'?'}</div>
                 <div class="comunicado-author-info">
                   <div class="comunicado-title">${Utils.escapeHtml(c.title)}</div>
                   <div class="comunicado-meta">
                     <span><i class="fa-solid fa-user"></i> ${Utils.escapeHtml(c.author?.name||'—')}</span>
                     <span><i class="fa-regular fa-calendar"></i> ${Utils.formatDate(c.created_at)}</span>
                   </div>
                 </div>
               </div>
               <div class="comunicado-body">${Utils.escapeHtml(c.content)}</div>
               <div class="comunicado-footer">
                 <span class="badge ${catColors[c.category]||'badge-gold'}">${c.category}</span>
                 <button class="btn btn-outline btn-sm read-com" data-id="${c.id}">Ler completo <i class="fa-solid fa-chevron-right"></i></button>
               </div>
             </div>`).join('');
   
       list.querySelectorAll('.read-com').forEach(btn => {
         btn.addEventListener('click', e => {
           e.stopPropagation();
           const c = coms.find(x => x.id === btn.dataset.id);
           if (!c) return;
           document.getElementById('comModalTitle').textContent = c.title;
           document.getElementById('comModalBody').innerHTML = `
             <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
               <div class="avatar" style="background:linear-gradient(135deg,${c.author?.color||'#7f1d1d'},#1a1a1a)">${c.author?.initials||'?'}</div>
               <div>
                 <div style="font-weight:600;color:var(--text-1)">${Utils.escapeHtml(c.author?.name||'—')}</div>
                 <div style="font-size:.75rem;color:var(--text-3)">${Utils.formatDate(c.created_at)}</div>
               </div>
               <span class="badge ${catColors[c.category]||'badge-gold'}" style="margin-left:auto">${c.category}</span>
             </div>
             <div class="divider"></div>
             <div style="font-size:.9rem;color:var(--text-1);line-height:1.8;white-space:pre-wrap">${Utils.escapeHtml(c.content)}</div>
           `;
           document.getElementById('comModal').classList.add('open');
         });
       });
   
       list.querySelectorAll('.toggle-pin').forEach(btn => {
         btn.addEventListener('click', async e => {
           e.stopPropagation();
           const newPin = btn.dataset.pinned === 'true' ? false : true;
           await db.from('comunicados').update({ pinned: newPin }).eq('id', btn.dataset.id);
           Utils.showToast(newPin ? 'Comunicado fixado.' : 'Comunicado desafixado.');
           loadComunicados();
         });
       });
   
       list.querySelectorAll('.delete-com').forEach(btn => {
         btn.addEventListener('click', async e => {
           e.stopPropagation();
           if (!confirm('Excluir este comunicado permanentemente?')) return;
           await db.from('comunicados').delete().eq('id', btn.dataset.id);
           Utils.showToast('Comunicado excluído.');
           loadComunicados();
         });
       });
     }
   
     content.innerHTML = `
       <div class="page-header">
         <div>
           <div class="page-header-title">Comunicados</div>
           <div class="page-header-sub">Mural oficial da Masayoshi Order</div>
         </div>
         ${canPublicar ? `<button class="btn btn-primary" id="newComBtn"><i class="fa-solid fa-plus"></i> Novo Comunicado</button>` : ''}
       </div>
       <div class="comunicados-list" id="comunList" style="position:relative"></div>
   
       <div class="modal-overlay" id="comModal">
         <div class="modal">
           <div class="modal-header">
             <div class="modal-title" id="comModalTitle"></div>
             <button class="modal-close" id="comModalClose"><i class="fa-solid fa-xmark"></i></button>
           </div>
           <div class="modal-body" id="comModalBody"></div>
           <div class="modal-footer"><button class="btn btn-outline" id="comModalCancel">Fechar</button></div>
         </div>
       </div>
   
       <div class="modal-overlay" id="newComModal">
         <div class="modal">
           <div class="modal-header">
             <div class="modal-title">Novo Comunicado</div>
             <button class="modal-close" id="newComClose"><i class="fa-solid fa-xmark"></i></button>
           </div>
           <div class="modal-body" id="newComBody">
             <div class="form-group" style="margin-bottom:14px">
               <label class="form-label">Título *</label>
               <input class="form-input" id="com-title" placeholder="Título do comunicado">
             </div>
             <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
               <div class="form-group">
                 <label class="form-label">Categoria</label>
                 <select class="form-input form-select" id="com-cat">
                   <option>Geral</option><option>Urgente</option>
                   <option>Tecnologia</option><option>Evento</option><option>Regulamento</option>
                 </select>
               </div>
               <div class="form-group">
                 <label class="form-label">Fixar?</label>
                 <select class="form-input form-select" id="com-pin">
                   <option value="false">Não</option>
                   <option value="true">Sim — fixar no topo</option>
                 </select>
               </div>
             </div>
             <div class="form-group">
               <label class="form-label">Conteúdo *</label>
               <textarea class="form-input form-textarea" id="com-content" style="min-height:150px" placeholder="Escreva o comunicado..."></textarea>
             </div>
           </div>
           <div class="modal-footer">
             <button class="btn btn-ghost" id="cancelNewCom">Cancelar</button>
             <button class="btn btn-primary" id="publishComBtn"><i class="fa-solid fa-bullhorn"></i> Publicar</button>
           </div>
         </div>
       </div>
     `;
   
     await loadComunicados();
   
     const comModal = document.getElementById('comModal');
     if (comModal && comModal.parentElement !== document.body) document.body.appendChild(comModal);
     document.getElementById('comModalClose').addEventListener('click', () => comModal.classList.remove('open'));
     document.getElementById('comModalCancel').addEventListener('click', () => comModal.classList.remove('open'));
     comModal.addEventListener('click', e => { if (e.target === comModal) comModal.classList.remove('open'); });
   
     const newComModal = document.getElementById('newComModal');
     if (newComModal && newComModal.parentElement !== document.body) document.body.appendChild(newComModal);
     document.getElementById('newComBtn')?.addEventListener('click', () => newComModal.classList.add('open'));
     document.getElementById('newComClose').addEventListener('click', () => newComModal.classList.remove('open'));
     document.getElementById('cancelNewCom').addEventListener('click', () => newComModal.classList.remove('open'));
     newComModal.addEventListener('click', e => { if (e.target === newComModal) newComModal.classList.remove('open'); });
   
     document.getElementById('publishComBtn')?.addEventListener('click', async () => {
       const title    = document.getElementById('com-title').value.trim();
       const content2 = document.getElementById('com-content').value.trim();
       const category = document.getElementById('com-cat').value;
       const pinned   = document.getElementById('com-pin').value === 'true';
       if (!title || !content2) { Utils.showToast('Preencha título e conteúdo.', 'error'); return; }
   
       const btn = document.getElementById('publishComBtn');
       btn.disabled = true; btn.textContent = 'Publicando...';
   
       const { error } = await db.from('comunicados').insert({ title, content: content2, author_id: profile.id, category, pinned });
       if (!error) {
         await db.rpc('notify_member', { p_user_id: null, p_message: `Novo comunicado: "${title}"`, p_type: 'comunicado', p_icon: '📢' });
         newComModal.classList.remove('open');
         Utils.showToast('Comunicado publicado!');
         loadComunicados();
       } else {
         Utils.showToast('Erro ao publicar.', 'error');
         btn.disabled = false; btn.textContent = 'Publicar';
       }
     });
   }
   
   /* ============================================================
      PAGE: MEMBROS
      ============================================================ */

   /* ── RAIOS LENDÁRIOS — Canvas ao redor do modal ──────────
      Apenas desktop (largura > 768px). Cria um canvas fixo
      sobre a página, desenha raios zigzag que aparecem e somem
      nas laterais do modal. Limpo ao fechar o modal.
   ─────────────────────────────────────────────────────────── */
   let _lendCanvas = null, _lendRAF = null;

   function _startLendarioLightning(modalEl, nivel) {
     _stopLendarioLightning();
     if (nivel !== 'lendario' || window.innerWidth <= 768) return;

     const canvas = document.createElement('canvas');
     canvas.id = 'lend-lightning-canvas';
     canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1001;';
     document.body.appendChild(canvas);
     _lendCanvas = canvas;

     const ctx = canvas.getContext('2d');
     let W, H, rect;

     function resize() {
       W = canvas.width  = window.innerWidth;
       H = canvas.height = window.innerHeight;
       rect = modalEl ? modalEl.getBoundingClientRect() : null;
     }
     resize();
     window.addEventListener('resize', resize);

     // Gera segmentos do raio do topo para baixo — como raio real.
     // Começa no topo, desce predominantemente para baixo com desvios laterais.
     function buildBolt(startX, startY, endY, segments) {
       const pts = [[startX, startY]];
       let x = startX, y = startY;
       const totalH = endY - startY;
       for (let i = 0; i < segments; i++) {
         const progress = (i + 1) / segments;
         // Desce uma fração da altura total
         const stepY = (totalH / segments) * (0.7 + Math.random() * 0.6);
         // Desvia lateralmente — mais perto do topo desvia mais, estabiliza embaixo
         const maxShift = 30 * (1 - progress * 0.5);
         const stepX = (Math.random() - 0.5) * maxShift * 2;
         x = Math.max(20, Math.min(W - 20, x + stepX));
         y = Math.min(endY, y + stepY);
         pts.push([x, y]);
       }
       // Garante que termina na posição Y final
       pts[pts.length - 1][1] = endY;
       return pts;
     }

     // Ramificação: sai de um ponto do raio e vai para baixo-diagonal
     function buildBranch(px, py, endY) {
       const pts = [[px, py]];
       let x = px, y = py;
       const steps = 3 + Math.floor(Math.random() * 4);
       const totalH = endY - py;
       for (let i = 0; i < steps; i++) {
         y += (totalH / steps) * (0.8 + Math.random() * 0.4);
         x += (Math.random() - 0.5) * 24;
         x = Math.max(20, Math.min(W - 20, x));
         pts.push([x, Math.min(endY, y)]);
       }
       return pts;
     }

     // Desenha um raio com 3 camadas: glow externo, glow médio, núcleo brilhante
     function strokeBolt(pts, alpha, baseWidth) {
       if (pts.length < 2) return;

       ctx.lineCap  = 'round';
       ctx.lineJoin = 'round';

       for (let pass = 0; pass < 3; pass++) {
         ctx.beginPath();
         ctx.moveTo(pts[0][0], pts[0][1]);
         for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);

         if (pass === 0) {
           // Glow externo: largo, vermelho tênue
           ctx.strokeStyle = `rgba(200,0,0,${alpha * 0.12})`;
           ctx.lineWidth   = baseWidth * 10;
           ctx.shadowBlur  = 0;
         } else if (pass === 1) {
           // Glow médio: vermelho intenso
           ctx.strokeStyle = `rgba(255,30,30,${alpha * 0.55})`;
           ctx.lineWidth   = baseWidth * 3;
           ctx.shadowColor = `rgba(255,0,0,1)`;
           ctx.shadowBlur  = 20;
         } else {
           // Núcleo: branco quase puro — o centro brilhante do raio
           ctx.strokeStyle = `rgba(255,210,210,${alpha * 0.95})`;
           ctx.lineWidth   = baseWidth * 0.7;
           ctx.shadowColor = `rgba(255,80,80,1)`;
           ctx.shadowBlur  = 8;
         }
         ctx.stroke();
       }
       ctx.shadowBlur = 0;
     }

     // Cada bolt: nasce no topo, cai até embaixo do modal ou até a base da tela
     function createBolt() {
       if (!rect) return null;

       // X: aleaório mas próximo das laterais do modal (efeito de "atraído" pelo modal)
       const nearLeft  = rect.left  - 60 + Math.random() * 120;
       const nearRight = rect.right - 60 + Math.random() * 120;
       const startX = Math.random() < 0.5 ? nearLeft : nearRight;
       const startY = 0; // sempre do topo da tela
       const endY   = rect.bottom + 20 + Math.random() * 40; // vai até abaixo do modal

       const segs = 10 + Math.floor(Math.random() * 8);
       const pts  = buildBolt(
         Math.max(20, Math.min(W - 20, startX)),
         startY, endY, segs
       );

       // Ramificações: saem de pontos do meio do raio
       const branches = [];
       const branchCount = 1 + Math.floor(Math.random() * 3);
       for (let b = 0; b < branchCount; b++) {
         const idx = Math.floor(pts.length * 0.2 + Math.random() * pts.length * 0.6);
         if (idx < pts.length) {
           const [bx, by] = pts[idx];
           const bEndY = by + 40 + Math.random() * 80;
           branches.push(buildBranch(bx, by, bEndY));
         }
       }

       // Ciclo de vida: pausa → flash → fade rápido
       // O raio real dura milissegundos — simulamos com poucos frames
       const pauseFrames = Math.floor(Math.random() * 90) + 20; // espera antes de aparecer
       const flashFrames = 3 + Math.floor(Math.random() * 4);   // flash instantâneo
       const fadeFrames  = 6 + Math.floor(Math.random() * 6);   // fade rápido

       return {
         pts, branches,
         width: 1.5 + Math.random() * 1.5,
         phase: 'pause',
         pauseLeft: pauseFrames,
         flashLeft: flashFrames,
         flashTotal: flashFrames,
         fadeLeft: fadeFrames,
         fadeTotal: fadeFrames,
         dead: false,
       };
     }

     // Pool inicial: 3 raios com timings escalonados
     let bolts = [createBolt(), createBolt(), createBolt()].filter(Boolean);
     let spawnTimer = 0;

     function draw() {
       if (!_lendCanvas) return;
       ctx.clearRect(0, 0, W, H);
       rect = modalEl ? modalEl.getBoundingClientRect() : rect;

       // Spawn de novos raios periodicamente
       spawnTimer++;
       if (spawnTimer > 40 + Math.floor(Math.random() * 50)) {
         spawnTimer = 0;
         if (bolts.length < 5) bolts.push(createBolt());
       }

       for (const b of bolts) {
         if (b.dead) continue;

         if (b.phase === 'pause') {
           b.pauseLeft--;
           if (b.pauseLeft <= 0) b.phase = 'flash';
           continue;
         }

         if (b.phase === 'flash') {
           // Flash: aparece instantaneamente a plena intensidade
           // Flicker: alterna entre 0.8 e 1.0 muito rápido (pisca-pisca real)
           const flicker = b.flashLeft % 2 === 0 ? 1.0 : 0.75;
           strokeBolt(b.pts, flicker, b.width);
           for (const br of b.branches) strokeBolt(br, flicker * 0.6, b.width * 0.5);
           b.flashLeft--;
           if (b.flashLeft <= 0) b.phase = 'fade';
           continue;
         }

         if (b.phase === 'fade') {
           const alpha = b.fadeLeft / b.fadeTotal;
           strokeBolt(b.pts, alpha, b.width);
           for (const br of b.branches) strokeBolt(br, alpha * 0.5, b.width * 0.5);
           b.fadeLeft--;
           if (b.fadeLeft <= 0) b.dead = true;
         }
       }

       // Remove mortos e garante pool mínimo
       bolts = bolts.filter(b => !b.dead);
       if (bolts.length === 0) bolts.push(createBolt());

       _lendRAF = requestAnimationFrame(draw);
     }

     _lendRAF = requestAnimationFrame(draw);
   }

   function _stopLendarioLightning() {
     if (_lendRAF) { cancelAnimationFrame(_lendRAF); _lendRAF = null; }
     const c = document.getElementById('lend-lightning-canvas');
     if (c) c.remove();
     _lendCanvas = null;
   }

   async function initMembros() {
     const profile = await renderSidebar('membros');
     if (!profile) return;
     await renderTopBar('Membros', profile);
   
     const content = document.getElementById('pageContent');
     Utils.showLoading(content);
   
     const isDiretoria = profile.tier === 'diretoria';
     const canAprovar  = isDiretoria || await MSYPerms.check(profile.id, profile.tier, 'aprovar_membros');
     const canEditar   = isDiretoria || await MSYPerms.check(profile.id, profile.tier, 'editar_membros');
     const canRemover  = isDiretoria || await MSYPerms.check(profile.id, profile.tier, 'remover_membros');
     const canGerenciarMembros = canAprovar || canEditar || canRemover;
   
     const { data: membersRaw, error } = await db.from('profiles')
       .select('*')
       .order('name', { ascending: true });
   
     // Ordem de prioridade: Fundador > Coordenador Geral > demais Diretoria > demais membros
     const getRolePriority = m => {
       const r = (m.role || '').toLowerCase();
       if (r === 'fundador')                return 0;
       if (r.includes('coordenador geral')) return 1;
       if (m.tier === 'diretoria')          return 2;
       return 3;
     };
     const members = membersRaw
       ? [...membersRaw].sort((a, b) => {
           const diff = getRolePriority(a) - getRolePriority(b);
           if (diff !== 0) return diff;
           return (a.name || '').localeCompare(b.name || '', 'pt-BR');
         })
       : [];
   
     if (error) { Utils.showToast('Erro ao carregar membros.', 'error'); return; }
   
     content.innerHTML = `
       <div class="page-header">
         <div>
           <div class="page-header-title">Membros</div>
           <div class="page-header-sub">${(members||[]).filter(m=>m.status==='ativo').length} membros ativos</div>
         </div>
       </div>
       <div style="margin-bottom:18px">
         <div class="filters-bar">
           <input type="text" class="form-input" id="memberSearch" placeholder="🔍  Pesquisar membro..." style="max-width:260px">
           <button class="filter-btn active" data-filter="todos">Todos</button>
           <button class="filter-btn" data-filter="diretoria">Diretoria</button>
           <button class="filter-btn" data-filter="membro">Membros</button>
           ${canAprovar ? `<button class="filter-btn" data-filter="pendente" style="color:#eab308;border-color:rgba(234,179,8,.3)">Pendentes</button>` : ''}

         </div>
       </div>
       <div class="members-grid" id="membersGrid">
         ${(members||[]).map(m => `
           <div class="member-card ${m.tier==='diretoria'?'diretoria':''} card-enter" data-tier="${m.tier}" data-status="${m.status}" data-name="${Utils.escapeHtml(m.name).toLowerCase()}" style="cursor:pointer">
             ${m.status === 'pendente' ? '<div style="position:absolute;top:10px;right:10px"><span class="badge badge-pending">Pendente</span></div>' : ''}
             <div class="avatar" style="width:64px;height:64px;font-size:1.1rem;margin:0 auto 14px;background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a);border-color:${m.tier==='diretoria'?'var(--border-gold)':'var(--border-faint)'}">
               ${m.avatar_url ? `<img src="${m.avatar_url}" alt="${Utils.escapeHtml(m.name)}">` : (m.initials||Utils.getInitials(m.name))}
             </div>
             <div class="member-card-text">
               <div class="member-name">${Utils.escapeHtml(m.name)}</div>
               <div class="member-join" style="font-size:.68rem;color:var(--text-3);margin-bottom:3px"><i class="fa-regular fa-calendar"></i> ${Utils.formatDate(m.join_date)}</div>
               <div class="member-role-text">${Utils.escapeHtml(m.role)}</div>
               <div class="member-tier-badge">${Utils.tierBadge(m.tier)}</div>
             </div>
             ${canGerenciarMembros ? `
               <div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap;justify-content:center" onclick="event.stopPropagation()">
                 ${m.status === 'pendente' && canAprovar ? `<button class="btn btn-sm btn-primary approve-btn" data-id="${m.id}"><i class="fa-solid fa-check"></i> Aprovar</button>` : ''}
                 ${m.tier !== 'diretoria' && m.status === 'ativo' ? `
                   <button class="btn btn-sm btn-outline promote-btn" data-id="${m.id}" title="Elevar à Diretoria">
                     <i class="fa-solid fa-arrow-up"></i> Diretoria
                   </button>` : ''}
                 ${m.tier === 'diretoria' && m.id !== profile.id ? `
                   <button class="btn btn-sm btn-ghost demote-btn" data-id="${m.id}" style="color:#eab308;border-color:rgba(234,179,8,.3)">
                     <i class="fa-solid fa-arrow-down"></i> Rebaixar
                   </button>` : ''}
                 ${m.status === 'ativo' ? `
                   <button class="btn btn-sm btn-ghost edit-role-btn" data-id="${m.id}" data-name="${Utils.escapeHtml(m.name)}" data-role="${Utils.escapeHtml(m.role)}" title="Editar cargo">
                     <i class="fa-solid fa-pen" style="font-size:.7rem"></i>
                   </button>` : ''}
                 ${m.id !== profile.id && canRemover ? `
                   <button class="btn btn-sm btn-ghost remove-btn" data-id="${m.id}" title="Desativar membro" style="color:#eab308;border-color:rgba(234,179,8,.3)">
                     <i class="fa-solid fa-user-slash"></i>
                   </button>` : ''}
                 ${m.id !== profile.id && isDiretoria ? `
                   <button class="btn btn-sm btn-ghost delete-member-btn" data-id="${m.id}" data-name="${Utils.escapeHtml(m.name)}" title="Excluir membro permanentemente" style="color:var(--red-bright);border-color:rgba(239,68,68,.3)">
                     <i class="fa-solid fa-trash"></i>
                   </button>` : ''}
               </div>` : ''}
           </div>`).join('')}
       </div>
   
       <!-- Member Profile Modal -->
       <div class="modal-overlay" id="memberProfileModal">
         <div class="modal" style="max-width:520px">
           <div class="modal-header">
             <div class="modal-title" id="memberProfileTitle">Perfil do Membro</div>
             <button class="modal-close" id="memberProfileClose"><i class="fa-solid fa-xmark"></i></button>
           </div>
           <div class="modal-body member-profile-modal-body" id="memberProfileBody"></div>
           <div class="modal-footer" id="memberProfileFooter"></div>
         </div>
       </div>
   
       <!-- Edit Profile Modal (diretoria) -->
       <div class="modal-overlay" id="editMemberModal">
         <div class="modal" style="max-width:460px">
           <div class="modal-header">
             <div class="modal-title" id="editMemberTitle">Editar Perfil</div>
             <button class="modal-close" id="editMemberClose"><i class="fa-solid fa-xmark"></i></button>
           </div>
           <div class="modal-body" id="editMemberBody"></div>
           <div class="modal-footer" id="editMemberFooter"></div>
         </div>
       </div>
   
       <!-- Edit Role Modal -->
       <div class="modal-overlay" id="editRoleModal">
         <div class="modal" style="max-width:400px">
           <div class="modal-header">
             <div class="modal-title" id="editRoleTitle">Editar Cargo</div>
             <button class="modal-close" id="editRoleClose"><i class="fa-solid fa-xmark"></i></button>
           </div>
           <div class="modal-body">
             <div class="form-group">
               <label class="form-label">Cargo do Membro</label>
               <input class="form-input" id="editRoleInput" placeholder="Ex: Diretor de Tecnologia">
             </div>
           </div>
           <div class="modal-footer">
             <button class="btn btn-ghost" id="editRoleCancel">Cancelar</button>
             <button class="btn btn-primary" id="editRoleSave"><i class="fa-solid fa-floppy-disk"></i> Salvar</button>
           </div>
         </div>
       </div>
     `;
   
     // Click card → open profile
     content.querySelectorAll('.member-card').forEach(card => {
       card.addEventListener('click', () => {
         const m = members.find(x => x.id === card.dataset.id || card.querySelector(`[data-id="${x.id}"]`));
         // find by member name match
         const memberName = card.querySelector('.member-name')?.textContent;
         const found = members.find(x => x.name === memberName);
         if (found) openMemberProfileModal(found, profile, isDiretoria, members, { canAprovar, canEditar, canRemover });
       });
     });
   
     // Search & filter
     let tierFilter = 'todos';
     const filterMembers = () => {
       const q = document.getElementById('memberSearch').value.toLowerCase();
       document.querySelectorAll('.member-card').forEach(card => {
         const nameMatch = card.dataset.name.includes(q);
         const tierMatch = tierFilter === 'todos' || tierFilter === card.dataset.tier || (tierFilter === 'pendente' && card.dataset.status === 'pendente');
         card.style.display = nameMatch && tierMatch ? '' : 'none';
       });
     };
     document.getElementById('memberSearch').addEventListener('input', filterMembers);
     content.querySelectorAll('.filter-btn').forEach(btn => {
       btn.addEventListener('click', () => {
         content.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
         btn.classList.add('active');
         tierFilter = btn.dataset.filter;
         filterMembers();
       });
     });

   
     // Approve
     content.querySelectorAll('.approve-btn').forEach(btn => {
       btn.addEventListener('click', async () => {
         await db.from('profiles').update({ status: 'ativo' }).eq('id', btn.dataset.id);
         await db.rpc('notify_member', { p_user_id: btn.dataset.id, p_message: 'Bem-vindo à Ordem! Seu acesso foi aprovado pela Diretoria.', p_type: 'member', p_icon: '✅' });
         Utils.showToast('Membro aprovado!');
         initMembros();
       });
     });
   
     // Promote
     content.querySelectorAll('.promote-btn').forEach(btn => {
       btn.addEventListener('click', async () => {
         if (!confirm('Elevar membro à Diretoria? Esta ação dá acesso administrativo completo.')) return;
         await db.from('profiles').update({ tier: 'diretoria', role: 'Diretor' }).eq('id', btn.dataset.id);
         Utils.showToast('Membro elevado à Diretoria.');
         initMembros();
       });
     });
   
     // Demote
     content.querySelectorAll('.demote-btn').forEach(btn => {
       btn.addEventListener('click', async () => {
         if (!confirm('Rebaixar para Membro comum? Ele perderá acesso administrativo.')) return;
         await db.from('profiles').update({ tier: 'membro', role: 'Membro' }).eq('id', btn.dataset.id);
         await db.rpc('notify_member', { p_user_id: btn.dataset.id, p_message: 'Seu cargo foi alterado para Membro pela Diretoria.', p_type: 'member', p_icon: 'ℹ️' });
         Utils.showToast('Membro rebaixado.');
         initMembros();
       });
     });
   
     // Edit Role
     const editRoleModal = document.getElementById('editRoleModal');
     if (editRoleModal && editRoleModal.parentElement !== document.body) document.body.appendChild(editRoleModal);
     let editingMemberId = null;
     content.querySelectorAll('.edit-role-btn').forEach(btn => {
       btn.addEventListener('click', () => {
         editingMemberId = btn.dataset.id;
         document.getElementById('editRoleTitle').textContent = `Cargo — ${btn.dataset.name}`;
         document.getElementById('editRoleInput').value = btn.dataset.role || '';
         editRoleModal.classList.add('open');
       });
     });
     document.getElementById('editRoleClose').addEventListener('click', () => editRoleModal.classList.remove('open'));
     document.getElementById('editRoleCancel').addEventListener('click', () => editRoleModal.classList.remove('open'));
     editRoleModal.addEventListener('click', e => { if (e.target === editRoleModal) editRoleModal.classList.remove('open'); });
     document.getElementById('editRoleSave').addEventListener('click', async () => {
       const newRole = document.getElementById('editRoleInput').value.trim();
       if (!newRole) { Utils.showToast('Digite um cargo.', 'error'); return; }
       const { error } = await db.from('profiles').update({ role: newRole }).eq('id', editingMemberId);
       if (!error) { editRoleModal.classList.remove('open'); Utils.showToast('Cargo atualizado!'); initMembros(); }
       else Utils.showToast('Erro ao atualizar cargo.', 'error');
     });
   
     // Remove (desativar)
     content.querySelectorAll('.remove-btn').forEach(btn => {
       btn.addEventListener('click', async () => {
         if (!confirm('Desativar este membro? Ele perderá acesso ao portal mas os dados serão mantidos.')) return;
         await db.from('profiles').update({ status: 'inativo' }).eq('id', btn.dataset.id);
         Utils.showToast('Membro desativado.');
         initMembros();
       });
     });

     // Delete — exclusao permanente completa
     content.querySelectorAll('.delete-member-btn').forEach(btn => {
       btn.addEventListener('click', () => {
         const memberId = btn.dataset.id;
         const memberName = btn.dataset.name;
         _confirmarExclusaoMembro(memberId, memberName);
       });
     });
   
     // Modal close handlers
     const memberProfileModal = document.getElementById('memberProfileModal');
     const editMemberModal = document.getElementById('editMemberModal');
     const editRoleModalEl = document.getElementById('editRoleModal');

     // Mover modais para document.body (garante position:fixed correto independente de scroll)
     if (memberProfileModal && memberProfileModal.parentElement !== document.body) document.body.appendChild(memberProfileModal);
     if (editMemberModal && editMemberModal.parentElement !== document.body) document.body.appendChild(editMemberModal);
     if (editRoleModalEl && editRoleModalEl.parentElement !== document.body) document.body.appendChild(editRoleModalEl);

     document.getElementById('memberProfileClose').addEventListener('click', () => memberProfileModal.classList.remove('open'));
     memberProfileModal.addEventListener('click', e => { if (e.target === memberProfileModal) memberProfileModal.classList.remove('open'); });
   
     document.getElementById('editMemberClose').addEventListener('click', () => editMemberModal.classList.remove('open'));
     editMemberModal.addEventListener('click', e => { if (e.target === editMemberModal) editMemberModal.classList.remove('open'); });
   }
   
   /* ============================================================
      EXCLUSAO PERMANENTE DE MEMBRO
      Remove o membro e todos os registros associados do Supabase.
      ============================================================ */
   async function _confirmarExclusaoMembro(memberId, memberName) {
     /* Modal de confirmacao com digitação do nome */
     let modal = document.getElementById('deleteMemberModal');
     if (!modal) {
       modal = document.createElement('div');
       modal.id = 'deleteMemberModal';
       modal.className = 'modal-overlay';
       document.body.appendChild(modal);
     }

     modal.innerHTML = `
       <div class="modal" style="max-width:460px">
         <div class="modal-header" style="border-bottom:1px solid rgba(239,68,68,.3)">
           <div class="modal-title" style="color:var(--red-bright)">
             <i class="fa-solid fa-triangle-exclamation"></i> Excluir Membro Permanentemente
           </div>
           <button class="modal-close" id="delMemClose"><i class="fa-solid fa-xmark"></i></button>
         </div>
         <div class="modal-body" style="padding:24px;display:flex;flex-direction:column;gap:16px">
           <div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:8px;padding:14px">
             <div style="font-size:.75rem;color:var(--red-bright);font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">
               <i class="fa-solid fa-skull-crossbones"></i> Ação Irreversível
             </div>
             <p style="font-size:.85rem;color:var(--text-2);margin:0">
               Isso removerá <strong style="color:var(--text-1)">${Utils.escapeHtml(memberName)}</strong> permanentemente do sistema, incluindo:
             </p>
             <ul style="font-size:.8rem;color:var(--text-3);margin:8px 0 0 0;padding-left:16px;display:flex;flex-direction:column;gap:4px">
               <li>Perfil e dados de cadastro</li>
               <li>Notificações e permissões individuais</li>
               <li>Registros de mensalidade</li>
               <li>Atividades e presenças associadas</li>
               <li>Publicações no feed e biblioteca</li>
             </ul>
           </div>
           <div class="form-group" style="margin:0">
             <label class="form-label">Para confirmar, digite o nome do membro:</label>
             <input type="text" class="form-input" id="delMemConfirmInput"
               placeholder="${Utils.escapeHtml(memberName)}"
               style="border-color:rgba(239,68,68,.3)">
             <div id="delMemConfirmError" style="display:none;color:var(--red-bright);font-size:.75rem;margin-top:4px">
               <i class="fa-solid fa-circle-exclamation"></i> Nome incorreto.
             </div>
           </div>
         </div>
         <div class="modal-footer">
           <button class="btn btn-ghost" id="delMemCancel">Cancelar</button>
           <button class="btn" id="delMemConfirmBtn" style="background:rgba(185,28,28,.25);border:1px solid rgba(239,68,68,.5);color:#ef4444">
             <i class="fa-solid fa-trash"></i> Excluir Permanentemente
           </button>
         </div>
       </div>`;

     requestAnimationFrame(() => modal.classList.add('open'));

     const close = () => modal.classList.remove('open');
     document.getElementById('delMemClose').addEventListener('click', close);
     document.getElementById('delMemCancel').addEventListener('click', close);
     modal.addEventListener('click', e => { if (e.target === modal) close(); });

     document.getElementById('delMemConfirmBtn').addEventListener('click', async () => {
       const inputVal = document.getElementById('delMemConfirmInput').value.trim();
       const errEl = document.getElementById('delMemConfirmError');

       if (inputVal !== memberName) {
         errEl.style.display = 'block';
         document.getElementById('delMemConfirmInput').style.borderColor = 'rgba(239,68,68,.6)';
         return;
       }
       errEl.style.display = 'none';

       const btn = document.getElementById('delMemConfirmBtn');
       btn.disabled = true;
       btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Excluindo...';

       try {
         await _executarExclusaoMembro(memberId, memberName);
         close();
         Utils.showToast(`Membro "${memberName}" excluído permanentemente.`, 'success');
         setTimeout(() => initMembros(), 400);
       } catch (err) {
         console.error('[MSY Delete]', err);
         Utils.showToast('Erro ao excluir membro: ' + err.message, 'error');
         btn.disabled = false;
         btn.innerHTML = '<i class="fa-solid fa-trash"></i> Excluir Permanentemente';
       }
     });
   }

   async function _executarExclusaoMembro(memberId, memberName) {
     /* Remove registros associados em ordem segura (FK constraints) */
     const tabelas = [
       'notifications',
       'member_permissions',
       'mensalidades',
       'event_presencas',
       'activity_responses',
     ];

     for (const tabela of tabelas) {
       // Tenta pelo campo user_id primeiro, depois membro_id
       const campo = 'user_id';
       const { error } = await db.from(tabela).delete().eq(campo, memberId);
       if (error) console.warn(`[MSY Delete] Aviso ao limpar ${tabela}:`, error.message);
     }

     // Limpar atividades atribuídas ao membro (desassociar, nao deletar)
     const { error: actErr } = await db.from('activities')
       .update({ assigned_to: null }).eq('assigned_to', memberId);
     if (actErr) console.warn('[MSY Delete] activities:', actErr.message);

     // Limpar posts do feed criados pelo membro
     const { error: feedErr } = await db.from('feed_atividade')
       .delete().eq('autor_id', memberId);
     if (feedErr) console.warn('[MSY Delete] feed_atividade:', feedErr.message);

     // Limpar conteudos da biblioteca criados pelo membro
     const { error: bibErr } = await db.from('biblioteca_conteudos')
       .delete().eq('criado_por', memberId);
     if (bibErr) console.warn('[MSY Delete] biblioteca_conteudos:', bibErr.message);

     // Por ultimo: deletar o profile
     const { error: profileErr } = await db.from('profiles').delete().eq('id', memberId);
     if (profileErr) throw new Error(`Falha ao remover perfil: ${profileErr.message}`);

     // Tentar deletar o usuario de autenticacao via RPC (nao critico — requer service_role)
     try {
       await db.rpc('delete_user_account', { p_user_id: memberId });
     } catch (_) { /* RPC opcional — sem service_role falha silenciosamente */ }
   }

   async function openMemberProfileModal(m, currentProfile, isDiretoria, allMembers, perms = {}) {
     const { canAprovar = isDiretoria, canEditar = isDiretoria, canRemover = isDiretoria } = perms;
     const modal = document.getElementById('memberProfileModal');
     const body  = document.getElementById('memberProfileBody');
     const footer = document.getElementById('memberProfileFooter');

     document.getElementById('memberProfileTitle').textContent = 'Perfil do Membro';
     body.dataset.memberId = m.id;

     // Busca stats e nível FIFA em paralelo
     const [statsRes, cardData] = await Promise.all([
       db.rpc('get_member_stats', { p_user_id: m.id }),
       typeof MSYBadges !== 'undefined'
         ? MSYBadges.getCardLevel(m.id)
         : Promise.resolve({ total: 0, nivel: 'comum', badges: [] }),
     ]);

     const stats   = statsRes.data || { total: 0, concluidas: 0, andamento: 0, pendentes: 0 };
     const nivel   = cardData.nivel;
     const badges  = cardData.badges;

     const joinDate = new Date(m.join_date + 'T00:00:00');
     const now = new Date();
     const diffDays = Math.floor((now - joinDate) / (1000 * 60 * 60 * 24));
     const months = Math.floor(diffDays / 30);
     const timeLabel = months >= 1 ? `${months} ${months === 1 ? 'mês' : 'meses'}` : `${diffDays} dias`;

     // Aplicar classe FIFA no modal
     const modalEl = modal.querySelector('.modal');
     if (modalEl) {
       modalEl.className = modalEl.className.replace(/\s*mcard-\S+/g, '');
       if (nivel !== 'comum') modalEl.classList.add(`mcard-${nivel}`);
     }

     // Render das insígnias agrupadas
     function renderBadgesList(bList) {
       if (!bList || bList.length === 0) {
         return `<div class="mpb-vazio"><i class="fa-solid fa-medal" style="opacity:.25;font-size:1.4rem;display:block;margin-bottom:6px"></i>Nenhuma insígnia conquistada ainda.</div>`;
       }
       return bList.map(b => {
         const qty = b.origem === 'premiacao' && b.meta?.quantidade > 0
           ? `<span class="mpb-qty">×${b.meta.quantidade}</span>` : '';
         const glow = b.origem === 'recorde' ? `filter:drop-shadow(0 0 8px ${b.color}99)` : '';
         const tip  = b.meta?.tooltip || b.desc || '';
         return `<div class="mpb-item" title="${Utils.escapeHtml(tip)}" style="--bc:${b.color}">
           <div class="mpb-icon" style="${glow}">${b.icon}</div>
           <div class="mpb-info">
             <div class="mpb-label">${Utils.escapeHtml(b.label)}</div>
             <div class="mpb-sub">${b.origem === 'recorde' ? 'Recorde' : b.origem === 'icm' ? 'ICM' : (b.meta?.importancia || 'Premiação')}</div>
           </div>
           ${qty}
         </div>`;
       }).join('');
     }

     const NIVEL_LABELS = { comum:'', raro:'Raro', epico:'Épico', lendario:'Lendário' };
     const nivelTag = nivel !== 'comum'
       ? `<div class="mcard-nivel-tag mcard-nivel-tag--${nivel}">${NIVEL_LABELS[nivel]}</div>` : '';

     body.innerHTML = `
       <div class="mcard-hero mcard-hero--${nivel}">
         ${nivelTag}
         <div class="mcard-fx-rays" aria-hidden="true">
           <span></span><span></span><span></span><span></span><span></span><span></span>
         </div>
         <div class="mcard-hero-avatar" style="background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a)">
           ${m.avatar_url ? `<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : (m.initials||Utils.getInitials(m.name))}
         </div>
         <div class="mcard-hero-info">
           <div class="mcard-name">${Utils.escapeHtml(m.name)}</div>
           <div class="mcard-role">${Utils.escapeHtml(m.role)}</div>
           <div class="mcard-badges-row">
             ${Utils.tierBadge(m.tier)}
             <span class="badge ${m.status==='ativo'?'badge-done':m.status==='inativo'?'badge-red':'badge-pending'}">${m.status.charAt(0).toUpperCase()+m.status.slice(1)}</span>
           </div>
         </div>
       </div>

       <div class="mcard-details">
         <div class="member-profile-detail-row">
           <i class="fa-regular fa-calendar"></i>
           <span class="member-profile-detail-label">Membro desde</span>
           <span class="member-profile-detail-val">${Utils.formatDate(m.join_date)}</span>
         </div>
         <div class="member-profile-detail-row">
           <i class="fa-solid fa-hourglass-half"></i>
           <span class="member-profile-detail-label">Tempo na Ordem</span>
           <span class="member-profile-detail-val">${timeLabel}</span>
         </div>
         <div class="member-profile-detail-row">
           <i class="fa-solid fa-shield-halved"></i>
           <span class="member-profile-detail-label">Nível</span>
           <span class="member-profile-detail-val">${m.tier === 'diretoria' ? 'Diretoria' : 'Membro'}</span>
         </div>
         ${m.birth_date ? `
         <div class="member-profile-detail-row">
           <i class="fa-solid fa-cake-candles" style="color:var(--gold)"></i>
           <span class="member-profile-detail-label">Nascimento</span>
           <span class="member-profile-detail-val">${Utils.formatDate(m.birth_date)}</span>
         </div>` : ''}
         ${m.bio ? `
         <div class="member-profile-bio">
           <div style="font-size:.72rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px"><i class="fa-solid fa-quote-left"></i> Sobre</div>
           ${Utils.escapeHtml(m.bio)}
         </div>` : ''}
       </div>

       <div class="member-profile-stats-row">
         <div class="member-profile-stat"><div class="member-profile-stat-num">${stats.total||0}</div><div class="member-profile-stat-lbl">Total</div></div>
         <div class="member-profile-stat"><div class="member-profile-stat-num">${stats.concluidas||0}</div><div class="member-profile-stat-lbl">Concluídas</div></div>
         <div class="member-profile-stat"><div class="member-profile-stat-num">${stats.andamento||0}</div><div class="member-profile-stat-lbl">Em andamento</div></div>
         <div class="member-profile-stat"><div class="member-profile-stat-num">${stats.pendentes||0}</div><div class="member-profile-stat-lbl">Pendentes</div></div>
       </div>

       <div class="mpb-section">
         <div class="mpb-header"><i class="fa-solid fa-medal"></i> Insígnias Conquistadas</div>
         <div class="mpb-grid">${renderBadgesList(badges)}</div>
       </div>
     `;

     // Prévia de nível no modal (só Diretoria)
     const previewSel = isDiretoria
       ? `<select id="modalPreviewNivel" class="form-input form-select" style="font-size:.7rem;padding:4px 6px;border-color:rgba(201,168,76,.25);color:var(--gold);flex:0 0 auto;width:auto;max-width:130px;height:34px" title="Prévia visual — não altera dados">
           <option value="${nivel}">👁 Prévia</option>
           <option value="comum"${nivel==='comum'?' selected':''}>◻ Comum</option>
           <option value="raro"${nivel==='raro'?' selected':''}>🟥 Raro</option>
           <option value="epico"${nivel==='epico'?' selected':''}>🔶 Épico</option>
           <option value="lendario"${nivel==='lendario'?' selected':''}>⭐ Lendário</option>
         </select>` : '';

     footer.innerHTML = canEditar && m.id !== currentProfile.id
       ? `${previewSel}<button class="btn btn-ghost" id="closeMemberProfile">Fechar</button>
          <button class="btn btn-primary" id="editMemberProfileBtn"><i class="fa-solid fa-pen"></i> Editar Perfil</button>`
       : `${previewSel}<button class="btn btn-outline" id="closeMemberProfile">Fechar</button>`;

     modal.classList.add('open');

     // ── Raios Lendários (canvas ao redor do modal, só desktop) ──
     _startLendarioLightning(modalEl, nivel);

     // Prévia: troca o nível visual do modal ao mudar o select
     document.getElementById('modalPreviewNivel')?.addEventListener('change', e => {
       if (!modalEl) return;
       modalEl.className = modalEl.className.replace(/\s*mcard-\S+/g, '');
       const v = e.target.value;
       if (v && v !== 'comum') modalEl.classList.add(`mcard-${v}`);
       _startLendarioLightning(modalEl, v);
       // Atualiza hero e tag também
       const hero = body.querySelector('.mcard-hero');
       if (hero) {
         hero.className = `mcard-hero mcard-hero--${v || 'comum'}`;
       }
       const tag = body.querySelector('.mcard-nivel-tag');
       const LABELS = { raro:'Raro', epico:'Épico', lendario:'Lendário' };
       if (!v || v === 'comum') {
         if (tag) tag.remove();
       } else {
         if (tag) { tag.className = `mcard-nivel-tag mcard-nivel-tag--${v}`; tag.textContent = LABELS[v]; }
         else {
           const newTag = document.createElement('div');
           newTag.className = `mcard-nivel-tag mcard-nivel-tag--${v}`;
           newTag.textContent = LABELS[v];
           hero?.appendChild(newTag);
         }
       }
     });

     document.getElementById('closeMemberProfile').addEventListener('click', () => {
       modal.classList.remove('open');
       if (modalEl) modalEl.className = modalEl.className.replace(/\s*mcard-\S+/g, '');
       _stopLendarioLightning();
     });
     document.getElementById('editMemberProfileBtn')?.addEventListener('click', () => {
       modal.classList.remove('open');
       openEditMemberModal(m, allMembers);
     });
   }
   
   function openEditMemberModal(m, allMembers) {
     const modal  = document.getElementById('editMemberModal');
     const body   = document.getElementById('editMemberBody');
     const footer = document.getElementById('editMemberFooter');
   
     document.getElementById('editMemberTitle').textContent = `Editar — ${m.name}`;
   
     const COLORS = ['#7f1d1d','#991b1b','#1e3a5f','#14532d','#3b0764','#78350f','#1e40af','#065f46','#6b21a8','#c9a84c'];
   
     body.innerHTML = `
       <div class="form-group" style="margin-bottom:14px">
         <label class="form-label">Nome completo</label>
         <input class="form-input" id="em-name" value="${Utils.escapeHtml(m.name)}">
       </div>
       <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
         <div class="form-group">
           <label class="form-label">Iniciais</label>
           <input class="form-input" id="em-initials" maxlength="2" value="${Utils.escapeHtml(m.initials||'')}" placeholder="TM">
         </div>
         <div class="form-group">
           <label class="form-label">Cargo</label>
           <input class="form-input" id="em-role" value="${Utils.escapeHtml(m.role||'')}">
         </div>
       </div>
       <div class="form-group" style="margin-bottom:14px">
         <label class="form-label">Cor do Avatar</label>
         <div class="color-picker-row">
           ${COLORS.map(c => `<div class="color-swatch ${m.color===c?'selected':''}" style="background:${c}" data-color="${c}" title="${c}"></div>`).join('')}
         </div>
         <input type="hidden" id="em-color" value="${m.color||'#7f1d1d'}">
       </div>
       <div class="form-group" style="margin-bottom:14px">
         <label class="form-label">Bio / Descrição</label>
         <textarea class="form-input form-textarea" id="em-bio" style="min-height:80px" placeholder="Breve descrição do membro...">${Utils.escapeHtml(m.bio||'')}</textarea>
       </div>
       <div class="form-group">
         <label class="form-label">Status</label>
         <select class="form-input form-select" id="em-status">
           <option value="ativo" ${m.status==='ativo'?'selected':''}>Ativo</option>
           <option value="inativo" ${m.status==='inativo'?'selected':''}>Inativo</option>
           <option value="pendente" ${m.status==='pendente'?'selected':''}>Pendente</option>
         </select>
       </div>
       <div class="form-group" style="margin-top:14px">
         <label class="form-label"><i class="fa-regular fa-calendar"></i> Data de Entrada na Ordem</label>
         <input class="form-input" type="date" id="em-joindate" value="${m.join_date||''}">
         <div style="font-size:.72rem;color:var(--text-3);margin-top:4px">Corrige a data real de entrada do membro (diferente da criação da conta).</div>
       </div>
     `;
   
     footer.innerHTML = `
       <button class="btn btn-ghost" id="editMemberCancel">Cancelar</button>
       <button class="btn btn-primary" id="editMemberSave"><i class="fa-solid fa-floppy-disk"></i> Salvar Alterações</button>
     `;
   
     modal.classList.add('open');
   
     // Color swatches
     body.querySelectorAll('.color-swatch').forEach(sw => {
       sw.addEventListener('click', () => {
         body.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
         sw.classList.add('selected');
         document.getElementById('em-color').value = sw.dataset.color;
       });
     });
   
     document.getElementById('editMemberCancel').addEventListener('click', () => modal.classList.remove('open'));
   
     document.getElementById('editMemberSave').addEventListener('click', async () => {
       const name      = document.getElementById('em-name').value.trim();
       const initials  = document.getElementById('em-initials').value.trim().toUpperCase().slice(0,2);
       const role      = document.getElementById('em-role').value.trim();
       const color     = document.getElementById('em-color').value;
       const bio       = document.getElementById('em-bio').value.trim();
       const status    = document.getElementById('em-status').value;
       const join_date = document.getElementById('em-joindate').value || m.join_date;
   
       if (!name) { Utils.showToast('Nome obrigatório.', 'error'); return; }
   
       const btn = document.getElementById('editMemberSave');
       btn.disabled = true; btn.textContent = 'Salvando...';
   
       const { error } = await db.from('profiles').update({ name, initials: initials||Utils.getInitials(name), role, color, bio, status, join_date }).eq('id', m.id);
       if (!error) {
         modal.classList.remove('open');
         Utils.showToast('Perfil atualizado!');
         initMembros();
       } else {
         Utils.showToast('Erro ao salvar.', 'error');
         btn.disabled = false; btn.textContent = 'Salvar Alterações';
       }
     });
   }
   
   
   /* ============================================================
      PAGE: TECNOLOGIAS
      ============================================================ */
   const TECHNOLOGIES = [
     { id:1, name:'Corvus',                icon:'🦅', description:'Assistente de IA institucional da MSY. Chat com memória, base de conhecimento e integrações avançadas.', status:'Online', url:'https://t4msy.github.io/Corvus-2.0/' },
     { id:2, name:'MSY Analytics', icon:'📊', description:'Painel de métricas e KPIs coletivos da Ordem, atualizado semanalmente via análise de WhatsApp.', status:'Online', url:'https://t4msy.github.io/MSY-ANALYTICS/' },
     { id:3, name:'Índice De Capacidade Masayoshi',  icon:'🧠', description:'Sistema de avaliação comportamental com lógica adaptativa, análise de padrões e coerência. Desenvolvido para identificar alinhamento com a Masayoshi.', status:'Online', url:'https://t4msy.github.io/ICM-TESTE/' },
     { id:4, name:'ProvaGen',              icon:'📝', description:'Sistema automatizado de geração de avaliações internas via IA multi-modelo.', status:'Online', url:'https://t4msy.github.io/Gerador-de-Provas/' },
     { id:5, name:'NeverMind Studio',      icon:'🎬', description:'Central de produção de conteúdo e mídia da MSY. Pipeline editorial e social em desenvolvimento.', status:'Em breve', url:'#' },
     { id:6, name:'Britannia Hub',         icon:'🏛️', description:'Portal da camada comunitária da Masayoshi. Conector entre a Ordem e o mundo externo.', status:'Em breve', url:'#' },
   ];
   
   async function initTecnologias() {
     const profile = await renderSidebar('tecnologias');
     if (!profile) return;
     await renderTopBar('Tecnologias', profile);
   
     const content = document.getElementById('pageContent');
     content.innerHTML = `
       <div class="page-header">
         <div>
           <div class="page-header-title">Tecnologias</div>
           <div class="page-header-sub">Ferramentas e sistemas internos da Masayoshi</div>
         </div>
       </div>
       <div class="tech-grid">
         ${TECHNOLOGIES.map(t => `
           <div class="tech-card card-enter">
             <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
               <div class="tech-icon">${t.icon}</div>
               <span class="badge ${t.status==='Online'?'badge-done':t.status==='Beta'?'badge-progress':'badge-pending'}">${t.status}</span>
             </div>
             <div class="tech-name">${Utils.escapeHtml(t.name)}</div>
             <div class="tech-desc">${Utils.escapeHtml(t.description)}</div>
             <button class="btn ${t.status==='Online'?'btn-primary':t.status==='Beta'?'btn-outline':'btn-ghost'}"
               ${t.status==='Em breve'?'disabled':''}
               onclick="${t.status!=='Em breve'?`window.open('${t.url}','_blank')`:''}"
             >${t.status==='Em breve'?'<i class="fa-solid fa-lock"></i> Em Breve':'<i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir Sistema'}</button>
           </div>`).join('')}
       </div>
     `;
   }
   
   /* ============================================================
      PAGE: EVENTOS
      ============================================================ */
   async function initEventos() {
     const profile = await renderSidebar('eventos');
     if (!profile) return;
     await renderTopBar('Eventos', profile);
   
     const content = document.getElementById('pageContent');
     Utils.showLoading(content);
   
     const isDiretoria = profile.tier === 'diretoria';
     let activeTab = 'eventos';
   
     /* ── CSS premium de eventos (injetado uma vez) ── */
     if (!document.getElementById('msy-ev-css')) {
       const _s = document.createElement('style');
       _s.id = 'msy-ev-css';
       _s.textContent = `
         /* ══ EVENT CARDS ══════════════════════════════════════════════ */
         .ev-card {
           position: relative;
           background: var(--black-3);
           border: 1px solid var(--border-faint);
           border-radius: var(--radius-lg);
           margin-bottom: 12px;
           overflow: hidden;
           transition: border-color .22s var(--ease), box-shadow .22s var(--ease), transform .22s var(--ease);
         }
         .ev-card:hover {
           border-color: rgba(201,168,76,.25);
           box-shadow: 0 8px 32px rgba(0,0,0,.55);
           transform: translateY(-2px);
         }
         .ev-card-stripe {
           position: absolute;
           left: 0; top: 0; bottom: 0;
           width: 3px;
           border-radius: 3px 0 0 3px;
         }
         .ev-card-inner {
           padding: 18px 20px 16px 22px;
         }
         .ev-card-top {
           display: flex;
           align-items: center;
           justify-content: space-between;
           gap: 10px;
           margin-bottom: 10px;
           flex-wrap: wrap;
         }
         .ev-card-type {
           display: inline-flex;
           align-items: center;
           gap: 5px;
           font-size: .62rem;
           font-weight: 700;
           text-transform: uppercase;
           letter-spacing: .09em;
           padding: 3px 10px;
           border-radius: 20px;
           border: 1px solid;
         }
         .ev-badge {
           display: inline-flex;
           align-items: center;
           gap: 4px;
           font-size: .62rem;
           font-weight: 700;
           padding: 3px 9px;
           border-radius: 20px;
           border: 1px solid;
           letter-spacing: .05em;
           text-transform: uppercase;
         }
         .ev-badge-done  { background:rgba(16,185,129,.1); border-color:rgba(16,185,129,.3); color:#10b981; }
         .ev-badge-obrig { background:rgba(220,38,38,.1);  border-color:rgba(220,38,38,.3);  color:#ef4444; }
         .ev-badge-opt   { background:rgba(201,168,76,.08);border-color:rgba(201,168,76,.2); color:var(--gold); }
         .ev-action-btn {
           width: 28px; height: 28px;
           border-radius: 7px;
           border: 1px solid rgba(255,255,255,.08);
           background: rgba(255,255,255,.03);
           cursor: pointer;
           display: inline-flex;
           align-items: center;
           justify-content: center;
           font-size: .72rem;
           color: var(--text-3);
           transition: all .18s;
         }
         .ev-action-btn:hover { background:rgba(255,255,255,.08); border-color:rgba(255,255,255,.16); }
         .ev-conclude-btn { color: #10b981 !important; border-color: rgba(16,185,129,.25) !important; }
         .ev-conclude-btn:hover { background: rgba(16,185,129,.1) !important; }
         .ev-card-title {
           font-family: 'Cinzel', serif;
           font-size: .98rem;
           font-weight: 700;
           color: var(--text-1);
           letter-spacing: .03em;
           margin-bottom: 8px;
           line-height: 1.3;
         }
         .ev-title-done {
           text-decoration: line-through;
           opacity: .55;
         }
         .ev-card-meta {
           display: flex;
           flex-wrap: wrap;
           gap: 14px;
           font-size: .76rem;
           color: var(--text-3);
           margin-bottom: 8px;
         }
         .ev-card-desc {
           font-size: .82rem;
           color: var(--text-2);
           line-height: 1.6;
           margin-bottom: 10px;
           padding-top: 6px;
           border-top: 1px solid var(--border-faint);
         }
         .ev-card-crew {
           display: flex;
           align-items: center;
           gap: 12px;
           flex-wrap: wrap;
           padding-top: 10px;
           border-top: 1px solid var(--border-faint);
           margin-top: 4px;
         }
         .ev-crew-item {
           display: flex;
           align-items: center;
           gap: 6px;
         }
         .ev-crew-label {
           font-size: .6rem;
           color: var(--text-3);
           text-transform: uppercase;
           letter-spacing: .08em;
           font-weight: 700;
         }
         .ev-crew-name {
           font-size: .76rem;
           color: var(--text-2);
           font-weight: 600;
         }
         .ev-crew-sep {
           width: 1px;
           height: 16px;
           background: var(--border-faint);
         }

         /* ══ SECAO LABEL ══════════════════════════════════════════════ */
         .ev-section-label {
           display: flex;
           align-items: center;
           gap: 10px;
           font-size: .65rem;
           color: var(--gold);
           text-transform: uppercase;
           letter-spacing: .14em;
           font-weight: 700;
           margin: 20px 0 12px;
         }
         .ev-section-label::after {
           content: '';
           flex: 1;
           height: 1px;
           background: linear-gradient(90deg, var(--border-gold), transparent);
         }
         .ev-section-label:first-child { margin-top: 0; }

         /* ══ MODAL NOVO EVENTO ════════════════════════════════════════ */
         #newEventModal .modal {
           max-width: 580px;
           background: #0e0e13;
           border: 1px solid rgba(201,168,76,.2);
         }
         #newEventModal .modal-header {
           background: linear-gradient(135deg,rgba(201,168,76,.07),transparent);
           border-bottom: 1px solid rgba(201,168,76,.15);
         }
         #newEventModal .modal-title {
           font-family: 'Cinzel', serif;
           letter-spacing: .06em;
           color: var(--gold);
         }
         .ev-form-grid-3 {
           display: grid;
           grid-template-columns: 1fr 1fr 1fr;
           gap: 12px;
           margin-bottom: 16px;
         }
         @media (max-width:560px) { .ev-form-grid-3 { grid-template-columns: 1fr 1fr; } }
         .ev-modal-section {
           font-size: .6rem;
           color: var(--gold);
           text-transform: uppercase;
           letter-spacing: .12em;
           font-weight: 700;
           margin: 18px 0 10px;
           display: flex;
           align-items: center;
           gap: 8px;
         }
         .ev-modal-section::before {
           content: '';
           width: 3px;
           height: 12px;
           background: var(--gold);
           border-radius: 2px;
         }
         .ev-check-row {
           display: flex;
           align-items: center;
           gap: 8px;
           cursor: pointer;
           font-size: .84rem;
           color: var(--text-2);
           padding: 10px 14px;
           border-radius: var(--radius);
           border: 1px solid var(--border-faint);
           background: rgba(255,255,255,.02);
           transition: all .18s;
           user-select: none;
         }
         .ev-check-row:hover { border-color: var(--border-gold); background: rgba(201,168,76,.04); }
         .ev-check-row input { accent-color: var(--gold); width: 15px; height: 15px; cursor: pointer; }
         /* ══ PRESENÇA EM EVENTOS ══════════════════════════════════════ */
         .ev-presence-bar {
           display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
           margin-top: 10px; padding-top: 10px;
           border-top: 1px solid var(--border-faint);
         }
         .ev-presence-btn {
           display: inline-flex; align-items: center; gap: 5px;
           padding: 6px 14px; border-radius: 8px; border: 1px solid;
           font-size: .75rem; font-weight: 700; cursor: pointer;
           letter-spacing: .04em; transition: all .18s;
         }
         .ev-presence-btn-join {
           background: rgba(16,185,129,.1); border-color: rgba(16,185,129,.35); color: #10b981;
         }
         .ev-presence-btn-join:hover { background: rgba(16,185,129,.2); }
         .ev-presence-btn-skip {
           background: rgba(220,38,38,.07); border-color: rgba(220,38,38,.25); color: #ef4444;
         }
         .ev-presence-btn-skip:hover { background: rgba(220,38,38,.15); }
         .ev-presence-btn-cancel {
           background: rgba(245,158,11,.07); border-color: rgba(245,158,11,.25); color: #f59e0b;
           font-size: .68rem;
         }
         .ev-presence-btn-cancel:hover { background: rgba(245,158,11,.13); }
         .ev-presence-btn:disabled { opacity: .45; cursor: not-allowed; }
         .ev-presence-status {
           font-size: .72rem; font-weight: 700; padding: 4px 12px;
           border-radius: 8px; border: 1px solid;
         }
         .ev-presence-status-joined { background:rgba(16,185,129,.1); border-color:rgba(16,185,129,.3); color:#10b981; }
         .ev-presence-status-skip   { background:rgba(220,38,38,.1);  border-color:rgba(220,38,38,.3);  color:#ef4444; }
         .ev-presence-count { font-size:.68rem; color:var(--text-3); margin-left:auto; }
       `;
       document.head.appendChild(_s);
     }

     async function loadEventos() {
       const tab = document.getElementById('evTab');
       if (!tab) return;
       tab.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i></div>`;

       /* Checar permissão de gerenciar eventos (diretoria OU permissão individual) */
       let canManage = isDiretoria;
       if (!isDiretoria) {
         canManage = await MSYPerms.checkAny(profile.id, profile.tier, ['criar_eventos','excluir_eventos','gerenciar_eventos']);
       }

       const [{ data: evs, error }, { data: myPresencas }] = await Promise.all([
         db.from('events')
           .select('*, creator:created_by(name,initials,color,avatar_url), helper:helper_id(name,initials,color,avatar_url)')
           .order('event_date', { ascending: false }),
         db.from('event_presencas').select('event_id,status,justificativa').eq('user_id', profile.id)
       ]);

       if (error) { Utils.showToast('Erro ao carregar eventos.', 'error'); return; }

       // Build my presence map { event_id -> status }
       const myPresMap = {};
       (myPresencas||[]).forEach(p => { myPresMap[p.event_id] = p.status; });

       // Load cancel requests pending
       const { data: cancelReqs } = await db.from('event_cancel_requests')
         .select('event_id,status').eq('user_id', profile.id).eq('status','pendente');
       const cancelPending = new Set((cancelReqs||[]).map(r => r.event_id));

       // Load confirmed counts for upcoming events (visible to all)
       const today    = new Date().toISOString().split('T')[0];
       const upcoming = (evs||[]).filter(e => e.event_date >= today && e.status !== 'concluido');
       const done     = (evs||[]).filter(e => e.status === 'concluido');
       const past     = (evs||[]).filter(e => e.event_date < today && e.status !== 'concluido');

       let presCountMap = {};
       if (upcoming.length) {
         const { data: counts } = await db.from('event_presencas')
           .select('event_id,status').in('event_id', upcoming.map(e=>e.id)).eq('status','participar');
         (counts||[]).forEach(c => { presCountMap[c.event_id] = (presCountMap[c.event_id]||0)+1; });
       }

       // Load cancel requests for diretoria
       let allCancelReqs = [];
       if (isDiretoria) {
         const { data: cr } = await db.from('event_cancel_requests')
           .select('*').eq('status','pendente').order('created_at',{ascending:false});
         if (cr && cr.length) {
           const uids = [...new Set(cr.map(r => r.user_id).filter(Boolean))];
           const { data: profs } = await db.from('profiles').select('id,name').in('id', uids);
           const pm = {}; (profs||[]).forEach(p => { pm[p.id] = p; });
           cr.forEach(r => { r.requester = pm[r.user_id] || null; });
         }
         allCancelReqs = cr||[];
       }

       tab.innerHTML = `
         ${canManage ? `
           <div style="margin-bottom:20px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
             <button class="btn btn-primary" id="newEventBtn">
               <i class="fa-solid fa-calendar-plus"></i> Novo Evento
             </button>
             ${allCancelReqs.length > 0 ? `<button class="btn btn-gold" id="cancelReqsBtn"><i class="fa-solid fa-bell"></i> ${allCancelReqs.length} Pedido(s) de Cancelamento</button>` : ''}
           </div>` : ''}

         ${upcoming.length > 0 ? `
           <div class="ev-section-label"><i class="fa-solid fa-calendar-days"></i> Próximos Eventos</div>
           ${upcoming.map(ev => renderEventCard(ev, canManage, false, myPresMap[ev.id]||null, cancelPending.has(ev.id), presCountMap[ev.id]||0)).join('')}
         ` : `
           <div class="empty-state" style="padding:40px">
             <div class="empty-state-icon"><i class="fa-solid fa-calendar-days"></i></div>
             <div class="empty-state-text">Nenhum evento agendado.</div>
           </div>`}

         ${done.length > 0 ? `
           <div class="ev-section-label" style="color:#10b981"><i class="fa-solid fa-circle-check"></i> Concluídos</div>
           ${done.map(ev => renderEventCard(ev, canManage, false, myPresMap[ev.id]||null, false, 0)).join('')}
         ` : ''}

         ${past.length > 0 ? `
           <div class="ev-section-label" style="color:var(--text-3)"><i class="fa-regular fa-calendar"></i> Encerrados</div>
           ${past.map(ev => renderEventCard(ev, canManage, true, myPresMap[ev.id]||null, false, 0)).join('')}
         ` : ''}
       `;

       document.getElementById('newEventBtn')?.addEventListener('click', () => openNewEventModal(profile, loadEventos));

       document.getElementById('cancelReqsBtn')?.addEventListener('click', () => openCancelRequestsModal(loadEventos));

       /* Excluir */
       tab.querySelectorAll('.delete-event-btn').forEach(btn => {
         btn.addEventListener('click', async e => {
           e.stopPropagation();
           if (!confirm('Excluir este evento permanentemente?')) return;
           const { error } = await db.from('events').delete().eq('id', btn.dataset.id);
           if (!error) { Utils.showToast('Evento excluído.'); loadEventos(); }
           else Utils.showToast('Erro ao excluir.', 'error');
         });
       });

       /* Concluir */
       tab.querySelectorAll('.ev-conclude-btn').forEach(btn => {
         btn.addEventListener('click', async e => {
           e.stopPropagation();
           const { error } = await db.from('events').update({ status: 'concluido' }).eq('id', btn.dataset.id);
           if (!error) { Utils.showToast('Evento marcado como concluído!'); loadEventos(); }
           else Utils.showToast('Erro ao atualizar.', 'error');
         });
       });

       /* Reabrir */
       tab.querySelectorAll('.ev-unconclude-btn').forEach(btn => {
         btn.addEventListener('click', async e => {
           e.stopPropagation();
           const { error } = await db.from('events').update({ status: 'ativo' }).eq('id', btn.dataset.id);
           if (!error) { Utils.showToast('Evento reaberto.'); loadEventos(); }
           else Utils.showToast('Erro ao reabrir.', 'error');
         });
       });

       /* PRESENÇA — Participar */
       tab.querySelectorAll('.pres-join-btn').forEach(btn => {
         btn.addEventListener('click', async e => {
           e.stopPropagation();
           btn.disabled = true;
           const eid = btn.dataset.id;
           const { error } = await db.from('event_presencas').upsert(
             { event_id: eid, user_id: profile.id, membro_id: profile.id, status: 'participar' },
             { onConflict: 'event_id,user_id', ignoreDuplicates: false }
           );
           if (!error) { Utils.showToast('Presença confirmada!'); loadEventos(); }
           else { Utils.showToast('Erro ao confirmar presença.', 'error'); btn.disabled = false; }
         });
       });

       /* PRESENÇA — Não Participar (abre modal de justificativa) */
       tab.querySelectorAll('.pres-skip-btn').forEach(btn => {
         btn.addEventListener('click', e => {
           e.stopPropagation();
           openSkipModal(btn.dataset.id, profile, loadEventos);
         });
       });

       /* PRESENÇA — Solicitar Cancelamento */
       tab.querySelectorAll('.pres-cancel-btn').forEach(btn => {
         btn.addEventListener('click', e => {
           e.stopPropagation();
           openPresenceCancelModal(btn.dataset.id, profile, loadEventos);
         });
       });

       /* PRESENÇA — Gerenciar (evento finalizado/encerrado, diretoria) */
       tab.querySelectorAll('.ev-pres-manage-btn').forEach(btn => {
         btn.addEventListener('click', e => {
           e.stopPropagation();
           const ev = [...(evs||[])].find(ev2 => ev2.id === btn.dataset.id);
           openPresenceManageModal(btn.dataset.id, ev, loadEventos);
         });
       });

       /* PRESENÇA — Ver detalhes (diretoria, evento futuro) */
       tab.querySelectorAll('.ev-pres-detail-btn').forEach(btn => {
         btn.addEventListener('click', e => {
           e.stopPropagation();
           const ev = [...(evs||[])].find(ev2 => ev2.id === btn.dataset.id);
           openPresenceDetailModal(btn.dataset.id, ev);
         });
       });
     }
   
     async function loadAtas() {
       const tab = document.getElementById('evTab');
       if (!tab) return;
       tab.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i></div>`;
   
       const { data: atas, error } = await db.from('meeting_minutes')
         .select('*, creator:created_by(name,initials,color)')
         .order('meeting_date', { ascending: false });
   
       if (error) { Utils.showToast('Erro ao carregar atas.', 'error'); return; }
   
       const dirAtас = (atas||[]).filter(a => a.type === 'diretoria');
       const gerAtаs = (atas||[]).filter(a => a.type === 'geral');
   
       tab.innerHTML = `
         ${isDiretoria ? `
           <div style="margin-bottom:18px">
             <button class="btn btn-primary" id="newAtaBtn"><i class="fa-solid fa-plus"></i> Nova Ata</button>
           </div>` : ''}
   
         <div style="font-size:.78rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">
           <i class="fa-solid fa-shield-halved" style="color:var(--gold)"></i> Reuniões da Diretoria
         </div>
         ${dirAtас.length === 0
           ? `<div class="empty-state" style="padding:20px"><div class="empty-state-text">Nenhuma ata de diretoria.</div></div>`
           : dirAtас.map(a => renderAtaCard(a, isDiretoria)).join('')}
   
         <div style="font-size:.78rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-top:28px;margin-bottom:12px">
           <i class="fa-solid fa-users" style="color:var(--gold)"></i> Reuniões Gerais da Masayoshi
         </div>
         ${gerAtаs.length === 0
           ? `<div class="empty-state" style="padding:20px"><div class="empty-state-text">Nenhuma ata geral.</div></div>`
           : gerAtаs.map(a => renderAtaCard(a, isDiretoria)).join('')}
       `;
   
       document.getElementById('newAtaBtn')?.addEventListener('click', () => openNewAtaModal(profile, loadAtas));
   
       tab.querySelectorAll('.delete-ata-btn').forEach(btn => {
         btn.addEventListener('click', async e => {
           e.stopPropagation();
           if (!confirm('Excluir esta ata?')) return;
           const { error } = await db.from('meeting_minutes').delete().eq('id', btn.dataset.id);
           if (!error) { Utils.showToast('Ata excluída.'); loadAtas(); }
           else Utils.showToast('Erro ao excluir.', 'error');
         });
       });
   
       tab.querySelectorAll('.view-ata-btn').forEach(btn => {
         btn.addEventListener('click', e => {
           e.stopPropagation();
           const ata = atas.find(a => a.id === btn.dataset.id);
           if (!ata) return;
           document.getElementById('ataViewTitle').textContent = ata.title;
           document.getElementById('ataViewBody').innerHTML = `
             <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">
               <span class="badge ${ata.type==='diretoria'?'badge-red':'badge-gold'}">${ata.type==='diretoria'?'Diretoria':'Geral'}</span>
               <span style="font-size:.78rem;color:var(--text-3)"><i class="fa-regular fa-calendar"></i> ${Utils.formatDate(ata.meeting_date)}</span>
             </div>
             ${ata.content ? `<div style="font-size:.88rem;color:var(--text-1);line-height:1.8;white-space:pre-wrap">${Utils.escapeHtml(ata.content)}</div>` : '<div style="color:var(--text-3);font-size:.84rem">Sem conteúdo registrado.</div>'}
             ${ata.document_url ? `<div class="divider"></div><a href="${ata.document_url}" target="_blank" class="btn btn-outline"><i class="fa-solid fa-file-arrow-down"></i> ${Utils.escapeHtml(ata.document_name||'Documento')}</a>` : ''}
           `;
           document.getElementById('ataViewModal').classList.add('open');
         });
       });
     }
   
     async function loadRanking() {
       const tab = document.getElementById('evTab');
       if (!tab) return;
       tab.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i></div>`;
   
       const { data: rankings, error } = await db.from('weekly_rankings')
         .select('*, creator:created_by(name)')
         .order('week_start', { ascending: false });
   
       if (error) { Utils.showToast('Erro ao carregar rankings.', 'error'); return; }
   
       tab.innerHTML = `
         ${isDiretoria ? `
           <div style="margin-bottom:18px">
             <button class="btn btn-primary" id="newRankingBtn"><i class="fa-solid fa-plus"></i> Novo Ranking Semanal</button>
           </div>` : ''}
         ${(rankings||[]).length === 0
           ? `<div class="empty-state" style="padding:40px"><div class="empty-state-icon"><i class="fa-solid fa-chart-bar"></i></div><div class="empty-state-text">Nenhum ranking registrado ainda.</div></div>`
           : (rankings||[]).map(r => {
               const sorted = [...(r.entries||[])].sort((a,b) => b.messages - a.messages);
               return `
                 <div class="card card-enter" style="margin-bottom:16px">
                   <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                     <div>
                       <div style="font-weight:600;color:var(--text-1)">${Utils.formatDate(r.week_start)} → ${Utils.formatDate(r.week_end)}</div>
                       <div style="font-size:.72rem;color:var(--text-3)">Criado por ${Utils.escapeHtml(r.creator?.name||'—')}</div>
                     </div>
                     ${isDiretoria ? `<button class="btn btn-ghost btn-sm delete-ranking-btn" data-id="${r.id}" style="color:var(--red-bright)"><i class="fa-solid fa-trash"></i></button>` : ''}
                   </div>
                   <table style="width:100%;border-collapse:collapse;font-size:.85rem">
                     <thead>
                       <tr style="border-bottom:1px solid var(--border-faint)">
                         <th style="text-align:left;padding:6px 8px;color:var(--text-3);font-weight:500">#</th>
                         <th style="text-align:left;padding:6px 8px;color:var(--text-3);font-weight:500">Membro</th>
                         <th style="text-align:right;padding:6px 8px;color:var(--text-3);font-weight:500">Mensagens</th>
                       </tr>
                     </thead>
                     <tbody>
                       ${sorted.map((e,i) => `
                         <tr style="border-bottom:1px solid var(--border-faint)">
                           <td style="padding:8px;color:${i===0?'#f59e0b':i===1?'#9ca3af':i===2?'#b47c3c':'var(--text-3)'};font-weight:600">${i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}º`}</td>
                           <td style="padding:8px;color:var(--text-1)">${Utils.escapeHtml(e.name)}</td>
                           <td style="padding:8px;text-align:right;color:var(--gold);font-weight:600">${e.messages}</td>
                         </tr>`).join('')}
                     </tbody>
                   </table>
                 </div>`;
             }).join('')
         }
       `;
   
       document.getElementById('newRankingBtn')?.addEventListener('click', () => openNewRankingModal(profile, loadRanking));
   
       tab.querySelectorAll('.delete-ranking-btn').forEach(btn => {
         btn.addEventListener('click', async e => {
           e.stopPropagation();
           if (!confirm('Excluir este ranking?')) return;
           const { error } = await db.from('weekly_rankings').delete().eq('id', btn.dataset.id);
           if (!error) { Utils.showToast('Ranking excluído.'); loadRanking(); }
           else Utils.showToast('Erro ao excluir.', 'error');
         });
       });
     }
   
     content.innerHTML = `
       <div class="page-header">
         <div>
           <div class="page-header-title">Eventos</div>
           <div class="page-header-sub">Agenda, atas e rankings da Masayoshi Order</div>
         </div>
       </div>
       <div class="filters-bar" style="margin-bottom:20px">
         <button class="filter-btn active" data-tab="eventos"><i class="fa-solid fa-calendar-days"></i> Eventos</button>

       </div>
       <div id="evTab"></div>
   
       <!-- New Event Modal -->
       <div class="modal-overlay" id="newEventModal">
         <div class="modal" style="max-width:580px;background:#0e0e13;border:1px solid rgba(201,168,76,.2)">
           <div class="modal-header" style="background:linear-gradient(135deg,rgba(201,168,76,.07),transparent);border-bottom:1px solid rgba(201,168,76,.15)">
             <div class="modal-title" style="font-family:'Cinzel',serif;letter-spacing:.06em;color:var(--gold)">
               <i class="fa-solid fa-calendar-plus"></i> Novo Evento
             </div>
             <button class="modal-close" id="newEventClose"><i class="fa-solid fa-xmark"></i></button>
           </div>
           <div class="modal-body" style="padding:24px;display:flex;flex-direction:column;gap:0">

             <!-- Título -->
             <div class="form-group" style="margin-bottom:16px">
               <label class="form-label">Título <span style="color:var(--red-bright)">*</span></label>
               <input class="form-input" id="ev-title" placeholder="Nome do evento" style="font-size:.92rem">
             </div>

             <!-- Data / Hora / Tipo -->
             <div class="ev-form-grid-3">
               <div class="form-group">
                 <label class="form-label">Data <span style="color:var(--red-bright)">*</span></label>
                 <input class="form-input" type="date" id="ev-date">
               </div>
               <div class="form-group">
                 <label class="form-label">Horário</label>
                 <input class="form-input" type="time" id="ev-time" value="19:00">
               </div>
               <div class="form-group">
                 <label class="form-label">Tipo</label>
                 <select class="form-input form-select" id="ev-type">
                   <option>Reunião</option>
                   <option>Treinamento</option>
                   <option>Evento Social</option>
                   <option>Cerimonial</option>
                   <option>Outro</option>
                 </select>
               </div>
             </div>

             <!-- Seção: Responsáveis -->
             <div class="ev-modal-section">Responsáveis</div>

             <div class="form-group" style="margin-bottom:12px">
               <label class="form-label" style="display:flex;align-items:center;gap:6px">
                 <i class="fa-solid fa-user-pen" style="color:var(--gold);font-size:.8rem"></i>
                 Criador do Evento <span style="color:var(--red-bright)">*</span>
                 <span style="font-size:.65rem;color:var(--text-3);font-weight:400;margin-left:4px">impacta desempenho</span>
               </label>
               <select class="form-input form-select" id="ev-creator">
                 <option value="">Selecione o criador...</option>
               </select>
             </div>

             <div class="form-group" style="margin-bottom:4px">
               <label class="form-label" style="display:flex;justify-content:space-between;align-items:center">
                 <span style="display:flex;align-items:center;gap:6px">
                   <i class="fa-solid fa-users" style="color:var(--gold);font-size:.8rem"></i>
                   Co-criadores
                   <span style="font-size:.65rem;color:var(--text-3);font-weight:400">recebem crédito</span>
                 </span>
                 <button type="button" class="btn btn-ghost btn-sm" id="ev-add-helper" style="font-size:.65rem;padding:3px 10px">
                   <i class="fa-solid fa-plus"></i> Adicionar
                 </button>
               </label>
               <div id="ev-helpers-wrap">
                 <select class="form-input form-select ev-helper-sel" style="margin-bottom:6px">
                   <option value="">Nenhum co-criador</option>
                 </select>
               </div>
               <div style="font-size:.65rem;color:var(--text-3);margin-top:2px">Máx. 5 co-criadores por evento.</div>
             </div>

             <!-- Seção: Detalhes -->
             <div class="ev-modal-section">Detalhes</div>

             <div class="form-group" style="margin-bottom:16px">
               <label class="form-label">Descrição</label>
               <textarea class="form-input form-textarea" id="ev-desc" style="min-height:80px;resize:vertical" placeholder="Detalhes, local, pauta..."></textarea>
             </div>

             <!-- Checkboxes -->
             <div style="display:flex;flex-direction:column;gap:8px">
               <label class="ev-check-row">
                 <input type="checkbox" id="ev-mandatory">
                 <i class="fa-solid fa-circle-exclamation" style="color:var(--red-bright);font-size:.85rem"></i>
                 Presença obrigatória
               </label>
               <label class="ev-check-row" style="border-color:rgba(168,85,247,.2)">
                 <input type="checkbox" id="ev-private" style="accent-color:#a855f7">
                 <i class="fa-solid fa-lock" style="color:#c084fc;font-size:.85rem"></i>
                 <span style="color:#c084fc">Reunião interna — visível apenas para Diretoria</span>
               </label>
             </div>

           </div>
           <div class="modal-footer">
             <button class="btn btn-ghost" id="newEventCancel">Cancelar</button>
             <button class="btn btn-primary" id="newEventSave">
               <i class="fa-solid fa-calendar-plus"></i> Criar Evento
             </button>
           </div>
         </div>
       </div>
   
       <!-- New Ata Modal -->
       <div class="modal-overlay" id="newAtaModal">
         <div class="modal">
           <div class="modal-header">
             <div class="modal-title">Nova Ata de Reunião</div>
             <button class="modal-close" id="newAtaClose"><i class="fa-solid fa-xmark"></i></button>
           </div>
           <div class="modal-body">
             <div class="form-group" style="margin-bottom:14px">
               <label class="form-label">Título *</label>
               <input class="form-input" id="ata-title" placeholder="Ex: Reunião de Planejamento Q2">
             </div>
             <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
               <div class="form-group">
                 <label class="form-label">Data da Reunião *</label>
                 <input class="form-input" type="date" id="ata-date">
               </div>
               <div class="form-group">
                 <label class="form-label">Tipo *</label>
                 <select class="form-input form-select" id="ata-type">
                   <option value="geral">Geral da Masayoshi</option>
                   <option value="diretoria">Diretoria</option>
                 </select>
               </div>
             </div>
             <div class="form-group">
               <label class="form-label">Conteúdo / Resumo</label>
               <textarea class="form-input form-textarea" id="ata-content" style="min-height:120px" placeholder="O que foi discutido, decisões, pautas..."></textarea>
             </div>
           </div>
           <div class="modal-footer">
             <button class="btn btn-ghost" id="newAtaCancel">Cancelar</button>
             <button class="btn btn-primary" id="newAtaSave"><i class="fa-solid fa-file-circle-plus"></i> Salvar Ata</button>
           </div>
         </div>
       </div>
   
       <!-- View Ata Modal -->
       <div class="modal-overlay" id="ataViewModal">
         <div class="modal">
           <div class="modal-header">
             <div class="modal-title" id="ataViewTitle"></div>
             <button class="modal-close" id="ataViewClose"><i class="fa-solid fa-xmark"></i></button>
           </div>
           <div class="modal-body" id="ataViewBody"></div>
           <div class="modal-footer"><button class="btn btn-outline" id="ataViewCancel">Fechar</button></div>
         </div>
       </div>
   
       <!-- New Ranking Modal -->
       <div class="modal-overlay" id="newRankingModal">
         <div class="modal">
           <div class="modal-header">
             <div class="modal-title"><i class="fa-solid fa-ranking-star"></i> Novo Ranking Semanal</div>
             <button class="modal-close" id="newRankingClose"><i class="fa-solid fa-xmark"></i></button>
           </div>
           <div class="modal-body" id="newRankingBody"></div>
           <div class="modal-footer" id="newRankingFooter"></div>
         </div>
       </div>
     `;
   
     // Tab switching
     content.querySelectorAll('.filter-btn[data-tab]').forEach(btn => {
       btn.addEventListener('click', () => {
         content.querySelectorAll('.filter-btn[data-tab]').forEach(b => b.classList.remove('active'));
         btn.classList.add('active');
         activeTab = btn.dataset.tab;
         if (activeTab === 'eventos') loadEventos();
         
         else if (activeTab === 'ranking') loadRanking();
       });
     });
   
     // New event modal handlers
     const newEventModal = document.getElementById('newEventModal');
     if (newEventModal && newEventModal.parentElement !== document.body) document.body.appendChild(newEventModal);
     document.getElementById('newEventClose').addEventListener('click', () => newEventModal.classList.remove('open'));
     document.getElementById('newEventCancel').addEventListener('click', () => newEventModal.classList.remove('open'));
     newEventModal.addEventListener('click', e => { if (e.target === newEventModal) newEventModal.classList.remove('open'); });
   
     // New ata modal handlers
     const newAtaModal = document.getElementById('newAtaModal');
     if (newAtaModal && newAtaModal.parentElement !== document.body) document.body.appendChild(newAtaModal);
     document.getElementById('newAtaClose').addEventListener('click', () => newAtaModal.classList.remove('open'));
     document.getElementById('newAtaCancel').addEventListener('click', () => newAtaModal.classList.remove('open'));
     newAtaModal.addEventListener('click', e => { if (e.target === newAtaModal) newAtaModal.classList.remove('open'); });
   
     // View ata modal handlers
     const ataViewModal = document.getElementById('ataViewModal');
     if (ataViewModal && ataViewModal.parentElement !== document.body) document.body.appendChild(ataViewModal);
     document.getElementById('ataViewClose').addEventListener('click', () => ataViewModal.classList.remove('open'));
     document.getElementById('ataViewCancel').addEventListener('click', () => ataViewModal.classList.remove('open'));
     ataViewModal.addEventListener('click', e => { if (e.target === ataViewModal) ataViewModal.classList.remove('open'); });
   
     // Ranking modal handlers
     const newRankingModal = document.getElementById('newRankingModal');
     if (newRankingModal && newRankingModal.parentElement !== document.body) document.body.appendChild(newRankingModal);
     document.getElementById('newRankingClose').addEventListener('click', () => newRankingModal.classList.remove('open'));
     newRankingModal.addEventListener('click', e => { if (e.target === newRankingModal) newRankingModal.classList.remove('open'); });
   
     await loadEventos();
   }
   
   function renderEventCard(ev, canManage, isPast = false, myStatus = null, cancelPending = false, presCount = 0) {
     const isDone     = ev.status === 'concluido';
     const isPrivate  = ev.is_private;
     const creator    = ev.creator;
     const helper     = ev.helper;

     /* Cor e ícone por tipo */
     const TYPE_META = {
       'Reunião':       { color:'#60a5fa', icon:'fa-users' },
       'Treinamento':   { color:'#10b981', icon:'fa-graduation-cap' },
       'Evento Social': { color:'#f59e0b', icon:'fa-champagne-glasses' },
       'Cerimonial':    { color:'#c9a84c', icon:'fa-crown' },
       'Outro':         { color:'#8b5cf6', icon:'fa-star' },
     };
     const typeMeta = TYPE_META[ev.type] || { color:'#c9a84c', icon:'fa-calendar' };

     /* Opacidade para passados/concluídos */
     const dimStyle = (isPast || isDone) ? 'opacity:.6;' : '';

     /* Mini avatar */
     const miniAvatar = (m) => m
       ? `<div class="avatar" style="width:20px;height:20px;font-size:.45rem;flex-shrink:0;background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a)">
            ${m.avatar_url ? `<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : (m.initials||Utils.getInitials(m.name))}
          </div>`
       : '';

     return `
       <div class="ev-card card-enter" data-id="${ev.id}" style="${dimStyle}">
         <!-- Faixa lateral colorida por tipo -->
         <div class="ev-card-stripe" style="background:${typeMeta.color}"></div>

         <div class="ev-card-inner">
           <!-- Topo: tipo + badges + ações -->
           <div class="ev-card-top">
             <div class="ev-card-type" style="color:${typeMeta.color};border-color:${typeMeta.color}33;background:${typeMeta.color}12">
               <i class="fa-solid ${typeMeta.icon}" style="font-size:.6rem"></i>
               ${Utils.escapeHtml(ev.type)}
             </div>
             <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
               ${isDone
                 ? `<span class="ev-badge ev-badge-done"><i class="fa-solid fa-circle-check" style="font-size:.6rem"></i> Concluído</span>`
                 : ev.mandatory
                   ? `<span class="ev-badge ev-badge-obrig"><i class="fa-solid fa-circle-exclamation" style="font-size:.6rem"></i> Obrigatório</span>`
                   : `<span class="ev-badge ev-badge-opt">Opcional</span>`}
               ${isPrivate ? `<span class="ev-badge" style="background:rgba(168,85,247,.12);border-color:rgba(168,85,247,.3);color:#c084fc"><i class="fa-solid fa-lock" style="font-size:.55rem"></i> Diretoria</span>` : ''}
               ${canManage ? `
                 <div style="display:flex;gap:4px;margin-left:4px">
                   ${!isDone ? `<button class="ev-action-btn ev-conclude-btn" data-id="${ev.id}" title="Marcar como concluído">
                     <i class="fa-solid fa-circle-check"></i>
                   </button>` : `<button class="ev-action-btn ev-unconclude-btn" data-id="${ev.id}" title="Reabrir evento" style="color:var(--text-3)">
                     <i class="fa-solid fa-rotate-left"></i>
                   </button>`}
                   <button class="ev-action-btn delete-event-btn" data-id="${ev.id}" title="Excluir evento" style="color:var(--red-bright)">
                     <i class="fa-solid fa-trash"></i>
                   </button>
                 </div>` : ''}
             </div>
           </div>

           <!-- Título -->
           <div class="ev-card-title ${isDone ? 'ev-title-done' : ''}">${Utils.escapeHtml(ev.title)}</div>

           <!-- Meta: data, hora -->
           <div class="ev-card-meta">
             <span><i class="fa-regular fa-calendar" style="color:${typeMeta.color};opacity:.8"></i> ${Utils.formatDate(ev.event_date)}</span>
             <span><i class="fa-regular fa-clock" style="color:${typeMeta.color};opacity:.8"></i> ${ev.event_time || '—'}</span>
           </div>

           <!-- Descrição -->
           ${ev.description ? `<div class="ev-card-desc">${Utils.escapeHtml(ev.description)}</div>` : ''}

           <!-- Criador e co-criador -->
           ${creator || helper ? `
             <div class="ev-card-crew">
               ${creator ? `
                 <div class="ev-crew-item">
                   ${miniAvatar(creator)}
                   <span class="ev-crew-label">Criador</span>
                   <span class="ev-crew-name">${Utils.escapeHtml(creator.name)}</span>
                 </div>` : ''}
               ${helper ? `
                 <div class="ev-crew-sep"></div>
                 <div class="ev-crew-item">
                   ${miniAvatar(helper)}
                   <span class="ev-crew-label">Co-criador</span>
                   <span class="ev-crew-name">${Utils.escapeHtml(helper.name)}</span>
                 </div>` : ''}
             </div>` : ''}

           ${!isPast && !isDone ? `
             <div class="ev-presence-bar" data-evid="${ev.id}">
               ${myStatus === 'participar' ? `
                 <span class="ev-presence-status ev-presence-status-joined"><i class="fa-solid fa-check"></i> Confirmado</span>
                 ${cancelPending
                   ? `<span class="ev-presence-btn ev-presence-btn-cancel" style="cursor:default"><i class="fa-solid fa-clock"></i> Cancelamento Pendente</span>`
                   : `<button class="ev-presence-btn ev-presence-btn-cancel pres-cancel-btn" data-id="${ev.id}"><i class="fa-solid fa-rotate-left"></i> Solicitar Cancelamento</button>`}
               ` : myStatus === 'nao_participar' ? `
                 <span class="ev-presence-status ev-presence-status-skip"><i class="fa-solid fa-comment-dots"></i> Justificou ausência</span>
               ` : `
                 <button class="ev-presence-btn ev-presence-btn-join pres-join-btn" data-id="${ev.id}"><i class="fa-solid fa-check"></i> Vou Participar</button>
                 <button class="ev-presence-btn ev-presence-btn-skip pres-skip-btn" data-id="${ev.id}"><i class="fa-solid fa-xmark"></i> Não Vou Participar</button>
               `}
               <span class="ev-presence-count"><i class="fa-solid fa-users" style="font-size:.6rem"></i> ${presCount} confirmado${presCount!==1?'s':''}</span>
               ${canManage ? `<button class="ev-presence-btn ev-pres-detail-btn" data-id="${ev.id}" style="background:rgba(201,168,76,.06);border:1px solid rgba(201,168,76,.18);color:var(--gold);margin-left:auto;font-size:.65rem;padding:4px 10px"><i class="fa-solid fa-eye"></i> Ver detalhes</button>` : ''}
             </div>` : (isPast || isDone) && canManage ? `
             <div class="ev-presence-bar" data-evid="${ev.id}">
               <button class="ev-presence-btn ev-pres-manage-btn" data-id="${ev.id}" style="background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.25);color:var(--gold)">
                 <i class="fa-solid fa-clipboard-list"></i> Registrar Presenças (${presCount} confirmado${presCount!==1?'s':''})
               </button>
             </div>` : ''}
         </div>
       </div>`;
   }
   
   function renderAtaCard(ata, isDiretoria) {
     return `
       <div class="card card-enter" style="margin-bottom:10px">
         <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
           <div style="flex:1">
             <div style="font-weight:600;color:var(--text-1);margin-bottom:2px">${Utils.escapeHtml(ata.title)}</div>
             <div style="font-size:.75rem;color:var(--text-3)"><i class="fa-regular fa-calendar"></i> ${Utils.formatDate(ata.meeting_date)}</div>
           </div>
           <div style="display:flex;gap:6px">
             <button class="btn btn-outline btn-sm view-ata-btn" data-id="${ata.id}"><i class="fa-solid fa-eye"></i> Ver</button>
             ${isDiretoria ? `<button class="btn btn-ghost btn-sm delete-ata-btn" data-id="${ata.id}" style="color:var(--red-bright)"><i class="fa-solid fa-trash" style="font-size:.7rem"></i></button>` : ''}
           </div>
         </div>
       </div>`;
   }
   
   /* ── Diretoria: painel detalhado de presenças (evento ativo/futuro) ── */
   async function openPresenceDetailModal(eventId, evento) {
     const overlay = document.createElement('div');
     overlay.className = 'modal-overlay open';
     overlay.innerHTML = `
       <div class="modal" style="max-width:580px;background:#0e0e13;border:1px solid rgba(201,168,76,.2);max-height:88vh;display:flex;flex-direction:column">
         <div class="modal-header" style="background:linear-gradient(135deg,rgba(201,168,76,.07),transparent);border-bottom:1px solid rgba(201,168,76,.15)">
           <div>
             <div class="modal-title font-cinzel" style="color:var(--gold)"><i class="fa-solid fa-users-viewfinder"></i> Detalhes de Presença</div>
             <div style="font-size:.72rem;color:var(--text-3);margin-top:2px">${evento ? Utils.escapeHtml(evento.title) : 'Evento'}</div>
           </div>
           <button class="modal-close" id="pdClose"><i class="fa-solid fa-xmark"></i></button>
         </div>
         <div class="modal-body" id="pdBody" style="overflow-y:auto;flex:1">
           <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i></div>
         </div>
         <div class="modal-footer"><button class="btn btn-outline" id="pdDone">Fechar</button></div>
       </div>`;
     document.body.appendChild(overlay);
     const close = () => overlay.remove();
     overlay.querySelector('#pdClose').addEventListener('click', close);
     overlay.querySelector('#pdDone').addEventListener('click', close);
     overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

     const [memRes, presRes, cancelRes] = await Promise.all([
       db.from('profiles').select('id,name,role,initials,color,avatar_url').eq('status','ativo').order('name'),
       db.from('event_presencas').select('*').eq('event_id', eventId),
       db.from('event_cancel_requests').select('*').eq('event_id', eventId).order('created_at',{ascending:false})
     ]);

     // Enriquecer cancel requests com nome do solicitante
     if (cancelRes.data && cancelRes.data.length) {
       const uids = [...new Set(cancelRes.data.map(r => r.user_id).filter(Boolean))];
       const { data: profs } = await db.from('profiles').select('id,name').in('id', uids);
       const pm = {}; (profs||[]).forEach(p => { pm[p.id] = p; });
       cancelRes.data.forEach(r => { r.requester = pm[r.user_id] || null; });
     }

     const membros = memRes.data || [];
     const presMap = {};
     (presRes.data||[]).forEach(p => { presMap[p.user_id || p.membro_id] = p; });
     const cancelReqs = cancelRes.data || [];

     const confirmados = membros.filter(m => {
       const s = presMap[m.id]?.status;
       return s === 'participar' || s === 'confirmado';
     });
     const justificados = membros.filter(m => {
       const s = presMap[m.id]?.status;
       return s === 'nao_participar' || s === 'ausente' || s === 'justificado';
     });
     const semResp = membros.filter(m => !presMap[m.id]);
     const cancelPend = cancelReqs.filter(r => r.status === 'pendente');

     const avatarHtml = m => m.avatar_url
       ? `<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
       : (m.initials || Utils.getInitials(m.name));

     const memberRow = (m, statusColor, statusIcon, extra = '') => `
       <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:rgba(255,255,255,.02);border-radius:8px;border:1px solid var(--border-faint);margin-bottom:6px">
         <div class="avatar" style="width:28px;height:28px;font-size:.5rem;flex-shrink:0;background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a)">${avatarHtml(m)}</div>
         <div style="flex:1;min-width:0">
           <div style="font-size:.82rem;font-weight:600;color:var(--text-1)">${Utils.escapeHtml(m.name)}</div>
           ${m.role ? `<div style="font-size:.65rem;color:var(--text-3)">${Utils.escapeHtml(m.role)}</div>` : ''}
           ${extra}
         </div>
         <i class="${statusIcon}" style="color:${statusColor};font-size:.8rem;flex-shrink:0"></i>
       </div>`;

     const cancelCardHtml = (r) => `
       <div style="padding:10px 14px;background:rgba(245,158,11,.05);border:1px solid rgba(245,158,11,.2);border-radius:8px;margin-bottom:8px">
         <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
           <div style="font-size:.82rem;font-weight:600;color:var(--text-1)">${Utils.escapeHtml(r.requester?.name||'—')}</div>
           <span style="font-size:.62rem;padding:2px 8px;border-radius:12px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);color:#f59e0b">${r.status === 'pendente' ? 'Pendente' : r.status === 'aprovado' ? 'Aprovado' : 'Recusado'}</span>
         </div>
         <div style="font-size:.78rem;color:var(--text-2);margin-bottom:8px"><i class="fa-solid fa-comment-dots" style="color:#f59e0b;margin-right:5px;font-size:.7rem"></i>${Utils.escapeHtml(r.justificativa)}</div>
         ${r.status === 'pendente' ? `
           <div style="display:flex;gap:6px">
             <button class="btn btn-sm pd-cr-approve" data-rid="${r.id}" data-uid="${r.user_id}" data-eid="${r.event_id}" style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);color:#10b981"><i class="fa-solid fa-check"></i> Aprovar</button>
             <button class="btn btn-sm pd-cr-refuse" data-rid="${r.id}" style="background:rgba(220,38,38,.07);border:1px solid rgba(220,38,38,.25);color:#ef4444"><i class="fa-solid fa-xmark"></i> Recusar</button>
           </div>` : ''}
       </div>`;

     const sectionLabel = (label, count, color = 'var(--gold)') => `
       <div style="font-size:.62rem;color:${color};text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin:16px 0 8px;display:flex;align-items:center;gap:8px">
         <span>${label}</span><span style="background:rgba(255,255,255,.05);border-radius:10px;padding:1px 8px;color:var(--text-3)">${count}</span>
         <div style="flex:1;height:1px;background:linear-gradient(90deg,rgba(255,255,255,.08),transparent)"></div>
       </div>`;

     const body = overlay.querySelector('#pdBody');
     body.innerHTML = `
       <!-- Resumo -->
       <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:4px">
         <div style="background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.18);border-radius:10px;padding:10px;text-align:center">
           <div style="font-size:1.3rem;font-weight:700;color:#10b981">${confirmados.length}</div>
           <div style="font-size:.62rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Confirmados</div>
         </div>
         <div style="background:rgba(220,38,38,.07);border:1px solid rgba(220,38,38,.18);border-radius:10px;padding:10px;text-align:center">
           <div style="font-size:1.3rem;font-weight:700;color:#ef4444">${justificados.length}</div>
           <div style="font-size:.62rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Justificados</div>
         </div>
         <div style="background:rgba(255,255,255,.03);border:1px solid var(--border-faint);border-radius:10px;padding:10px;text-align:center">
           <div style="font-size:1.3rem;font-weight:700;color:var(--text-3)">${semResp.length}</div>
           <div style="font-size:.62rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Sem resp.</div>
         </div>
       </div>

       ${cancelPend.length ? `
         ${sectionLabel('<i class="fa-solid fa-rotate-left"></i> Pedidos de Cancelamento', cancelPend.length, '#f59e0b')}
         ${cancelPend.map(cancelCardHtml).join('')}
       ` : ''}

       ${confirmados.length ? `
         ${sectionLabel('<i class="fa-solid fa-check"></i> Vão Participar', confirmados.length, '#10b981')}
         ${confirmados.map(m => memberRow(m, '#10b981', 'fa-solid fa-check-circle')).join('')}
       ` : ''}

       ${justificados.length ? `
         ${sectionLabel('<i class="fa-solid fa-comment-dots"></i> Justificaram Ausência', justificados.length, '#ef4444')}
         ${justificados.map(m => {
           const just = presMap[m.id]?.justificativa;
           const extra = just ? `<div style="font-size:.72rem;color:var(--text-2);margin-top:3px;padding:4px 8px;background:rgba(220,38,38,.06);border-radius:5px;border-left:2px solid rgba(220,38,38,.3)"><i class="fa-solid fa-comment-dots" style="color:#ef4444;margin-right:4px;font-size:.65rem"></i>${Utils.escapeHtml(just)}</div>` : '';
           return memberRow(m, '#ef4444', 'fa-solid fa-comment-dots', extra);
         }).join('')}
       ` : ''}

       ${semResp.length ? `
         ${sectionLabel('<i class="fa-solid fa-minus"></i> Sem Resposta', semResp.length, 'var(--text-3)')}
         ${semResp.map(m => memberRow(m, 'var(--text-3)', 'fa-solid fa-minus-circle')).join('')}
       ` : ''}
     `;

     // Cancel request handlers
     body.querySelectorAll('.pd-cr-approve').forEach(btn => {
       btn.addEventListener('click', async () => {
         btn.disabled = true;
         const [{ error: e1 }, { error: e2 }] = await Promise.all([
           db.from('event_presencas').delete().eq('event_id', btn.dataset.eid).eq('user_id', btn.dataset.uid),
           db.from('event_cancel_requests').update({ status: 'aprovado' }).eq('id', btn.dataset.rid)
         ]);
         if (!e1 && !e2) { Utils.showToast('Cancelamento aprovado.'); btn.closest('[style*="rgba(245"]').remove(); }
         else { Utils.showToast('Erro.', 'error'); btn.disabled = false; }
       });
     });
     body.querySelectorAll('.pd-cr-refuse').forEach(btn => {
       btn.addEventListener('click', async () => {
         btn.disabled = true;
         const { error } = await db.from('event_cancel_requests').update({ status: 'recusado' }).eq('id', btn.dataset.rid);
         if (!error) { Utils.showToast('Recusado.'); btn.closest('[style*="rgba(245"]').remove(); }
         else { Utils.showToast('Erro.', 'error'); btn.disabled = false; }
       });
     });
   }

   /* ── Presença: modal Gerenciar Presenças (evento concluído/encerrado) ── */
   async function openPresenceManageModal(eventId, evento, onSuccess) {
     const overlay = document.createElement('div');
     overlay.className = 'modal-overlay open';
     overlay.innerHTML = `
       <div class="modal" style="max-width:560px;background:#0e0e13;border:1px solid rgba(201,168,76,.2);max-height:85vh;display:flex;flex-direction:column">
         <div class="modal-header" style="background:linear-gradient(135deg,rgba(201,168,76,.07),transparent);border-bottom:1px solid rgba(201,168,76,.15)">
           <div>
             <div class="modal-title font-cinzel" style="color:var(--gold)"><i class="fa-solid fa-clipboard-list"></i> Presenças</div>
             <div style="font-size:.72rem;color:var(--text-3);margin-top:2px">${evento ? Utils.escapeHtml(evento.title) : 'Evento'}</div>
           </div>
           <button class="modal-close" id="pmClose"><i class="fa-solid fa-xmark"></i></button>
         </div>
         <div class="modal-body" id="pmBody" style="overflow-y:auto;flex:1">
           <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i></div>
         </div>
         <div class="modal-footer"><button class="btn btn-outline" id="pmDone">Fechar</button></div>
       </div>`;
     document.body.appendChild(overlay);
     const close = () => { overlay.remove(); onSuccess(); };
     overlay.querySelector('#pmClose').addEventListener('click', close);
     overlay.querySelector('#pmDone').addEventListener('click', close);
     overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

     const [memRes, presRes] = await Promise.all([
       db.from('profiles').select('id,name,role,initials,color,avatar_url').eq('status','ativo').order('name'),
       db.from('event_presencas').select('*').eq('event_id', eventId)
     ]);

     const membros  = memRes.data || [];
     const presMap  = {};
     (presRes.data||[]).forEach(p => { presMap[p.user_id || p.membro_id] = p; });

     const conf  = Object.values(presMap).filter(p => p.status === 'participar' || p.status === 'confirmado').length;
     const skip  = Object.values(presMap).filter(p => p.status === 'nao_participar' || p.status === 'ausente').length;
     const sem   = membros.length - Object.keys(presMap).length;

     const body = overlay.querySelector('#pmBody');

     function statusIcon(s) {
       if (s === 'participar' || s === 'confirmado') return '<i class="fa-solid fa-check" style="color:#10b981"></i>';
       if (s === 'nao_participar' || s === 'ausente') return '<i class="fa-solid fa-xmark" style="color:#ef4444"></i>';
       if (s === 'justificado') return '<i class="fa-solid fa-comment-dots" style="color:#f59e0b"></i>';
       return '<i class="fa-solid fa-minus" style="color:var(--text-3)"></i>';
     }

     body.innerHTML = `
       <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:18px">
         <div style="background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.2);border-radius:10px;padding:12px;text-align:center">
           <div style="font-size:1.4rem;font-weight:700;color:#10b981">${conf}</div>
           <div style="font-size:.65rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Presentes</div>
         </div>
         <div style="background:rgba(220,38,38,.07);border:1px solid rgba(220,38,38,.2);border-radius:10px;padding:12px;text-align:center">
           <div style="font-size:1.4rem;font-weight:700;color:#ef4444">${skip}</div>
           <div style="font-size:.65rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Ausentes</div>
         </div>
         <div style="background:rgba(255,255,255,.03);border:1px solid var(--border-faint);border-radius:10px;padding:12px;text-align:center">
           <div style="font-size:1.4rem;font-weight:700;color:var(--text-3)">${sem}</div>
           <div style="font-size:.65rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Sem registro</div>
         </div>
       </div>
       <div style="display:flex;flex-direction:column;gap:6px">
         ${membros.map(m => {
           const p = presMap[m.id];
           const status = p?.status || null;
           const av = m.avatar_url
             ? `<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
             : (m.initials || Utils.getInitials(m.name));
           return `
             <div class="pm-row" data-uid="${m.id}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,255,255,.02);border-radius:8px;border:1px solid var(--border-faint)">
               <div class="avatar" style="width:28px;height:28px;font-size:.5rem;flex-shrink:0;background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a)">${av}</div>
               <div style="flex:1;min-width:0">
                 <div style="font-size:.82rem;font-weight:600;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${Utils.escapeHtml(m.name)}</div>
                 ${m.role ? `<div style="font-size:.65rem;color:var(--text-3)">${Utils.escapeHtml(m.role)}</div>` : ''}
               </div>
               <div style="display:flex;gap:5px;flex-shrink:0;align-items:center">
                 ${p?.justificativa ? `<button class="pm-btn pm-justif" data-uid="${m.id}" data-justif="${Utils.escapeHtml(p.justificativa)}" title="Ver justificativa" style="width:30px;height:30px;border-radius:7px;border:1px solid rgba(245,158,11,.4);background:rgba(245,158,11,.1);cursor:pointer;color:#f59e0b;font-size:.75rem;display:inline-flex;align-items:center;justify-content:center;transition:all .15s"><i class="fa-solid fa-comment-dots"></i></button>` : ''}
                 <button class="pm-btn pm-present" data-uid="${m.id}" title="Presente" style="width:30px;height:30px;border-radius:7px;border:1px solid ${(status==='participar'||status==='confirmado')?'rgba(16,185,129,.5)':'var(--border-faint)'};background:${(status==='participar'||status==='confirmado')?'rgba(16,185,129,.15)':'rgba(255,255,255,.02)'};cursor:pointer;color:${(status==='participar'||status==='confirmado')?'#10b981':'var(--text-3)'};font-size:.75rem;display:inline-flex;align-items:center;justify-content:center;transition:all .15s">
                   <i class="fa-solid fa-check"></i>
                 </button>
                 <button class="pm-btn pm-absent" data-uid="${m.id}" title="Ausente" style="width:30px;height:30px;border-radius:7px;border:1px solid ${(status==='nao_participar'||status==='ausente')?'rgba(220,38,38,.5)':'var(--border-faint)'};background:${(status==='nao_participar'||status==='ausente')?'rgba(220,38,38,.1)':'rgba(255,255,255,.02)'};cursor:pointer;color:${(status==='nao_participar'||status==='ausente')?'#ef4444':'var(--text-3)'};font-size:.75rem;display:inline-flex;align-items:center;justify-content:center;transition:all .15s">
                   <i class="fa-solid fa-xmark"></i>
                 </button>
               </div>
             </div>`;
         }).join('')}
       </div>`;

     async function setStatus(uid, status) {
       const ex = presMap[uid];
       let error;
       if (ex) {
         ({ error } = await db.from('event_presencas').update({ status }).eq('id', ex.id));
         if (!error) presMap[uid].status = status;
       } else {
         const { data, error: e } = await db.from('event_presencas').insert({
           event_id: eventId, user_id: uid, status
         }).select().single();
         error = e;
         if (!error) presMap[uid] = data;
       }
       if (error) { Utils.showToast('Erro ao registrar.', 'error'); return; }

       // Update row visually
       const row = body.querySelector(`.pm-row[data-uid="${uid}"]`);
       if (row) {
         const pBtn = row.querySelector('.pm-present');
         const aBtn = row.querySelector('.pm-absent');
         const isP = status === 'participar' || status === 'confirmado';
         const isA = status === 'nao_participar' || status === 'ausente';
         pBtn.style.cssText = `width:30px;height:30px;border-radius:7px;border:1px solid ${isP?'rgba(16,185,129,.5)':'var(--border-faint)'};background:${isP?'rgba(16,185,129,.15)':'rgba(255,255,255,.02)'};cursor:pointer;color:${isP?'#10b981':'var(--text-3)'};font-size:.75rem;display:inline-flex;align-items:center;justify-content:center;transition:all .15s`;
         aBtn.style.cssText = `width:30px;height:30px;border-radius:7px;border:1px solid ${isA?'rgba(220,38,38,.5)':'var(--border-faint)'};background:${isA?'rgba(220,38,38,.1)':'rgba(255,255,255,.02)'};cursor:pointer;color:${isA?'#ef4444':'var(--text-3)'};font-size:.75rem;display:inline-flex;align-items:center;justify-content:center;transition:all .15s`;
       }
     }

     body.querySelectorAll('.pm-present').forEach(btn => {
       btn.addEventListener('click', () => setStatus(btn.dataset.uid, 'confirmado'));
     });
     body.querySelectorAll('.pm-absent').forEach(btn => {
       btn.addEventListener('click', () => setStatus(btn.dataset.uid, 'ausente'));
     });
     body.querySelectorAll('.pm-justif').forEach(btn => {
       btn.addEventListener('click', e => {
         e.stopPropagation();
         const tip = document.createElement('div');
         tip.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)';
         tip.innerHTML = `<div style="max-width:360px;width:90%;background:#0e0e13;border:1px solid rgba(245,158,11,.3);border-radius:12px;padding:20px 22px;box-shadow:0 12px 40px rgba(0,0,0,.7)">
           <div style="font-size:.62rem;color:#f59e0b;text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin-bottom:10px"><i class="fa-solid fa-comment-dots"></i> Justificativa</div>
           <div style="font-size:.88rem;color:var(--text-2);line-height:1.6">${Utils.escapeHtml(btn.dataset.justif)}</div>
           <button style="margin-top:16px;width:100%;padding:8px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:8px;color:#f59e0b;cursor:pointer;font-size:.82rem">Fechar</button>
         </div>`;
         document.body.appendChild(tip);
         const closeTip = () => tip.remove();
         tip.querySelector('button').addEventListener('click', closeTip);
         tip.addEventListener('click', e => { if (e.target === tip) closeTip(); });
       });
     });
   }

   /* ── Presença: modal Não Participar ── */
   function openSkipModal(eventId, profile, onSuccess) {
     const overlay = document.createElement('div');
     overlay.className = 'modal-overlay open';
     overlay.innerHTML = `
       <div class="modal" style="max-width:440px;background:#0e0e13;border:1px solid rgba(220,38,38,.25)">
         <div class="modal-header" style="border-bottom:1px solid rgba(220,38,38,.15)">
           <div class="modal-title" style="color:#ef4444"><i class="fa-solid fa-xmark-circle"></i> Justificar Ausência</div>
           <button class="modal-close" id="skipClose"><i class="fa-solid fa-xmark"></i></button>
         </div>
         <div class="modal-body">
           <div class="form-group">
             <label class="form-label">Motivo da ausência <span style="color:var(--red-bright)">*</span></label>
             <textarea class="form-input form-textarea" id="skipReason" style="min-height:90px" placeholder="Explique o motivo..."></textarea>
           </div>
         </div>
         <div class="modal-footer">
           <button class="btn btn-ghost" id="skipCancel">Cancelar</button>
           <button class="btn" id="skipSave" style="background:rgba(220,38,38,.15);border:1px solid rgba(220,38,38,.35);color:#ef4444"><i class="fa-solid fa-floppy-disk"></i> Confirmar</button>
         </div>
       </div>`;
     document.body.appendChild(overlay);
     const close = () => overlay.remove();
     overlay.querySelector('#skipClose').addEventListener('click', close);
     overlay.querySelector('#skipCancel').addEventListener('click', close);
     overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
     overlay.querySelector('#skipSave').addEventListener('click', async () => {
       const reason = overlay.querySelector('#skipReason').value.trim();
       if (!reason) { Utils.showToast('Informe o motivo.', 'error'); return; }
       const btn = overlay.querySelector('#skipSave');
       btn.disabled = true;
       const { error } = await db.from('event_presencas').upsert(
         { event_id: eventId, user_id: profile.id, membro_id: profile.id, status: 'nao_participar', justificativa: reason },
         { onConflict: 'event_id,user_id', ignoreDuplicates: false }
       );
       if (!error) { Utils.showToast('Ausência registrada.'); close(); onSuccess(); }
       else { Utils.showToast('Erro ao registrar.', 'error'); btn.disabled = false; }
     });
   }

   /* ── Presença: modal Solicitar Cancelamento ── */
   function openPresenceCancelModal(eventId, profile, onSuccess) {
     const overlay = document.createElement('div');
     overlay.className = 'modal-overlay open';
     overlay.innerHTML = `
       <div class="modal" style="max-width:440px;background:#0e0e13;border:1px solid rgba(245,158,11,.2)">
         <div class="modal-header" style="border-bottom:1px solid rgba(245,158,11,.12)">
           <div class="modal-title" style="color:#f59e0b"><i class="fa-solid fa-rotate-left"></i> Solicitar Cancelamento</div>
           <button class="modal-close" id="pcClose"><i class="fa-solid fa-xmark"></i></button>
         </div>
         <div class="modal-body">
           <div style="font-size:.81rem;color:var(--text-2);margin-bottom:14px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.15);border-radius:8px;padding:10px 14px">
             <i class="fa-solid fa-circle-info" style="color:#f59e0b;margin-right:6px"></i>
             Sua solicitação será analisada pela Diretoria. O cancelamento só será efetivado após aprovação.
           </div>
           <div class="form-group">
             <label class="form-label">Motivo <span style="color:var(--red-bright)">*</span></label>
             <textarea class="form-input form-textarea" id="pcReason" style="min-height:90px" placeholder="Por que deseja cancelar sua participação?"></textarea>
           </div>
         </div>
         <div class="modal-footer">
           <button class="btn btn-ghost" id="pcCancel">Cancelar</button>
           <button class="btn btn-gold" id="pcSave"><i class="fa-solid fa-paper-plane"></i> Enviar Solicitação</button>
         </div>
       </div>`;
     document.body.appendChild(overlay);
     const close = () => overlay.remove();
     overlay.querySelector('#pcClose').addEventListener('click', close);
     overlay.querySelector('#pcCancel').addEventListener('click', close);
     overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
     overlay.querySelector('#pcSave').addEventListener('click', async () => {
       const reason = overlay.querySelector('#pcReason').value.trim();
       if (!reason) { Utils.showToast('Informe o motivo.', 'error'); return; }
       const btn = overlay.querySelector('#pcSave');
       btn.disabled = true;
       const { error } = await db.from('event_cancel_requests').insert({
         user_id: profile.id, event_id: eventId, justificativa: reason, status: 'pendente'
       });
       if (!error) { Utils.showToast('Solicitação enviada à Diretoria!'); close(); onSuccess(); }
       else { Utils.showToast('Erro ao enviar.', 'error'); btn.disabled = false; }
     });
   }

   /* ── Diretoria: modal Pedidos de Cancelamento ── */
   async function openCancelRequestsModal(onSuccess) {
     const overlay = document.createElement('div');
     overlay.className = 'modal-overlay open';
     overlay.innerHTML = `
       <div class="modal" style="max-width:560px;background:#0e0e13;border:1px solid rgba(201,168,76,.2)">
         <div class="modal-header" style="border-bottom:1px solid rgba(201,168,76,.15)">
           <div class="modal-title font-cinzel" style="color:var(--gold)"><i class="fa-solid fa-bell"></i> Pedidos de Cancelamento</div>
           <button class="modal-close" id="crClose"><i class="fa-solid fa-xmark"></i></button>
         </div>
         <div class="modal-body" id="crBody">
           <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i></div>
         </div>
         <div class="modal-footer"><button class="btn btn-outline" id="crDone">Fechar</button></div>
       </div>`;
     document.body.appendChild(overlay);
     const close = () => { overlay.remove(); onSuccess(); };
     overlay.querySelector('#crClose').addEventListener('click', close);
     overlay.querySelector('#crDone').addEventListener('click', close);
     overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

     const { data: reqs } = await db.from('event_cancel_requests')
       .select('*')
       .eq('status','pendente').order('created_at',{ascending:false});

     // Enriquecer com nome do solicitante e título do evento
     if (reqs && reqs.length) {
       const uids = [...new Set(reqs.map(r => r.user_id).filter(Boolean))];
       const eids = [...new Set(reqs.map(r => r.event_id).filter(Boolean))];
       const [{ data: profs }, { data: evs }] = await Promise.all([
         db.from('profiles').select('id,name,initials,color').in('id', uids),
         db.from('events').select('id,title,event_date').in('id', eids)
       ]);
       const pm = {}; (profs||[]).forEach(p => { pm[p.id] = p; });
       const em = {}; (evs||[]).forEach(e => { em[e.id] = e; });
       reqs.forEach(r => { r.requester = pm[r.user_id]||null; r.ev = em[r.event_id]||null; });
     }

     const body = overlay.querySelector('#crBody');
     if (!reqs?.length) {
       body.innerHTML = '<div class="empty-state" style="padding:30px"><div class="empty-state-text">Nenhuma solicitação pendente.</div></div>';
       return;
     }

     body.innerHTML = reqs.map(r => `
       <div class="card" style="margin-bottom:10px" data-rid="${r.id}" data-uid="${r.user_id}" data-eid="${r.event_id}">
         <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px">
           <div>
             <div style="font-weight:600;color:var(--text-1)">${Utils.escapeHtml(r.requester?.name||'—')}</div>
             <div style="font-size:.72rem;color:var(--text-3)"><i class="fa-regular fa-calendar"></i> ${Utils.escapeHtml(r.ev?.title||'—')} · ${Utils.formatDate(r.ev?.event_date)}</div>
           </div>
         </div>
         <div style="font-size:.8rem;color:var(--text-2);background:rgba(255,255,255,.03);border-radius:6px;padding:8px 12px;margin-bottom:10px;border:1px solid var(--border-faint)">
           <i class="fa-solid fa-comment-dots" style="color:var(--gold);margin-right:6px;font-size:.7rem"></i>${Utils.escapeHtml(r.justificativa)}
         </div>
         <div style="display:flex;gap:8px">
           <button class="btn btn-sm cr-approve" data-rid="${r.id}" data-uid="${r.user_id}" data-eid="${r.event_id}" style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);color:#10b981"><i class="fa-solid fa-check"></i> Aprovar</button>
           <button class="btn btn-sm cr-refuse" data-rid="${r.id}" style="background:rgba(220,38,38,.07);border:1px solid rgba(220,38,38,.25);color:#ef4444"><i class="fa-solid fa-xmark"></i> Recusar</button>
         </div>
       </div>`).join('');

     body.querySelectorAll('.cr-approve').forEach(btn => {
       btn.addEventListener('click', async () => {
         btn.disabled = true;
         const [{ error: e1 }, { error: e2 }] = await Promise.all([
           db.from('event_presencas').delete().eq('event_id', btn.dataset.eid).eq('user_id', btn.dataset.uid),
           db.from('event_cancel_requests').update({ status: 'aprovado' }).eq('id', btn.dataset.rid)
         ]);
         if (!e1 && !e2) { Utils.showToast('Cancelamento aprovado.'); btn.closest('[data-rid]').remove(); }
         else { Utils.showToast('Erro ao aprovar.', 'error'); btn.disabled = false; }
       });
     });
     body.querySelectorAll('.cr-refuse').forEach(btn => {
       btn.addEventListener('click', async () => {
         btn.disabled = true;
         const { error } = await db.from('event_cancel_requests').update({ status: 'recusado' }).eq('id', btn.dataset.rid);
         if (!error) { Utils.showToast('Solicitação recusada.'); btn.closest('[data-rid]').remove(); }
         else { Utils.showToast('Erro.', 'error'); btn.disabled = false; }
       });
     });
   }

   async function openNewEventModal(profile, onSuccess) {
     const modal = document.getElementById('newEventModal');
     modal.classList.add('open');
   
     // Popular selects de membros
     const { data: membros } = await db.from('profiles').select('id,name,role').eq('status','ativo').order('name');
     const memOpts = (membros||[]).map(m => `<option value="${m.id}">${Utils.escapeHtml(m.name)} — ${Utils.escapeHtml(m.role||'')}</option>`).join('');
   
     const creatorSel = document.getElementById('ev-creator');
     creatorSel.innerHTML = `<option value="">Selecione o criador...</option>${memOpts}`;
   
     const helpersWrap = document.getElementById('ev-helpers-wrap');
     helpersWrap.innerHTML = `<select class="form-input form-select ev-helper-sel" style="margin-bottom:6px"><option value="">Nenhum co-criador</option>${memOpts}</select>`;
   
     // Adicionar co-criador
     let helperCount = 0;
     const addHelperBtn = document.getElementById('ev-add-helper');
     addHelperBtn.onclick = () => {
       if (helperCount >= 4) { Utils.showToast('Máximo de 5 co-criadores.', 'error'); return; }
       helperCount++;
       const row = document.createElement('div');
       row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px';
       row.innerHTML = `<select class="form-input form-select ev-helper-sel" style="flex:1"><option value="">Co-criador ${helperCount+1}</option>${memOpts}</select><button type="button" class="btn btn-ghost btn-sm" style="color:var(--red-bright);padding:6px 10px;flex-shrink:0"><i class="fa-solid fa-xmark"></i></button>`;
       row.querySelector('button').addEventListener('click', () => { row.remove(); helperCount--; });
       helpersWrap.appendChild(row);
     };
   
     document.getElementById('newEventSave').onclick = async () => {
       const title       = document.getElementById('ev-title').value.trim();
       const event_date  = document.getElementById('ev-date').value;
       const event_time  = document.getElementById('ev-time').value || '19:00';
       const type        = document.getElementById('ev-type').value;
       const description = document.getElementById('ev-desc').value.trim();
       const mandatory   = document.getElementById('ev-mandatory').checked;
       const is_private  = document.getElementById('ev-private')?.checked || false;
       const creator_id  = document.getElementById('ev-creator').value;
       const helpers     = [...document.querySelectorAll('.ev-helper-sel')].map(s => s.value).filter(Boolean);
       const helper_id   = helpers[0] || null;
   
       if (!title || !event_date) { Utils.showToast('Preencha título e data.', 'error'); return; }
       if (!creator_id) { Utils.showToast('Selecione o criador do evento.', 'error'); return; }
   
       const btn = document.getElementById('newEventSave');
       btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Criando...';
   
       const { data: evData, error } = await db.from('events').insert({
         title, event_date, event_time, type,
         description: description || null,
         mandatory, is_private,
         created_by: creator_id,
         helper_id,
       }).select('id').single();
   
       if (!error) {
         // Registrar co-criadores adicionais se houver
         if (helpers.length > 1 && evData?.id) {
           const extraHelpers = helpers.slice(1).map(uid => ({ event_id: evData.id, helper_id: uid }));
           await db.from('event_co_creators').insert(extraHelpers).catch(() => {});
         }
         if (!is_private) {
           await db.rpc('notify_member', { p_user_id: null, p_message: `Novo evento: "${title}" em ${Utils.formatDate(event_date)}`, p_type: 'event', p_icon: '🗓️' });
         }
         modal.classList.remove('open');
         Utils.showToast('Evento criado!');
         onSuccess();
       } else {
         console.error('[MSY] Erro ao criar evento:', error);
         const msg = error?.message?.includes('row-level security') || error?.code === '42501'
           ? 'Sem permissão para criar eventos. Verifique as políticas RLS no Supabase.'
           : (error?.message || 'Erro ao criar evento.');
         Utils.showToast(msg, 'error');
         btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-calendar-plus"></i> Criar Evento';
       }
     };
   }
   
   function openNewAtaModal(profile, onSuccess) {
     const modal = document.getElementById('newAtaModal');
     modal.classList.add('open');
   
     document.getElementById('newAtaSave').onclick = async () => {
       const title        = document.getElementById('ata-title').value.trim();
       const meeting_date = document.getElementById('ata-date').value;
       const type         = document.getElementById('ata-type').value;
       const content      = document.getElementById('ata-content').value.trim();
   
       if (!title || !meeting_date) { Utils.showToast('Preencha título e data.', 'error'); return; }
   
       const btn = document.getElementById('newAtaSave');
       btn.disabled = true; btn.textContent = 'Salvando...';
   
       const { error } = await db.from('meeting_minutes').insert({
         title, meeting_date, type, content: content || null, created_by: profile.id
       });
   
       if (!error) {
         modal.classList.remove('open');
         Utils.showToast('Ata registrada!');
         onSuccess();
       } else {
         Utils.showToast('Erro ao salvar ata.', 'error');
         btn.disabled = false; btn.textContent = 'Salvar Ata';
       }
     };
   }
   
   function openNewRankingModal(profile, onSuccess) {
     const modal  = document.getElementById('newRankingModal');
     const body   = document.getElementById('newRankingBody');
     const footer = document.getElementById('newRankingFooter');
   
     const todayStr = new Date().toISOString().split('T')[0];
     let rowCount = 5;
   
     function buildRows() {
       return Array.from({ length: rowCount }, (_, i) => `
         <div style="display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;margin-bottom:8px">
           <span style="font-size:.8rem;color:var(--text-3);min-width:22px">${i+1}º</span>
           <input class="form-input rk-name" placeholder="Nome do membro" style="height:34px;font-size:.83rem">
           <input class="form-input rk-msgs" type="number" placeholder="Msgs" min="0" style="width:80px;height:34px;font-size:.83rem">
         </div>`).join('');
     }
   
     body.innerHTML = `
       <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
         <div class="form-group">
           <label class="form-label">Início da Semana *</label>
           <input class="form-input" type="date" id="rk-start" value="${todayStr}">
         </div>
         <div class="form-group">
           <label class="form-label">Fim da Semana *</label>
           <input class="form-input" type="date" id="rk-end" value="${todayStr}">
         </div>
       </div>
       <div style="font-size:.78rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Membros & Mensagens</div>
       <div id="rkRows">${buildRows()}</div>
       <button class="btn btn-ghost btn-sm" id="addRkRow" style="margin-top:8px"><i class="fa-solid fa-plus"></i> Adicionar linha</button>
     `;
   
     footer.innerHTML = `
       <button class="btn btn-ghost" id="newRankingCancel">Cancelar</button>
       <button class="btn btn-primary" id="newRankingSave"><i class="fa-solid fa-floppy-disk"></i> Salvar Ranking</button>
     `;
   
     modal.classList.add('open');
   
     document.getElementById('newRankingCancel').addEventListener('click', () => modal.classList.remove('open'));
   
     document.getElementById('addRkRow').addEventListener('click', () => {
       rowCount++;
       document.getElementById('rkRows').insertAdjacentHTML('beforeend', `
         <div style="display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;margin-bottom:8px">
           <span style="font-size:.8rem;color:var(--text-3);min-width:22px">${rowCount}º</span>
           <input class="form-input rk-name" placeholder="Nome do membro" style="height:34px;font-size:.83rem">
           <input class="form-input rk-msgs" type="number" placeholder="Msgs" min="0" style="width:80px;height:34px;font-size:.83rem">
         </div>`);
     });
   
     document.getElementById('newRankingSave').addEventListener('click', async () => {
       const week_start = document.getElementById('rk-start').value;
       const week_end   = document.getElementById('rk-end').value;
       if (!week_start || !week_end) { Utils.showToast('Preencha as datas.', 'error'); return; }
   
       const names = [...document.querySelectorAll('.rk-name')].map(el => el.value.trim());
       const msgs  = [...document.querySelectorAll('.rk-msgs')].map(el => parseInt(el.value) || 0);
   
       const entries = names
         .map((name, i) => ({ name, messages: msgs[i] }))
         .filter(e => e.name)
         .sort((a, b) => b.messages - a.messages);
   
       if (entries.length === 0) { Utils.showToast('Adicione ao menos um membro.', 'error'); return; }
   
       const btn = document.getElementById('newRankingSave');
       btn.disabled = true; btn.textContent = 'Salvando...';
   
       const { error } = await db.from('weekly_rankings').insert({
         week_start, week_end, entries, created_by: profile.id
       });
   
       if (!error) {
         modal.classList.remove('open');
         Utils.showToast('Ranking salvo!');
         onSuccess();
       } else {
         Utils.showToast('Erro ao salvar.', 'error');
         btn.disabled = false; btn.textContent = 'Salvar Ranking';
       }
     });
   }
   
   /* ============================================================
      PAGE: ADMIN
      ============================================================ */
   async function initAdmin() {
     const profileRaw = await Auth.requireAuth();
     if (!profileRaw) return;
     /* Se ViewMode ativo: admin nao deve acessar painel admin como membro */
     if (ViewMode.isActive() || profileRaw.tier !== 'diretoria') {
       window.location.href = 'dashboard.html'; return;
     }
     const profile = profileRaw;
   
     await renderSidebar('admin');
     await renderTopBar('Administração', profile);
   
     const content = document.getElementById('pageContent');
     Utils.showLoading(content);
   
     const [
       { count: totalMembers },
       { count: pendingMembers },
       { count: totalActs },
       { count: pendingActs },
       { count: totalComs },
       { data: recentMembers }
     ] = await Promise.all([
       db.from('profiles').select('id', { count: 'exact', head: true }),
       db.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
       db.from('activities').select('id', { count: 'exact', head: true }),
       db.from('activities').select('id', { count: 'exact', head: true }).eq('status', 'Pendente'),
       db.from('comunicados').select('id', { count: 'exact', head: true }),
       db.from('profiles').select('*').order('created_at', { ascending: false }).limit(5)
     ]);
   
     content.innerHTML = `
       <div class="page-header">
         <div>
           <div class="page-header-title">Painel Administrativo</div>
           <div class="page-header-sub">Visão geral e gestão da Ordem</div>
         </div>
       </div>
   
       <div class="stats-grid" style="margin-bottom:28px">
         <div class="stat-card gold-accent card-enter"><div class="stat-icon gold"><i class="fa-solid fa-users"></i></div><div class="stat-info"><div class="stat-value">${totalMembers||0}</div><div class="stat-label">Total Membros</div></div></div>
         <div class="stat-card red-accent card-enter"><div class="stat-icon red"><i class="fa-solid fa-user-clock"></i></div><div class="stat-info"><div class="stat-value">${pendingMembers||0}</div><div class="stat-label">Pendentes Aprovação</div></div></div>
         <div class="stat-card blue-accent card-enter"><div class="stat-icon blue"><i class="fa-solid fa-list-check"></i></div><div class="stat-info"><div class="stat-value">${totalActs||0}</div><div class="stat-label">Atividades Total</div></div></div>
         <div class="stat-card green-accent card-enter"><div class="stat-icon green"><i class="fa-solid fa-bullhorn"></i></div><div class="stat-info"><div class="stat-value">${totalComs||0}</div><div class="stat-label">Comunicados</div></div></div>
       </div>
   
       <div class="card card-enter" style="margin-bottom:20px">
         <div class="card-title"><i class="fa-solid fa-bolt"></i> Ações Rápidas</div>
         <div style="display:flex;flex-wrap:wrap;gap:10px">
           <a href="atividades.html" class="btn btn-primary"><i class="fa-solid fa-plus"></i> Nova Atividade</a>
           <a href="comunicados.html" class="btn btn-gold"><i class="fa-solid fa-bullhorn"></i> Novo Comunicado</a>
           <a href="membros.html" class="btn btn-outline"><i class="fa-solid fa-users"></i> Gerenciar Membros</a>
           <a href="eventos.html" class="btn btn-outline"><i class="fa-solid fa-calendar-days"></i> Eventos</a>
           <button class="btn btn-ghost" id="notifyAllBtn"><i class="fa-solid fa-bell"></i> Notificar Todos</button>
           <button class="btn btn-ghost" id="pagManualBtn" style="border-color:rgba(201,168,76,.3);color:var(--gold)"><i class="fa-solid fa-hand-holding-dollar"></i> Pagamento Manual</button>
           <button class="btn btn-ghost" id="viewAsMemberAdminBtn" style="border-color:rgba(96,165,250,.3);color:#60a5fa"><i class="fa-solid fa-eye"></i> Visualizar como Membro</button>
           <button class="btn btn-ghost" id="addMemberBtn" style="border-color:rgba(16,185,129,.3);color:#10b981"><i class="fa-solid fa-user-plus"></i> Adicionar Membro</button>
         </div>
       </div>
   
       ${pendingMembers > 0 ? `
         <div class="card card-enter" style="border-color:var(--border-red);margin-bottom:20px">
           <div class="card-title" style="color:var(--red-bright)"><i class="fa-solid fa-triangle-exclamation"></i> Membros Aguardando Aprovação (${pendingMembers})</div>
           <div class="small-list">
             ${(recentMembers||[]).filter(m=>m.status==='pendente').map(m => `
               <div class="small-list-item">
                 <div class="avatar" style="background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a)">${m.initials||'?'}</div>
                 <div class="small-list-info">
                   <div class="small-list-title">${Utils.escapeHtml(m.name)}</div>
                   <div class="small-list-sub">Cadastrado em ${Utils.formatDate(m.created_at)}</div>
                 </div>
                 <button class="btn btn-primary btn-sm quick-approve" data-id="${m.id}">Aprovar</button>
               </div>`).join('')}
           </div>
         </div>` : ''}
   
       <div class="modal-overlay" id="addMemberModal">
         <div class="modal" style="max-width:480px">
           <div class="modal-header">
             <div class="modal-title"><i class="fa-solid fa-user-plus" style="color:#10b981;margin-right:8px"></i>Adicionar Membro</div>
             <button class="modal-close" id="addMemberClose"><i class="fa-solid fa-xmark"></i></button>
           </div>
           <div class="modal-body" style="padding:24px;display:flex;flex-direction:column;gap:16px">
             <div class="form-group">
               <label class="form-label">Nome completo <span style="color:var(--red-bright)">*</span></label>
               <input type="text" class="form-input" id="addMemberName" placeholder="Ex: João Silva" maxlength="80">
             </div>
             <div class="form-group">
               <label class="form-label">E-mail <span style="color:var(--red-bright)">*</span></label>
               <input type="email" class="form-input" id="addMemberEmail" placeholder="email@exemplo.com">
             </div>
             <div class="form-group">
               <label class="form-label">Senha <span style="color:var(--red-bright)">*</span></label>
               <input type="password" class="form-input" id="addMemberPassword" placeholder="Mínimo 6 caracteres">
             </div>
             <div class="form-group">
               <label class="form-label">Cargo</label>
               <input type="text" class="form-input" id="addMemberRole" placeholder="Ex: Membro" value="Membro" maxlength="60">
             </div>
             <div class="form-group">
               <label class="form-label">Data de entrada</label>
               <input type="date" class="form-input" id="addMemberDate" value="${new Date().toISOString().split('T')[0]}">
             </div>
             <div id="addMemberError" style="display:none;color:var(--red-bright);font-size:.8rem;padding:10px 14px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:8px"></div>
           </div>
           <div class="modal-footer">
             <button class="btn btn-ghost" id="addMemberCancel">Cancelar</button>
             <button class="btn btn-primary" id="addMemberSave" style="background:linear-gradient(135deg,#059669,#10b981);border-color:#10b981">
               <i class="fa-solid fa-user-plus"></i> Criar Membro
             </button>
           </div>
         </div>
       </div>

       <div class="modal-overlay" id="notifyModal">
         <div class="modal">
           <div class="modal-header">
             <div class="modal-title">Notificar Todos os Membros</div>
             <button class="modal-close" id="notifyClose"><i class="fa-solid fa-xmark"></i></button>
           </div>
           <div class="modal-body">
             <div class="form-group" style="margin-bottom:12px">
               <label class="form-label">Tipo</label>
               <select class="form-input form-select" id="notif-type">
                 <option value="info">Informação 🔔</option>
                 <option value="activity">Atividade 📋</option>
                 <option value="event">Evento 🗓️</option>
                 <option value="comunicado">Comunicado 📢</option>
               </select>
             </div>
             <div class="form-group" style="margin-bottom:12px">
               <label class="form-label">Mensagem</label>
               <textarea class="form-input form-textarea" id="notif-msg" placeholder="Digite a mensagem para todos os membros..."></textarea>
             </div>
             <div class="form-group">
               <label class="form-label">Canais de envio</label>
               <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px">
                 <label style="display:flex;align-items:center;gap:10px;cursor:default;font-size:0.85rem;color:var(--text-2)">
                   <input type="checkbox" id="ch-portal" checked disabled style="accent-color:var(--gold);width:15px;height:15px">
                   <span><i class="fa-solid fa-bell" style="color:var(--gold);margin-right:6px"></i>Portal — sempre ativo</span>
                 </label>
                 <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.85rem;color:var(--text-2)">
                   <input type="checkbox" id="ch-push" style="accent-color:var(--red-bright);width:15px;height:15px">
                   <span><i class="fa-solid fa-mobile-screen" style="color:var(--red-bright);margin-right:6px"></i>Push — dispositivos com permissão ativa</span>
                 </label>
                 <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.85rem;color:var(--text-2)">
                   <input type="checkbox" id="ch-email" style="accent-color:#60a5fa;width:15px;height:15px">
                   <span><i class="fa-solid fa-envelope" style="color:#60a5fa;margin-right:6px"></i>Email — membros com email ativo nas preferências</span>
                 </label>
               </div>
             </div>
           </div>
           <div class="modal-footer">
             <button class="btn btn-ghost" id="notifyCancel">Cancelar</button>
             <button class="btn btn-primary" id="notifySend"><i class="fa-solid fa-paper-plane"></i> Enviar para Todos</button>
           </div>
         </div>
       </div>
     `;
   
     content.querySelectorAll('.quick-approve').forEach(btn => {
       btn.addEventListener('click', async () => {
         await db.from('profiles').update({ status: 'ativo' }).eq('id', btn.dataset.id);
         await db.rpc('notify_member', { p_user_id: btn.dataset.id, p_message: 'Bem-vindo à Ordem! Acesso aprovado.', p_type: 'member', p_icon: '✅' });
         Utils.showToast('Membro aprovado!');
         initAdmin();
       });
     });
   
     const notifyModal = document.getElementById('notifyModal');
     if (notifyModal && notifyModal.parentElement !== document.body) document.body.appendChild(notifyModal);
     document.getElementById('notifyAllBtn')?.addEventListener('click', () => notifyModal.classList.add('open'));
     document.getElementById('notifyClose').addEventListener('click', () => notifyModal.classList.remove('open'));
     document.getElementById('notifyCancel').addEventListener('click', () => notifyModal.classList.remove('open'));
     notifyModal.addEventListener('click', e => { if (e.target === notifyModal) notifyModal.classList.remove('open'); });

     // ── Modal Adicionar Membro ──
     const addMemberModal = document.getElementById('addMemberModal');
     if (addMemberModal && addMemberModal.parentElement !== document.body) document.body.appendChild(addMemberModal);

     const openAddMember = () => {
       document.getElementById('addMemberName').value = '';
       document.getElementById('addMemberEmail').value = '';
       document.getElementById('addMemberPassword').value = '';
       document.getElementById('addMemberRole').value = 'Membro';
       document.getElementById('addMemberDate').value = new Date().toISOString().split('T')[0];
       document.getElementById('addMemberError').style.display = 'none';
       addMemberModal.classList.add('open');
     };
     const closeAddMember = () => addMemberModal.classList.remove('open');

     document.getElementById('addMemberBtn')?.addEventListener('click', openAddMember);
     document.getElementById('addMemberClose').addEventListener('click', closeAddMember);
     document.getElementById('addMemberCancel').addEventListener('click', closeAddMember);
     addMemberModal.addEventListener('click', e => { if (e.target === addMemberModal) closeAddMember(); });

     document.getElementById('addMemberSave').addEventListener('click', async () => {
       const name     = document.getElementById('addMemberName').value.trim();
       const email    = document.getElementById('addMemberEmail').value.trim();
       const password = document.getElementById('addMemberPassword').value;
       const role     = document.getElementById('addMemberRole').value.trim() || 'Membro';
       const joinDate = document.getElementById('addMemberDate').value;
       const errEl    = document.getElementById('addMemberError');

       errEl.style.display = 'none';
       if (!name || !email || !password) {
         errEl.textContent = 'Nome, e-mail e senha são obrigatórios.';
         errEl.style.display = 'block'; return;
       }

       const saveBtn = document.getElementById('addMemberSave');
       saveBtn.disabled = true;
       saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Criando...';

       try {
         const { data: { session } } = await db.auth.getSession();
         const resp = await fetch(`${MSY_CONFIG.SUPABASE_URL}/functions/v1/create-member`, {
           method: 'POST',
           headers: {
             'Content-Type':  'application/json',
             'Authorization': `Bearer ${session.access_token}`,
           },
           body: JSON.stringify({ email, password, name, role, joinDate }),
         });

         const result = await resp.json();
         if (!resp.ok || result.error) throw new Error(result.error || 'Erro ao criar membro.');

         closeAddMember();
         Utils.showToast(`✅ ${name} adicionado com sucesso!`, 'success');
         await db.rpc('notify_member', {
           p_user_id: result.userId,
           p_message: 'Bem-vindo à Masayoshi Order! Seu acesso foi criado pela Diretoria.',
           p_type: 'member', p_icon: '✅',
         }).catch(() => {});
         initAdmin();
       } catch (err) {
         errEl.textContent = err.message || 'Erro ao criar membro.';
         errEl.style.display = 'block';
       } finally {
         saveBtn.disabled = false;
         saveBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Criar Membro';
       }
     });
   
     document.getElementById('notifySend').addEventListener('click', async () => {
       const msg    = document.getElementById('notif-msg').value.trim();
       const type   = document.getElementById('notif-type').value;
       const doPush = document.getElementById('ch-push')?.checked  || false;
       const doEmail= document.getElementById('ch-email')?.checked || false;
       if (!msg) { Utils.showToast('Digite uma mensagem.', 'error'); return; }
       const btn2 = document.getElementById('notifySend');
       btn2.disabled = true; btn2.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando...';
       const iconMap = { info:'🔔', activity:'📋', event:'🗓️', comunicado:'📢' };
       // 1. Grava no portal para todos
       await db.rpc('notify_member', { p_user_id: null, p_message: msg, p_type: type, p_icon: iconMap[type] });
       // 2. Push em massa (se selecionado e módulo disponível)
       if (doPush && typeof PushManager !== 'undefined') {
         await PushManager.sendToAll({ title: 'MSY Portal', body: msg, url: '/dashboard.html' });
       }
       // 3. Email em massa via Edge Function send-email
       if (doEmail && typeof EmailManager !== 'undefined') {
         await EmailManager.sendToAll({ subject: 'Notificação — MSY Portal', message: msg });
       }
       notifyModal.classList.remove('open');
       Utils.showToast('Notificação enviada' + (doPush ? ' + push' : '') + (doEmail ? ' + email' : '') + '!');
       btn2.disabled = false; btn2.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar para Todos';
     });

     /* ── Botão: Visualizar como Membro ── */
     document.getElementById('viewAsMemberAdminBtn')?.addEventListener('click', () => {
       if (confirm('Ativar modo de visualização como membro?\n\nVocê verá o portal como um membro comum.\nSuas permissões reais não serão alteradas.')) {
         ViewMode.activate();
         window.location.href = 'dashboard.html';
       }
     });

     /* ── Botão: Pagamento Manual ── */
     document.getElementById('pagManualBtn')?.addEventListener('click', async () => {
       await _abrirModalPagamentoManual(profile);
     });
   }

   /* ── Modal de Pagamento Manual (admin) ── */
   async function _abrirModalPagamentoManual(adminProfile) {
     let modal = document.getElementById('pagManualModal');
     if (!modal) {
       modal = document.createElement('div');
       modal.id = 'pagManualModal';
       modal.className = 'modal-overlay';
       document.body.appendChild(modal);
     }

     // Buscar membros ativos
     const { data: membros } = await db.from('profiles')
       .select('id, name, role')
       .eq('status', 'ativo')
       .order('name');

     const mesAtual = Payments.getMesAtual();

     modal.innerHTML = `
       <div class="modal" style="max-width:440px">
         <div class="modal-header">
           <div class="modal-title" style="color:var(--gold)">
             <i class="fa-solid fa-hand-holding-dollar"></i> Registrar Pagamento Manual
           </div>
           <button class="modal-close" id="pagManualClose"><i class="fa-solid fa-xmark"></i></button>
         </div>
         <div class="modal-body" style="padding:24px;display:flex;flex-direction:column;gap:16px">
           <div style="background:rgba(201,168,76,.07);border:1px solid rgba(201,168,76,.2);border-radius:8px;padding:12px;font-size:.82rem;color:var(--text-2)">
             <i class="fa-solid fa-circle-info" style="color:var(--gold);margin-right:6px"></i>
             Registra o pagamento de <strong style="color:var(--text-1)">${Payments.formatMes(mesAtual)}</strong> para um membro. Use quando o pagamento foi feito fora do portal.
           </div>
           <div class="form-group" style="margin:0">
             <label class="form-label">Membro</label>
             <select class="form-input form-select" id="pagManualMembro">
               <option value="">— Selecione o membro —</option>
               ${(membros||[]).map(m => `<option value="${m.id}">${Utils.escapeHtml(m.name)} · ${Utils.escapeHtml(m.role||'')}</option>`).join('')}
             </select>
           </div>
           <div class="form-group" style="margin:0">
             <label class="form-label">Valor confirmado</label>
             <input type="text" class="form-input" value="R$ 10,00" disabled style="opacity:.6">
           </div>
         </div>
         <div class="modal-footer">
           <button class="btn btn-ghost" id="pagManualCancel">Cancelar</button>
           <button class="btn btn-gold" id="pagManualSave">
             <i class="fa-solid fa-circle-check"></i> Confirmar Pagamento
           </button>
         </div>
       </div>`;

     requestAnimationFrame(() => modal.classList.add('open'));
     const close = () => modal.classList.remove('open');
     document.getElementById('pagManualClose').addEventListener('click', close);
     document.getElementById('pagManualCancel').addEventListener('click', close);
     modal.addEventListener('click', e => { if (e.target === modal) close(); });

     document.getElementById('pagManualSave').addEventListener('click', async () => {
       const userId = document.getElementById('pagManualMembro').value;
       if (!userId) { Utils.showToast('Selecione um membro.', 'error'); return; }

       const btn = document.getElementById('pagManualSave');
       btn.disabled = true;
       btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Registrando...';

       try {
         await Payments.registrarPagamentoManual(userId, adminProfile.id);
         Utils.showToast('Pagamento registrado com sucesso!', 'success');
         close();
       } catch (err) {
         Utils.showToast(err.message || 'Erro ao registrar pagamento.', 'error');
         btn.disabled = false;
         btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Confirmar Pagamento';
       }
     });
   }
   
   /* ============================================================
      PAGE: PERFIL
      ============================================================ */
   async function initPerfil() {
     const profile = await renderSidebar('perfil');
     if (!profile) return;
     await renderTopBar('Meu Perfil', profile);
   
     const content = document.getElementById('pageContent');
     Utils.showLoading(content);
   
     const isDiretoria = profile.tier === 'diretoria';
   
     // Fetch stats + dados ICM em paralelo
     const [statsRes, icmRes] = await Promise.all([
       db.rpc('get_member_stats', { p_user_id: profile.id }),
       db.from('profiles').select('icm, selected_badges').eq('id', profile.id).single()
     ]);
     const stats          = statsRes.data || { total: 0, concluidas: 0, andamento: 0, pendentes: 0 };
     const icmData        = icmRes.data?.icm            || null;
     const selectedBadges = icmRes.data?.selected_badges || [];
   
     const joinDate = new Date(profile.join_date + 'T00:00:00');
     const diffDays = Math.floor((new Date() - joinDate) / (1000 * 60 * 60 * 24));
     const months   = Math.floor(diffDays / 30);
     const timeLabel = months >= 1 ? `${months} ${months === 1 ? 'mês' : 'meses'}` : `${diffDays} dias`;
   
     const COLORS = ['#7f1d1d','#991b1b','#1e3a5f','#14532d','#3b0764','#78350f','#1e40af','#065f46','#6b21a8','#c9a84c'];
   
     const avatarHTML = profile.avatar_url
       ? `<img src="${profile.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
       : `<span style="font-family:'Cinzel',serif;font-size:2rem;font-weight:700;color:var(--gold)">${profile.initials||Utils.getInitials(profile.name)}</span>`;
   
     content.innerHTML = `
       <div class="page-header">
         <div>
           <div class="page-header-title">Meu Perfil</div>
           <div class="page-header-sub">Gerencie suas informações e preferências</div>
         </div>
       </div>
   
       <div class="profile-page-grid">
         <!-- LEFT: Avatar Card -->
         <div class="profile-avatar-card">
           <div class="profile-avatar-wrap" style="display:inline-block;position:relative;margin-bottom:18px">
             <div class="profile-avatar-img" id="avatarDisplay"
                  style="width:120px;height:120px;border-radius:50%;border:3px solid var(--border-gold);background:linear-gradient(135deg,${profile.color||'#7f1d1d'},#1a1a1a);display:flex;align-items:center;justify-content:center;overflow:hidden;margin:0 auto">
               ${avatarHTML}
             </div>
             <button class="profile-avatar-upload-btn" id="uploadAvatarBtn" title="Trocar foto">
               <i class="fa-solid fa-camera"></i>
             </button>
             <input type="file" id="avatarFileInput" accept="image/png,image/jpeg,image/webp" style="display:none">
             ${profile.avatar_url ? `<button class="profile-avatar-upload-btn" id="removeAvatarBtn" title="Remover foto" style="bottom:4px;left:4px;right:auto;background:var(--red-subtle);border-color:var(--border-red);color:var(--red-bright)"><i class="fa-solid fa-trash" style="font-size:.6rem"></i></button>` : ''}
           </div>
           <div id="avatarUploadProgress" style="display:none;font-size:.72rem;color:var(--gold);margin-bottom:10px">
             <i class="fa-solid fa-circle-notch fa-spin"></i> Enviando foto...
           </div>
   
           <div class="profile-name-display" id="profileNameDisplay">${Utils.escapeHtml(profile.name)}</div>
           <div class="profile-role-display">${Utils.escapeHtml(profile.role)}</div>
           <div style="margin-top:6px">${Utils.tierBadge(profile.tier)}</div>
   
           ${profile.bio ? `<div class="profile-bio-display">${Utils.escapeHtml(profile.bio)}</div>` : ''}
   
           <div class="profile-stats-row">
             <div class="profile-stat-box">
               <div class="profile-stat-box-num">${stats.total||0}</div>
               <div class="profile-stat-box-lbl">Total</div>
             </div>
             <div class="profile-stat-box">
               <div class="profile-stat-box-num">${stats.concluidas||0}</div>
               <div class="profile-stat-box-lbl">Concluídas</div>
             </div>
             <div class="profile-stat-box">
               <div class="profile-stat-box-num">${stats.andamento||0}</div>
               <div class="profile-stat-box-lbl">Andamento</div>
             </div>
           </div>
   
           <div class="profile-join-info">
             <i class="fa-regular fa-calendar"></i> Membro desde ${Utils.formatDate(profile.join_date)}<br>
             <i class="fa-solid fa-hourglass-half" style="margin-top:4px"></i> ${timeLabel} na Ordem
           </div>
   
           <!-- INSÍGNIAS -->
           <div style="margin-top:16px;border-top:1px solid var(--border-faint);padding-top:16px">
             <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
               <div style="font-family:'Cinzel',serif;font-size:.8rem;color:var(--gold);letter-spacing:.08em;text-transform:uppercase">
                 <i class="fa-solid fa-medal" style="margin-right:6px"></i>Insígnias
               </div>
               <a href="premiacoes.html" style="font-size:.72rem;color:var(--text-3);transition:color .2s" onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color='var(--text-3)'">
                 Ver premiações →
               </a>
             </div>
             <div id="profileBadgesContainer"></div>
           </div>
         </div>
   
         <!-- RIGHT: Edit Forms -->
         <div style="display:flex;flex-direction:column;gap:20px">
   
           <!-- Informações Pessoais -->
           <div class="card">
             <div class="card-title"><i class="fa-solid fa-user"></i> Informações Pessoais</div>
             <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
               <div class="form-group">
                 <label class="form-label">Nome completo *</label>
                 <input class="form-input" id="p-name" value="${Utils.escapeHtml(profile.name)}">
               </div>
               <div class="form-group">
                 <label class="form-label">Iniciais (2 letras)</label>
                 <input class="form-input" id="p-initials" maxlength="2" value="${Utils.escapeHtml(profile.initials||Utils.getInitials(profile.name))}" placeholder="TM" style="text-transform:uppercase">
               </div>
             </div>
             <div class="form-group" style="margin-bottom:14px">
               <label class="form-label">Bio / Descrição</label>
               <textarea class="form-input form-textarea" id="p-bio" style="min-height:90px" placeholder="Escreva algo sobre você, seus objetivos na Ordem...">${Utils.escapeHtml(profile.bio||'')}</textarea>
             </div>
             <div class="form-group" style="margin-bottom:14px">
               <label class="form-label"><i class="fa-solid fa-cake-candles" style="color:var(--gold)"></i> Data de Nascimento</label>
               <input class="form-input" type="date" id="p-birthdate" value="${profile.birth_date||''}" max="${new Date().toISOString().split('T')[0]}">
               <div style="font-size:.7rem;color:var(--text-3);margin-top:4px">Apenas você pode editar esta informação.</div>
             </div>
             <div class="form-group" style="margin-bottom:18px">
               <label class="form-label">Cor do Avatar</label>
               <div class="color-picker-row" id="colorPickerRow">
                 ${COLORS.map(c => `<div class="color-swatch ${(profile.color||'#7f1d1d')===c?'selected':''}" style="background:${c}" data-color="${c}" title="${c}"></div>`).join('')}
               </div>
               <input type="hidden" id="p-color" value="${profile.color||'#7f1d1d'}">
             </div>
             <div style="display:flex;justify-content:flex-end">
               <button class="btn btn-primary" id="saveProfileBtn"><i class="fa-solid fa-floppy-disk"></i> Salvar Alterações</button>
             </div>
           </div>
   
           <!-- Segurança -->
           <div class="card">
             <div class="card-title"><i class="fa-solid fa-lock"></i> Alterar Senha</div>
             <div style="display:flex;flex-direction:column;gap:14px">
               <div class="form-group">
                 <label class="form-label">Nova Senha</label>
                 <div style="position:relative">
                   <input class="form-input" type="password" id="p-newpass" placeholder="••••••••" style="padding-right:42px">
                   <button type="button" id="toggleNewPass" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-3);cursor:pointer;font-size:.9rem"><i class="fa-regular fa-eye" id="newPassIcon"></i></button>
                 </div>
               </div>
               <div class="form-group">
                 <label class="form-label">Confirmar Nova Senha</label>
                 <input class="form-input" type="password" id="p-confirmpass" placeholder="••••••••">
               </div>
               <div style="display:flex;justify-content:flex-end">
                 <button class="btn btn-outline" id="savePasswordBtn"><i class="fa-solid fa-key"></i> Atualizar Senha</button>
               </div>
             </div>
           </div>
   
           <!-- Preferências de Notificação -->
           <div class="card" id="notifPrefsCard">
             <div class="card-title"><i class="fa-solid fa-bell"></i> Notificações</div>
             <div style="display:flex;flex-direction:column;gap:16px">
   
               <!-- Push -->
               <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:14px;border-bottom:1px solid var(--border-faint)">
                 <div>
                   <div style="font-weight:600;font-size:0.88rem;color:var(--text-1);margin-bottom:3px">
                     <i class="fa-solid fa-mobile-screen" style="color:var(--red-bright);margin-right:6px"></i>Push no Dispositivo
                   </div>
                   <div style="font-size:0.77rem;color:var(--text-3);line-height:1.5">
                     Receba alertas em tempo real no celular, computador e tablet.<br>
                     Funciona em Windows, macOS, Linux, Android e iOS (via Safari).
                   </div>
                   <div id="pushStatusLabel" style="margin-top:6px;font-size:0.75rem;font-weight:600"></div>
                 </div>
                 <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
                   <label class="notif-toggle-wrap">
                     <input type="checkbox" id="toggle-push" class="notif-toggle-input">
                     <span class="notif-toggle-slider"></span>
                   </label>
                   <button class="btn btn-ghost btn-sm" id="btnTestPush" style="font-size:0.72rem;padding:4px 10px;display:none">
                     <i class="fa-solid fa-bell"></i> Testar
                   </button>
                 </div>
               </div>
   
               <!-- Email -->
               <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:14px;border-bottom:1px solid var(--border-faint)">
                 <div style="flex:1">
                   <div style="font-weight:600;font-size:0.88rem;color:var(--text-1);margin-bottom:3px">
                     <i class="fa-solid fa-envelope" style="color:#60a5fa;margin-right:6px"></i>Notificações por Email
                   </div>
                   <div style="font-size:0.77rem;color:var(--text-3);line-height:1.5;margin-bottom:10px">
                     Receba comunicados, atividades e eventos também no email.
                   </div>
                   <div id="emailFieldWrap" style="display:none">
                     <input type="email" class="form-input" id="notif-email-addr"
                       placeholder="email@exemplo.com (opcional, usa o da conta se vazio)"
                       style="font-size:0.82rem;padding:8px 12px">
                   </div>
                 </div>
                 <div style="flex-shrink:0">
                   <label class="notif-toggle-wrap">
                     <input type="checkbox" id="toggle-email" class="notif-toggle-input">
                     <span class="notif-toggle-slider"></span>
                   </label>
                 </div>
               </div>
   
               <div style="display:flex;justify-content:flex-end">
                 <button class="btn btn-outline" id="saveNotifPrefsBtn">
                   <i class="fa-solid fa-floppy-disk"></i> Salvar preferências
                 </button>
               </div>
             </div>
           </div>
   
           <!-- Info somente leitura (cargo, tier) -->
           <div class="card" style="border-color:var(--border-faint)">
             <div class="card-title"><i class="fa-solid fa-shield-halved"></i> Informações da Ordem</div>
             <div style="display:flex;flex-direction:column;gap:0">
               <div class="member-profile-detail-row">
                 <i class="fa-solid fa-id-badge"></i>
                 <span class="member-profile-detail-label">Cargo</span>
                 <span class="member-profile-detail-val">${Utils.escapeHtml(profile.role)}</span>
               </div>
               <div class="member-profile-detail-row">
                 <i class="fa-solid fa-shield-halved"></i>
                 <span class="member-profile-detail-label">Nível</span>
                 <span class="member-profile-detail-val">${Utils.tierBadge(profile.tier)}</span>
               </div>
               <div class="member-profile-detail-row">
                 <i class="fa-regular fa-calendar"></i>
                 <span class="member-profile-detail-label">Entrada</span>
                 <span class="member-profile-detail-val">${Utils.formatDate(profile.join_date)}</span>
               </div>
               <div class="member-profile-detail-row" style="border-bottom:none">
                 <i class="fa-solid fa-circle-dot"></i>
                 <span class="member-profile-detail-label">Status</span>
                 <span class="member-profile-detail-val">
                   <span class="badge badge-done">Ativo</span>
                 </span>
               </div>
             </div>
             <div style="font-size:.72rem;color:var(--text-3);margin-top:10px">
               Cargo e nível são gerenciados pela Diretoria.
             </div>
           </div>

           <!-- ICM — Insígnias -->
           <div class="card" id="icm-badges-card">
             <div class="card-title"><i class="fa-solid fa-brain"></i> Insígnias ICM — Selecione as que deseja exibir</div>
             <div id="icm-badges-section">
               <div style="padding:12px 0;color:var(--text-3);font-size:.82rem;font-style:italic">Carregando...</div>
             </div>
           </div>

         </div>
       </div>
     `;
   
     // Carregar insígnias do perfil — sistema unificado MSYBadges
     if (typeof MSYBadges !== 'undefined') {
       MSYBadges.render(profile.id, 'profileBadgesContainer', { compact: false });
     } else if (typeof renderBadgesNoPerfil === 'function') {
       renderBadgesNoPerfil(profile.id, 'profileBadgesContainer');
     }

     // ── ICM BADGES ──────────────────────────────────────────────
     renderICMBadgesSection(icmData, selectedBadges, profile.id);
   
     /* ── Preferências de Notificação ────────────────────────── */
     (async () => {
       const pushToggle  = document.getElementById('toggle-push');
       const emailToggle = document.getElementById('toggle-email');
       const emailField  = document.getElementById('notif-email-addr');
       const emailWrap   = document.getElementById('emailFieldWrap');
       const pushLabel   = document.getElementById('pushStatusLabel');
       const testBtn     = document.getElementById('btnTestPush');
   
       // Preenche toggles com prefs salvas
       pushToggle.checked  = profile.notif_push  ?? true;
       emailToggle.checked = profile.notif_email ?? false;
       emailField.value    = profile.notif_email_address || '';
       if (emailToggle.checked) emailWrap.style.display = 'block';
   
       // Estado atual do push neste browser
       async function updatePushLabel() {
         if (!PushManager.isSupported()) {
           pushLabel.innerHTML = '<span style="color:var(--text-3)"><i class="fa-solid fa-ban"></i> Push não suportado neste browser</span>';
           pushToggle.disabled = true;
           return;
         }
         const perm       = PushManager.getPermissionStatus();
         const subscribed = await PushManager.isSubscribed();
         if (perm === 'denied') {
           pushLabel.innerHTML = '<span style="color:var(--red-bright)"><i class="fa-solid fa-triangle-exclamation"></i> Bloqueado no browser — libere nas configurações do site</span>';
           pushToggle.checked  = false;
         } else if (subscribed) {
           pushLabel.innerHTML = '<span style="color:#4ade80"><i class="fa-solid fa-circle-check"></i> Ativo neste dispositivo (' + PushManager._getDeviceLabel() + ')</span>';
           if (testBtn) testBtn.style.display = 'inline-flex';
         } else {
           pushLabel.innerHTML = '<span style="color:var(--text-3)"><i class="fa-regular fa-circle"></i> Inativo neste dispositivo</span>';
           if (testBtn) testBtn.style.display = 'none';
         }
       }
       await updatePushLabel();
   
       // Toggle push: ativa ou desativa subscription neste browser
       pushToggle.addEventListener('change', async () => {
         if (pushToggle.checked) {
           try {
             const { deviceLabel } = await PushManager.subscribe(profile.id);
             pushLabel.innerHTML = '<span style="color:#4ade80"><i class="fa-solid fa-circle-check"></i> Ativo: ' + deviceLabel + '</span>';
             if (testBtn) testBtn.style.display = 'inline-flex';
             Utils.showToast('Push ativado neste dispositivo!');
           } catch (err) {
             pushToggle.checked = false;
             Utils.showToast(err.message || 'Erro ao ativar push.', 'error');
             await updatePushLabel();
           }
         } else {
           await PushManager.unsubscribe(profile.id);
           if (testBtn) testBtn.style.display = 'none';
           await updatePushLabel();
           Utils.showToast('Push desativado neste dispositivo.');
         }
       });
   
       // Botão de teste
       testBtn?.addEventListener('click', () => {
         if ('serviceWorker' in navigator) {
           navigator.serviceWorker.ready.then(reg => {
             reg.showNotification('MSY Portal — Teste', {
               body:  'Push funcionando neste dispositivo!',
               icon:  '/favicon.ico',
               badge: '/favicon.ico',
               vibrate: [150, 50, 150],
             });
           });
         }
       });
   
       // Toggle email: exibe/esconde campo de email
       emailToggle.addEventListener('change', () => {
         emailWrap.style.display = emailToggle.checked ? 'block' : 'none';
       });
   
       // Salvar preferências de notificação
       document.getElementById('saveNotifPrefsBtn').addEventListener('click', async () => {
         const btn = document.getElementById('saveNotifPrefsBtn');
         btn.disabled = true;
         btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...';
         try {
           const emailAddr = emailField.value.trim() || null;
   
           // UPDATE (não upsert): upsert parcial dispara INSERT sem colunas obrigatórias (ex.: name).
           const { error: saveErr } = await db.from('profiles').update({
             notif_push:          pushToggle.checked,
             notif_email:         emailToggle.checked,
             notif_email_address: emailAddr,
           }).eq('id', profile.id);
   
           if (saveErr) throw saveErr;
   
           // Confirma lendo o dado de volta do banco
           const { data: updated } = await db.from('profiles')
             .select('notif_push, notif_email, notif_email_address')
             .eq('id', profile.id)
             .single();
   
           if (updated) {
             // Atualiza objeto local com o que realmente foi gravado
             profile.notif_push          = updated.notif_push;
             profile.notif_email         = updated.notif_email;
             profile.notif_email_address = updated.notif_email_address;
             // Sincroniza toggles com o valor confirmado
             pushToggle.checked  = updated.notif_push  ?? true;
             emailToggle.checked = updated.notif_email ?? false;
             emailField.value    = updated.notif_email_address || '';
             emailWrap.style.display = emailToggle.checked ? 'block' : 'none';
           }
   
           Utils.showToast('Preferências de notificação salvas!');
         } catch (err) {
           console.error('[MSY] Erro ao salvar prefs de notificação:', err);
           Utils.showToast('Erro ao salvar preferências.', 'error');
         }
         btn.disabled = false;
         btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar preferências';
       });
     })();
   
     // Color swatches
     document.querySelectorAll('#colorPickerRow .color-swatch').forEach(sw => {
       sw.addEventListener('click', () => {
         document.querySelectorAll('#colorPickerRow .color-swatch').forEach(s => s.classList.remove('selected'));
         sw.classList.add('selected');
         document.getElementById('p-color').value = sw.dataset.color;
         // Live preview on avatar
         const av = document.getElementById('avatarDisplay');
         if (!profile.avatar_url) av.style.background = `linear-gradient(135deg,${sw.dataset.color},#1a1a1a)`;
       });
     });
   
     // Avatar upload
     document.getElementById('uploadAvatarBtn').addEventListener('click', () => {
       document.getElementById('avatarFileInput').click();
     });
   
     document.getElementById('avatarFileInput').addEventListener('change', async () => {
       const file = document.getElementById('avatarFileInput').files[0];
       if (!file) return;
       if (file.size > 5 * 1024 * 1024) { Utils.showToast('Imagem muito grande. Máx 5MB.', 'error'); return; }
   
       const progress = document.getElementById('avatarUploadProgress');
       progress.style.display = 'block';
   
       const ext  = file.name.split('.').pop();
       const path = `avatars/${profile.id}/avatar_${Date.now()}.${ext}`;
   
       const { data: upData, error: upErr } = await db.storage.from('activity-files').upload(path, file, { upsert: true });
       if (upErr) {
         progress.style.display = 'none';
         Utils.showToast('Erro ao enviar imagem.', 'error');
         return;
       }
   
       const { data: urlData } = db.storage.from('activity-files').getPublicUrl(path);
       const avatar_url = urlData.publicUrl;
   
       const { error } = await db.from('profiles').update({ avatar_url }).eq('id', profile.id);
       progress.style.display = 'none';
       if (!error) {
         Utils.showToast('Foto de perfil atualizada!');
         setTimeout(() => initPerfil(), 300);
       } else {
         Utils.showToast('Erro ao salvar foto.', 'error');
       }
     });
   
     // Remove avatar
     document.getElementById('removeAvatarBtn')?.addEventListener('click', async () => {
       if (!confirm('Remover foto de perfil?')) return;
       const { error } = await db.from('profiles').update({ avatar_url: null }).eq('id', profile.id);
       if (!error) { Utils.showToast('Foto removida.'); setTimeout(() => initPerfil(), 300); }
       else Utils.showToast('Erro ao remover foto.', 'error');
     });
   
     // Save profile
     document.getElementById('saveProfileBtn').addEventListener('click', async () => {
       const name     = document.getElementById('p-name').value.trim();
       const initials = document.getElementById('p-initials').value.trim().toUpperCase().slice(0, 2);
       const bio      = document.getElementById('p-bio').value.trim();
       const color    = document.getElementById('p-color').value;
   
       if (!name) { Utils.showToast('Nome obrigatório.', 'error'); return; }
   
       const btn = document.getElementById('saveProfileBtn');
       btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...';
   
       const birth_date = document.getElementById('p-birthdate')?.value || null;
   
       const { error } = await db.from('profiles').update({
         name,
         initials: initials || Utils.getInitials(name),
         bio: bio || null,
         color,
         birth_date: birth_date || null,
       }).eq('id', profile.id);
   
       if (!error) {
         document.getElementById('profileNameDisplay').textContent = name;
         Utils.showToast('Perfil atualizado com sucesso!');
         btn.disabled = false;
         btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Alterações';
       } else {
         Utils.showToast('Erro ao salvar.', 'error');
         btn.disabled = false;
         btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Alterações';
       }
     });
   
     // Password toggle visibility
     document.getElementById('toggleNewPass').addEventListener('click', () => {
       const input = document.getElementById('p-newpass');
       const icon  = document.getElementById('newPassIcon');
       input.type = input.type === 'password' ? 'text' : 'password';
       icon.className = input.type === 'password' ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
     });
   
     // Save password
     document.getElementById('savePasswordBtn').addEventListener('click', async () => {
       const newPass  = document.getElementById('p-newpass').value;
       const confirm2 = document.getElementById('p-confirmpass').value;
   
       if (!newPass) { Utils.showToast('Digite a nova senha.', 'error'); return; }
       if (newPass.length < 6) { Utils.showToast('Senha deve ter ao menos 6 caracteres.', 'error'); return; }
       if (newPass !== confirm2) { Utils.showToast('As senhas não coincidem.', 'error'); return; }
   
       const btn = document.getElementById('savePasswordBtn');
       btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Atualizando...';
   
       const { error } = await db.auth.updateUser({ password: newPass });
       if (!error) {
         document.getElementById('p-newpass').value = '';
         document.getElementById('p-confirmpass').value = '';
         Utils.showToast('Senha atualizada com sucesso!');
       } else {
         Utils.showToast('Erro ao atualizar senha: ' + (error.message || 'tente novamente.'), 'error');
       }
       btn.disabled = false;
       btn.innerHTML = '<i class="fa-solid fa-key"></i> Atualizar Senha';
     });
   }
   
   /* ============================================================
      ROUTER
      ============================================================ */
   /* ============================================================
      JORNAL MSY — Sistema de Notícias da Dashboard
      ============================================================ */
   
   (function injectJornalCSS() {
     if (document.getElementById('msy-jornal-css')) return;
     const s = document.createElement('style');
     s.id = 'msy-jornal-css';
     s.textContent = `
       .jornal-wrap {
         position:relative; background:linear-gradient(135deg,#0d0d12,#0a0a0e);
         border:1px solid rgba(201,168,76,.22); border-radius:var(--radius); overflow:hidden;
       }
       .jornal-wrap::before {
         content:''; position:absolute; top:0; left:0; right:0; height:2px;
         background:linear-gradient(90deg,transparent,rgba(201,168,76,.7) 25%,#c9a84c 50%,rgba(201,168,76,.7) 75%,transparent);
       }
       .jornal-header {
         display:flex; align-items:center; justify-content:space-between;
         padding:13px 18px 11px; border-bottom:1px solid rgba(201,168,76,.1);
       }
       .jornal-header-left { display:flex; align-items:center; gap:10px; }
       .jornal-logo {
         width:28px; height:28px; border-radius:7px;
         background:linear-gradient(135deg,rgba(201,168,76,.25),rgba(120,40,30,.2));
         border:1px solid rgba(201,168,76,.35);
         display:flex; align-items:center; justify-content:center; font-size:.85rem;
       }
       .jornal-title {
         font-family:'Cinzel',serif; font-size:.75rem; font-weight:700;
         color:var(--gold); letter-spacing:.14em; text-transform:uppercase;
       }
       .jornal-subtitle { font-size:.58rem; color:var(--text-3); letter-spacing:.06em; margin-top:1px; }
       .jornal-live-dot {
         width:6px; height:6px; border-radius:50%; background:#10b981;
         box-shadow:0 0 6px rgba(16,185,129,.6); animation:jpulse 2s infinite;
       }
       @keyframes jpulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.7)} }
       .jornal-add-btn {
         display:inline-flex; align-items:center; gap:5px; padding:4px 10px;
         border-radius:6px; cursor:pointer; background:rgba(201,168,76,.1);
         border:1px solid rgba(201,168,76,.2); color:var(--gold);
         font-size:.65rem; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
         transition:all .2s;
       }
       .jornal-add-btn:hover { background:rgba(201,168,76,.18); }
       .jornal-carousel { position:relative; min-height:72px; overflow:hidden; }
       .jornal-slide {
         display:flex; align-items:center; gap:14px; padding:14px 18px;
         position:absolute; top:0; left:0; width:100%; box-sizing:border-box;
         opacity:0; transform:translateX(30px);
         transition:opacity .45s ease, transform .45s ease; pointer-events:none;
       }
       .jornal-slide.active { opacity:1; transform:translateX(0); pointer-events:auto; position:relative; }
       .jornal-slide-icon {
         width:40px; height:40px; border-radius:10px; flex-shrink:0;
         display:flex; align-items:center; justify-content:center; font-size:1.1rem;
       }
       .jornal-slide-icon.aniversario { background:rgba(236,72,153,.12); border:1px solid rgba(236,72,153,.25); }
       .jornal-slide-icon.recorde     { background:rgba(245,158,11,.12); border:1px solid rgba(245,158,11,.3); }
       .jornal-slide-icon.evento      { background:rgba(96,165,250,.12); border:1px solid rgba(96,165,250,.25); }
       .jornal-slide-icon.ranking     { background:rgba(201,168,76,.12); border:1px solid rgba(201,168,76,.25); }
       .jornal-slide-icon.aviso       { background:rgba(168,85,247,.12); border:1px solid rgba(168,85,247,.25); }
       .jornal-slide-icon.priority    { background:rgba(239,68,68,.12);  border:1px solid rgba(239,68,68,.3); }
       .jornal-slide-icon.desempenho  { background:rgba(22,163,74,.15); border:1px solid rgba(34,197,94,.3); }
       .jornal-slide-body { flex:1; min-width:0; }
       .jornal-slide-tag {
         display:inline-block; padding:1px 7px; border-radius:20px; margin-bottom:4px;
         font-size:.55rem; font-weight:700; letter-spacing:.09em; text-transform:uppercase;
       }
       .jornal-slide-tag.aniversario { background:rgba(236,72,153,.15); color:#f472b6; }
       .jornal-slide-tag.recorde     { background:rgba(245,158,11,.15); color:#f59e0b; }
       .jornal-slide-tag.evento      { background:rgba(96,165,250,.15); color:#60a5fa; }
       .jornal-slide-tag.ranking     { background:rgba(201,168,76,.15); color:var(--gold); }
       .jornal-slide-tag.aviso       { background:rgba(168,85,247,.15); color:#c084fc; }
       .jornal-slide-tag.priority    { background:rgba(239,68,68,.15);  color:#ef4444; }
       .jornal-slide-tag.desempenho  { background:rgba(22,163,74,.15); color:#4ade80; }
       .jornal-slide-text { font-size:.84rem; font-weight:600; color:var(--text-1); line-height:1.35; }
       .jornal-slide-meta { font-size:.65rem; color:var(--text-3); margin-top:2px; }
       .jornal-footer {
         display:flex; align-items:center; justify-content:space-between;
         padding:8px 18px 10px; border-top:1px solid rgba(255,255,255,.04);
       }
       .jornal-dots { display:flex; gap:5px; align-items:center; }
       .jornal-dot {
         width:5px; height:5px; border-radius:50%;
         background:rgba(255,255,255,.15); transition:all .3s; cursor:pointer;
       }
       .jornal-dot.active { background:var(--gold); width:16px; border-radius:3px; }
       .jornal-nav { display:flex; gap:4px; }
       .jornal-nav-btn {
         width:24px; height:24px; border-radius:6px; border:1px solid rgba(255,255,255,.08);
         background:rgba(255,255,255,.03); color:var(--text-3);
         display:flex; align-items:center; justify-content:center;
         cursor:pointer; font-size:.65rem; transition:all .15s;
       }
       .jornal-nav-btn:hover { background:rgba(201,168,76,.12); color:var(--gold); border-color:rgba(201,168,76,.2); }
       .jornal-count { font-size:.62rem; color:var(--text-3); }
       .jornal-slide-del {
         flex-shrink:0; background:none; border:1px solid rgba(239,68,68,.25);
         border-radius:6px; color:rgba(239,68,68,.6); cursor:pointer;
         font-size:.65rem; padding:3px 7px; transition:all .2s;
         align-self:flex-start; margin-left:6px;
       }
       .jornal-slide-del:hover { background:rgba(239,68,68,.12); color:#ef4444; border-color:rgba(239,68,68,.5); }
       .jornal-empty {
         display:flex; align-items:center; justify-content:center;
         gap:10px; padding:20px; color:var(--text-3); font-size:.78rem;
       }
     `;
     document.head.appendChild(s);
   })();
   
   /* ── CSS: Notificações Dashboard ── */
   (function injectNotifDashCSS() {
     if (document.getElementById('msy-notifdash-css')) return;
     const s = document.createElement('style');
     s.id = 'msy-notifdash-css';
     s.textContent = `
       .notif-clear-all-btn {
         display:inline-flex; align-items:center; gap:5px;
         background:none; border:1px solid rgba(239,68,68,.22);
         border-radius:7px; color:rgba(239,68,68,.55); cursor:pointer;
         font-size:.65rem; font-weight:600; letter-spacing:.04em;
         padding:4px 10px; transition:all .2s; white-space:nowrap;
       }
       .notif-clear-all-btn:hover {
         background:rgba(239,68,68,.1); color:#ef4444;
         border-color:rgba(239,68,68,.45);
       }
       .notif-del-btn {
         flex-shrink:0; background:none; border:none;
         color:rgba(255,255,255,.2); cursor:pointer;
         font-size:.75rem; padding:4px 6px; border-radius:5px;
         transition:all .2s; margin-left:4px;
       }
       .notif-del-btn:hover { background:rgba(239,68,68,.12); color:#ef4444; }
       .notif-item-dash { position:relative; transition:opacity .2s; }
       .notif-item-dash.removing { opacity:0; pointer-events:none; }
       .notif-empty-state {
         display:flex; align-items:center; justify-content:center;
         gap:9px; padding:22px 16px; color:var(--text-3); font-size:.78rem;
       }
     `;
     document.head.appendChild(s);
   })();
   
   /* ── Funções internas do Jornal ── */
   async function _jornalFetchAuto() {
     const today    = new Date();
     const todayStr = today.toISOString().split('T')[0];
     const todayMM  = String(today.getMonth()+1).padStart(2,'0');
     const todayDD  = String(today.getDate()).padStart(2,'0');
     const slides   = [];
   
     const em3dias = new Date(today.getTime() + 3*86400000).toISOString().split('T')[0];
   
     // Mês atual para desempenho
     const mesAtual = todayStr.slice(0,7); // "YYYY-MM"
     const mesStart = `${mesAtual}-01`;
     const mesEnd   = todayStr;
   
     const [membrosRes, eventosRes, rankingRes, top3Res, rankingsMesRes, rankingMensalRes, presencasRes, atividadesRes] = await Promise.all([
       db.from('profiles').select('id,name,birth_date').eq('status','ativo'),
       db.from('events').select('id,title,event_date,event_time,mandatory')
         .gte('event_date', todayStr).lte('event_date', em3dias)
         .order('event_date',{ascending:true}).limit(5),
       db.from('weekly_rankings').select('*').eq('tipo','semanal')
         .order('week_start',{ascending:false}).limit(1),
       // Trono dos Recordes — fonte de verdade do Top 3 histórico
       db.from('msy_recordes_top3').select('tipo,posicao,nome,mensagens,periodo'),
       // Rankings semanais do mês (para detectar novo ranking)
       db.from('weekly_rankings').select('week_start,week_end,entries,created_at').eq('tipo','semanal')
         .gte('week_start', mesStart).lte('week_start', mesEnd)
         .order('week_start',{ascending:false}),
       // Relatório MENSAL do mês atual — usado para destaque
       db.from('weekly_rankings').select('week_start,week_end,entries,created_at').eq('tipo','mensal')
         .gte('week_start', mesStart).lte('week_start', mesEnd)
         .order('week_start',{ascending:false}).limit(1),
       // Presenças do mês para calcular desempenho
       db.from('event_presencas').select('user_id,membro_id,status'),
       // Atividades do mês para calcular desempenho
       db.from('activities').select('assigned_to,status'),
     ]);
   
     const membros      = membrosRes.data        || [];
     const eventos      = eventosRes.data        || [];
     const ranking      = rankingRes.data?.[0]   || null;
     const rankingsMes  = rankingsMesRes.data    || [];
     const rankingMensal = rankingMensalRes.data?.[0] || null;
     const presencas    = presencasRes.data      || [];
     const atividades   = atividadesRes.data     || [];

     // Montar top3 por tipo a partir da tabela persistida
     const top3Rows = top3Res.data || [];
     const top3Map  = { semanal: [], mensal: [], diario: [] };
     top3Rows.forEach(r => { if (top3Map[r.tipo]) top3Map[r.tipo].push(r); });
     // Compatibilidade: recorde Top 1 de cada categoria
     const recSemTop1  = top3Map.semanal.find(r => r.posicao === 1) || null;
     const recMesTop1  = top3Map.mensal.find(r  => r.posicao === 1) || null;
     const recDiarTop1 = top3Map.diario.find(r  => r.posicao === 1) || null;
   
     /* Aniversários */
     membros.forEach(m => {
       if (!m.birth_date) return;
       const [,mm,dd] = m.birth_date.split('-');
       if (mm === todayMM && dd === todayDD)
         slides.push({ type:'aniversario', priority:10, icon:'🎂', tag:'Aniversário',
           text:`Hoje é aniversário de ${m.name}!`,
           meta:`Feliz aniversário, ${m.name}! Que seu dia seja incrível. 🍷` });
     });
   
     /* Eventos */
     eventos.forEach(ev => {
       const diff   = Math.round((new Date(ev.event_date+'T00:00:00') - today) / 86400000);
       const quando = diff===0 ? `hoje às ${ev.event_time||'?'}` : diff===1 ? 'amanhã' : `em ${diff} dias`;
       slides.push({ type:'evento', priority: diff===0 ? 9 : 5,
         icon: diff===0 ? '📍' : '📅', tag: diff===0 ? 'Acontece Hoje' : 'Evento Próximo',
         text:`${ev.title} — ${quando}`,
         meta: ev.mandatory ? '⚠ Presença obrigatória' : '' });
     });
   
     /* Ranking semanal */
     if (ranking) {
       const entries  = ranking.entries || [];
       const leader   = entries[0];
       const diffDays = Math.round((today - new Date(ranking.week_start+'T00:00:00')) / 86400000);
       if (diffDays <= 10) { // até 10 dias para pegar semanas que ainda são relevantes
         const periodoRank = `${ranking.week_start?.split('-').reverse().join('/')} a ${ranking.week_end?.split('-').reverse().join('/')}`;
         const mesRank = new Date(ranking.week_start+'T00:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
         slides.push({ type:'ranking', priority:6, icon:'👑', tag:'Ranking Semanal',
           text: leader ? `${leader.name} liderou a semana com ${leader.messages} msgs` : 'Novo ranking semanal disponível',
           meta: `Semana de ${periodoRank} · ${mesRank}` });
   
         /* Recorde semanal — exibe se o líder supera o Top 1 histórico */
         const recSem = recSemTop1;
         if (leader && recSem && leader.messages > recSem.mensagens)
           slides.push({ type:'recorde', priority:10, icon:'🏆', tag:'Novo Recorde!',
             text:`${leader.name} bateu o recorde semanal com ${leader.messages} msgs!`,
             meta:`Anterior: ${recSem.mensagens} msgs — ${recSem.nome} · ${periodoRank}` });
       }
     }
   
     /* Novo relatório semanal adicionado (último criado há menos de 48h) */
     if (rankingsMes.length > 0) {
       const ultimo     = rankingsMes[0];
       const criadoEm   = new Date(ultimo.created_at);
       const horasAtras = (today - criadoEm) / 3600000;
       if (horasAtras <= 48) {
         const entries    = ultimo.entries || [];
         const lider      = entries[0];
         const periodoRel = `${ultimo.week_start?.split('-').reverse().join('/')} a ${ultimo.week_end?.split('-').reverse().join('/')}`;
         const mesRel     = new Date(ultimo.week_start+'T00:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
         slides.push({ type:'ranking', priority:7, icon:'📊', tag:'Novo Relatório',
           text: lider ? `Ranking publicado: ${lider.name} lidera com ${lider.messages} msgs` : 'Novo ranking semanal publicado',
           meta: `${periodoRel} · ${mesRel}` });
       }
   
       /* Recorde mensal — compara total acumulado no mês com Top 1 histórico */
       const recMes = recMesTop1;
       if (recMes && rankingsMes.length > 0) {
         // Soma total de msgs no mês por pessoa
         const totalMes = {};
         rankingsMes.forEach(rk => {
           (rk.entries||[]).forEach(e => {
             totalMes[e.name] = (totalMes[e.name]||0) + (parseInt(e.messages)||0);
           });
         });
         const topMes = Object.entries(totalMes).sort((a,b)=>b[1]-a[1])[0];
         if (topMes && topMes[1] > recMes.mensagens)
           slides.push({ type:'recorde', priority:9, icon:'🏆', tag:'Recorde Mensal!',
             text:`${topMes[0]} está batendo o recorde mensal com ${topMes[1]} msgs!`,
             meta:`Recorde anterior: ${recMes.mensagens} msgs — ${recMes.nome}` });
       }
     }
   
     /* Recorde diário */
     const recDia = recDiarTop1;
     if (recDia && ranking) {
       const entries = ranking.entries || [];
       // Pega o melhor dia estimado (msgs do líder / dias da semana)
       const leader = entries[0];
       if (leader) {
         const mediaLider = Math.round(leader.messages / 7);
         if (mediaLider > recDia.mensagens)
           slides.push({ type:'recorde', priority:8, icon:'⚡', tag:'Recorde Diário!',
             text:`${leader.name} pode estar batendo o recorde diário!`,
             meta:`Recorde atual: ${recDia.mensagens} msgs/dia — ${recDia.nome}` });
       }
     }
   
     /* Membro com alto desempenho — usa relatório MENSAL se disponível, fallback semanais */
     const fonteDesempenho = rankingMensal || (rankingsMes.length > 0 ? { entries: rankingsMes.flatMap(r => r.entries||[]), week_start: rankingsMes[rankingsMes.length-1]?.week_start, week_end: rankingsMes[0]?.week_end, tipo:'semanal' } : null);
   
     if (membros.length > 0 && fonteDesempenho) {
       // Determina o mês pelo dado real usando o week_end (data mais recente do período)
       // Isso garante que o mês exibido corresponde ao período real dos dados
       const referenciaData = fonteDesempenho.week_end || fonteDesempenho.week_start;
       const mesDaFonte = referenciaData?.slice(0,7);
       const mesNomeReal = mesDaFonte
         ? new Date(mesDaFonte+'-02').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})
         : null;
   
       // Agrega msgs da fonte — se mensal, já está somado; se semanais, soma por nome
       const msgsPorNome = {};
       const entradas = fonteDesempenho.entries || [];
       entradas.forEach(e => {
         const n = (e.name||'').toLowerCase().trim();
         msgsPorNome[n] = (msgsPorNome[n]||0) + (parseInt(e.messages)||0);
       });
   
       // Presenças confirmadas por membro
       const presConf = {};
       presencas.forEach(p => {
         if (p.status==='confirmado') { const uid = p.user_id||p.membro_id; if(uid) presConf[uid] = (presConf[uid]||0)+1; }
       });
   
       // Atividades concluídas por membro
       const actsConcl = {};
       atividades.forEach(a => {
         if (a.status==='Concluída') actsConcl[a.assigned_to] = (actsConcl[a.assigned_to]||0)+1;
       });
   
       const totalMsgs = Object.values(msgsPorNome).reduce((s,v)=>s+v,0)||1;
       const maxPres   = Math.max(...membros.map(m => presConf[m.id]||0), 1);
       const maxActs   = Math.max(...membros.map(m => actsConcl[m.id]||0), 1);
   
       const scored = membros.map(m => {
         const nNorm = (m.name||'').toLowerCase().trim();
         const msgs  = msgsPorNome[nNorm]||0;
         const pres  = presConf[m.id]||0;
         const acts  = actsConcl[m.id]||0;
         const sMsgs = (msgs/totalMsgs)*100;
         const sPres = maxPres>0 ? (pres/maxPres)*100 : 0;
         const sActs = maxActs>0 ? (acts/maxActs)*100 : 0;
         const score = Math.round(sMsgs*0.6 + sPres*0.25 + sActs*0.15);
         return { ...m, score, msgs, pres, acts };
       }).filter(m => m.score > 0).sort((a,b)=>b.score-a.score);
   
       const destaque = scored[0];
       if (destaque && scored.length >= 2 && mesNomeReal) {
         const isMensal = !!rankingMensal;
         const periodoMeta = isMensal
           ? `Relatório mensal · ${mesNomeReal}`
           : `${fonteDesempenho.week_start?.split('-').reverse().join('/')} a ${fonteDesempenho.week_end?.split('-').reverse().join('/')} · ${mesNomeReal}`;
   
         slides.push({ type:'desempenho', priority:5, icon:'⭐', tag:'Destaque do Período',
           text:`${destaque.name} se destaca em ${mesNomeReal}`,
           meta:`${destaque.msgs} msgs · ${destaque.pres} presenças · ${destaque.acts} atividades · ${periodoMeta}` });
       }
     }
   
     slides.sort((a,b) => (b.priority||0) - (a.priority||0));
   
     /* ── SLIDES DE GARANTIA: sempre presentes se não há conteúdo suficiente ── */
   
     // Slide: ranking histórico (sempre exibe o líder do último ranking disponível)
     if (slides.filter(s=>s.type==='ranking').length === 0 && ranking) {
       const entries    = ranking.entries || [];
       const leader     = entries[0];
       if (leader) {
         const periodoGar = `${ranking.week_start?.split('-').reverse().join('/')} a ${ranking.week_end?.split('-').reverse().join('/')}`;
         const mesGar     = new Date(ranking.week_start+'T00:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
         slides.push({ type:'ranking', priority:3, icon:'👑', tag:'Último Ranking',
           text:`${leader.name} liderou a semana com ${leader.messages} msgs`,
           meta:`${periodoGar} · ${mesGar}` });
       }
     }
   
     // Slide: recordes atuais do sistema (sempre informativo) — usa Top 1 do Trono
     const recSemGlobal = recSemTop1;
     if (recSemGlobal && slides.filter(s=>s.type==='recorde').length === 0) {
       slides.push({ type:'recorde', priority:2, icon:'🏆', tag:'Recorde Semanal',
         text:`Recorde semanal: ${recSemGlobal.mensagens} msgs por ${recSemGlobal.nome}`,
         meta: recSemGlobal.periodo ? `Período: ${recSemGlobal.periodo}` : 'Recorde histórico da Masayoshi' });
     }
   
     // Slide: total de membros ativos
     if (membros.length > 0) {
       slides.push({ type:'aviso', priority:1, icon:'⚔️', tag:'Masayoshi',
         text:`${membros.length} membros ativos na Ordem`,
         meta:'A Masayoshi cresce a cada dia' });
     }
   
     // Slide: próximo evento além dos 3 dias — busca qualquer evento futuro
     const temEvento = slides.some(s => s.type==='evento');
     if (!temEvento) {
       // Tenta pegar o próximo evento (já foi buscado até 3 dias, então busca além)
       try {
         const { data: proximoEv } = await db.from('events')
           .select('id,title,event_date,event_time,mandatory')
           .gt('event_date', em3dias)
           .order('event_date',{ascending:true}).limit(1);
         if (proximoEv?.[0]) {
           const ev = proximoEv[0];
           const diff = Math.round((new Date(ev.event_date+'T00:00:00') - today) / 86400000);
           slides.push({ type:'evento', priority:3, icon:'📅', tag:'Próximo Evento',
             text:`${ev.title} em ${diff} dias`,
             meta:`${Utils.formatDate(ev.event_date)}${ev.event_time ? ' · '+ev.event_time : ''}${ev.mandatory?' · Presença obrigatória':''}` });
         }
       } catch(e) {}
     }
   
     // Reordenar após adições
     slides.sort((a,b) => (b.priority||0) - (a.priority||0));
   
     return slides;
   }
   
   async function _jornalFetchManuais() {
     try {
       const now = new Date().toISOString();
       const { data } = await db.from('jornal_avisos').select('*').eq('ativo',true)
         .or(`expira_em.is.null,expira_em.gte.${now}`)
         .order('prioridade',{ascending:false}).order('created_at',{ascending:false}).limit(10);
       return (data||[]).map(a => ({
         type: a.prioridade>=2 ? 'priority' : 'aviso',
         priority: 10+a.prioridade, icon: a.icone||'📢',
         tag: a.prioridade>=2 ? 'Urgente' : 'Aviso',
         text: a.mensagem,
         meta: a.autor_nome ? `Diretoria · ${a.autor_nome}` : 'Diretoria',
         avisoId: a.id, // id para exclusão
       }));
     } catch(e) { return []; }
   }
   
   let _jornalTimer = null;
   let _jornalCur   = 0;
   let _jornalSlides = [];
   
   function _jornalShow(idx) {
     _jornalCur = idx;
     document.querySelectorAll('.jornal-slide').forEach((el,i) => {
       el.classList.toggle('active', i===idx);
     });
     document.querySelectorAll('.jornal-dot').forEach((d,i) => d.classList.toggle('active',i===idx));
     const cnt = document.getElementById('jornalCount');
     if (cnt) cnt.textContent = `${idx+1} / ${_jornalSlides.length}`;
   }
   
   function _jornalNext() { _jornalShow((_jornalCur+1) % _jornalSlides.length); }
   function _jornalPrev() { _jornalShow((_jornalCur-1+_jornalSlides.length) % _jornalSlides.length); }
   
   function _jornalStartTimer() {
     clearInterval(_jornalTimer);
     if (_jornalSlides.length > 1)
       _jornalTimer = setInterval(_jornalNext, 5000);
   }
   
   function _jornalSlideHTML(s, i, canDelete) {
     const delBtn = (canDelete && s.avisoId)
       ? `<button class="jornal-slide-del" data-aviso-id="${s.avisoId}" title="Excluir aviso"><i class="fa-solid fa-trash-can"></i></button>`
       : '';
     return `
       <div class="jornal-slide${i===0?' active':''}" data-idx="${i}">
         <div class="jornal-slide-icon ${s.type}">${s.icon}</div>
         <div class="jornal-slide-body">
           <div class="jornal-slide-tag ${s.type}">${s.tag}</div>
           <div class="jornal-slide-text">${Utils.escapeHtml(s.text)}</div>
           ${s.meta ? `<div class="jornal-slide-meta">${Utils.escapeHtml(s.meta)}</div>` : ''}
         </div>
         ${delBtn}
       </div>`;
   }
   
   function _jornalBindModal(profile) {
     if (document.getElementById('jornalAvisoModal')) return;
     const el = document.createElement('div');
     el.className = 'modal-overlay';
     el.id = 'jornalAvisoModal';
     el.innerHTML = `
       <div class="modal" style="max-width:460px">
         <div class="modal-header">
           <div class="modal-title"><i class="fa-solid fa-newspaper" style="color:var(--gold)"></i> Novo Aviso — Jornal MSY</div>
           <button class="modal-close" id="jornalModalClose"><i class="fa-solid fa-xmark"></i></button>
         </div>
         <div class="modal-body">
           <div class="form-group" style="margin-bottom:13px">
             <label class="form-label">Mensagem *</label>
             <textarea class="form-input form-textarea" id="jornalAvisoMsg" placeholder="Escreva o aviso..." style="min-height:80px;resize:none"></textarea>
           </div>
           <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:13px">
             <div class="form-group">
               <label class="form-label">Ícone</label>
               <input class="form-input" id="jornalAvisoIcon" value="📢" maxlength="4" style="font-size:1.1rem;text-align:center">
             </div>
             <div class="form-group">
               <label class="form-label">Prioridade</label>
               <select class="form-input form-select" id="jornalAvisoPrio">
                 <option value="0">Normal</option>
                 <option value="1">Alta</option>
                 <option value="2">Urgente</option>
               </select>
             </div>
           </div>
           <div class="form-group">
             <label class="form-label">Expira em (opcional)</label>
             <input class="form-input" type="date" id="jornalAvisoExpira">
           </div>
         </div>
         <div class="modal-footer">
           <button class="btn btn-ghost" id="jornalModalCancel">Cancelar</button>
           <button class="btn btn-primary" id="jornalModalSave"><i class="fa-solid fa-paper-plane"></i> Publicar</button>
         </div>
       </div>`;
     document.body.appendChild(el);
   
     const close = () => el.classList.remove('open');
     document.getElementById('jornalModalClose').addEventListener('click', close);
     document.getElementById('jornalModalCancel').addEventListener('click', close);
     el.addEventListener('click', e => { if (e.target===el) close(); });
   
     document.getElementById('jornalModalSave').addEventListener('click', async () => {
       const msg    = document.getElementById('jornalAvisoMsg')?.value.trim();
       const icone  = document.getElementById('jornalAvisoIcon')?.value.trim() || '📢';
       const prio   = parseInt(document.getElementById('jornalAvisoPrio')?.value||'0');
       const expira = document.getElementById('jornalAvisoExpira')?.value || null;
       if (!msg) { Utils.showToast('Escreva uma mensagem.','error'); return; }
       const btn = document.getElementById('jornalModalSave');
       btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i>';
       const { error } = await db.from('jornal_avisos').insert({
         mensagem:msg, icone, prioridade:prio, ativo:true,
         autor_id:profile.id, autor_nome:profile.name,
         expira_em: expira ? expira+'T23:59:59Z' : null,
       });
       btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-paper-plane"></i> Publicar';
       if (!error) {
         close(); Utils.showToast('Aviso publicado!');
         _initJornalMSY(profile);
       } else {
         Utils.showToast('Erro: '+(error.message||''),'error');
       }
     });
   }
   
   async function _initJornalMSY(profile) {
     const container = document.getElementById('jornalContainer');
     if (!container) return;
   
     let auto=[], man=[];
     try { auto = await _jornalFetchAuto(); }   catch(e) { console.warn('[Jornal auto]',e); }
     try { man  = await _jornalFetchManuais(); } catch(e) {}
   
     const high = man.filter(s=>s.type==='priority');
     const low  = man.filter(s=>s.type!=='priority');
     _jornalSlides = [...high, ...auto, ...low];
     _jornalCur = 0;
   
     const canAdd = profile.tier === 'diretoria';
     const hasSlides = _jornalSlides.length > 0;
   
     container.innerHTML = `
       <div class="jornal-wrap">
         <div class="jornal-header">
           <div class="jornal-header-left">
             <div class="jornal-logo">📰</div>
             <div>
               <div class="jornal-title">Jornal MSY</div>
               <div class="jornal-subtitle">Acontecimentos da Ordem</div>
             </div>
             ${hasSlides ? '<div class="jornal-live-dot"></div>' : ''}
           </div>
           ${canAdd ? `<button class="jornal-add-btn" id="jornalAddBtn"><i class="fa-solid fa-plus"></i> Aviso</button>` : ''}
         </div>
         ${hasSlides ? `
           <div class="jornal-carousel">
             ${_jornalSlides.map((s,i)=>_jornalSlideHTML(s,i,canAdd)).join('')}
           </div>
           <div class="jornal-footer">
             <div class="jornal-dots">
               ${_jornalSlides.map((_,i)=>`<div class="jornal-dot${i===0?' active':''}" data-idx="${i}"></div>`).join('')}
             </div>
             <div style="display:flex;align-items:center;gap:10px">
               <span class="jornal-count" id="jornalCount">1 / ${_jornalSlides.length}</span>
               <div class="jornal-nav">
                 <button class="jornal-nav-btn" id="jornalPrev"><i class="fa-solid fa-chevron-left"></i></button>
                 <button class="jornal-nav-btn" id="jornalNext"><i class="fa-solid fa-chevron-right"></i></button>
               </div>
             </div>
           </div>` :
           `<div class="jornal-empty"><i class="fa-solid fa-newspaper" style="opacity:.3"></i> Nenhuma novidade no momento.</div>`
         }
       </div>`;
   
     if (hasSlides) {
       _jornalStartTimer();
       document.getElementById('jornalNext')?.addEventListener('click',()=>{ _jornalNext(); _jornalStartTimer(); });
       document.getElementById('jornalPrev')?.addEventListener('click',()=>{ _jornalPrev(); _jornalStartTimer(); });
       container.querySelectorAll('.jornal-dot').forEach(d=>{
         d.addEventListener('click',()=>{ _jornalShow(parseInt(d.dataset.idx)); _jornalStartTimer(); });
       });
   
       // Exclusão de avisos manuais (apenas diretoria)
       if (canAdd) {
         container.querySelectorAll('.jornal-slide-del').forEach(btn => {
           btn.addEventListener('click', async (e) => {
             e.stopPropagation();
             const avisoId = btn.dataset.avisoId;
             if (!avisoId) return;
             if (!confirm('Excluir este aviso do Jornal MSY?')) return;
             btn.disabled = true;
             btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
             const { error } = await db.from('jornal_avisos')
               .update({ ativo: false })
               .eq('id', avisoId);
             if (!error) {
               Utils.showToast('Aviso excluído.');
               _initJornalMSY(profile);
             } else {
               btn.disabled = false;
               btn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
               Utils.showToast('Erro ao excluir: '+(error.message||''),'error');
             }
           });
         });
       }
     }
   
     if (canAdd) {
       _jornalBindModal(profile);
       document.getElementById('jornalAddBtn')?.addEventListener('click',()=>{
         document.getElementById('jornalAvisoModal')?.classList.add('open');
       });
     }
   }
   
   /* ── Sistema de limpeza de notificações — Dashboard ── */
   function _initNotifsDash(profile) {
     const card = document.getElementById('notifsCard');
     if (!card) return;
   
     // Helper: renderiza o estado vazio elegante
     function _renderEmpty() {
       const list = document.getElementById('notifsList');
       if (!list) return;
       // Remove botão limpar se existir
       document.getElementById('notifClearAllBtn')?.remove();
       list.innerHTML = `<div class="notif-empty-state"><i class="fa-solid fa-bell-slash" style="opacity:.3;font-size:1.1rem"></i><span>Nenhuma notificação recente.</span></div>`;
     }
   
     // Helper: anima remoção e remove do DOM
     function _animateRemove(el, callback) {
       el.classList.add('removing');
       setTimeout(() => { el.remove(); callback?.(); }, 200);
     }
   
     // Verificar se lista ficou vazia após remoção individual
     function _checkEmpty() {
       const list = document.getElementById('notifsList');
       if (!list) return;
       if (list.querySelectorAll('.notif-item-dash').length === 0) _renderEmpty();
     }
   
     // ── Remoção individual ──
     card.querySelectorAll('.notif-del-btn').forEach(btn => {
       btn.addEventListener('click', async (e) => {
         e.stopPropagation();
         const notifId = btn.dataset.notifId;
         if (!notifId) return;
         const item = card.querySelector(`.notif-item-dash[data-notif-id="${notifId}"]`);
         // Feedback imediato na UI
         _animateRemove(item, _checkEmpty);
         // Soft delete persistente — compatível com RLS do Supabase
         await db.from('notifications')
           .update({ deleted_at: new Date().toISOString() })
           .eq('id', notifId).eq('user_id', profile.id);
       });
     });
   
     // ── Limpar todas ──
     document.getElementById('notifClearAllBtn')?.addEventListener('click', async () => {
       const total = card.querySelectorAll('.notif-item-dash').length;
       if (total === 0) return;
   
       const ok = confirm(`Tem certeza que deseja limpar ${total > 1 ? 'todas as ' + total + ' notificações' : 'esta notificação'}?\n\nEsta ação não pode ser desfeita.`);
       if (!ok) return;
   
       const btn = document.getElementById('notifClearAllBtn');
       if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>'; }
   
       const { error } = await db.from('notifications')
         .update({ deleted_at: new Date().toISOString() })
         .eq('user_id', profile.id).is('deleted_at', null);
   
       if (!error) {
         _renderEmpty();
         Utils.showToast('Notificações limpas.');
       } else {
         if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Limpar'; }
         Utils.showToast('Erro ao limpar notificações.', 'error');
       }
     });
   }
   

   /* ═══════════════════════════════════════════════════════════
      ICM BADGES — helpers de geração, renderização e save
      ═══════════════════════════════════════════════════════════ */

   /* ICM_BADGE_META — agora gerenciado por badges_unificado.js */
   const ICM_BADGE_META = (typeof MSYBadges !== 'undefined' && MSYBadges.ICM_META)
     ? MSYBadges.ICM_META
     : {
         corvus:   { label:'Corvus',               icon:'🐦‍⬛', color:'#8b5cf6', desc:'Estrategista das Sombras' },
         fenrir:   { label:'Fenrir',               icon:'🐺', color:'#ef4444', desc:'Ruptor de Paradigmas' },
         aegis:    { label:'Aegis',                icon:'⬡', color:'#3b82f6', desc:'Guardião da Estrutura' },
         vortex:   { label:'Vortex',               icon:'◉', color:'#10b981', desc:'Núcleo de Influência' },
         titan:    { label:'Titan',                icon:'▲', color:'#f59e0b', desc:'Executor de Força' },
         cipher:   { label:'Cipher',               icon:'🎯', color:'#06b6d4', desc:'Decodificador de Sistemas' },
         specter:  { label:'Specter',              icon:'◬', color:'#6b7280', desc:'Operador Silencioso' },
         elite:    { label:'Elite da Ordem',       icon:'👑', color:'#c9a84c', desc:'ICM ≥ 80' },
         agente:   { label:'Agente da Ordem',      icon:'🔵', color:'#3b82f6', desc:'ICM ≥ 70' },
         operador: { label:'Operador Estratégico', icon:'🔰', color:'#10b981', desc:'ICM ≥ 60' },
       };

   function getICMBadges(icm) {
     /* Delega ao sistema unificado de insígnias */
     if (typeof MSYBadges !== 'undefined') {
       return MSYBadges.getICMDisponiveis(icm).map(b => b.meta?.icmKey || b.key);
     }
     // Fallback local caso MSYBadges não esteja carregado
     if (!icm) return [];
     const badges = [];
     if (icm.dominante) badges.push(icm.dominante.toLowerCase());
     if (icm.secundario && icm.secundario.toLowerCase() !== icm.dominante?.toLowerCase())
       badges.push(icm.secundario.toLowerCase());
     if (icm.score >= 80)      badges.push('elite');
     else if (icm.score >= 70) badges.push('agente');
     else if (icm.score >= 60) badges.push('operador');
     return badges;
   }

   function renderICMBadgesSection(icmData, selectedBadges, userId) {
     const section = document.getElementById('icm-badges-section');
     if (!section) return;

     const available = getICMBadges(icmData);
     let selected    = Array.isArray(selectedBadges) ? [...selectedBadges] : [];

     if (!icmData || available.length === 0) {
       section.innerHTML = `
         <div style="padding:12px 0;text-align:center">
           <div style="font-size:.82rem;color:var(--text-3);margin-bottom:10px">
             Realize o ICM para desbloquear insígnias.
           </div>
           <a href="icm.html" style="font-size:.78rem;color:var(--red-bright);font-weight:600">
             → Realizar ICM
           </a>
         </div>`;
       return;
     }

     function renderBadgeItem(key, isSelected) {
       const meta = ICM_BADGE_META[key] || { label: key, icon: '🏷', color: '#c9a84c', desc: '' };
       const hex  = meta.color.startsWith('#') ? meta.color : '#c9a84c';
       return `
         <div class="icm-badge-item ${isSelected ? 'selected' : ''}"
              data-key="${key}"
              style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;cursor:pointer;border:1px solid ${isSelected ? hex : 'var(--border-faint)'};background:${isSelected ? hex + '18' : 'rgba(255,255,255,0.02)'};transition:all .18s"
              onclick="window.__icmBadgeToggle('${key}')"
              onmouseover="this.style.borderColor='${hex}';this.style.background='${hex}18'"
              onmouseout="if(!this.classList.contains('selected')){this.style.borderColor='var(--border-faint)';this.style.background='rgba(255,255,255,0.02)'}">
           <span style="font-size:1.1rem;line-height:1">${meta.icon}</span>
           <div style="flex:1;min-width:0">
             <div style="font-size:.8rem;font-weight:600;color:${isSelected ? hex : 'var(--text-1)'}">${meta.label}</div>
             <div style="font-size:.68rem;color:var(--text-3)">${meta.desc}</div>
           </div>
           <div style="width:16px;height:16px;border-radius:50%;border:1px solid ${hex};flex-shrink:0;display:flex;align-items:center;justify-content:center;background:${isSelected ? hex : 'transparent'}">
             ${isSelected ? '<span style="color:#000;font-size:.55rem;font-weight:700">✓</span>' : ''}
           </div>
         </div>`;
     }

     function renderSelected() {
       if (selected.length === 0) return `<div style="font-size:.76rem;color:var(--text-3);font-style:italic;padding:4px 0">Nenhuma selecionada.</div>`;
       return selected.map(k => {
         const m = ICM_BADGE_META[k] || { label: k, icon: '🏷', color: '#c9a84c' };
         const hex = m.color.startsWith('#') ? m.color : '#c9a84c';
         return `<span style="display:inline-flex;align-items:center;gap:5px;background:${hex}18;border:1px solid ${hex}44;border-radius:20px;padding:3px 10px;font-size:.72rem;font-weight:600;color:${hex};letter-spacing:.04em">${m.icon} ${m.label}</span>`;
       }).join('');
     }

     function rebuild() {
       section.innerHTML = `
         <div style="margin-bottom:10px">
           <div style="font-size:.72rem;color:var(--text-3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">Exibindo no perfil</div>
           <div id="icm-selected-display" style="display:flex;flex-wrap:wrap;gap:6px;min-height:28px">${renderSelected()}</div>
         </div>
         <div style="font-size:.72rem;color:var(--text-3);margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em">Disponíveis — clique para selecionar/remover</div>
         <div style="display:flex;flex-direction:column;gap:5px">
           ${available.map(k => renderBadgeItem(k, selected.includes(k))).join('')}
         </div>
         <div style="margin-top:12px;display:flex;align-items:center;justify-content:flex-end;gap:10px">
           <span id="icm-badges-save-msg" style="font-size:.72rem;color:var(--text-3)"></span>
           <button class="btn btn-primary btn-sm" id="icm-badges-save-btn" onclick="window.__icmBadgesSave()">
             <i class="fa-solid fa-floppy-disk"></i> Salvar seleção
           </button>
         </div>`;
     }

     window.__icmBadgeToggle = function(key) {
       const idx = selected.indexOf(key);
       if (idx === -1) selected.push(key); else selected.splice(idx, 1);
       rebuild();
     };

     window.__icmBadgesSave = async function() {
       const btn = document.getElementById('icm-badges-save-btn');
       const msg = document.getElementById('icm-badges-save-msg');
       if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>'; }
       try {
         // Upsert direto — funciona mesmo se selected_badges ainda não existia antes
         const { error } = await db
           .from('profiles')
           .update({ selected_badges: selected.length > 0 ? selected : [] })
           .eq('id', userId);
         if (error) {
           console.error('[ICM Badges] Erro ao salvar:', error);
           throw error;
         }
         if (msg) { msg.textContent = '✓ Salvo!'; msg.style.color = 'var(--gold)'; }
         /* Invalida cache do sistema unificado para reflectir nova seleção */
         if (typeof MSYBadges !== 'undefined') MSYBadges.clearCache(userId);
         renderLeftBadges();
         // Atualiza selected display
         const disp = document.getElementById('icm-selected-display');
         if (disp) disp.innerHTML = renderSelected();
       } catch(e) {
         console.error('[ICM Badges] catch:', e);
         if (msg) { msg.textContent = 'Erro: ' + (e.message || 'tente novamente'); msg.style.color = 'var(--red-bright)'; }
       } finally {
         if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar seleção'; }
         setTimeout(() => { if (msg) msg.textContent = ''; }, 4000);
       }
     };

     function renderLeftBadges() {
       // Usar container dedicado para badges ICM no painel esquerdo
       let icmLeft = document.getElementById('icm-left-badges');
       if (!icmLeft) {
         const profileBadgesContainer = document.getElementById('profileBadgesContainer');
         if (!profileBadgesContainer) return;
         icmLeft = document.createElement('div');
         icmLeft.id = 'icm-left-badges';
         icmLeft.style.marginTop = '8px';
         profileBadgesContainer.appendChild(icmLeft);
       }
       if (selected.length === 0) {
         icmLeft.innerHTML = '';
         return;
       }
       icmLeft.innerHTML =
         `<div style="font-size:.6rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">ICM</div>` +
         `<div style="display:flex;flex-wrap:wrap;gap:6px">` +
         selected.map(k => {
           const m = ICM_BADGE_META[k] || { label: k, icon: '🏷', color: '#c9a84c' };
           const hex = m.color.startsWith('#') ? m.color : '#c9a84c';
           return `<div style="display:flex;align-items:center;gap:5px;background:${hex}14;border:1px solid ${hex}33;border-radius:7px;padding:4px 9px">
             <span style="font-size:.85rem">${m.icon}</span>
             <span style="font-size:.7rem;font-weight:600;color:${hex}">${m.label}</span>
           </div>`;
         }).join('') + `</div>`;
     }

     rebuild();
     renderLeftBadges();
   }

   document.addEventListener('DOMContentLoaded', () => {
     const page = document.body.dataset.page;
     const init = {
       login:       initLogin,
       dashboard:   initDashboard,
       atividades:  initAtividades,
       comunicados: initComunicados,
       membros:     initMembros,
       perfil:      initPerfil,
       icm:         function() { /* gerenciado por icm_script.js + icm.html */ },
       eventos:     initEventos,
       tecnologias: initTecnologias,
       admin:       initAdmin,
       // Módulos v3.0 — gerenciados em modules.js
       // biblioteca, premiacoes, ordem são roteados via extraRoutes em modules.js
     };
     init[page]?.();
   });
