import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Linking, StatusBar, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { registerGlobals } from '@livekit/react-native-webrtc'
import type { Session } from '@supabase/supabase-js'
import { canAccessSpace, friendly, joinByCode, myProfile, voiceRooms, type Profile, type Room } from './src/lib/api'
import { supabase } from './src/lib/supabase'
import { LoginScreen } from './src/screens/LoginScreen'
import { RoomScreen } from './src/screens/RoomScreen'
import { RoomsScreen } from './src/screens/RoomsScreen'
import { Btn, s } from './src/ui/components'
import { colors } from './src/ui/theme'

// RTCPeerConnection, MediaStream etc. como globais: a camada WebRTC do site usa as APIs padrão.
registerGlobals()

/** Link de sala do site: https://portalmsy.site/space.html?sala=CODIGO */
function codeFromUrl(url: string | null): string | null {
  const m = url?.match(/[?&]sala=([A-Za-z0-9-]+)/)
  return m?.[1] ?? null
}

type Access = 'loading' | 'yes' | 'no'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [access, setAccess] = useState<Access>('loading')
  const [loading, setLoading] = useState(true)
  const [room, setRoom] = useState<Room | null>(null)
  const [pendingCode, setPendingCode] = useState<string | null>(null)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess)
      if (!sess) {
        setProfile(null)
        setRoom(null)
        setAccess('loading')
        setLoading(false)
      }
    })
    void Linking.getInitialURL().then((u) => setPendingCode(codeFromUrl(u)))
    const sub = Linking.addEventListener('url', ({ url }) => setPendingCode(codeFromUrl(url)))
    return () => {
      data.subscription.unsubscribe()
      sub.remove()
    }
  }, [])

  const checkAccess = async (userId: string) => {
    try {
      const [p, ok] = await Promise.all([myProfile(userId), canAccessSpace()])
      setProfile(p)
      setAccess(ok ? 'yes' : 'no')
    } catch (e) {
      Alert.alert('MSY Space', friendly(e))
      setAccess('no')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session) void checkAccess(session.user.id)
  }, [session])

  // Link de sala aberto no celular: entra na sala depois do login.
  useEffect(() => {
    if (!pendingCode || access !== 'yes') return
    const code = pendingCode
    setPendingCode(null)
    joinByCode(code)
      .then(async (id) => {
        const r = (await voiceRooms()).find((x) => x.id === id)
        if (r) setRoom(r)
      })
      .catch((e: unknown) => Alert.alert('Sala', friendly(e)))
  }, [pendingCode, access])

  let content
  if (loading || (session && access === 'loading')) {
    content = (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    )
  } else if (!session) {
    content = <LoginScreen />
  } else if (access !== 'yes') {
    content = (
      <View style={[s.screen, { justifyContent: 'center', padding: 24 }]}>
        <Text style={[s.h1, { marginBottom: 8 }]}>Sem acesso ao MSY Space</Text>
        <Text style={s.muted}>O MSY Space é liberado pela Diretoria (permissão "Acessar o MSY Space" no portal).</Text>
        <Btn title="Verificar de novo" onPress={() => void checkAccess(session.user.id)} />
        <Btn title="Sair da conta" tone="secondary" onPress={() => void supabase.auth.signOut()} />
      </View>
    )
  } else if (room) {
    content = <RoomScreen key={room.id} room={room} userId={session.user.id} onBack={() => setRoom(null)} />
  } else {
    content = <RoomsScreen displayName={profile?.name?.split(' ')[0] ?? 'membro'} onOpen={setRoom} />
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.ink900} />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink900 }}>{content}</SafeAreaView>
    </SafeAreaProvider>
  )
}
