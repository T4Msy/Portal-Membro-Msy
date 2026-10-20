// Gera o APK de release e copia para mobile/apk/MSY-Space.apk (fora do git).
// --rerun no bundle JS: o Gradle não percebe mudanças em ../js/space (camada de chamada compartilhada com o site).
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const mobile = join(dirname(fileURLToPath(import.meta.url)), '..')
const android = join(mobile, 'android')
const win = process.platform === 'win32'

execFileSync(win ? 'cmd.exe' : './gradlew', [...(win ? ['/c', join(android, 'gradlew.bat')] : []), ':app:createBundleReleaseJsAndAssets', '--rerun', 'assembleRelease'], {
  cwd: android,
  stdio: 'inherit',
})

const out = join(mobile, 'apk', 'MSY-Space.apk')
mkdirSync(dirname(out), { recursive: true })
copyFileSync(join(android, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'), out)
console.log(`APK copiado para ${out}`)
