// Ponte para o cliente Supabase do portal.
// O MSY Space usa a MESMA sessão do portal: o `db` criado em js/app.js e exposto em
// window.MSY (ponte oficial do portal para ES modules). Nada de login próprio.
export const supabase = window.MSY.db;
