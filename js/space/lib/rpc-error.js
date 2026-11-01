/** Mensagem segura e acionável para RPCs ausentes/fora do cache do PostgREST. */
export function rpcErrorContext(error, response = {}) {
  return {
    httpStatus: response.status ?? error?.status ?? null,
    statusText: response.statusText ?? error?.statusText ?? null,
    code: error?.code ?? null,
    message: error?.message ?? String(error ?? 'Erro desconhecido'),
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  };
}

export function rpcFailureMessage(error, name, fallback) {
  const code = String(error?.code || '');
  const status = Number(error?.status || 0);
  if (code === 'PGRST202' || (status === 404 && /function|schema cache/i.test(error?.message || ''))) {
    return `O Supabase ainda não reconhece ${name}. Confira se a migration de canais e DMs foi aplicada ao projeto do portal e atualize o cache do esquema da API.`;
  }
  if (code === 'PGRST203') {
    return `O Supabase encontrou assinaturas ambíguas para ${name}. Revise a assinatura da função e atualize o cache do esquema da API.`;
  }
  return fallback;
}
