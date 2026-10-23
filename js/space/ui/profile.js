import { supabase } from '../lib/supabase.js';
import { avatarHtml, displayName, esc, icon, safeColor, toast } from './dom.js';
import { matchesProfileImageSignature, PROFILE_IMAGE_TYPES } from './profile-image.js';

const BUCKET = 'space-profile-media';

export function openProfileCard({ profile, ownProfile, workspace }) {
  if (!profile) return;
  const wrap = document.createElement('div');
  wrap.className = 'modal-overlay open sp-modal sp-profile-modal';
  const render = (editing = false, error = '') => {
    const current = workspace.profile(profile.id) || profile;
    wrap.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-label="Perfil de ${esc(displayName(current))}">
      <button class="modal-close sp-profile-close" data-close aria-label="Fechar">${icon('fa-xmark')}</button>
      <div class="sp-profile-banner" style="--profile-accent:${safeColor(current.color, '#a855f7')};${current.banner_url ? `background-image:url('${esc(current.banner_url)}')` : ''}"></div>
      <div class="sp-profile-card" style="--profile-accent:${safeColor(current.color, '#a855f7')}">
        ${avatarHtml(current, 88, 'sp-profile-avatar')}
        ${editing ? `<form class="sp-profile-form">
          <div class="sp-profile-preview"><strong data-preview-name>${esc(current.name || '')}</strong><p data-preview-bio>${current.bio ? esc(current.bio) : 'Sua biografia aparecerá aqui.'}</p></div>
          <label class="sp-profile-field">Nome de exibição<input name="display_name" minlength="2" maxlength="32" required value="${esc(current.name || '')}"></label>
          <label class="sp-profile-field">Biografia<textarea name="bio" maxlength="190" rows="3" placeholder="Conte um pouco sobre você">${esc(current.bio || '')}</textarea><small><span data-count>${(current.bio || '').length}</span>/190</small></label>
          <label class="sp-profile-field">Cor de destaque<div class="sp-profile-color"><input name="accent_color" type="color" value="${safeColor(current.color, '#a855f7')}"><span>Personaliza detalhes do seu cartão</span></div></label>
          <div class="sp-profile-uploads">
            <label>Foto de perfil<input type="file" name="avatar" accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"><small>JPEG, PNG, WebP ou GIF · até 8 MB</small></label>
            <button type="button" class="btn btn-ghost btn-sm" data-remove="avatar">Remover foto</button>
            <label>Banner<input type="file" name="banner" accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"><small>JPEG, PNG, WebP ou GIF · até 8 MB</small></label>
            <button type="button" class="btn btn-ghost btn-sm" data-remove="banner">Remover banner</button>
          </div>
          ${error ? `<p class="sp-profile-error" role="alert">${esc(error)}</p>` : ''}
          <div class="sp-profile-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Salvar perfil</button></div>
        </form>` : `<h2>${esc(displayName(current))}</h2><p class="sp-profile-bio">${current.bio ? esc(current.bio) : '<span>Este membro ainda não adicionou uma biografia.</span>'}</p>
          ${ownProfile ? `<button class="btn btn-primary" data-edit>${icon('fa-pen')} Editar perfil</button>` : ''}`}
      </div>
    </section>`;
  };
  render();
  document.body.appendChild(wrap);
  let removals = new Set();
  const previews = new Map();
  const close = () => { for (const url of previews.values()) URL.revokeObjectURL(url); wrap.remove(); };
  const clearDraft = () => { removals.clear(); for (const url of previews.values()) URL.revokeObjectURL(url); previews.clear(); };
  wrap.addEventListener('click', async (event) => {
    if (event.target === wrap || event.target.closest('[data-close]')) return close();
    if (event.target.closest('[data-edit]')) { clearDraft(); render(true); return; }
    if (event.target.closest('[data-cancel]')) { clearDraft(); render(false); return; }
    const remove = event.target.closest('[data-remove]');
    if (remove) {
      removals.add(remove.dataset.remove);
      const input = wrap.querySelector(`input[name="${remove.dataset.remove}"]`);
      if (input) input.value = '';
      const preview = previews.get(remove.dataset.remove);
      if (preview) { URL.revokeObjectURL(preview); previews.delete(remove.dataset.remove); }
      remove.textContent = `${remove.dataset.remove === 'avatar' ? 'Foto' : 'Banner'} será removido ao salvar`;
      if (remove.dataset.remove === 'avatar') {
        const avatar = wrap.querySelector('.sp-profile-avatar');
        if (avatar) avatar.outerHTML = avatarHtml({ ...workspace.profile(profile.id), avatar_url: null }, 88, 'sp-profile-avatar');
      } else {
        const banner = wrap.querySelector('.sp-profile-banner');
        if (banner) banner.style.backgroundImage = 'none';
      }
    }
  });
  wrap.addEventListener('input', (event) => {
    if (event.target.name === 'bio') wrap.querySelector('[data-count]').textContent = event.target.value.length;
    if (event.target.name === 'bio') wrap.querySelector('[data-preview-bio]').textContent = event.target.value || 'Sua biografia aparecerá aqui.';
    if (event.target.name === 'display_name') wrap.querySelector('[data-preview-name]').textContent = event.target.value || 'Seu nome';
  });
  wrap.addEventListener('change', async (event) => {
    if (event.target.name === 'accent_color') {
      wrap.querySelector('.sp-profile-banner')?.style.setProperty('--profile-accent', safeColor(event.target.value, '#a855f7'));
      wrap.querySelector('.sp-profile-card')?.style.setProperty('--profile-accent', safeColor(event.target.value, '#a855f7'));
      return;
    }
    if (event.target.type !== 'file' || !event.target.files[0]) return;
    const file = event.target.files[0];
    const limit = 8 * 1024 * 1024;
    if (!PROFILE_IMAGE_TYPES.has(file.type) || file.size > limit) {
      toast(`Arquivo inválido. Use JPEG, PNG, WebP ou GIF de até ${limit / 1024 / 1024} MB.`, 'error');
      event.target.value = '';
      return;
    }
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!matchesProfileImageSignature(file.type, bytes)) {
      toast('O conteúdo do arquivo não corresponde ao tipo de imagem informado.', 'error');
      event.target.value = '';
      return;
    }
    const image = new Image();
    const previewUrl = URL.createObjectURL(file);
    const priorPreview = previews.get(event.target.name);
    if (priorPreview) URL.revokeObjectURL(priorPreview);
    previews.set(event.target.name, previewUrl);
    image.onload = () => {
      if (event.target.name === 'avatar') {
        const avatar = wrap.querySelector('.sp-profile-avatar');
        if (avatar) avatar.innerHTML = `<img src="${previewUrl}" alt="Prévia da foto">`;
      } else {
        const banner = wrap.querySelector('.sp-profile-banner');
        if (banner) banner.style.backgroundImage = `url("${previewUrl}")`;
      }
    };
    image.onerror = () => { toast('Não foi possível abrir esta imagem.', 'error'); event.target.value = ''; };
    image.src = previewUrl;
    removals.delete(event.target.name);
  });
  wrap.addEventListener('submit', async (event) => {
    if (!event.target.matches('.sp-profile-form')) return;
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('[data-save]');
    if (!form.reportValidity()) return;
    const name = form.elements.display_name.value.trim();
    if (name.length < 2 || name.length > 32) return toast('O nome deve ter de 2 a 32 caracteres.', 'error');
    button.disabled = true;
    button.textContent = 'Salvando…';
    const old = workspace.profile(profile.id) || profile;
    const uploaded = [];
    try {
      const paths = { avatar_path: old.avatar_path || null, banner_path: old.banner_path || null };
      for (const kind of ['avatar', 'banner']) {
        const key = `${kind}_path`;
        if (removals.has(kind)) paths[key] = null;
        const file = form.elements[kind].files[0];
        if (!file) continue;
        const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
        const path = `${profile.id}/${kind}-${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });
        if (error) throw error;
        uploaded.push(path);
        paths[key] = path;
      }
      const payload = { user_id: profile.id, display_name: name, bio: form.elements.bio.value.trim(),
        accent_color: form.elements.accent_color.value, ...paths, updated_at: new Date().toISOString() };
      const { error } = await supabase.from('space_profiles').upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;
      const prior = [old.avatar_path, old.banner_path].filter(Boolean);
      const keep = new Set([payload.avatar_path, payload.banner_path].filter(Boolean));
      const stale = prior.filter((path) => !keep.has(path));
      if (stale.length) await supabase.storage.from(BUCKET).remove(stale);
      workspace.applySpaceProfile(profile.id, payload);
      toast('Perfil atualizado.');
      for (const url of previews.values()) URL.revokeObjectURL(url);
      previews.clear();
      render(false);
      removals = new Set();
    } catch (error) {
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
      for (const url of previews.values()) URL.revokeObjectURL(url);
      previews.clear();
      console.error('[MSY][space] Falha ao salvar perfil:', error);
      button.disabled = false;
      button.textContent = 'Salvar perfil';
      toast('Não foi possível salvar o perfil. Verifique sua conexão e tente novamente.', 'error');
    }
  });
}
