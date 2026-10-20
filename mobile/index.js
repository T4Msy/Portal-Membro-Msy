/**
 * @format
 */

import { AppRegistry } from 'react-native'
import App from './App'
import { name as appName } from './app.json'
import { keepAliveTask } from './src/voice/keepAlive'

AppRegistry.registerComponent(appName, () => App)

// Tarefa "headless" iniciada pelo CallService durante a chamada. Ela só termina
// ao sair da sala (stopKeepAlive): enquanto existe, o React Native mantém os timers do JS rodando em
// segundo plano (sinal de vida do Supabase, reconexão, etc.). Termina quando o
// serviço é parado ao sair da sala.
AppRegistry.registerHeadlessTask('MasayoshiCallKeepAlive', () => keepAliveTask)
