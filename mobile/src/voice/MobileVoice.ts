import { mediaDevices, MediaStream, type MediaStreamTrack } from '@livekit/react-native-webrtc'
import { NativeModules } from 'react-native'
import InCallManager from 'react-native-incall-manager'
// Mesma camada WebRTC do site (ver metro.config.js).
import { getIceServers, hasTurn } from '@/features/voice/webrtc/iceServers'
import { MeshTransport } from '@/features/voice/webrtc/MeshTransport'
import { SignalingChannel } from '@/features/voice/webrtc/SignalingChannel'
import type { LinkState, MediaSlot, PresenceMeta, SenderEncoding } from './webrtcTypes'
import { supabase } from '../lib/supabase'
import { uuid } from '../lib/uuid'
import { stopKeepAlive } from './keepAlive'

export interface VoiceState {
  channelId: string
  muted: boolean
  deafened: boolean
  screen: boolean
  camera: boolean
}

export type Status = 'idle' | 'joining' | 'connected' | 'reconnecting' | 'error'

export interface RemotePeer {
  sessionId: string
  userId: string
  meta: PresenceMeta
  link: LinkState
  screen: MediaStream | null
  camera: MediaStream | null
}

export interface Snapshot {
  status: Status
  channelId: string | null
  error: string | null
  muted: boolean
  micAvailable: boolean
  deafened: boolean
  sharing: boolean
  localScreen: MediaStream | null
  /** Minha câmera (prévia). */
  camera: MediaStream | null
  peers: RemotePeer[]
  turn: boolean
  /** Quem está falando agora (sessionIds) e se eu estou falando — anel verde, como no Discord. */
  speaking: string[]
  selfSpeaking: boolean
  /** true = alto-falante; false = "do ouvido" (ou fone/Bluetooth, que o Android escolhe sozinho). */
  speaker: boolean
}

// Celular: tela reduzida pela metade (telas de celular têm resolução alta e o upload é limitado).
const ENCODINGS: Record<MediaSlot, SenderEncoding> = {
  mic: { maxBitrate: 48_000, priority: 'high', networkPriority: 'high' },
  camera: { maxBitrate: 1_000_000, maxFramerate: 30 },
  screen: { maxBitrate: 1_800_000, maxFramerate: 24, scaleResolutionDownBy: 2, priority: 'medium' },
  screenAudio: { maxBitrate: 64_000 },
}

const INITIAL: Snapshot = {
  status: 'idle',
  channelId: null,
  error: null,
  muted: false,
  micAvailable: false,
  deafened: false,
  sharing: false,
  localScreen: null,
  camera: null,
  peers: [],
  turn: false,
  speaker: true,
  speaking: [],
  selfSpeaking: false,
}

/** Sessão de voz do app MSY Space: entra na mesma sala do site, fala, ouve, câmera e transmite a tela. */
export class MobileVoice {
  readonly sessionId = uuid()
  private snap: Snapshot = INITIAL
  private listeners = new Set<() => void>()
  private signaling: SignalingChannel | null = null
  private transport: MeshTransport | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private levelTimer: ReturnType<typeof setInterval> | null = null
  private streams: Record<MediaSlot, MediaStream> | null = null
  private mic: MediaStreamTrack | null = null
  private screen: MediaStreamTrack | null = null
  private cameraTrack: MediaStreamTrack | null = null
  private roomName = 'Sala de voz'
  private peers = new Map<string, RemotePeer>()
  private remote = new Map<string, Partial<Record<MediaSlot, MediaStream>>>()
  private joinedAt = Date.now()
  private disposed = false

  constructor(
    private readonly userId: string,
    private readonly temporaryRoom: boolean,
    /** Estado de voz para a presença global (o site mostra quem está em cada sala). */
    private readonly onVoiceState: (state: VoiceState | null) => void = () => undefined,
  ) {}

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getSnapshot = () => this.snap
  private patch(p: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...p }
    this.listeners.forEach((l) => l())
  }

  async join(channelId: string, userLimit: number, roomName = 'Sala de voz'): Promise<void> {
    if (this.disposed) return // saiu antes de entrar (ex.: enquanto pedia permissão)
    this.patch({ status: 'joining', channelId, error: null })
    this.roomName = roomName
    InCallManager.start({ media: 'video' }) // modo chamada + alto-falante
    InCallManager.setForceSpeakerphoneOn(this.snap.speaker)

    this.streams = { mic: new MediaStream(), camera: new MediaStream(), screen: new MediaStream(), screenAudio: new MediaStream() }

    try {
      const s = await mediaDevices.getUserMedia({ audio: true, video: false })
      this.mic = s.getAudioTracks()[0] ?? null
      if (this.mic) this.streams.mic.addTrack(this.mic)
      this.patch({ micAvailable: Boolean(this.mic) })
    } catch {
      this.patch({ micAvailable: false, muted: true })
    }

    const ice = await getIceServers()
    this.patch({ turn: hasTurn(ice) })
    this.joinedAt = Date.now()

    this.signaling = new SignalingChannel(channelId, this.meta(), {
      onPeers: (metas) => this.onPeers(metas),
      onSignal: (env) => this.transport?.handleSignal(env),
      onMeta: (meta) => {
        const p = this.peers.get(meta.sessionId)
        if (!p || (meta.rev ?? 0) < (p.meta.rev ?? 0)) return
        p.meta = meta
        this.emitPeers()
      },
      onReaction: () => undefined,
      onWatch: (ev) => {
        if (ev.to === this.sessionId) this.transport?.setPeerWatching(ev.from, ev.watching)
      },
      onStatus: (st) => {
        if (this.disposed || this.snap.status === 'joining') return
        if (st === 'reconnecting') this.patch({ status: 'reconnecting' })
        if (st === 'connected') this.patch({ status: 'connected' })
      },
    })
    this.transport = new MeshTransport(
      this.sessionId,
      this.streams as unknown as Record<MediaSlot, globalThis.MediaStream>,
      ice,
      (env) => this.signaling?.sendSignal(env),
      {
        onRemoteTrack: (peerId, slot, _track, stream) => {
          const m = this.remote.get(peerId) ?? {}
          m[slot] = stream as unknown as MediaStream
          this.remote.set(peerId, m)
          this.emitPeers()
        },
        onPeerState: (peerId, state) => {
          const p = this.peers.get(peerId)
          if (p && state === 'closed') {
            this.peers.delete(peerId)
            this.remote.delete(peerId)
            this.emitPeers()
          } else if (p) {
            p.link = state
            this.emitPeers()
          }
        },
      },
      ENCODINGS,
    )
    if (this.mic) await this.transport.setTrack('mic', this.mic as unknown as globalThis.MediaStreamTrack)

    try {
      await this.signaling.join()
    } catch (e) {
      this.fail(e instanceof Error ? e.message : 'Não foi possível entrar na sala.')
      return
    }
    if (this.signaling.peers().length > userLimit) {
      this.fail(`A sala está cheia (limite de ${userLimit}).`)
      return
    }
    this.patch({ status: 'connected' })
    this.levelTimer = setInterval(() => void this.pollLevels(), 400)
    // Notificação fixa "Em chamada": mantém o app vivo e o microfone ativo em segundo plano.
    this.startService()
    this.publish()
    if (this.temporaryRoom) {
      void supabase.rpc('space_touch_room', { p_channel: channelId })
      this.heartbeat = setInterval(() => void supabase.rpc('space_touch_room', { p_channel: channelId }), 5 * 60_000)
    }
  }

  /** Alto-falante × "do ouvido" (como no Discord do celular). */
  toggleSpeaker() {
    const speaker = !this.snap.speaker
    InCallManager.setForceSpeakerphoneOn(speaker)
    this.patch({ speaker })
  }

  toggleMute() {
    if (!this.mic) return
    const muted = !this.snap.muted
    this.mic.enabled = !muted && !this.snap.deafened
    this.patch({ muted })
    this.publish()
  }

  toggleDeafen() {
    const deafened = !this.snap.deafened
    for (const m of this.remote.values()) for (const st of Object.values(m)) st?.getAudioTracks().forEach((t) => (t.enabled = !deafened))
    if (this.mic) this.mic.enabled = !this.snap.muted && !deafened
    this.patch({ deafened })
    this.publish()
  }

  async startScreen(): Promise<void> {
    if (this.screen || !this.transport || !this.streams) return
    const stream = await mediaDevices.getDisplayMedia()
    const track = stream.getVideoTracks()[0]
    if (!track) throw new Error('A captura de tela não retornou vídeo.')
    this.screen = track
    track.addEventListener('ended', () => void this.stopScreen())
    this.streams.screen.getTracks().forEach((t) => this.streams?.screen.removeTrack(t))
    this.streams.screen.addTrack(track)
    await this.transport.setTrack('screen', track as unknown as globalThis.MediaStreamTrack)
    this.patch({ sharing: true, localScreen: stream })
    this.publish()
  }

  async stopScreen(): Promise<void> {
    const t = this.screen
    if (!t) return
    this.screen = null
    await this.transport?.setTrack('screen', null)
    t.stop()
    this.patch({ sharing: false, localScreen: null })
    this.publish()
  }

  /** Liga/desliga a câmera (frontal). Quem assiste vê no formato do celular: em pé ou deitado. */
  async toggleCamera(): Promise<void> {
    if (!this.transport || !this.streams) return
    if (this.cameraTrack) {
      const t = this.cameraTrack
      this.cameraTrack = null
      await this.transport.setTrack('camera', null)
      this.streams.camera.getTracks().forEach((x) => this.streams?.camera.removeTrack(x))
      t.stop()
      this.patch({ camera: null })
    } else {
      const s = await mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: 1280, height: 720, frameRate: 30 } })
      const track = s.getVideoTracks()[0]
      if (!track) throw new Error('A câmera não retornou vídeo.')
      this.cameraTrack = track
      this.streams.camera.getTracks().forEach((x) => this.streams?.camera.removeTrack(x))
      this.streams.camera.addTrack(track)
      await this.transport.setTrack('camera', track as unknown as globalThis.MediaStreamTrack)
      this.patch({ camera: s })
    }
    this.startService() // atualiza o tipo do serviço (câmera fora do app)
    this.publish()
  }

  /** Troca entre câmera frontal e traseira. */
  switchCamera() {
    this.cameraTrack?._switchCamera()
  }

  setWatching(sharerSessionId: string, watching: boolean) {
    this.signaling?.sendWatch({ from: this.sessionId, to: sharerSessionId, watching })
  }

  leave() {
    if (this.disposed) return
    this.disposed = true
    const channelId = this.snap.channelId
    if (this.temporaryRoom && channelId && this.peers.size === 0) void supabase.rpc('space_mark_room_empty', { p_channel: channelId })
    if (this.heartbeat) clearInterval(this.heartbeat)
    if (this.levelTimer) clearInterval(this.levelTimer)
    this.signaling?.leave()
    this.transport?.close()
    this.mic?.stop()
    this.screen?.stop()
    this.cameraTrack?.stop()
    this.onVoiceState(null)
    InCallManager.stop()
    void NativeModules.CallService?.stop().catch(() => undefined)
    stopKeepAlive()
    this.patch({ ...INITIAL, speaker: this.snap.speaker })
  }

  // ---------------------------------------------------------------------------

  private startService() {
    void NativeModules.CallService?.start(this.roomName, Boolean(this.cameraTrack)).catch(() => undefined)
  }

  private fail(message: string) {
    this.leave()
    this.patch({ status: 'error', error: message })
  }

  private meta(): PresenceMeta {
    const s = this.streams
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      muted: this.snap.muted || !this.snap.micAvailable,
      deafened: this.snap.deafened,
      camera: Boolean(this.cameraTrack),
      screen: this.snap.sharing,
      screenAudio: false,
      screenLabel: this.snap.sharing ? 'Tela do celular' : null,
      streams: {
        mic: s?.mic.id ?? '',
        camera: s?.camera.id ?? '',
        screen: s?.screen.id ?? '',
        screenAudio: s?.screenAudio.id ?? '',
      },
      joinedAt: this.joinedAt,
    }
  }

  /** Nível de áudio pelas estatísticas do WebRTC (o app não tem AudioContext como o site). */
  private async pollLevels() {
    const links = (this.transport as unknown as { links?: Map<string, { pc?: RTCPeerConnection }> } | null)?.links
    if (!links || this.disposed) return
    const speaking: string[] = []
    let self = false
    for (const [id, link] of links) {
      if (!link.pc) continue
      try {
        const report = await link.pc.getStats()
        let level = 0
        report.forEach((s: { type: string; kind?: string; audioLevel?: number }) => {
          if (s.type === 'inbound-rtp' && s.kind === 'audio' && typeof s.audioLevel === 'number') level = Math.max(level, s.audioLevel)
          if (s.type === 'media-source' && s.kind === 'audio' && typeof s.audioLevel === 'number' && s.audioLevel > 0.04) self = true
        })
        if (level > 0.04) speaking.push(id)
      } catch {
        /* conexão fechando */
      }
    }
    if (this.snap.muted || this.snap.deafened || !this.snap.micAvailable) self = false
    if (speaking.join() !== this.snap.speaking.join() || self !== this.snap.selfSpeaking) this.patch({ speaking, selfSpeaking: self })
  }

  private publish() {
    void this.signaling?.updateMeta(this.meta())
    if (this.snap.channelId && this.snap.status !== 'joining') {
      this.onVoiceState({ channelId: this.snap.channelId, muted: this.snap.muted || !this.snap.micAvailable, deafened: this.snap.deafened, screen: this.snap.sharing, camera: Boolean(this.cameraTrack) })
    }
  }

  private onPeers(metas: PresenceMeta[]) {
    const others = metas.filter((m) => m.sessionId !== this.sessionId)
    const seen = new Set<string>()
    for (const incoming of others) {
      seen.add(incoming.sessionId)
      const prev = this.peers.get(incoming.sessionId)
      const meta = prev && (prev.meta.rev ?? 0) > (incoming.rev ?? 0) ? prev.meta : incoming
      this.peers.set(meta.sessionId, { sessionId: meta.sessionId, userId: meta.userId, meta, link: this.transport?.linkState(meta.sessionId) ?? prev?.link ?? 'connecting', screen: null, camera: null })
    }
    for (const id of [...this.peers.keys()]) {
      // Sumiu da presença mas a mídia segue ativa: mantém (o transporte decide quando encerrar).
      if (!seen.has(id) && this.peers.get(id)?.link !== 'connected') {
        this.peers.delete(id)
        this.remote.delete(id)
      }
    }
    this.transport?.syncPeers(metas)
    this.emitPeers()
  }

  private emitPeers() {
    const list: RemotePeer[] = []
    for (const p of this.peers.values()) {
      const m = this.remote.get(p.sessionId)
      const screen = p.meta.screen ? (m?.screen ?? null) : null
      const camera = p.meta.camera ? (m?.camera ?? null) : null
      if (this.snap.deafened && m) Object.values(m).forEach((st) => st?.getAudioTracks().forEach((t) => (t.enabled = false)))
      list.push({ ...p, screen, camera })
    }
    this.patch({ peers: list })
  }
}
