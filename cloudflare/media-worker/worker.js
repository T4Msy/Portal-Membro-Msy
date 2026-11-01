// MSY Media Worker — guarda e entrega os arquivos públicos do portal no Cloudflare R2.
// Motivo: o R2 não cobra egress; no Supabase Free o download de anexos/vídeos/avatares
// estourava a cota (16 GB de 5 GB em out/2026). Banco, login e realtime continuam no Supabase.
//
// Chaves no R2 = "<bucket>/<caminho>" com o MESMO caminho que o Supabase Storage usava,
// então o site troca só o cliente de storage (js/core/media-store.js).
//
//   GET/HEAD /<bucket>/<caminho>      público (com Range, para vídeo). ?download=nome força baixar.
//   PUT      /<bucket>/<caminho>      logado; só no próprio caminho (1º nível = seu id, ou avatars/<seu id>)
//   DELETE   /<bucket>/<caminho>      dono do caminho ou diretoria (Jornal: editores)
//   POST     /_import {bucket, path}  diretoria; copia um arquivo do Supabase Storage para o R2
//
// Login: valida o JWT do Supabase (ES256) pela chave PÚBLICA do projeto (JWKS). Nenhum segredo aqui.
// Binding necessário: R2 bucket "MEDIA" -> msy-portal-media.

const SUPABASE_URL = 'https://lldzgkxpoyqauxdcjyaw.supabase.co'
const ISSUER = `${SUPABASE_URL}/auth/v1`
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`

const MB = 1024 * 1024
const IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const VIDEO = ['video/mp4', 'video/webm', 'video/quicktime']
// Mesmos limites dos buckets do Supabase (storage.buckets) em 01/11/2026.
const BUCKETS = {
  'activity-files': { maxBytes: 20 * MB, types: null },
  'social-media': { maxBytes: 50 * MB, types: [...IMAGE, ...VIDEO] },
  'jornal-media': { maxBytes: 50 * MB, types: [...IMAGE, ...VIDEO], editorsOnly: true },
  'space-profile-media': { maxBytes: 8 * MB, types: IMAGE },
}

const ALLOWED_ORIGINS = [
  /^https:\/\/(www\.)?portalmsy\.site$/,
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
]

function corsHeaders(req) {
  const origin = req.headers.get('Origin') || ''
  const allowed = ALLOWED_ORIGINS.some((re) => re.test(origin))
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://www.portalmsy.site',
    'Access-Control-Allow-Methods': 'GET, HEAD, PUT, DELETE, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-upsert, x-cache-control, range',
    'Access-Control-Expose-Headers': 'ETag, Content-Length, Content-Range, Accept-Ranges',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

const json = (req, body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })

// ---------- Login (JWT ES256 do Supabase) ----------
let jwksCache = { at: 0, keys: [] }

async function getJwks() {
  if (Date.now() - jwksCache.at < 10 * 60 * 1000 && jwksCache.keys.length) return jwksCache.keys
  const res = await fetch(JWKS_URL)
  if (!res.ok) throw new Error(`JWKS ${res.status}`)
  jwksCache = { at: Date.now(), keys: (await res.json()).keys || [] }
  return jwksCache.keys
}

const b64urlBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0))
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)))

async function verifyUser(req) {
  const auth = req.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const [h, p, sig] = token.split('.')
  if (!h || !p || !sig) return null
  let header, payload
  try {
    header = b64urlJson(h)
    payload = b64urlJson(p)
  } catch {
    return null
  }
  if (header.alg !== 'ES256') return null
  const jwk = (await getJwks()).find((k) => k.kid === header.kid)
  if (!jwk) return null
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64urlBytes(sig), new TextEncoder().encode(`${h}.${p}`))
  const now = Math.floor(Date.now() / 1000)
  if (!ok || payload.iss !== ISSUER || payload.aud !== 'authenticated' || !payload.sub || (payload.exp && payload.exp < now)) return null
  return { id: payload.sub, token }
}

// Pergunta ao Supabase, com o token do próprio usuário, se ele tem um papel (is_diretoria / has_permission).
async function supabaseRpc(req, user, fn, args = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${user.token}`, apikey: req.headers.get('apikey') || '', 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  return res.ok ? (await res.json()) === true : false
}

const isDiretoria = (req, user) => supabaseRpc(req, user, 'is_diretoria')
const canEditJornal = async (req, user) =>
  (await isDiretoria(req, user)) || supabaseRpc(req, user, 'has_permission', { perm: 'gerenciar_jornal' })

// ---------- Caminhos ----------
function parseKey(pathname) {
  const key = decodeURIComponent(pathname.replace(/^\/+/, ''))
  const [bucket, ...rest] = key.split('/')
  const path = rest.join('/')
  if (!BUCKETS[bucket] || !path || path.split('/').some((seg) => !seg || seg === '.' || seg === '..')) return null
  return { bucket, path, key: `${bucket}/${path}` }
}

// Mesma regra das policies do Supabase: 1º nível do caminho = id de quem enviou (avatares: avatars/<id>).
function ownsPath(user, path) {
  const parts = path.split('/')
  return parts[0] === user.id || (parts[0] === 'avatars' && parts[1] === user.id)
}

// ---------- Handlers ----------
async function handleGet(req, env, target, url) {
  const wantsRange = req.headers.has('Range')
  const obj = await env.MEDIA.get(target.key, { ...(wantsRange ? { range: req.headers } : {}), onlyIf: req.headers })
  if (obj === null) return new Response('Not found', { status: 404, headers: corsHeaders(req) })
  const headers = new Headers(corsHeaders(req))
  obj.writeHttpMetadata(headers)
  headers.set('ETag', obj.httpEtag)
  headers.set('Accept-Ranges', 'bytes')
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  const download = url.searchParams.get('download')
  if (download !== null) headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(download || target.path.split('/').pop())}`)
  if (!('body' in obj)) return new Response(null, { status: 304, headers })
  if (req.method === 'HEAD') {
    headers.set('Content-Length', String(obj.size))
    return new Response(null, { status: 200, headers })
  }
  if (wantsRange && obj.range && 'offset' in obj.range) {
    const end = obj.range.offset + obj.range.length - 1
    headers.set('Content-Range', `bytes ${obj.range.offset}-${end}/${obj.size}`)
    return new Response(obj.body, { status: 206, headers })
  }
  return new Response(obj.body, { status: 200, headers })
}

async function handlePut(req, env, target, user) {
  const rules = BUCKETS[target.bucket]
  if (!ownsPath(user, target.path)) return json(req, { error: 'Caminho não pertence ao usuário.' }, 403)
  if (rules.editorsOnly && !(await canEditJornal(req, user))) return json(req, { error: 'Sem permissão para este bucket.' }, 403)
  const size = Number(req.headers.get('Content-Length') || 0)
  if (!size) return json(req, { error: 'Content-Length obrigatório.' }, 411)
  if (size > rules.maxBytes) return json(req, { error: 'Payload too large: maximum allowed size exceeded.' }, 413)
  const contentType = (req.headers.get('Content-Type') || 'application/octet-stream').split(';')[0].trim()
  if (rules.types && !rules.types.includes(contentType)) return json(req, { error: `mime type ${contentType} is not supported` }, 415)
  const upsert = req.headers.get('x-upsert') === 'true'
  const obj = await env.MEDIA.put(target.key, req.body, {
    httpMetadata: { contentType, cacheControl: req.headers.get('x-cache-control') || 'public, max-age=31536000, immutable' },
    customMetadata: { owner: user.id },
    ...(upsert ? {} : { onlyIf: { etagDoesNotMatch: '*' } }),
  })
  if (obj === null) return json(req, { error: 'The resource already exists' }, 409)
  return json(req, { Key: target.key, path: target.path, size: obj.size })
}

async function handleDelete(req, env, target, user) {
  const rules = BUCKETS[target.bucket]
  const allowed = ownsPath(user, target.path)
    || (rules.editorsOnly ? await canEditJornal(req, user) : await isDiretoria(req, user))
  if (!allowed) return json(req, { error: 'Sem permissão para remover.' }, 403)
  await env.MEDIA.delete(target.key)
  return json(req, { removed: target.key })
}

// Copia do Supabase Storage (público) para o R2. Usado uma vez na migração; não sobrescreve.
async function handleImport(req, env, user) {
  if (!(await isDiretoria(req, user))) return json(req, { error: 'Só a diretoria.' }, 403)
  const { bucket, path } = await req.json().catch(() => ({}))
  const target = parseKey(`/${bucket}/${path}`)
  if (!target) return json(req, { error: 'bucket/path inválido.' }, 400)
  if (await env.MEDIA.head(target.key)) return json(req, { skipped: target.key })
  const src = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${target.bucket}/${target.path.split('/').map(encodeURIComponent).join('/')}`)
  if (!src.ok) return json(req, { error: `origem ${src.status}`, key: target.key }, 502)
  const obj = await env.MEDIA.put(target.key, src.body, {
    httpMetadata: { contentType: src.headers.get('Content-Type') || 'application/octet-stream', cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { imported: 'supabase' },
  })
  return json(req, { imported: target.key, size: obj.size })
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) })
    const url = new URL(req.url)
    try {
      if (url.pathname === '/' && req.method === 'GET') return json(req, { ok: true, service: 'msy-media' })
      if (url.pathname === '/_import' && req.method === 'POST') {
        const user = await verifyUser(req)
        return user ? handleImport(req, env, user) : json(req, { error: 'Unauthorized' }, 401)
      }
      const target = parseKey(url.pathname)
      if (!target) return json(req, { error: 'Not found' }, 404)
      if (req.method === 'GET' || req.method === 'HEAD') return handleGet(req, env, target, url)
      const user = await verifyUser(req)
      if (!user) return json(req, { error: 'Unauthorized' }, 401)
      if (req.method === 'PUT') return handlePut(req, env, target, user)
      if (req.method === 'DELETE') return handleDelete(req, env, target, user)
      return json(req, { error: 'Method not allowed' }, 405)
    } catch (err) {
      console.error('[MSY][media-worker]', err)
      return json(req, { error: 'Erro interno.' }, 500)
    }
  },
}
