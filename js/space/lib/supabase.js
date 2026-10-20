// Ponte para o cliente Supabase do portal.
// O MSY Space usa a MESMA sessão do portal: o `db` criado em js/app.js e exposto em
// window.MSY (ponte oficial do portal para ES modules). Nada de login próprio.
export const supabase = window.MSY.db;

// Sinal de vida do tempo real num Web Worker: com o site em segundo plano o navegador atrasa
// os timers da página e o Supabase derrubava a conexão (a chamada "sumia" para os outros).
// Precisa ser ligado antes da primeira conexão (o portal não usa tempo real nesta página).
if (supabase.realtime && !supabase.realtime.isConnected()) supabase.realtime.worker = true;
