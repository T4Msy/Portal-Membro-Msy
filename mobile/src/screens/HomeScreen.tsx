// Tela principal (como a lista de canais do Discord no celular): categorias, canais de texto,
// salas de voz com quem está dentro, barra "Voz conectada" e painel do usuário.
import { useState, useSyncExternalStore } from 'react'
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { createRoom, friendly, joinByCode, type Room } from '../lib/api'
import type { SpaceStore, VoiceMember } from '../lib/space'
import { supabase } from '../lib/supabase'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import { colors, radius } from '../ui/theme'

interface Props {
  store: SpaceStore
  onOpenChat: (room: Room) => void
  onOpenCall: () => void
}

export function HomeScreen({ store, onOpenChat, onOpenCall }: Props) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [sheet, setSheet] = useState<Room | null>(null)
  const [dialog, setDialog] = useState<null | 'join' | 'create'>(null)

  const fixed = snap.channels.filter((c) => !c.is_temporary)
  const groups = snap.categories.map((cat) => ({ id: cat.id, name: cat.name, channels: fixed.filter((c) => c.category_id === cat.id) }))
  const loose = fixed.filter((c) => !c.category_id || !snap.categories.some((cat) => cat.id === c.category_id))
  if (loose.length) groups.unshift({ id: 'loose', name: 'Canais', channels: loose })
  const rooms = snap.channels.filter((c) => c.is_temporary)
  if (rooms.length) groups.push({ id: 'rooms', name: 'Salas com código', channels: rooms })

  const me = store.profile(store.userId)
  const inCallId = snap.voiceRoom?.id ?? null
  // Re-desenha quando muda quem fala / mudo na minha call (anel verde na lista).
  const v = useSyncExternalStore(snap.voice?.subscribe ?? noopSubscribe, snap.voice?.getSnapshot ?? nullSnapshot)
  const speaking = speakingUsers(store)
  /** Presença tem freio de 15 s: na minha sala eu apareço na hora, pelo estado local. */
  const membersOf = (c: Room): VoiceMember[] => {
    const list = snap.voiceByChannel.get(c.id) ?? []
    if (c.id !== inCallId || !v) return list
    const self: VoiceMember = { userId: store.userId, channelId: c.id, muted: v.muted || !v.micAvailable, deafened: v.deafened, screen: v.sharing, camera: Boolean(v.camera) }
    return [self, ...list.filter((m) => m.userId !== store.userId)]
  }

  async function refresh() {
    setRefreshing(true)
    try {
      await store.reload()
    } catch (e) {
      Alert.alert('MSY Space', friendly(e))
    } finally {
      setRefreshing(false)
    }
  }

  function openChannel(c: Room) {
    if (c.kind === 'text') onOpenChat(c)
    else if (c.id === inCallId) onOpenCall()
    else setSheet(c)
  }

  function toggle(id: string) {
    const next = new Set(collapsed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setCollapsed(next)
  }

  async function confirmDialog(text: string) {
    try {
      const id = dialog === 'join' ? await joinByCode(text) : (await createRoom(text)).id
      await store.reload()
      const room = store.channel(id)
      setDialog(null)
      if (room) setSheet(room)
    } catch (e) {
      Alert.alert('Sala', friendly(e))
    }
  }

  function account() {
    Alert.alert(me?.name ?? 'Conta', 'Mesma conta do Portal MSY.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair da conta', style: 'destructive', onPress: () => void supabase.auth.signOut() },
    ])
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink800 }}>
      {/* Cabeçalho do "servidor" */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: colors.brandDark, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="satellite-dish" size={18} color={colors.white} />
        </View>
        <Text style={{ flex: 1, color: colors.white, fontSize: 20, fontWeight: '800' }}>MSY Space</Text>
        <RoundButton icon="key" label="Usar código" onPress={() => setDialog('join')} />
        <RoundButton icon="plus" label="Criar sala" onPress={() => setDialog('create')} />
      </View>
      <View style={{ height: 1, backgroundColor: colors.line }} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.brand} colors={[colors.accent]} />}
      >
        {groups.map((g) => (
          <View key={g.id} style={{ marginTop: 14 }}>
            <Pressable onPress={() => toggle(g.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Icon name={collapsed.has(g.id) ? 'chevron-right' : 'chevron-down'} size={10} color={colors.silver500} />
              <Text style={{ color: colors.silver500, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' }}>{g.name}</Text>
            </Pressable>
            {g.channels
              .filter((c) => !collapsed.has(g.id) || c.id === inCallId)
              .map((c) => (
                <ChannelRow
                  key={c.id}
                  room={c}
                  active={c.id === inCallId}
                  members={membersOf(c)}
                  store={store}
                  speaking={c.id === inCallId ? speaking : new Set()}
                  onPress={() => openChannel(c)}
                />
              ))}
          </View>
        ))}
        {!snap.channels.length && <Text style={{ color: colors.silver500, textAlign: 'center', marginTop: 40 }}>Nenhum canal ainda.</Text>}
      </ScrollView>

      <VoiceBar store={store} onOpenCall={onOpenCall} />

      {/* Painel do usuário (como no Discord) */}
      <Pressable onPress={account} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.ink900 }}>
        <View>
          <Avatar profile={me} size={38} />
          <View style={{ position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: colors.ink900, backgroundColor: inCallId ? colors.accent : colors.ok }} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.white, fontWeight: '700' }} numberOfLines={1}>{me?.name ?? 'Você'}</Text>
          <Text style={{ color: colors.silver500, fontSize: 12 }}>{inCallId ? 'Em chamada' : 'Disponível'}</Text>
        </View>
        <Icon name="gear" size={18} color={colors.silver500} />
      </Pressable>

      <JoinSheet store={store} room={sheet} onClose={() => setSheet(null)} onJoined={() => { setSheet(null); onOpenCall() }} />
      <CodeDialog mode={dialog} onCancel={() => setDialog(null)} onConfirm={(t) => void confirmDialog(t)} />
    </View>
  )
}

function speakingUsers(store: SpaceStore): Set<string> {
  const v = store.getSnapshot().voice?.getSnapshot()
  const out = new Set<string>()
  if (!v) return out
  if (v.selfSpeaking) out.add(store.userId)
  for (const p of v.peers) if (v.speaking.includes(p.sessionId)) out.add(p.userId)
  return out
}

function RoundButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={6} style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, backgroundColor: pressed ? colors.ink500 : colors.ink600, alignItems: 'center', justifyContent: 'center' })}>
      <Icon name={icon} size={15} color={colors.silver300} />
    </Pressable>
  )
}

function ChannelRow({ room, active, members, store, speaking, onPress }: { room: Room; active: boolean; members: VoiceMember[]; store: SpaceStore; speaking: Set<string>; onPress: () => void }) {
  const voice = room.kind === 'voice'
  return (
    <View>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 9, borderRadius: radius.sm, backgroundColor: active ? colors.ink600 : pressed ? colors.ink700 : 'transparent', marginTop: 2 })}
      >
        <Icon name={voice ? 'volume-high' : 'hashtag'} size={16} color={active ? colors.ok : colors.silver500} />
        <Text style={{ flex: 1, color: active ? colors.white : colors.silver300, fontSize: 16, fontWeight: active ? '700' : '500' }} numberOfLines={1}>{room.name}</Text>
        {room.is_private && <Icon name="lock" size={11} color={colors.silver700} />}
        {voice && members.length > 0 && <Text style={{ color: colors.silver500, fontSize: 12 }}>{members.length}/{room.user_limit}</Text>}
      </Pressable>
      {voice &&
        members.map((m) => {
          const p = store.profile(m.userId)
          return (
            <View key={m.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 38, paddingRight: 10, paddingVertical: 4 }}>
              <Avatar profile={p} size={24} speaking={speaking.has(m.userId)} />
              <Text style={{ flex: 1, color: colors.silver500, fontSize: 14 }} numberOfLines={1}>{p?.name ?? 'Membro'}</Text>
              {m.camera && <Icon name="video" size={11} color={colors.silver500} />}
              {m.screen && <Icon name="display" size={11} color={colors.brand} />}
              {m.deafened ? <Icon name="volume-xmark" size={12} color={colors.dangerSoft} /> : m.muted ? <Icon name="microphone-slash" size={12} color={colors.dangerSoft} /> : null}
            </View>
          )
        })}
    </View>
  )
}

/** Barra verde "Voz conectada" enquanto está em chamada e fora da tela da call. */
function VoiceBar({ store, onOpenCall }: { store: SpaceStore; onOpenCall: () => void }) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const voice = snap.voice
  const v = useSyncExternalStore(voice?.subscribe ?? noopSubscribe, voice?.getSnapshot ?? nullSnapshot)
  if (!voice || !v || !snap.voiceRoom) return null
  const status = v.status === 'connected' ? 'Voz conectada' : v.status === 'reconnecting' ? 'Reconectando…' : 'Conectando…'
  const micOff = v.muted || !v.micAvailable
  return (
    <Pressable onPress={onOpenCall} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.ink700, borderTopWidth: 1, borderColor: colors.line }}>
      <Icon name="signal" size={16} color={v.status === 'connected' ? colors.ok : colors.warn} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: v.status === 'connected' ? colors.ok : colors.warn, fontWeight: '700', fontSize: 13 }}>{status}</Text>
        <Text style={{ color: colors.silver500, fontSize: 12 }} numberOfLines={1}>{snap.voiceRoom.name}</Text>
      </View>
      <Pressable onPress={() => voice.toggleMute()} hitSlop={8} style={{ padding: 8 }}>
        <Icon name={micOff ? 'microphone-slash' : 'microphone'} size={18} color={micOff ? colors.dangerSoft : colors.silver300} />
      </Pressable>
      <Pressable onPress={() => store.leaveVoice()} hitSlop={8} style={{ padding: 8 }}>
        <Icon name="phone-slash" size={18} color={colors.dangerSoft} />
      </Pressable>
    </Pressable>
  )
}

const noopSubscribe = () => () => undefined
const nullSnapshot = () => null

/** Folha "Entrar na voz" (como no Discord): quem está na sala e o botão verde. */
function JoinSheet({ store, room, onClose, onJoined }: { store: SpaceStore; room: Room | null; onClose: () => void; onJoined: () => void }) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const members = room ? (snap.voiceByChannel.get(room.id) ?? []) : []
  const busy = Boolean(snap.voiceRoom && room && snap.voiceRoom.id !== room.id)
  return (
    <Modal visible={Boolean(room)} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} />
      {room && (
        <View style={{ backgroundColor: colors.ink700, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, paddingBottom: 28 }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.ink500, marginBottom: 18 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="volume-high" size={20} color={colors.silver300} />
            <Text style={{ flex: 1, color: colors.white, fontSize: 22, fontWeight: '800' }} numberOfLines={1}>{room.name}</Text>
          </View>
          {room.is_temporary && room.join_code && <Text style={{ color: colors.brand, marginTop: 4 }}>Código {room.join_code}</Text>}
          <View style={{ alignItems: 'center', marginVertical: 26 }}>
            {members.length ? (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
                  {members.slice(0, 8).map((m) => (
                    <Avatar key={m.userId} profile={store.profile(m.userId)} size={56} />
                  ))}
                </View>
                <Text style={{ color: colors.silver500, marginTop: 12 }}>
                  {members.map((m) => store.profile(m.userId)?.name?.split(' ')[0] ?? 'Membro').join(', ')}
                </Text>
              </>
            ) : (
              <>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.ink600, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="volume-high" size={28} color={colors.silver500} />
                </View>
                <Text style={{ color: colors.silver500, marginTop: 12 }}>Ninguém na sala ainda.</Text>
              </>
            )}
          </View>
          <Pressable
            onPress={() => {
              store.joinVoice(room)
              onJoined()
            }}
            style={({ pressed }) => ({ height: 52, borderRadius: radius.pill, backgroundColor: pressed ? '#16a34a' : colors.ok, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 })}
          >
            <Icon name="phone" size={16} color={colors.white} />
            <Text style={{ color: colors.white, fontWeight: '800', fontSize: 16 }}>{busy ? 'Trocar para esta sala' : 'Entrar na voz'}</Text>
          </Pressable>
          {busy && <Text style={{ color: colors.silver500, textAlign: 'center', marginTop: 10, fontSize: 12 }}>Você vai sair de {snap.voiceRoom?.name}.</Text>}
        </View>
      )}
    </Modal>
  )
}

function CodeDialog({ mode, onCancel, onConfirm }: { mode: null | 'join' | 'create'; onCancel: () => void; onConfirm: (text: string) => void }) {
  const [text, setText] = useState('')
  const join = mode === 'join'
  return (
    <Modal visible={mode !== null} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: colors.ink700, borderRadius: radius.lg, padding: 20, borderWidth: 1, borderColor: colors.line }}>
          <Text style={{ color: colors.white, fontSize: 18, fontWeight: '800', marginBottom: 14 }}>{join ? 'Entrar com código' : 'Criar sala com código'}</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={join ? 'XXXX-XXXX' : 'Nome da sala (opcional)'}
            placeholderTextColor={colors.silver700}
            autoCapitalize={join ? 'characters' : 'sentences'}
            maxLength={join ? 12 : 40}
            autoFocus
            style={{ height: 48, borderRadius: radius.md, backgroundColor: colors.ink900, color: colors.white, paddingHorizontal: 14, fontSize: 16, borderWidth: 1, borderColor: colors.line }}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Pressable onPress={() => { setText(''); onCancel() }} style={{ flex: 1, height: 46, borderRadius: radius.pill, backgroundColor: colors.ink500, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.silver300, fontWeight: '700' }}>Cancelar</Text>
            </Pressable>
            <Pressable onPress={() => { const t = text; setText(''); onConfirm(t) }} disabled={join && !text.trim()} style={{ flex: 1, height: 46, borderRadius: radius.pill, backgroundColor: colors.brandDark, alignItems: 'center', justifyContent: 'center', opacity: join && !text.trim() ? 0.5 : 1 }}>
              <Text style={{ color: colors.white, fontWeight: '800' }}>{join ? 'Entrar' : 'Criar'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}
