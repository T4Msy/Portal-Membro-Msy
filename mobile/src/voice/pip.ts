import { useEffect, useState } from 'react'
import { Alert, NativeEventEmitter, NativeModules } from 'react-native'

const native = NativeModules.CallService as
  | {
      configurePip(inCall: boolean, width: number, height: number): void
      pipStatus(): Promise<'allowed' | 'denied' | 'unsupported'>
      openPipSettings(): void
      setOrientation(mode: 'landscape' | 'portrait' | 'auto'): void
    }
  | undefined

/** true enquanto a sala estiver na janela flutuante (Picture-in-Picture). */
export function usePipMode(): boolean {
  const [pip, setPip] = useState(false)
  useEffect(() => {
    if (!native) return
    const sub = new NativeEventEmitter(NativeModules.CallService).addListener('masayoshiPip', (v: boolean) => setPip(Boolean(v)))
    return () => sub.remove()
  }, [])
  return pip
}

/** Em chamada: sair do app abre a janelinha com a proporção do vídeo principal. */
export function configurePip(inCall: boolean, width = 9, height = 16): void {
  native?.configurePip(inCall, Math.round(width), Math.round(height))
}

export function setOrientation(mode: 'landscape' | 'portrait' | 'auto'): void {
  native?.setOrientation(mode)
}

let asked = false

/** Se a janela flutuante estiver desligada nas configurações, pede para ligar (uma vez por uso do app). */
export async function askPipPermission(): Promise<void> {
  if (!native || asked) return
  asked = true
  const status = await native.pipStatus().catch(() => 'unsupported' as const)
  if (status !== 'denied') return
  Alert.alert(
    'Janela flutuante',
    'Para a chamada continuar numa janelinha por cima dos outros apps quando você sair, ative "Picture-in-picture" (Imagem em imagem) para o MSY Space.',
    [
      { text: 'Agora não', style: 'cancel' },
      { text: 'Ativar', onPress: () => native.openPipSettings() },
    ],
  )
}
