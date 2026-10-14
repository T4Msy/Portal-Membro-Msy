// Preferências de voz do MSY Space (dispositivos, volumes por pessoa, preset de tela).
// Ficam em public.space_preferences — não mexem no profile do portal.
import { supabase } from './lib/supabase.js';

export class SpacePrefs {
  constructor(userId) {
    this.userId = userId;
    this.value = {};
    this.saveTimer = null;
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
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 800);
    return this.value;
  }

  async flush() {
    clearTimeout(this.saveTimer);
    const { error } = await supabase.from('space_preferences')
      .upsert({ user_id: this.userId, preferences: this.value, updated_at: new Date().toISOString() });
    if (error) console.warn('[MSY][space] Falha ao salvar preferências:', error);
  }
}
