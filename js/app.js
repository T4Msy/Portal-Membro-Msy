/* ============================================================
   MSY PORTAL — APP.JS v2.1
   Supabase Integration | Vanilla JS
   ============================================================ */

   'use strict';


   const { createClient } = supabase;
   const db = createClient(MSY_CONFIG.SUPABASE_URL, MSY_CONFIG.SUPABASE_ANON_KEY);
   
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
     const profile = await Auth.requireAuth();
     if (!profile) return;
   
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
       { page: 'presencas',   icon: 'fa-solid fa-clipboard-list',label: 'Presenças' },
       { page: 'ranking',     icon: 'fa-solid fa-ranking-star',  label: 'Ranking' },
       { page: 'feed',        icon: 'fa-solid fa-rss',           label: 'Feed' },
       { page: 'biblioteca',  icon: 'fa-solid fa-book-open',     label: 'Biblioteca' },
       { page: 'premiacoes',  icon: 'fa-solid fa-trophy',        label: 'Premiações' },
       { page: 'ordem',       icon: 'fa-solid fa-crown',         label: 'Estrutura' },
       { page: 'tecnologias', icon: 'fa-solid fa-microchip',     label: 'Tecnologias' },
       { page: 'mensalidade', icon: 'fa-solid fa-credit-card',   label: 'Mensalidade' },
       { page: 'perfil',      icon: 'fa-solid fa-circle-user',   label: 'Meu Perfil' },
     ];
   
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
   async function initAtividades() {
     const profile = await renderSidebar('atividades');
     if (!profile) return;
     await renderTopBar('Atividades', profile);
   
     const content = document.getElementById('pageContent');
     Utils.showLoading(content);
   
     const isDiretoria = profile.tier === 'diretoria';
     let activeFilter = 'Todos';
   
     async function loadActivities() {
       const grid = document.getElementById('activitiesGrid');
       if (!grid) return;
       grid.innerHTML = `<div style="grid-column:1/-1"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i></div></div>`;
   
       let query = db.from('activities')
         .select('*, assigned_by_profile:assigned_by(name,initials,color), assigned_to_profile:assigned_to(name,initials)')
         .order('created_at', { ascending: false });
   
       if (!isDiretoria) query = query.eq('assigned_to', profile.id);
       if (activeFilter !== 'Todos') query = query.eq('status', activeFilter);
   
       const { data: acts, error } = await query;
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
         else if (passed && hasExt) deadlineLabel = `⚠️ Prazo estendido até ${Utils.formatDate(act.extended_deadline)}`;
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
   
     content.innerHTML = `
       <div class="page-header">
         <div>
           <div class="page-header-title">Atividades</div>
           <div class="page-header-sub">${isDiretoria ? 'Gerenciar todas as atividades' : 'Suas tarefas e entregas'}</div>
         </div>
         ${isDiretoria ? `<button class="btn btn-primary" id="newActivityBtn"><i class="fa-solid fa-plus"></i> Nova Atividade</button>` : ''}
       </div>
       <div class="filters-bar">
         ${['Todos','Pendente','Em andamento','Concluída','Cancelada'].map(f =>
           `<button class="filter-btn ${f==='Todos'?'active':''}" data-filter="${f}">${f}</button>`
         ).join('')}
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
         loadActivities();
       });
     });
   
     if (isDiretoria) {
       document.getElementById('newActivityBtn')?.addEventListener('click', () => openNewActivityModal(profile, loadActivities));
     }
   
     const modal = document.getElementById('activityModal');
     if (modal && modal.parentElement !== document.body) document.body.appendChild(modal);
     document.getElementById('modalClose').addEventListener('click', () => modal.classList.remove('open'));
     modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
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
     const isOwner = act.assigned_to === profile.id;
     const isLateSubmission = passed && hasExt && canSubmit;
   
     document.getElementById('modalTitle').textContent = act.title;
   
     const { data: responses } = await db
       .from('activity_responses')
       .select('*, user:user_id(name,initials,color)')
       .eq('activity_id', id)
       .order('created_at', { ascending: false });
   
     let deadlineLabel;
     if (passed && hasExt) deadlineLabel = `⚠️ Prazo estendido até ${Utils.formatDate(act.extended_deadline)}`;
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
           <div class="upload-zone-hint">PDF, DOC, XLSX, PPTX, PNG, JPG — máx. 10MB</div>
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
   
     document.getElementById('cancelModal')?.addEventListener('click', () => modal.classList.remove('open'));
   
     // File upload
     document.getElementById('uploadZone')?.addEventListener('click', () => document.getElementById('fileInput').click());
     document.getElementById('fileInput')?.addEventListener('change', () => {
       const f = document.getElementById('fileInput').files[0];
       if (f) { document.getElementById('fileChosen').textContent = `📎 ${f.name}`; document.getElementById('fileChosen').style.display = 'block'; }
     });
   
     // Submit response
     document.getElementById('submitActivity')?.addEventListener('click', async () => {
       const text = document.getElementById('responseText')?.value.trim();
       if (!text) { document.getElementById('responseText').style.borderColor = 'var(--red-bright)'; return; }
       const btn = document.getElementById('submitActivity');
       btn.disabled = true; btn.textContent = 'Enviando...';
   
       let file_url = null, file_name = null;
       const fileInput = document.getElementById('fileInput');
       if (fileInput?.files[0]) {
         const file = fileInput.files[0];
         const path = `${profile.id}/${id}/${Date.now()}_${file.name}`;
         const { data: upData, error: upErr } = await db.storage.from('activity-files').upload(path, file);
         if (!upErr && upData) {
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
           await db.rpc('notify_member', {
             p_user_id: act.assigned_to,
             p_message: `A Diretoria comentou na atividade "${act.title}"`,
             p_type: 'activity', p_icon: '📋'
           });
         } else {
           await db.rpc('notify_diretoria', {
             p_message: `${profile.name} enviou resposta para "${act.title}"`,
             p_type: 'activity', p_icon: '📋'
           });
         }
         modal.classList.remove('open');
         Utils.showToast(isOwner && isLateSubmission ? 'Resposta enviada (com atraso)!' : 'Resposta enviada com sucesso!');
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
       await db.rpc('notify_member', { p_user_id: act.assigned_to, p_message: `Sua atividade "${act.title}" foi marcada como concluída.`, p_type: 'approval', p_icon: '✅' });
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
   
     document.getElementById('extDeadlineBtn')?.addEventListener('click', async () => {
       const val = document.getElementById('extDeadlineInput').value;
       if (!val) { Utils.showToast('Selecione uma data.','error'); return; }
       const { error } = await db.from('activities').update({ extended_deadline: val }).eq('id', id);
       if (!error) { Utils.showToast('Prazo estendido!'); setTimeout(() => initAtividades(), 300); modal.classList.remove('open'); }
       else Utils.showToast('Erro ao estender prazo.', 'error');
     });
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
       <div class="form-group" style="margin-bottom:14px">
         <label class="form-label">Atribuir para *</label>
         <select class="form-input form-select" id="na-member">
           <option value="">Selecione um membro...</option>
           ${(members||[]).map(m => `<option value="${m.id}">${Utils.escapeHtml(m.name)} — ${Utils.escapeHtml(m.role)}</option>`).join('')}
         </select>
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
   
     document.getElementById('cancelModal').addEventListener('click', () => modal.classList.remove('open'));
   
     document.getElementById('createActivityBtn').addEventListener('click', async () => {
       const title    = document.getElementById('na-title').value.trim();
       const memberId = document.getElementById('na-member').value;
       const deadline = document.getElementById('na-deadline').value;
       const priority = document.getElementById('na-priority').value;
       const desc     = document.getElementById('na-desc').value.trim();
       const opens    = document.getElementById('na-opens').value;
       const closes   = document.getElementById('na-closes').value;
   
       if (!title || !memberId || !deadline || !desc) {
         Utils.showToast('Preencha todos os campos obrigatórios.', 'error'); return;
       }
   
       const btn = document.getElementById('createActivityBtn');
       btn.disabled = true; btn.textContent = 'Criando...';
   
       const payload = { title, description: desc, assigned_to: memberId, assigned_by: profile.id, deadline, priority };
       if (opens) payload.opens_at = new Date(opens).toISOString();
       if (closes) payload.closes_at = new Date(closes).toISOString();
   
       const { error } = await db.from('activities').insert(payload);
   
       if (!error) {
         // Coleta canais selecionados pela Diretoria
         const channels = [];
         if (document.getElementById('na-notif-push')?.checked)  channels.push('push');
         if (document.getElementById('na-notif-email')?.checked) channels.push('email');
   
         // Dispara notificação respeitando prefs do membro
         await NotifPrefs.dispatch(memberId, {
           message:  `Nova atividade atribuída: "${title}". Prazo: ${Utils.formatDate(deadline)}`,
           type:     'activity',
           icon:     '📋',
           link:     'atividades.html',
           channels,
         });
   
         modal.classList.remove('open');
         Utils.showToast('Atividade criada com sucesso!');
         setTimeout(onSuccess, 300);
       } else {
         Utils.showToast('Erro ao criar atividade.', 'error');
         btn.disabled = false; btn.textContent = 'Criar Atividade';
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
               ${isDiretoria ? `
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
         ${isDiretoria ? `<button class="btn btn-primary" id="newComBtn"><i class="fa-solid fa-plus"></i> Novo Comunicado</button>` : ''}
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
   async function initMembros() {
     const profile = await renderSidebar('membros');
     if (!profile) return;
     await renderTopBar('Membros', profile);
   
     const content = document.getElementById('pageContent');
     Utils.showLoading(content);
   
     const isDiretoria = profile.tier === 'diretoria';
   
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
           ${isDiretoria ? `<button class="filter-btn" data-filter="pendente" style="color:#eab308;border-color:rgba(234,179,8,.3)">Pendentes</button>` : ''}
         </div>
       </div>
       <div class="members-grid" id="membersGrid">
         ${(members||[]).map(m => `
           <div class="member-card ${m.tier==='diretoria'?'diretoria':''} card-enter" data-tier="${m.tier}" data-status="${m.status}" data-name="${Utils.escapeHtml(m.name).toLowerCase()}" style="cursor:pointer">
             ${m.status === 'pendente' ? '<div style="position:absolute;top:10px;right:10px"><span class="badge badge-pending">Pendente</span></div>' : ''}
             <div class="avatar" style="width:64px;height:64px;font-size:1.1rem;margin:0 auto 14px;background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a);border-color:${m.tier==='diretoria'?'var(--border-gold)':'var(--border-faint)'}">
               ${m.avatar_url ? `<img src="${m.avatar_url}" alt="${Utils.escapeHtml(m.name)}">` : (m.initials||Utils.getInitials(m.name))}
             </div>
             <div class="member-name">${Utils.escapeHtml(m.name)}</div>
             <div class="member-role-text">${Utils.escapeHtml(m.role)}</div>
             <div class="member-join"><i class="fa-regular fa-calendar"></i> ${Utils.formatDate(m.join_date)}</div>
             <div class="member-tier-badge">${Utils.tierBadge(m.tier)}</div>
             ${isDiretoria ? `
               <div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap;justify-content:center" onclick="event.stopPropagation()">
                 ${m.status === 'pendente' ? `<button class="btn btn-sm btn-primary approve-btn" data-id="${m.id}"><i class="fa-solid fa-check"></i> Aprovar</button>` : ''}
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
                 ${m.id !== profile.id ? `
                   <button class="btn btn-sm btn-ghost remove-btn" data-id="${m.id}" style="color:var(--red-bright)">
                     <i class="fa-solid fa-user-slash"></i>
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
         if (found) openMemberProfileModal(found, profile, isDiretoria, members);
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
   
     // Remove
     content.querySelectorAll('.remove-btn').forEach(btn => {
       btn.addEventListener('click', async () => {
         if (!confirm('Desativar este membro?')) return;
         await db.from('profiles').update({ status: 'inativo' }).eq('id', btn.dataset.id);
         Utils.showToast('Membro desativado.');
         initMembros();
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
   
   async function openMemberProfileModal(m, currentProfile, isDiretoria, allMembers) {
     const modal = document.getElementById('memberProfileModal');
     const body  = document.getElementById('memberProfileBody');
     const footer = document.getElementById('memberProfileFooter');
   
     document.getElementById('memberProfileTitle').textContent = 'Perfil do Membro';
   
     // Injetar ID do membro no body para uso pelo modules2.js (badges)
     body.dataset.memberId = m.id;
   
     // Fetch stats
     const statsRes = await db.rpc('get_member_stats', { p_user_id: m.id });
     const stats = statsRes.data || { total: 0, concluidas: 0, andamento: 0, pendentes: 0 };
   
     // Time in ordem
     const joinDate = new Date(m.join_date + 'T00:00:00');
     const now = new Date();
     const diffDays = Math.floor((now - joinDate) / (1000 * 60 * 60 * 24));
     const months = Math.floor(diffDays / 30);
     const timeLabel = months >= 1 ? `${months} ${months === 1 ? 'mês' : 'meses'}` : `${diffDays} dias`;
   
     body.innerHTML = `
       <div class="member-profile-hero">
         <div class="member-profile-hero-avatar" style="background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a)">
           ${m.avatar_url ? `<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : (m.initials||Utils.getInitials(m.name))}
         </div>
         <div style="flex:1">
           <div class="member-profile-info-name">${Utils.escapeHtml(m.name)}</div>
           <div class="member-profile-info-role">${Utils.escapeHtml(m.role)}</div>
           <div style="display:flex;gap:8px;flex-wrap:wrap">
             ${Utils.tierBadge(m.tier)}
             <span class="badge ${m.status==='ativo'?'badge-done':m.status==='inativo'?'badge-red':'badge-pending'}">${m.status.charAt(0).toUpperCase()+m.status.slice(1)}</span>
           </div>
         </div>
       </div>
   
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
   
       <div class="member-profile-stats-row">
         <div class="member-profile-stat">
           <div class="member-profile-stat-num">${stats.total||0}</div>
           <div class="member-profile-stat-lbl">Total</div>
         </div>
         <div class="member-profile-stat">
           <div class="member-profile-stat-num">${stats.concluidas||0}</div>
           <div class="member-profile-stat-lbl">Concluídas</div>
         </div>
         <div class="member-profile-stat">
           <div class="member-profile-stat-num">${stats.andamento||0}</div>
           <div class="member-profile-stat-lbl">Em andamento</div>
         </div>
         <div class="member-profile-stat">
           <div class="member-profile-stat-num">${stats.pendentes||0}</div>
           <div class="member-profile-stat-lbl">Pendentes</div>
         </div>
       </div>
     `;
   
     footer.innerHTML = isDiretoria && m.id !== currentProfile.id
       ? `<button class="btn btn-ghost" id="closeMemberProfile">Fechar</button>
          <button class="btn btn-primary" id="editMemberProfileBtn"><i class="fa-solid fa-pen"></i> Editar Perfil</button>`
       : `<button class="btn btn-outline" id="closeMemberProfile">Fechar</button>`;
   
     modal.classList.add('open');
   
     document.getElementById('closeMemberProfile').addEventListener('click', () => modal.classList.remove('open'));
   
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
     { id:2, name:'MSY Analytics Semanal', icon:'📊', description:'Painel de métricas e KPIs coletivos da Ordem, atualizado semanalmente via análise de WhatsApp.', status:'Online', url:'https://t4msy.github.io/MSY-ANALYTICS/' },
     { id:3, name:'MSY Analytics Mensal',  icon:'📈', description:'Relatório consolidado mensal com análise profunda e comparativo histórico da Ordem.', status:'Online', url:'https://t4msy.github.io/Msy-Analitycs-Mensal-2/' },
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
   
     async function loadEventos() {
       const tab = document.getElementById('evTab');
       if (!tab) return;
       tab.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i></div>`;
   
       const { data: evs, error } = await db.from('events')
         .select('*, creator:created_by(name,initials,color)')
         .order('event_date', { ascending: false });
   
       if (error) { Utils.showToast('Erro ao carregar eventos.', 'error'); return; }
   
       const today = new Date().toISOString().split('T')[0];
       const upcoming = (evs||[]).filter(e => e.event_date >= today);
       const past     = (evs||[]).filter(e => e.event_date < today);
   
       tab.innerHTML = `
         ${isDiretoria ? `
           <div style="margin-bottom:18px">
             <button class="btn btn-primary" id="newEventBtn"><i class="fa-solid fa-plus"></i> Novo Evento</button>
           </div>` : ''}
   
         ${upcoming.length > 0 ? `
           <div style="font-size:.78rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">Próximos Eventos</div>
           ${upcoming.map(ev => renderEventCard(ev, isDiretoria)).join('')}
         ` : `<div class="empty-state" style="padding:30px"><div class="empty-state-icon"><i class="fa-solid fa-calendar-xmark"></i></div><div class="empty-state-text">Nenhum evento agendado.</div></div>`}
   
         ${past.length > 0 ? `
           <div style="font-size:.78rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-top:24px;margin-bottom:12px">Eventos Passados</div>
           ${past.map(ev => renderEventCard(ev, isDiretoria, true)).join('')}
         ` : ''}
       `;
   
       document.getElementById('newEventBtn')?.addEventListener('click', () => openNewEventModal(profile, loadEventos));
   
       tab.querySelectorAll('.delete-event-btn').forEach(btn => {
         btn.addEventListener('click', async e => {
           e.stopPropagation();
           if (!confirm('Excluir este evento?')) return;
           const { error } = await db.from('events').delete().eq('id', btn.dataset.id);
           if (!error) { Utils.showToast('Evento excluído.'); loadEventos(); }
           else Utils.showToast('Erro ao excluir.', 'error');
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
         <button class="filter-btn" data-tab="atas"><i class="fa-solid fa-file-lines"></i> Atas de Reunião</button>
       </div>
       <div id="evTab"></div>
   
       <!-- New Event Modal -->
       <div class="modal-overlay" id="newEventModal">
         <div class="modal" style="max-width:560px">
           <div class="modal-header">
             <div class="modal-title"><i class="fa-solid fa-calendar-plus" style="color:var(--gold)"></i> Novo Evento</div>
             <button class="modal-close" id="newEventClose"><i class="fa-solid fa-xmark"></i></button>
           </div>
           <div class="modal-body">
             <div class="form-group" style="margin-bottom:14px">
               <label class="form-label">Título *</label>
               <input class="form-input" id="ev-title" placeholder="Nome do evento">
             </div>
             <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px">
               <div class="form-group">
                 <label class="form-label">Data *</label>
                 <input class="form-input" type="date" id="ev-date">
               </div>
               <div class="form-group">
                 <label class="form-label">Horário</label>
                 <input class="form-input" type="time" id="ev-time" value="19:00">
               </div>
               <div class="form-group">
                 <label class="form-label">Tipo</label>
                 <select class="form-input form-select" id="ev-type">
                   <option>Reunião</option><option>Treinamento</option>
                   <option>Evento Social</option><option>Cerimonial</option><option>Outro</option>
                 </select>
               </div>
             </div>
             <div class="form-group" style="margin-bottom:14px">
               <label class="form-label"><i class="fa-solid fa-user-pen" style="color:var(--gold)"></i> Criador do Evento * <span style="font-size:.7rem;color:var(--text-3);font-weight:400">(obrigatório — impacta desempenho)</span></label>
               <select class="form-input form-select" id="ev-creator">
                 <option value="">Selecione o criador...</option>
               </select>
             </div>
             <div class="form-group" style="margin-bottom:14px">
               <label class="form-label" style="display:flex;justify-content:space-between;align-items:center">
                 <span><i class="fa-solid fa-users" style="color:var(--gold)"></i> Co-criadores <span style="font-size:.7rem;color:var(--text-3);font-weight:400">(recebem crédito no desempenho)</span></span>
                 <button type="button" class="btn btn-ghost btn-sm" id="ev-add-helper" style="font-size:.65rem;padding:3px 10px"><i class="fa-solid fa-plus"></i> Adicionar</button>
               </label>
               <div id="ev-helpers-wrap">
                 <select class="form-input form-select ev-helper-sel" style="margin-bottom:6px">
                   <option value="">Nenhum co-criador</option>
                 </select>
               </div>
               <div style="font-size:.68rem;color:var(--text-3)">Máximo de 5 co-criadores por evento.</div>
             </div>
             <div class="form-group" style="margin-bottom:14px">
               <label class="form-label">Descrição</label>
               <textarea class="form-input form-textarea" id="ev-desc" style="min-height:80px" placeholder="Detalhes do evento..."></textarea>
             </div>
             <div style="display:flex;gap:18px;flex-wrap:wrap">
               <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.84rem;color:var(--text-2)">
                 <input type="checkbox" id="ev-mandatory"> Presença obrigatória
               </label>
               <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.84rem;color:#c084fc">
                 <input type="checkbox" id="ev-private" style="accent-color:#a855f7">
                 <i class="fa-solid fa-lock" style="font-size:.75rem"></i> Reunião interna (só Diretoria)
               </label>
             </div>
           </div>
           <div class="modal-footer">
             <button class="btn btn-ghost" id="newEventCancel">Cancelar</button>
             <button class="btn btn-primary" id="newEventSave"><i class="fa-solid fa-calendar-plus"></i> Criar Evento</button>
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
         else if (activeTab === 'atas') loadAtas();
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
   
   function renderEventCard(ev, isDiretoria, isPast = false) {
     return `
       <div class="card card-enter" style="margin-bottom:12px;${isPast?'opacity:.65':''}">
         <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
           <div style="flex:1">
             <div style="font-weight:600;color:var(--text-1);margin-bottom:4px">${Utils.escapeHtml(ev.title)}</div>
             <div style="font-size:.78rem;color:var(--text-3);display:flex;flex-wrap:wrap;gap:10px">
               <span><i class="fa-regular fa-calendar"></i> ${Utils.formatDate(ev.event_date)}</span>
               <span><i class="fa-regular fa-clock"></i> ${ev.event_time}</span>
               <span><i class="fa-solid fa-tag"></i> ${Utils.escapeHtml(ev.type)}</span>
             </div>
             ${ev.description ? `<div style="font-size:.83rem;color:var(--text-2);margin-top:8px">${Utils.escapeHtml(ev.description)}</div>` : ''}
           </div>
           <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
             ${ev.mandatory ? '<span class="badge badge-red" style="font-size:.62rem">Obrigatório</span>' : '<span class="badge badge-gold" style="font-size:.62rem">Opcional</span>'}
             ${isDiretoria ? `<button class="btn btn-ghost btn-sm delete-event-btn" data-id="${ev.id}" style="color:var(--red-bright)"><i class="fa-solid fa-trash" style="font-size:.7rem"></i></button>` : ''}
           </div>
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
         Utils.showToast('Erro ao criar evento.', 'error');
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
     const profile = await Auth.requireAuth();
     if (!profile) return;
     if (profile.tier !== 'diretoria') { window.location.href = 'dashboard.html'; return; }
   
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
   
     // Fetch stats
     const statsRes = await db.rpc('get_member_stats', { p_user_id: profile.id });
     const stats = statsRes.data || { total: 0, concluidas: 0, andamento: 0, pendentes: 0 };
   
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
   
         </div>
       </div>
     `;
   
     // Carregar insígnias do perfil (via modules.js)
     if (typeof renderBadgesNoPerfil === 'function') {
       renderBadgesNoPerfil(profile.id, 'profileBadgesContainer');
     }
   
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
       db.from('event_presencas').select('membro_id,status'),
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
         if (p.status==='confirmado') presConf[p.membro_id] = (presConf[p.membro_id]||0)+1;
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
   
   document.addEventListener('DOMContentLoaded', () => {
     const page = document.body.dataset.page;
     const init = {
       login:       initLogin,
       dashboard:   initDashboard,
       atividades:  initAtividades,
       comunicados: initComunicados,
       membros:     initMembros,
       perfil:      initPerfil,
       eventos:     initEventos,
       tecnologias: initTecnologias,
       admin:       initAdmin,
       // Módulos v3.0 — gerenciados em modules.js
       // biblioteca, premiacoes, ordem são roteados via extraRoutes em modules.js
     };
     init[page]?.();
   });