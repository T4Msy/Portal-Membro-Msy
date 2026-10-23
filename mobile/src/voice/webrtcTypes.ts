// Tipos da camada de chamada compartilhada com o site (js/space/voice/webrtc é JS, sem tipos).
// Copiado de Masayoshi-Plataforma/src/features/voice/webrtc/types.ts.
/** Tipos de mídia que cada participante publica. Cada um tem um "slot" fixo
 *  (transceiver) por conexão; ligar/desligar troca a track sem renegociar. */
export type MediaSlot = 'mic' | 'camera' | 'screen' | 'screenAudio'

export const SLOTS: MediaSlot[] = ['mic', 'camera', 'screen', 'screenAudio']
export const SLOT_KIND: Record<MediaSlot, 'audio' | 'video'> = {
  mic: 'audio',
  camera: 'video',
  screen: 'video',
  screenAudio: 'audio',
}

/** Estado público de um participante (vai na presença do canal de voz). */
export interface PresenceMeta {
  sessionId: string
  userId: string
  muted: boolean
  deafened: boolean
  camera: boolean
  screen: boolean
  screenAudio: boolean
  screenLabel: string | null
  /** id do MediaStream de cada slot — o receptor usa para saber o que é cada track. */
  streams: Record<MediaSlot, string>
  joinedAt: number
  /** Versão do estado (cresce a cada mudança): evita que uma presença atrasada desfaça um estado mais novo. */
  rev?: number
}

export interface SignalEnvelope {
  from: string
  to: string
  epoch: number
  description?: RTCSessionDescriptionInit
  candidates?: RTCIceCandidateInit[]
  reset?: boolean
}

export interface ReactionEvent {
  from: string
  emoji: string
}

/** Pedido de um espectador para (não) receber a tela de quem transmite. */
export interface WatchEvent {
  from: string
  to: string
  watching: boolean
}

export type LinkState = 'new' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed'

export interface SenderEncoding {
  maxBitrate?: number
  maxFramerate?: number
  scaleResolutionDownBy?: number
  priority?: RTCPriorityType
  networkPriority?: RTCPriorityType
}

/**
 * Contrato do transporte de mídia. Hoje: MeshTransport (P2P).
 * Futuro: SfuTransport (ex.: Cloudflare Realtime) com a mesma interface,
 * sem mudar a sessão de voz nem a interface.
 */
export interface MediaTransport {
  setTrack(slot: MediaSlot, track: MediaStreamTrack | null): Promise<void>
  setEncoding(slot: MediaSlot, enc: SenderEncoding): void
  /** Atualiza a lista de participantes (vinda da presença). */
  syncPeers(peers: PresenceMeta[]): void
  handleSignal(env: SignalEnvelope): void
  /** Espectador pediu para parar/voltar a receber minha tela. */
  setPeerWatching(peerSessionId: string, watching: boolean): void
  close(): void
}

export interface TransportEvents {
  onRemoteTrack(peerSessionId: string, slot: MediaSlot, track: MediaStreamTrack, stream: MediaStream): void
  onPeerState(peerSessionId: string, state: LinkState): void
  onStats?(peerSessionId: string, stats: LinkStats): void
}

export interface LinkStats {
  rttMs: number | null
  outKbps: number
  inKbps: number
  relayed: boolean
  /** Maior taxa de quadros de vídeo recebida deste participante. */
  inFps: number | null
  /** Motivo de limitação do vídeo enviado ('cpu' | 'bandwidth' | 'other'), se houver. */
  limitation: string | null
}
