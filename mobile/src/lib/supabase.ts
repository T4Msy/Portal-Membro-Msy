import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'

/** Mesmo projeto Supabase do site; sessão guardada no aparelho. */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  // Protocolo JSON (1.0.0): o padrão 2.0.0 manda broadcasts em frames binários,
  // que o WebSocket do React Native não entrega corretamente (o app não recebia
  // as respostas de conexão do site — diagnosticado no 1º teste real).
  realtime: { params: { eventsPerSecond: 20 }, vsn: '1.0.0' },
})

export const supabaseUrl = SUPABASE_URL
export const supabaseAnonKey = SUPABASE_ANON_KEY
export const isSupabaseConfigured = true
