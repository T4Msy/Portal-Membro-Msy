import { supabase } from './supabase'

/** Perfil do portal (tabela public.profiles do Portal de Membro MSY). */
export interface Profile {
  id: string
  name: string
  initials?: string | null
  color: string | null
  avatar_url: string | null
}

export interface Category {
  id: string
  name: string
  position: number
}

export interface Room {
  id: string
  category_id: string | null
  name: string
  kind: 'text' | 'voice'
  is_private: boolean
  is_temporary: boolean
  join_code: string | null
  user_limit: number
  position: number
  created_by?: string | null
}

/** Erros do banco/Auth em português (mesmos códigos do site do MSY Space). */
export function friendly(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err ?? '')
  if (/Invalid login credentials/i.test(raw)) return 'E-mail ou senha incorretos.'
  if (/Email not confirmed/i.test(raw)) return 'Confirme seu e-mail antes de entrar.'
  if (/ROOM_NOT_FOUND/.test(raw)) return 'Nenhuma sala com esse código. Ela pode ter sido encerrada.'
  if (/ROOM_LIMIT/.test(raw)) return 'Você já tem 3 salas abertas.'
  if (/FORBIDDEN/.test(raw)) return 'Você não tem permissão para isso.'
  if (/rate limit|too many/i.test(raw)) return 'Muitas tentativas. Aguarde um pouco.'
  if (/NotAllowedError|Permission/i.test(raw)) return 'Permissão negada.'
  if (/Network|fetch/i.test(raw)) return 'Sem conexão com o servidor.'
  return raw || 'Algo deu errado.'
}

/** Mesmo login do portal (e-mail e senha). */
export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
}

export async function myProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('id, name, initials, color, avatar_url').eq('id', userId).maybeSingle()
  return (data as Profile | null) ?? null
}

/** Diretoria ou permissão "Acessar o MSY Space" (mesma regra do site, checada no banco). */
export async function canAccessSpace(): Promise<boolean> {
  const { data, error } = await supabase.rpc('space_can_access')
  if (error) throw error
  return Boolean(data)
}

const CHANNEL_FIELDS = 'id, category_id, name, kind, is_private, is_temporary, join_code, user_limit, position, created_by'

export async function voiceRooms(): Promise<Room[]> {
  const { data, error } = await supabase.from('space_channels').select(CHANNEL_FIELDS).eq('kind', 'voice').order('position')
  if (error) throw error
  return data as Room[]
}

/** Estrutura do Space (igual ao site): categorias, todos os canais e perfis ativos do portal. */
export async function loadWorkspace(): Promise<{ categories: Category[]; channels: Room[]; profiles: Map<string, Profile> }> {
  const [cats, chans, profs] = await Promise.all([
    supabase.from('space_categories').select('id, name, position').order('position'),
    supabase.from('space_channels').select(CHANNEL_FIELDS).order('position').order('created_at'),
    supabase.from('profiles').select('id, name, initials, color, avatar_url').eq('status', 'ativo'),
  ])
  if (cats.error) throw cats.error
  if (chans.error) throw chans.error
  if (profs.error) throw profs.error
  return {
    categories: (cats.data ?? []) as Category[],
    channels: (chans.data ?? []) as Room[],
    profiles: new Map(((profs.data ?? []) as Profile[]).map((p) => [p.id, p])),
  }
}

export function normalizeCode(raw: string): string {
  const v = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return v.length === 8 ? `${v.slice(0, 4)}-${v.slice(4)}` : v
}

export async function joinByCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('space_join_room', { p_code: normalizeCode(code) })
  if (error) throw error
  return String(data)
}

/** Gestão do Space (pode encerrar qualquer sala com código). */
export async function canManageSpace(): Promise<boolean> {
  const { data } = await supabase.rpc('space_can_manage')
  return data === true
}

/** Encerra uma sala com código (quem criou ou a gestão; regra no banco). */
export async function deleteRoom(id: string): Promise<void> {
  const { error } = await supabase.rpc('space_delete_room', { p_channel: id })
  if (error) throw error
}

export async function createRoom(name: string): Promise<{ id: string; code: string }> {
  const { data, error } = await supabase.rpc('space_create_room', { p_name: name.trim() })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; join_code: string }
  return { id: row.id, code: row.join_code }
}
