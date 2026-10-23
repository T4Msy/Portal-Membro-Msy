// Canal de texto (como o chat do Discord no celular): mensagens agrupadas por autor,
// tempo real pelo mesmo tópico do site ('space:chat:<id>') e envio otimista com nonce.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { friendly, type Room } from '../lib/api'
import type { SpaceStore } from '../lib/space'
import { supabase } from '../lib/supabase'
import { uuid } from '../lib/uuid'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import { colors, radius } from '../ui/theme'

interface Message {
  id: string
  channel_id: string
  author_id: string | null
  content: string
  client_nonce: string | null
  created_at: string
  edited_at: string | null
  status?: 'sending' | 'failed'
}

const PAGE = 50
const GROUP_MS = 5 * 60_000
const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i

const pad = (n: number) => String(n).padStart(2, '0')
function timeLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) return `Hoje às ${hm}`
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return `Ontem às ${hm}`
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${hm}`
}

/** Junta sem duplicar (por id e nonce); a versão confirmada vence a otimista. Mais novas primeiro. */
function merge(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map(current.map((m) => [m.id, m]))
  for (const m of incoming) {
    for (const [id, x] of byId) if (x.status && m.client_nonce && x.client_nonce === m.client_nonce && id !== m.id) byId.delete(id)
    byId.set(m.id, m)
  }
  const list = [...byId.values()]
  const confirmed = list.filter((m) => !m.status).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
  return [...list.filter((m) => m.status), ...confirmed]
}

export function ChatScreen({ store, room, onBack }: { store: SpaceStore; room: Room; onBack: () => void }) {
  const [items, setItems] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [text, setText] = useState('')
  const itemsRef = useRef<Message[]>([])
  const apply = useCallback((next: Message[]) => {
    itemsRef.current = next
    setItems(next)
  }, [])

  useEffect(() => {
    let alive = true
    let rt: RealtimeChannel | null = null
    void (async () => {
      const { data, error } = await supabase.from('space_messages').select('*').eq('channel_id', room.id).order('created_at', { ascending: false }).limit(PAGE)
      if (!alive) return
      if (error) Alert.alert('Chat', friendly(error))
      apply(merge([], (data ?? []) as Message[]))
      setHasMore((data ?? []).length >= PAGE)
      setLoading(false)
    })()
    const filter = `channel_id=eq.${room.id}`
    rt = supabase
      .channel(`space:chat:${room.id}`, { config: { private: true } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'space_messages', filter }, (p) => apply(merge(itemsRef.current, [p.new as Message])))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'space_messages', filter }, (p) => apply(merge(itemsRef.current, [p.new as Message])))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'space_messages' }, (p) => {
        const id = (p.old as { id?: string })?.id
        if (id && itemsRef.current.some((m) => m.id === id)) apply(itemsRef.current.filter((m) => m.id !== id))
      })
      .subscribe()
    return () => {
      alive = false
      if (rt) void supabase.removeChannel(rt)
    }
  }, [room.id, apply])

  async function loadOlder() {
    const oldest = [...itemsRef.current].reverse().find((m) => !m.status)
    if (!oldest || !hasMore || loading) return
    setLoading(true)
    const { data } = await supabase.from('space_messages').select('*').eq('channel_id', room.id).lt('created_at', oldest.created_at).order('created_at', { ascending: false }).limit(PAGE)
    apply(merge(itemsRef.current, (data ?? []) as Message[]))
    setHasMore((data ?? []).length >= PAGE)
    setLoading(false)
  }

  async function deliver(item: Message) {
    const { data, error } = await supabase
      .from('space_messages')
      .insert({ channel_id: item.channel_id, author_id: item.author_id, content: item.content, client_nonce: item.client_nonce })
      .select('*')
      .single()
    if (error) {
      apply(itemsRef.current.map((m) => (m.id === item.id ? { ...m, status: 'failed' as const } : m)))
      Alert.alert('Mensagem', /RATE_LIMITED/.test(error.message) ? 'Calma! Muitas mensagens seguidas.' : friendly(error))
      return
    }
    apply(merge(itemsRef.current, [data as Message]))
  }

  function send() {
    const content = text.trim()
    if (!content) return
    setText('')
    const nonce = uuid()
    const item: Message = { id: `tmp-${nonce}`, channel_id: room.id, author_id: store.userId, content: content.slice(0, 4000), client_nonce: nonce, created_at: new Date().toISOString(), edited_at: null, status: 'sending' }
    apply(merge(itemsRef.current, [item]))
    void deliver(item)
  }

  function onLongPress(m: Message) {
    if (m.status === 'failed') {
      Alert.alert('Não enviada', m.content, [
        { text: 'Descartar', style: 'destructive', onPress: () => apply(itemsRef.current.filter((x) => x.id !== m.id)) },
        { text: 'Tentar de novo', onPress: () => { apply(itemsRef.current.map((x) => (x.id === m.id ? { ...x, status: 'sending' as const } : x))); void deliver(m) } },
      ])
      return
    }
    if (m.status || m.author_id !== store.userId) return
    Alert.alert('Mensagem', m.content, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('space_messages').delete().eq('id', m.id)
          if (error) Alert.alert('Mensagem', friendly(error))
          else apply(itemsRef.current.filter((x) => x.id !== m.id))
        },
      },
    ])
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ink700 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, height: 56, borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.ink800 }}>
        <Pressable onPress={onBack} hitSlop={10} style={{ padding: 6 }} accessibilityLabel="Voltar">
          <Icon name="arrow-left" size={18} color={colors.silver300} />
        </Pressable>
        <Icon name="hashtag" size={18} color={colors.silver500} />
        <Text style={{ flex: 1, color: colors.white, fontSize: 17, fontWeight: '800' }} numberOfLines={1}>{room.name}</Text>
      </View>

      <FlatList
        inverted
        data={items}
        keyExtractor={(m) => m.id}
        onEndReached={() => void loadOlder()}
        onEndReachedThreshold={0.4}
        contentContainerStyle={{ paddingVertical: 10 }}
        ListFooterComponent={
          !hasMore && !loading ? (
            <View style={{ padding: 16 }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.ink600, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Icon name="hashtag" size={26} color={colors.white} />
              </View>
              <Text style={{ color: colors.white, fontSize: 22, fontWeight: '800' }}>Bem-vindo a #{room.name}</Text>
              <Text style={{ color: colors.silver500, marginTop: 4 }}>Este é o começo do canal.</Text>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          const older = items[index + 1]
          const grouped = Boolean(older) && older.author_id === item.author_id && !older.status === !item.status && new Date(item.created_at).getTime() - new Date(older.created_at).getTime() < GROUP_MS
          const author = store.profile(item.author_id)
          const nameColor = SAFE_COLOR.test(author?.color || '') ? (author?.color as string) : colors.silver300
          return (
            <Pressable onLongPress={() => onLongPress(item)} delayLongPress={350} style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingTop: grouped ? 2 : 12, opacity: item.status === 'sending' ? 0.55 : 1 }}>
              <View style={{ width: 40 }}>{!grouped && <Avatar profile={author} size={40} />}</View>
              <View style={{ flex: 1 }}>
                {!grouped && (
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                    <Text style={{ color: nameColor, fontWeight: '800', fontSize: 15 }} numberOfLines={1}>{author?.name ?? 'Membro'}</Text>
                    <Text style={{ color: colors.silver700, fontSize: 11 }}>{timeLabel(item.created_at)}</Text>
                  </View>
                )}
                <Text style={{ color: colors.silver300, fontSize: 15, lineHeight: 21 }} selectable>
                  {item.content}
                  {item.edited_at ? <Text style={{ color: colors.silver700, fontSize: 11 }}> (editada)</Text> : null}
                </Text>
                {item.status === 'failed' && <Text style={{ color: colors.dangerSoft, fontSize: 12, marginTop: 2 }}>Não enviada · segure para tentar de novo</Text>}
              </View>
            </Pressable>
          )
        }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: colors.ink700 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={`Conversar em #${room.name}`}
          placeholderTextColor={colors.silver700}
          multiline
          maxLength={4000}
          style={{ flex: 1, minHeight: 44, maxHeight: 130, borderRadius: radius.xl, backgroundColor: colors.ink600, color: colors.white, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 16 }}
        />
        <Pressable onPress={send} disabled={!text.trim()} accessibilityLabel="Enviar" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? colors.brandDark : colors.ink600, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="paper-plane" size={17} color={text.trim() ? colors.white : colors.silver700} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}
