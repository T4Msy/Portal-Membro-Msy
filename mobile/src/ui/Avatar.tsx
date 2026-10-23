import { Image, Text, View } from 'react-native'
import type { Profile } from '../lib/api'
import { colors } from './theme'

const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i

export function initialsOf(name: string | null | undefined): string {
  const parts = String(name || '?').trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Foto do perfil do portal ou iniciais na cor do membro; anel verde quando está falando. */
export function Avatar({ profile, size = 36, speaking = false }: { profile: Profile | null | undefined; size?: number; speaking?: boolean }) {
  const bg = SAFE_COLOR.test(profile?.color || '') ? (profile?.color as string) : colors.wine
  const ring = speaking ? { borderWidth: Math.max(2, size / 18), borderColor: colors.ok } : null
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, ring]}>
      {profile?.avatar_url ? (
        <Image source={{ uri: profile.avatar_url }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Text style={{ color: colors.white, fontWeight: '700', fontSize: size * 0.38 }}>{profile?.initials || initialsOf(profile?.name)}</Text>
      )}
    </View>
  )
}
