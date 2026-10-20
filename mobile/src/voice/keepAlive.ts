/** Tarefa headless que mantém os timers do JS vivos durante a chamada (ver CallService.kt). */
let release: (() => void) | null = null

export function keepAliveTask(): Promise<void> {
  return new Promise<void>((resolve) => {
    release?.()
    release = resolve
  })
}

/** Encerra a tarefa (chamado ao sair da sala). */
export function stopKeepAlive(): void {
  release?.()
  release = null
}
