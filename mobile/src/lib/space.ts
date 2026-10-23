// Estado do MSY Space no app (equivalente a workspace.js + online.js + voice-controller.js do site).
// Uma instância só, viva enquanto o app está logado: a chamada continua ao trocar de tela
// (lista de canais, chat), como no Discord.
import type { RealtimeChannel } from '@supabase/supabase-js'
import { PresenceThrottle } from '@/lib/presenceThrottle'
import { loadWorkspace, type Category, type Profile, type Room } from './api'
import { supabase } from './supabase'
import { uuid } from './uuid'
import { MobileVoice, type VoiceState } from '../voice/MobileVoice'
import { askCallPermissions } from '../voice/permissions'

export interface VoiceMember extends VoiceState {
  userId: string
}

interface OnlineMeta {
  tabId: string
  sessionId: string
  userId: string
  voice: VoiceState | null
  joinedAt: number
}

export interface SpaceSnapshot {
  ready: boolean
  categories: Category[]
  channels: Room[]
  profiles: Map<string, Profile>
  /** channelId -> quem está na sala (presença global, inclui quem está no site). */
  voiceByChannel: Map<string, VoiceMember[]>
  /** Sessão de voz ativa (null fora de chamada). */
  voice: MobileVoice | null
  voiceRoom: Room | null
}

export class SpaceStore {
  private snap: SpaceSnapshot = {
    ready: false,
    categories: [],
    channels: [],
    profiles: new Map(),
    voiceByChannel: new Map(),
    voice: null,
    voiceRoom: null,
  }
  private listeners = new Set<() => void>()
  private structure: RealtimeChannel | null = null
  private online: RealtimeChannel | null = null
  private readonly tabId = uuid()
  private meta: OnlineMeta
  private throttle = new PresenceThrottle(15_000, (m: OnlineMeta) => this.online?.track(m) ?? Promise.resolve())
  private reloadTimer: ReturnType<typeof setTimeout> | null = null

  constructor(readonly userId: string) {
    this.meta = { tabId: this.tabId, sessionId: this.tabId, userId, voice: null, joinedAt: Date.now() }
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getSnapshot = () => this.snap
  private patch(p: Partial<SpaceSnapshot>) {
    this.snap = { ...this.snap, ...p }
    this.listeners.forEach((l) => l())
  }

  async start(): Promise<void> {
    await this.reload()
    // Estrutura ao vivo (canal criado/apagado no site aparece aqui), como o 'space:workspace' do site.
    let ch = supabase.channel('space:workspace', { config: { private: true } })
    for (const table of ['space_channels', 'space_categories', 'space_channel_members']) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        if (this.reloadTimer) clearTimeout(this.reloadTimer)
        this.reloadTimer = setTimeout(() => void this.reload().catch(() => undefined), 300)
      })
    }
    this.structure = ch.subscribe()

    // Presença global: quem está em cada sala de voz (mesmo formato do site).
    const on = supabase.channel('space:online', { config: { private: true, presence: { key: this.tabId } } })
    this.online = on
    on.on('presence', { event: 'sync' }, () => this.syncPresence()).subscribe((status) => {
      if (status === 'SUBSCRIBED') this.throttle.push(this.meta, true)
    })
  }

  async reload(): Promise<void> {
    const w = await loadWorkspace()
    this.patch({ ...w, ready: true })
  }

  private syncPresence() {
    if (!this.online) return
    const map = new Map<string, VoiceMember[]>()
    for (const list of Object.values(this.online.presenceState()) as unknown as OnlineMeta[][]) {
      const m = list[list.length - 1]
      if (!m?.voice) continue
      const arr = map.get(m.voice.channelId) ?? []
      if (!arr.some((x) => x.userId === m.userId)) arr.push({ ...m.voice, userId: m.userId })
      map.set(m.voice.channelId, arr)
    }
    this.patch({ voiceByChannel: map })
  }

  profile(id: string | null | undefined): Profile | null {
    return id ? (this.snap.profiles.get(id) ?? null) : null
  }

  channel(id: string | null | undefined): Room | null {
    return this.snap.channels.find((c) => c.id === id) ?? null
  }

  /** Entra na sala (sai da anterior). A sessão fica no store, não na tela. */
  joinVoice(room: Room): MobileVoice {
    const current = this.snap.voice
    if (current && this.snap.voiceRoom?.id === room.id && current.getSnapshot().status !== 'error') return current
    current?.leave()
    const voice = new MobileVoice(this.userId, room.is_temporary, (state) => {
      this.meta = { ...this.meta, voice: state }
      this.throttle.push(this.meta)
    })
    // Caiu com erro (sala cheia, sem conexão): some da barra de "voz conectada".
    voice.subscribe(() => {
      if (voice.getSnapshot().status === 'error' && this.snap.voice === voice) this.patch({ voice: null, voiceRoom: null })
    })
    this.patch({ voice, voiceRoom: room })
    void askCallPermissions().then(() => voice.join(room.id, room.user_limit, room.name))
    return voice
  }

  leaveVoice() {
    this.snap.voice?.leave()
    this.patch({ voice: null, voiceRoom: null })
  }

  stop() {
    this.leaveVoice()
    this.throttle.cancel()
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    if (this.structure) void supabase.removeChannel(this.structure)
    if (this.online) void supabase.removeChannel(this.online)
    this.structure = null
    this.online = null
  }
}
