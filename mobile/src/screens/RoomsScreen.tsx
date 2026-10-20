import { useCallback, useEffect, useState } from 'react'
import { FlatList, Modal, Pressable, RefreshControl, Text, View } from 'react-native'
import { createRoom, friendly, joinByCode, voiceRooms, type Room } from '../lib/api'
import { supabase } from '../lib/supabase'
import { Btn, Card, ErrorText, Input, s } from '../ui/components'
import { colors } from '../ui/theme'

interface Props {
  displayName: string
  onOpen: (room: Room) => void
}

export function RoomsScreen({ displayName, onOpen }: Props) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | 'join' | 'create'>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRooms(await voiceRooms())
      setError(null)
    } catch (e) {
      setError(friendly(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function confirmDialog() {
    setBusy(true)
    try {
      if (dialog === 'join') {
        const id = await joinByCode(text)
        const list = await voiceRooms()
        setRooms(list)
        const room = list.find((r) => r.id === id)
        if (room) onOpen(room)
      } else {
        const created = await createRoom(text)
        const list = await voiceRooms()
        setRooms(list)
        const room = list.find((r) => r.id === created.id)
        if (room) onOpen(room)
      }
      setDialog(null)
      setText('')
    } catch (e) {
      setError(friendly(e))
      setDialog(null)
    } finally {
      setBusy(false)
    }
  }

  const fixed = rooms.filter((r) => !r.is_temporary)
  const temp = rooms.filter((r) => r.is_temporary)

  return (
    <View style={[s.screen, { padding: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={s.h1}>MSY Space</Text>
          <Text style={s.muted}>Olá, {displayName} · salas de voz</Text>
        </View>
        <Pressable onPress={() => void supabase.auth.signOut()}>
          <Text style={{ color: colors.silver500 }}>Sair</Text>
        </Pressable>
      </View>
      {error && <ErrorText>{error}</ErrorText>}
      <FlatList
        data={[...fixed, ...temp]}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.brand} />}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => onOpen(item)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <Card>
              <Text style={{ color: colors.white, fontSize: 16, fontWeight: '600' }}>
                🔊 {item.name}
                {item.is_private ? '  🔒' : ''}
              </Text>
              {item.is_temporary && <Text style={[s.muted, { marginTop: 4 }]}>Sala com código · {item.join_code}</Text>}
            </Card>
          </Pressable>
        )}
        ListFooterComponent={
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <View style={{ flex: 1 }}>
              <Btn title="Criar sala" onPress={() => setDialog('create')} />
            </View>
            <View style={{ flex: 1 }}>
              <Btn title="Usar código" tone="secondary" onPress={() => setDialog('join')} />
            </View>
          </View>
        }
      />
      <Modal visible={dialog !== null} transparent animationType="fade" onRequestClose={() => setDialog(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 }}>
          <Card>
            <Text style={[s.h1, { marginBottom: 12 }]}>{dialog === 'join' ? 'Entrar com código' : 'Criar sala com código'}</Text>
            <Input
              label={dialog === 'join' ? 'Código da sala' : 'Nome da sala (opcional)'}
              placeholder={dialog === 'join' ? 'XXXX-XXXX' : 'Ex.: Squad de sexta'}
              autoCapitalize={dialog === 'join' ? 'characters' : 'sentences'}
              value={text}
              onChangeText={setText}
              maxLength={dialog === 'join' ? 12 : 40}
            />
            <Btn title={dialog === 'join' ? 'Entrar' : 'Criar'} onPress={() => void confirmDialog()} loading={busy} />
            <Btn title="Cancelar" tone="secondary" onPress={() => setDialog(null)} />
          </Card>
        </View>
      </Modal>
    </View>
  )
}
