import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ActivityIndicator, Alert, BackHandler, Linking, StatusBar, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { registerGlobals } from '@livekit/react-native-webrtc'
import type { Session } from '@supabase/supabase-js'
import { canAccessSpace, friendly, joinByCode, type Room } from './src/lib/api'
import { SpaceStore } from './src/lib/space'
import { supabase } from './src/lib/supabase'
import { CallScreen } from './src/screens/CallScreen'
import { ChatScreen } from './src/screens/ChatScreen'
import { HomeScreen } from './src/screens/HomeScreen'
import { LoginScreen } from './src/screens/LoginScreen'
import { Btn, s } from './src/ui/components'
import { colors } from './src/ui/theme'
import { usePipMode } from './src/voice/pip'

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
  const [access, setAccess] = useState<Access>('loading')
  const [loading, setLoading] = useState(true)
  const [pendingCode, setPendingCode] = useState<string | null>(null)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess)
      if (!sess) {
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

  const userId = session?.user.id ?? null

  const checkAccess = async () => {
    try {
      setAccess((await canAccessSpace()) ? 'yes' : 'no')
    } catch (e) {
      Alert.alert('MSY Space', friendly(e))
      setAccess('no')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userId) void checkAccess()
  }, [userId])

  let content
  if (loading || (session && access === 'loading')) {
    content = (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    )
  } else if (!session || !userId) {
    content = <LoginScreen />
  } else if (access !== 'yes') {
    content = (
      <View style={[s.screen, { justifyContent: 'center', padding: 24 }]}>
        <Text style={[s.h1, { marginBottom: 8 }]}>Sem acesso ao MSY Space</Text>
        <Text style={s.muted}>O MSY Space é liberado pela Diretoria (permissão "Acessar o MSY Space" no portal).</Text>
        <Btn title="Verificar de novo" onPress={() => void checkAccess()} />
        <Btn title="Sair da conta" tone="secondary" onPress={() => void supabase.auth.signOut()} />
      </View>
    )
  } else {
    content = <Space key={userId} userId={userId} pendingCode={pendingCode} onCodeHandled={() => setPendingCode(null)} />
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.ink900} />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink900 }}>{content}</SafeAreaView>
    </SafeAreaProvider>
  )
}

type Screen = { name: 'home' } | { name: 'chat'; room: Room } | { name: 'call' }

/** Área logada: lista de canais, chat e call. A chamada vive no store e continua entre as telas. */
function Space({ userId, pendingCode, onCodeHandled }: { userId: string; pendingCode: string | null; onCodeHandled: () => void }) {
  const store = useMemo(() => new SpaceStore(userId), [userId])
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const pip = usePipMode()

  useEffect(() => {
    store.start().catch((e: unknown) => Alert.alert('MSY Space', friendly(e)))
    return () => store.stop()
  }, [store])

  // Link de sala aberto no celular: entra direto na call.
  useEffect(() => {
    if (!pendingCode || !snap.ready) return
    onCodeHandled()
    joinByCode(pendingCode)
      .then(async (id) => {
        await store.reload()
        const room = store.channel(id)
        if (room) {
          store.joinVoice(room)
          setScreen({ name: 'call' })
        }
      })
      .catch((e: unknown) => Alert.alert('Sala', friendly(e)))
  }, [pendingCode, snap.ready, store, onCodeHandled])

  // Botão voltar do Android: call/chat → lista (a call continua, como no Discord).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen.name === 'home') return false
      setScreen({ name: 'home' })
      return true
    })
    return () => sub.remove()
  }, [screen.name])

  // Saiu da call (ou ela caiu): sai da tela da call.
  useEffect(() => {
    if (!snap.voice && screen.name === 'call') setScreen({ name: 'home' })
  }, [snap.voice, screen.name])

  if (!snap.ready) {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={[s.muted, { marginTop: 12 }]}>Entrando no MSY Space…</Text>
      </View>
    )
  }

  // Janela flutuante (PiP) mostra sempre a call, mesmo se você saiu do app pela lista.
  if (snap.voice && (screen.name === 'call' || pip)) {
    return <CallScreen store={store} voice={snap.voice} onMinimize={() => setScreen({ name: 'home' })} />
  }
  if (screen.name === 'chat') {
    return <ChatScreen key={screen.room.id} store={store} room={screen.room} onBack={() => setScreen({ name: 'home' })} />
  }
  return <HomeScreen store={store} onOpenChat={(room) => setScreen({ name: 'chat', room })} onOpenCall={() => setScreen({ name: 'call' })} />
}
