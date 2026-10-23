// Tela da chamada (como a call do Discord no celular): grade de pessoas com anel verde de quem
// fala, câmeras no formato certo, transmissão em cima, barra de controles redonda embaixo.
// A seta para baixo minimiza (volta para a lista) SEM sair da chamada.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, Share, StatusBar, Text, View, type LayoutChangeEvent } from 'react-native'
import { RTCView, type MediaStream } from '@livekit/react-native-webrtc'
import { friendly, type Profile } from '../lib/api'
import { SITE_URL } from '../lib/config'
import type { SpaceStore } from '../lib/space'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import { colors, radius } from '../ui/theme'
import type { MobileVoice } from '../voice/MobileVoice'
import { askCameraPermission } from '../voice/permissions'
import { askPipPermission, configurePip, setOrientation, usePipMode } from '../voice/pip'

interface Person {
  key: string
  profile: Profile | null
  name: string
  local: boolean
  muted: boolean
  deafened: boolean
  speaking: boolean
  camera: MediaStream | null
  connecting: boolean
}

interface FullItem {
  name: string
  stream: MediaStream
  screen: boolean
}

export function CallScreen({ store, voice, onMinimize }: { store: SpaceStore; voice: MobileVoice; onMinimize: () => void }) {
  const space = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const v = useSyncExternalStore(voice.subscribe, voice.getSnapshot)
  const room = space.voiceRoom
  const [watching, setWatching] = useState<string | null>(null)
  const [full, setFull] = useState<FullItem | null>(null)
  const [area, setArea] = useState({ w: 0, h: 0 })
  const pip = usePipMode()

  const sharers = v.peers.filter((p) => p.meta.screen && p.screen)
  const active = sharers.find((p) => p.sessionId === watching) ?? sharers[0]

  // Janela flutuante: liga durante a call (deitada se houver transmissão, senão em pé).
  const connected = v.status === 'connected' || v.status === 'reconnecting'
  const wide = Boolean(active?.screen)
  useEffect(() => {
    configurePip(connected, wide ? 16 : 9, wide ? 9 : 16)
    if (connected) void askPipPermission()
  }, [connected, wide])

  const me = store.profile(store.userId)
  const people: Person[] = [
    { key: 'me', profile: me, name: 'Você', local: true, muted: v.muted || !v.micAvailable, deafened: v.deafened, speaking: v.selfSpeaking, camera: v.camera, connecting: false },
    ...v.peers.map((p) => {
      const profile = store.profile(p.userId)
      return {
        key: p.sessionId,
        profile,
        name: profile?.name?.split(' ')[0] ?? 'Membro',
        local: false,
        muted: p.meta.muted,
        deafened: p.meta.deafened,
        speaking: v.speaking.includes(p.sessionId),
        camera: p.camera,
        connecting: p.link !== 'connected',
      }
    }),
  ]

  async function toggleCamera() {
    try {
      if (!v.camera && !(await askCameraPermission())) {
        Alert.alert('Câmera', 'Permita a câmera nas permissões do app para ligá-la.')
        return
      }
      await voice.toggleCamera()
    } catch (e) {
      Alert.alert('Câmera', friendly(e))
    }
  }

  async function toggleScreen() {
    try {
      if (v.sharing) await voice.stopScreen()
      else await voice.startScreen()
    } catch (e) {
      Alert.alert('Transmissão', friendly(e))
    }
  }

  function leave() {
    store.leaveVoice()
    onMinimize()
  }

  // ---------- Janela flutuante: só o essencial ----------
  if (pip) {
    const main = active?.screen ?? people.find((p) => !p.local && p.camera)?.camera ?? v.camera
    const talking = people.find((p) => p.speaking) ?? people[1] ?? people[0]
    return (
      <View style={{ flex: 1, backgroundColor: colors.black }}>
        {main ? (
          <RTCView streamURL={main.toURL()} objectFit="contain" style={{ flex: 1 }} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink700 }}>
            <Avatar profile={talking.profile} size={56} speaking={talking.speaking} />
            <Text style={{ color: colors.silver300, fontSize: 12, marginTop: 6 }} numberOfLines={1}>
              {room?.name} · {people.length}
            </Text>
          </View>
        )}
      </View>
    )
  }

  // Grade: 1 pessoa = tela toda; 2 = uma em cima da outra; 3+ = 2 colunas (como no Discord).
  const n = people.length
  const cols = n <= 2 ? 1 : 2
  const rows = Math.ceil(n / cols)
  const gap = 8
  const tileW = area.w ? (area.w - gap * (cols - 1)) / cols : 0
  const fitH = area.h ? (area.h - gap * (rows - 1)) / rows : 0
  const tileH = Math.max(150, Math.min(fitH, cols === 1 ? area.h : tileW * 1.35))

  const statusText = v.status === 'connected' ? null : v.status === 'joining' ? 'Conectando…' : v.status === 'reconnecting' ? 'Reconectando…' : v.status === 'error' ? v.error || 'Erro' : null

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink900 }}>
      {/* Topo: minimizar, nome da sala, alto-falante, convidar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, height: 56 }}>
        <TopButton icon="chevron-down" label="Minimizar" onPress={onMinimize} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.white, fontSize: 17, fontWeight: '800' }} numberOfLines={1}>{room?.name ?? 'Sala de voz'}</Text>
          <Text style={{ color: statusText ? colors.warn : colors.silver500, fontSize: 12 }}>{statusText ?? `${n} ${n === 1 ? 'pessoa' : 'pessoas'}`}</Text>
        </View>
        <TopButton icon={v.speaker ? 'volume-high' : 'phone'} label={v.speaker ? 'Alto-falante (toque para o do ouvido)' : 'Do ouvido (toque para o alto-falante)'} onPress={() => voice.toggleSpeaker()} />
        {room?.is_temporary && room.join_code && (
          <TopButton
            icon="user-plus"
            label="Convidar"
            onPress={() => void Share.share({ message: `Entra na sala ${room.name} do MSY Space: código ${room.join_code} — ${SITE_URL}/space.html?sala=${room.join_code}` })}
          />
        )}
      </View>

      {!v.micAvailable && v.status === 'connected' && (
        <Pressable onPress={() => void Linking.openSettings()} style={{ marginHorizontal: 12, marginBottom: 8, padding: 10, borderRadius: radius.md, backgroundColor: '#2a0a12' }}>
          <Text style={{ color: colors.dangerSoft, fontSize: 13 }}>Sem microfone: você entrou só para ouvir. Toque para liberar nas permissões do app.</Text>
        </Pressable>
      )}
      {v.sharing && (
        <View style={{ marginHorizontal: 12, marginBottom: 8, padding: 10, borderRadius: radius.md, backgroundColor: colors.ink600 }}>
          <Text style={{ color: colors.brand, fontWeight: '700' }}>Você está transmitindo a tela do celular</Text>
          <Text style={{ color: colors.silver500, fontSize: 12 }}>Pode sair do app e abrir o que quiser mostrar.</Text>
        </View>
      )}

      {/* Transmissão de tela em cima (toque = tela cheia) */}
      {active?.screen && (
        <View style={{ paddingHorizontal: 12, marginBottom: 8 }}>
          <Pressable onPress={() => active.screen && setFull({ name: store.profile(active.userId)?.name ?? 'Membro', stream: active.screen, screen: true })}>
            <RTCView streamURL={active.screen.toURL()} objectFit="contain" style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.black, borderRadius: radius.lg }} />
            <View style={{ position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#000a', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Icon name="display" size={11} color={colors.brand} />
              <Text style={{ color: colors.white, fontSize: 12 }}>{store.profile(active.userId)?.name?.split(' ')[0] ?? 'Membro'} · toque para tela cheia</Text>
            </View>
          </Pressable>
          {sharers.length > 1 && (
            <ScrollView horizontal style={{ marginTop: 6 }} contentContainerStyle={{ gap: 8 }}>
              {sharers.map((p) => (
                <Pressable key={p.sessionId} onPress={() => setWatching(p.sessionId)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: p.sessionId === active.sessionId ? colors.brandDark : colors.ink600 }}>
                  <Text style={{ color: colors.white, fontSize: 12 }}>{store.profile(p.userId)?.name?.split(' ')[0] ?? 'Membro'}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Grade de pessoas */}
      <View style={{ flex: 1, paddingHorizontal: 12 }} onLayout={(e: LayoutChangeEvent) => setArea({ w: e.nativeEvent.layout.width - 24, h: e.nativeEvent.layout.height })}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, flexDirection: 'row', flexWrap: 'wrap', gap, justifyContent: 'center', alignContent: 'center', paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
          {tileW > 0 &&
            people.map((p) => (
              <Tile
                key={p.key}
                person={p}
                width={n % 2 === 1 && cols === 2 && p === people[n - 1] ? tileW * 2 + gap : tileW}
                height={tileH}
                onPress={() => p.camera && setFull({ name: p.name, stream: p.camera, screen: false })}
                onSwitch={p.local && p.camera ? () => voice.switchCamera() : undefined}
              />
            ))}
        </ScrollView>
      </View>

      {Platform.OS === 'android' && v.status === 'connected' && (
        <Pressable onPress={() => void Linking.openSettings()} style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
          <Text style={{ color: colors.silver700, fontSize: 11, textAlign: 'center' }}>Se a call cair com o app fechado: toque aqui → Bateria → Sem restrições</Text>
        </Pressable>
      )}

      {/* Barra de controles (como a do Discord) */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', marginHorizontal: 12, marginBottom: 14, paddingVertical: 12, borderRadius: radius.xl, backgroundColor: colors.ink700, borderWidth: 1, borderColor: colors.line }}>
        <Control icon={v.camera ? 'video' : 'video-slash'} on={Boolean(v.camera)} label="Câmera" onPress={() => void toggleCamera()} disabled={v.status !== 'connected'} />
        <Control icon={v.muted || !v.micAvailable ? 'microphone-slash' : 'microphone'} off={v.muted || !v.micAvailable} label="Microfone" onPress={() => voice.toggleMute()} disabled={!v.micAvailable} />
        <Control icon={v.deafened ? 'volume-xmark' : 'headphones'} off={v.deafened} label="Som" onPress={() => voice.toggleDeafen()} />
        <Control icon="display" on={v.sharing} label="Tela" onPress={() => void toggleScreen()} disabled={v.status !== 'connected'} />
        <Control icon="phone-slash" danger label="Sair" onPress={leave} />
      </View>

      {full && <FullscreenVideo item={full} onClose={() => setFull(null)} />}
    </View>
  )
}

function TopButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={6} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: pressed ? colors.ink500 : colors.ink700, alignItems: 'center', justifyContent: 'center' })}>
      <Icon name={icon} size={16} color={colors.silver300} />
    </Pressable>
  )
}

function Control({ icon, label, onPress, on, off, danger, disabled }: { icon: string; label: string; onPress: () => void; on?: boolean; off?: boolean; danger?: boolean; disabled?: boolean }) {
  const bg = danger ? colors.danger : on ? colors.white : off ? '#3b1525' : colors.ink500
  const fg = danger ? colors.white : on ? colors.ink900 : off ? colors.dangerSoft : colors.silver300
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={label} style={({ pressed }) => ({ width: 54, height: 54, borderRadius: 27, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.75 : 1 })}>
      <Icon name={icon} size={20} color={fg} />
    </Pressable>
  )
}

/** Quadro de uma pessoa: câmera (cobrindo o quadro) ou foto grande com anel verde quando fala. */
function Tile({ person, width, height, onPress, onSwitch }: { person: Person; width: number; height: number; onPress: () => void; onSwitch?: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width, height, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.ink700, borderWidth: 2, borderColor: person.speaking ? colors.ok : 'transparent' }}>
      {person.camera ? (
        <RTCView streamURL={person.camera.toURL()} objectFit="cover" style={{ flex: 1 }} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Avatar profile={person.profile} size={Math.min(96, Math.max(56, Math.min(width, height) * 0.38))} speaking={person.speaking} />
        </View>
      )}
      <View style={{ position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#000a', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, maxWidth: width - 16 }}>
        {person.deafened ? <Icon name="volume-xmark" size={11} color={colors.dangerSoft} /> : person.muted ? <Icon name="microphone-slash" size={11} color={colors.dangerSoft} /> : null}
        <Text style={{ color: colors.white, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{person.name}</Text>
      </View>
      {person.connecting && (
        <View style={{ position: 'absolute', left: 8, top: 8, backgroundColor: '#000a', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ color: colors.warn, fontSize: 11 }}>conectando</Text>
        </View>
      )}
      {onSwitch && (
        <Pressable onPress={onSwitch} hitSlop={8} accessibilityLabel="Trocar câmera" style={{ position: 'absolute', right: 8, top: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="camera-rotate" size={14} color={colors.white} />
        </Pressable>
      )}
    </Pressable>
  )
}

/** Tela cheia: gira o celular conforme o vídeo (deitado → paisagem; em pé → retrato). */
function FullscreenVideo({ item, onClose }: { item: FullItem; onClose: () => void }) {
  const [ratio, setRatio] = useState<number | null>(item.screen ? 16 / 9 : null)
  useEffect(() => {
    if (ratio) setOrientation(ratio >= 1 ? 'landscape' : 'portrait')
  }, [ratio])
  useEffect(() => () => setOrientation('auto'), [])
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
      <StatusBar hidden />
      <View style={{ flex: 1, backgroundColor: colors.black }}>
        <RTCView
          streamURL={item.stream.toURL()}
          objectFit="contain"
          style={{ flex: 1 }}
          onDimensionsChange={(e: { nativeEvent: { width: number; height: number } }) => {
            const { width, height } = e.nativeEvent
            if (width && height) setRatio(width / height)
          }}
        />
        <Pressable onPress={onClose} hitSlop={10} style={{ position: 'absolute', right: 14, top: 18, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#000a', borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Icon name="compress" size={14} color={colors.white} />
          <Text style={{ color: colors.white, fontSize: 14 }}>Fechar</Text>
        </Pressable>
        <Text style={{ position: 'absolute', left: 14, top: 24, color: colors.white, fontSize: 14, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 4 }}>{item.name}</Text>
      </View>
    </Modal>
  )
}
