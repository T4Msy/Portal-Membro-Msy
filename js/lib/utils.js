/* ============================================================
   MSY PORTAL — LIB/UTILS.JS
   Utilitários puros — sem dependências de DOM ou Supabase.
   Exportados como ES Module para uso em js/pages/*.
   O objeto Utils em app.js permanece intacto (compatibilidade).
   ============================================================ */

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatActivityDeadline(deadlineDate, deadlineTime = null) {
  if (deadlineDate && typeof deadlineDate === 'object') {
    return formatActivityDeadline(deadlineDate.deadline, deadlineDate.deadline_time);
  }
  if (!deadlineDate) return '—';
  const time = String(deadlineTime || '23:59:59');
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const d = new Date(`${deadlineDate}T${normalizedTime}`);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function getActivityDeadlineDate(act) {
  if (!act?.deadline) return null;
  const time = String(act.deadline_time || '23:59:59');
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  return new Date(`${act.deadline}T${normalizedTime}`);
}

export function daysUntilActivityDeadline(act) {
  const deadline = getActivityDeadlineDate(act);
  if (!deadline || Number.isNaN(deadline.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(deadline);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

export function formatNameList(names, maxItems = 3) {
  const list = (names || []).map(name => String(name || '').trim()).filter(Boolean);
  if (!list.length) return '—';
  if (list.length <= maxItems) {
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} e ${list[1]}`;
    return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
  }
  return `${list.slice(0, maxItems).join(', ')} e mais ${list.length - maxItems}`;
}

export function daysDiff(dateStr) {
  const now    = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

export function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = String(text || '');
  return d.innerHTML;
}

export function getInitials(name) {
  return (name || '??').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export function statusBadge(status) {
  const map = {
    'Pendente':    'badge-pending',
    'Em andamento':'badge-progress',
    'Concluída':   'badge-done',
    'Cancelada':   'badge-red',
  };
  return `<span class="badge ${map[status] || 'badge-gold'}">${status}</span>`;
}

export function tierBadge(tier) {
  return tier === 'diretoria'
    ? `<span class="badge badge-red">Diretoria</span>`
    : `<span class="badge badge-gold">Membro</span>`;
}

export function techStatusBadge(status) {
  const map = { 'Online': 'badge-done', 'Beta': 'badge-progress', 'Em breve': 'badge-pending' };
  return `<span class="badge ${map[status] || 'badge-gold'}">${status}</span>`;
}
