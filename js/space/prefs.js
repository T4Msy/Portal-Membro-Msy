// Preferências de voz do MSY Space (dispositivos, volumes por pessoa, preset de tela).
// Ficam em public.space_preferences — não mexem no profile do portal.
import { supabase } from './lib/supabase.js';

export class SpacePrefs {
  constructor(userId) {
    this.userId = userId;
    this.value = {};
    this.saveTimer = null;
    this.dirty = false;
    // Token guardado para conseguir salvar na hora de fechar a aba (sem tempo para chamadas assíncronas).
    this.token = null;
    supabase.auth.getSession().then(({ data }) => { this.token = data.session?.access_token || null; }).catch(() => undefined);
    supabase.auth.onAuthStateChange((_e, session) => { this.token = session?.access_token || null; });
  }

  async load() {
    const { data, error } = await supabase.from('space_preferences').select('preferences').eq('user_id', this.userId).maybeSingle();
    if (error) console.warn('[MSY][space] Preferências indisponíveis:', error);
    this.value = data?.preferences || {};
    return this.value;
  }

  get() { return this.value; }

  /** Atualiza na hora e grava agrupado (arrastar um volume não vira dezenas de gravações). */
  update(patch) {
    this.value = { ...this.value, ...patch };
    this.dirty = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 800);
    return this.value;
  }

  row() { return { user_id: this.userId, preferences: this.value, updated_at: new Date().toISOString() }; }

  async flush() {
    clearTimeout(this.saveTimer);
    if (!this.dirty) return;
    this.dirty = false;
    try {
      const { error } = await supabase.from('space_preferences').upsert(this.row());
      if (error) throw error;
    } catch (error) {
      this.dirty = true;
      console.warn('[MSY][space] Falha ao salvar preferências:', error);
    }
  }

  /** Fechando a aba: grava com `keepalive`, que o navegador completa mesmo depois da página sair. */
  flushOnExit() {
    clearTimeout(this.saveTimer);
    if (!this.dirty) return;
    if (!this.token || typeof MSY_CONFIG === 'undefined') { this.flush(); return; }
    this.dirty = false;
    try {
      fetch(`${MSY_CONFIG.SUPABASE_URL}/rest/v1/space_preferences?on_conflict=user_id`, {
        method: 'POST',
        keepalive: true,
        headers: {
          apikey: MSY_CONFIG.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(this.row()),
      }).catch(() => undefined);
    } catch (err) {
      console.warn('[MSY][space] Falha ao salvar preferências ao sair:', err);
    }
  }
}
