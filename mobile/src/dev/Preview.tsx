// SÓ PARA TESTE VISUAL NO EMULADOR (não entra no APK real): telas com dados de exemplo,
// sem login e sem conexão. Ativado trocando o registro em index.js durante o teste.
import { useState } from 'react'
import { StatusBar } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import type { Profile, Room } from '../lib/api'
import { SpaceStore, type SpaceSnapshot } from '../lib/space'
import { CallScreen } from '../screens/CallScreen'
import { ChatScreen } from '../screens/ChatScreen'
import { HomeScreen } from '../screens/HomeScreen'
import { colors } from '../ui/theme'
import type { MobileVoice } from '../voice/MobileVoice'

const people: Profile[] = [
  { id: 'me', name: 'Xitter Dias', color: '#7c3aed', avatar_url: null },
  { id: 'u1', name: 'Marlon Souza', color: '#dc2626', avatar_url: null },
  { id: 'u2', name: 'Tales Dias', color: '#0891b2', avatar_url: null },
  { id: 'u3', name: 'Ana Lima', color: '#16a34a', avatar_url: null },
]
const room = (id: string, name: string, kind: 'text' | 'voice', cat: string, extra: Partial<Room> = {}): Room => ({ id, category_id: cat, name, kind, is_private: false, is_temporary: false, join_code: null, user_limit: 15, position: 0, ...extra })
const channels = [room('t1', 'geral', 'text', 'c1'), room('t2', 'avisos', 'text', 'c1'), room('v1', 'Sala Geral', 'voice', 'c2'), room('v2', 'Reunião', 'voice', 'c2'), room('v3', 'Resenha', 'voice', 'x', { is_temporary: true, join_code: 'AB12-CD34' })]

const voiceSnap = {
  status: 'connected', channelId: 'v1', error: null, muted: false, micAvailable: true, deafened: false, sharing: false, localScreen: null, camera: null,
  turn: true, speaker: true, speaking: ['s2'], selfSpeaking: false,
  peers: [
    { sessionId: 's1', userId: 'u1', meta: { muted: true, deafened: false, screen: false, camera: false }, link: 'connected', screen: null, camera: null },
    { sessionId: 's2', userId: 'u2', meta: { muted: false, deafened: false, screen: false, camera: false }, link: 'connected', screen: null, camera: null },
    { sessionId: 's3', userId: 'u3', meta: { muted: false, deafened: true, screen: false, camera: false }, link: 'connecting', screen: null, camera: null },
  ],
}
const fakeVoice = {
  subscribe: () => () => undefined,
  getSnapshot: () => voiceSnap,
  toggleMute() {}, toggleDeafen() {}, toggleSpeaker() {}, async toggleCamera() {}, async startScreen() {}, async stopScreen() {}, switchCamera() {}, leave() {},
} as unknown as MobileVoice

class FakeStore extends SpaceStore {
  private fake: SpaceSnapshot = {
    ready: true,
    categories: [{ id: 'c1', name: 'Texto', position: 0 }, { id: 'c2', name: 'Voz', position: 1 }],
    channels,
    profiles: new Map(people.map((p) => [p.id, p])),
    voiceByChannel: new Map([['v1', [
      { userId: 'u1', channelId: 'v1', muted: true, deafened: false, screen: false, camera: false },
      { userId: 'u2', channelId: 'v1', muted: false, deafened: false, screen: false, camera: true },
      { userId: 'u3', channelId: 'v1', muted: false, deafened: true, screen: false, camera: false },
    ]], ['v3', [{ userId: 'u1', channelId: 'v3', muted: false, deafened: false, screen: true, camera: false }]]]),
    voice: fakeVoice,
    voiceRoom: channels[2],
  }
  getSnapshot = () => this.fake
  subscribe = () => () => undefined
  async start() {}
  async reload() {}
  profile(id: string | null | undefined) { return id ? (this.fake.profiles.get(id) ?? null) : null }
  channel(id: string | null | undefined) { return channels.find((c) => c.id === id) ?? null }
  joinVoice() { return fakeVoice }
  leaveVoice() {}
}

export function Preview() {
  const [store] = useState(() => new FakeStore('me'))
  const [screen, setScreen] = useState<'home' | 'call' | 'chat'>('home')
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.ink900} />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink900 }}>
        {screen === 'call' ? (
          <CallScreen store={store} voice={fakeVoice} onMinimize={() => setScreen('home')} />
        ) : screen === 'chat' ? (
          <ChatScreen store={store} room={channels[0]} onBack={() => setScreen('home')} />
        ) : (
          <HomeScreen store={store} onOpenChat={() => setScreen('chat')} onOpenCall={() => setScreen('call')} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
