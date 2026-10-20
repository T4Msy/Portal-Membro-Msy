import { supabase } from './supabase'

/** Perfil do portal (tabela public.profiles do Portal de Membro MSY). */
export interface Profile {
  id: string
  name: string
  color: string | null
  avatar_url: string | null
}

export interface Room {
  id: string
  name: string
  kind: 'text' | 'voice'
  is_private: boolean
  is_temporary: boolean
  join_code: string | null
  user_limit: number
  position: number
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
  const { data } = await supabase.from('profiles').select('id, name, color, avatar_url').eq('id', userId).maybeSingle()
  return (data as Profile | null) ?? null
}

/** Diretoria ou permissão "Acessar o MSY Space" (mesma regra do site, checada no banco). */
export async function canAccessSpace(): Promise<boolean> {
  const { data, error } = await supabase.rpc('space_can_access')
  if (error) throw error
  return Boolean(data)
}

export async function voiceRooms(): Promise<Room[]> {
  const { data, error } = await supabase
    .from('space_channels')
    .select('id, name, kind, is_private, is_temporary, join_code, user_limit, position')
    .eq('kind', 'voice')
    .order('position')
  if (error) throw error
  return data as Room[]
}

export async function profileNames(): Promise<Map<string, string>> {
  const { data } = await supabase.from('profiles').select('id, name')
  return new Map(((data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]))
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

export async function createRoom(name: string): Promise<{ id: string; code: string }> {
  const { data, error } = await supabase.rpc('space_create_room', { p_name: name.trim() })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; join_code: string }
  return { id: row.id, code: row.join_code }
}
