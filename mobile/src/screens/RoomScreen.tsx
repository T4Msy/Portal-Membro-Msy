import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Alert, Linking, Modal, PermissionsAndroid, Platform, Pressable, ScrollView, Share, StatusBar, Text, View } from 'react-native'
import { RTCView, type MediaStream } from '@livekit/react-native-webrtc'
import { friendly, profileNames, type Room } from '../lib/api'
import { SITE_URL } from '../lib/config'
import { Btn, ErrorText, s } from '../ui/components'
import { colors } from '../ui/theme'
import { MobileVoice } from '../voice/MobileVoice'
import { askPipPermission, configurePip, setOrientation, usePipMode } from '../voice/pip'

interface Props {
  room: Room
  userId: string
  onBack: () => void
}

async function askPermissions(): Promise<void> {
  if (Platform.OS !== 'android') return
  const wanted = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]
  if (Number(Platform.Version) >= 33) wanted.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
  await PermissionsAndroid.requestMultiple(wanted)
}

/** Proporção do quadro: segue o vídeo (em pé 9:16 … deitado 16:9). */
const clampAspect = (r: number | null) => (r ? Math.min(16 / 9, Math.max(9 / 16, r)) : 16 / 9)

interface VideoItem {
  key: string
  name: string
  stream: MediaStream
  mirror: boolean
  local: boolean
}

export function RoomScreen({ room, userId, onBack }: Props) {
  const voice = useMemo(() => new MobileVoice(userId, room.is_temporary), [userId, room.is_temporary])
  const snap = useSyncExternalStore(voice.subscribe, voice.getSnapshot)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [watching, setWatching] = useState<string | null>(null)
  const [full, setFull] = useState<VideoItem | null>(null)
  const pip = usePipMode()

  useEffect(() => {
    void profileNames().then(setNames)
    void askPermissions().then(() => voice.join(room.id, room.user_limit, room.name))
    return () => voice.leave()
  }, [voice, room.id, room.user_limit, room.name])

  const sharers = snap.peers.filter((p) => p.meta.screen)
  const active = sharers.find((p) => p.sessionId === watching) ?? sharers[0]

  const cameras: VideoItem[] = [
    ...(snap.camera ? [{ key: 'me', name: 'Você', stream: snap.camera, mirror: false, local: true }] : []),
    ...snap.peers.filter((p) => p.camera).map((p) => ({ key: p.sessionId, name: names.get(p.userId) ?? 'Membro', stream: p.camera as MediaStream, mirror: false, local: false })),
  ]

  // Janela flutuante: liga em chamada; proporção deitada se houver transmissão, senão em pé.
  const connected = snap.status === 'connected' || snap.status === 'reconnecting'
  const wide = Boolean(active?.screen)
  useEffect(() => {
    configurePip(connected, wide ? 16 : 9, wide ? 9 : 16)
    if (connected) void askPipPermission()
  }, [connected, wide])
  useEffect(() => () => configurePip(false), [])

  async function toggleScreen() {
    try {
      if (snap.sharing) await voice.stopScreen()
      else await voice.startScreen()
    } catch (e) {
      Alert.alert('Transmissão', friendly(e))
    }
  }

  async function toggleCamera() {
    try {
      if (!snap.camera && Platform.OS === 'android') {
        const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA)
        if (r !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Câmera', 'Permita a câmera nas permissões do app para ligá-la.')
          return
        }
      }
      await voice.toggleCamera()
    } catch (e) {
      Alert.alert('Câmera', friendly(e))
    }
  }

  function leave() {
    voice.leave()
    onBack()
  }

  // ---------- Janela flutuante: só o essencial ----------
  if (pip) {
    const main = active?.screen ?? cameras.find((c) => !c.local)?.stream ?? snap.camera
    return (
      <View style={{ flex: 1, backgroundColor: colors.black }}>
        {main ? (
          <RTCView streamURL={main.toURL()} objectFit="contain" style={{ flex: 1 }} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 }}>
            <Text style={{ color: colors.brand, fontWeight: '700' }}>MSY SPACE</Text>
            <Text style={{ color: colors.white, fontSize: 13 }} numberOfLines={1}>
              {room.name}
            </Text>
            <Text style={{ color: colors.silver500, fontSize: 12 }}>
              {snap.peers.length + 1} na sala {snap.muted ? '· 🎤✕' : ''}
            </Text>
          </View>
        )}
      </View>
    )
  }

  const statusText =
    snap.status === 'connected' ? 'Conectado' : snap.status === 'joining' ? 'Conectando…' : snap.status === 'reconnecting' ? 'Reconectando…' : snap.status === 'error' ? 'Erro' : ''

  return (
    <View style={s.screen}>
      <View style={{ padding: 16, paddingBottom: 8, borderBottomWidth: 1, borderColor: colors.line }}>
        <Text style={s.h1}>🔊 {room.name}</Text>
        <Text style={{ color: snap.status === 'connected' ? colors.ok : colors.warn, marginTop: 2 }}>{statusText}</Text>
        {room.is_temporary && room.join_code && (
          <Pressable onPress={() => void Share.share({ message: `Entra na sala ${room.name} do MSY Space: código ${room.join_code} — ${SITE_URL}/space.html?sala=${room.join_code}` })}>
            <Text style={{ color: colors.brand, marginTop: 6 }}>Código {room.join_code} · Compartilhar</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {snap.error && <ErrorText>{snap.error}</ErrorText>}
        {!snap.micAvailable && snap.status === 'connected' && <ErrorText>Sem microfone: você entrou só para ouvir. Libere o microfone nas permissões do app.</ErrorText>}

        {snap.sharing && (
          <View style={{ backgroundColor: colors.ink600, borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <Text style={{ color: colors.brand, fontWeight: '700' }}>Você está transmitindo a tela do celular</Text>
            <Text style={s.muted}>Pode sair deste app e abrir o que quiser mostrar. Para parar, volte aqui ou use a notificação.</Text>
          </View>
        )}

        {active && active.screen && (
          <View style={{ marginBottom: 12 }}>
            <Text style={[s.muted, { marginBottom: 6 }]}>
              {names.get(active.userId) ?? 'Membro'} está transmitindo{active.meta.screenLabel ? ` · ${active.meta.screenLabel}` : ''} · toque para tela cheia
            </Text>
            <Pressable onPress={() => active.screen && setFull({ key: `screen:${active.sessionId}`, name: names.get(active.userId) ?? 'Membro', stream: active.screen, mirror: false, local: false })}>
              <RTCView streamURL={active.screen.toURL()} objectFit="contain" style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.black, borderRadius: 10 }} />
            </Pressable>
            {sharers.length > 1 && (
              <ScrollView horizontal style={{ marginTop: 6 }}>
                {sharers.map((p) => (
                  <Pressable key={p.sessionId} onPress={() => setWatching(p.sessionId)} style={{ marginRight: 8 }}>
                    <Text style={{ color: p.sessionId === active.sessionId ? colors.white : colors.silver500 }}>{names.get(p.userId) ?? 'Membro'}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {cameras.length > 0 && (
          <>
            <Text style={s.label}>Câmeras · toque para tela cheia</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 12 }}>
              {cameras.map((c) => (
                <CameraTile key={c.key} item={c} onPress={() => setFull(c)} onSwitch={c.local ? () => voice.switchCamera() : undefined} />
              ))}
            </View>
          </>
        )}

        <Text style={[s.muted, { fontSize: 12, marginBottom: 8 }]}>
          {snap.speaker ? '🔊 Som no alto-falante. Toque em 📞 para ouvir pelo do ouvido.' : '📞 Som no do ouvido. Toque em 🔊 para o alto-falante.'}
        </Text>

        {Platform.OS === 'android' && snap.status === 'connected' && (
          <Pressable onPress={() => void Linking.openSettings()} style={{ marginBottom: 12 }}>
            <Text style={[s.muted, { fontSize: 12 }]}>
              Se o app fechar sozinho em segundo plano, toque aqui → Bateria → <Text style={{ color: colors.brand }}>Sem restrições</Text>.
            </Text>
          </Pressable>
        )}

        <Text style={[s.label, { marginTop: 4 }]}>Na sala ({snap.peers.length + 1})</Text>
        <Participant name={`${names.get(userId) ?? 'Você'} (você)`} muted={snap.muted || !snap.micAvailable} deafened={snap.deafened} sharing={snap.sharing} camera={Boolean(snap.camera)} />
        {snap.peers.map((p) => (
          <Participant key={p.sessionId} name={names.get(p.userId) ?? 'Membro'} muted={p.meta.muted} deafened={p.meta.deafened} sharing={p.meta.screen} camera={p.meta.camera} connecting={p.link !== 'connected'} />
        ))}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 6, padding: 10, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.ink800 }}>
        <View style={{ flex: 1 }}>
          <Btn title={snap.muted || !snap.micAvailable ? '🎤✕' : '🎤'} tone={snap.muted ? 'danger' : 'secondary'} onPress={() => voice.toggleMute()} disabled={!snap.micAvailable} />
        </View>
        <View style={{ flex: 1 }}>
          <Btn title={snap.deafened ? '🔇' : '🎧'} tone={snap.deafened ? 'danger' : 'secondary'} onPress={() => voice.toggleDeafen()} />
        </View>
        <View style={{ flex: 1 }}>
          <Btn title={snap.speaker ? '🔊' : '📞'} tone="secondary" onPress={() => voice.toggleSpeaker()} />
        </View>
        <View style={{ flex: 1 }}>
          <Btn title={snap.camera ? '📷✕' : '📷'} tone={snap.camera ? 'primary' : 'secondary'} onPress={() => void toggleCamera()} disabled={snap.status !== 'connected'} />
        </View>
        <View style={{ flex: 1.3 }}>
          <Btn title={snap.sharing ? 'Parar' : 'Tela'} tone={snap.sharing ? 'danger' : 'primary'} onPress={() => void toggleScreen()} disabled={snap.status !== 'connected'} />
        </View>
        <View style={{ flex: 1.1 }}>
          <Btn title="Sair" tone="danger" onPress={leave} />
        </View>
      </View>

      {full && <FullscreenVideo item={full} onClose={() => setFull(null)} />}
    </View>
  )
}

/** Quadro de câmera: o formato acompanha o vídeo (em pé fica em pé, deitado fica deitado). */
function CameraTile({ item, onPress, onSwitch }: { item: VideoItem; onPress: () => void; onSwitch?: () => void }) {
  const [ratio, setRatio] = useState<number | null>(null)
  const aspect = clampAspect(ratio)
  return (
    <Pressable onPress={onPress} style={{ width: aspect < 1 ? '48.5%' : '100%', marginBottom: 8 }}>
      <View style={{ width: '100%', aspectRatio: aspect, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.black }}>
        <RTCView
          streamURL={item.stream.toURL()}
          objectFit="cover"
          mirror={item.mirror}
          style={{ flex: 1 }}
          onDimensionsChange={(e) => {
            const { width, height } = e.nativeEvent
            if (width && height) setRatio(width / height)
          }}
        />
        <Text style={{ position: 'absolute', left: 8, bottom: 6, color: colors.white, fontSize: 13, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 4 }}>{item.name}</Text>
        {onSwitch && (
          <Pressable onPress={onSwitch} hitSlop={8} style={{ position: 'absolute', right: 6, top: 6, backgroundColor: '#000a', borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: colors.white, fontSize: 13 }}>🔄</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  )
}

/** Tela cheia: gira o celular conforme o vídeo (deitado → paisagem; em pé → retrato). */
function FullscreenVideo({ item, onClose }: { item: VideoItem; onClose: () => void }) {
  const [ratio, setRatio] = useState<number | null>(item.key.startsWith('screen:') ? 16 / 9 : null)
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
          mirror={item.mirror}
          style={{ flex: 1 }}
          onDimensionsChange={(e) => {
            const { width, height } = e.nativeEvent
            if (width && height) setRatio(width / height)
          }}
        />
        <Pressable onPress={onClose} hitSlop={10} style={{ position: 'absolute', right: 14, top: 18, backgroundColor: '#000a', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: colors.white, fontSize: 15 }}>✕ Fechar</Text>
        </Pressable>
        <Text style={{ position: 'absolute', left: 14, top: 24, color: colors.white, fontSize: 14, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 4 }}>{item.name}</Text>
      </View>
    </Modal>
  )
}

function Participant({ name, muted, deafened, sharing, camera, connecting }: { name: string; muted: boolean; deafened: boolean; sharing: boolean; camera?: boolean; connecting?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.line }}>
      <Text style={{ flex: 1, color: colors.silver300, fontSize: 15 }}>{name}</Text>
      {connecting && <Text style={{ color: colors.warn, fontSize: 12, marginRight: 8 }}>conectando</Text>}
      {camera && <Text style={{ marginRight: 8 }}>📷</Text>}
      {sharing && <Text style={{ color: colors.brand, marginRight: 8 }}>📺</Text>}
      <Text style={{ color: colors.silver500 }}>{deafened ? '🔇' : muted ? '🎤✕' : '🎤'}</Text>
    </View>
  )
}
