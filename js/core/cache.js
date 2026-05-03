/**
 * MSY Cache — módulo de cache em memória com TTL por chave.
 *
 * Uso (classic script, carregado antes de app.js):
 *   MSYCache.set('profiles', data, 120_000)   // TTL: 2 min em ms
 *   MSYCache.get('profiles')                  // null se expirado/ausente
 *   MSYCache.invalidate('profiles')
 *   MSYCache.invalidatePrefix('activity_')
 *   MSYCache.clear()
 */
const MSYCache = (() => {
  const _store = new Map();

  function set(key, value, ttlMs = 60_000) {
    _store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  function get(key) {
    const entry = _store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      _store.delete(key);
      return null;
    }
    return entry.value;
  }

  function invalidate(key) {
    _store.delete(key);
  }

  function invalidatePrefix(prefix) {
    for (const key of _store.keys()) {
      if (key.startsWith(prefix)) _store.delete(key);
    }
  }

  function clear() {
    _store.clear();
  }

  function has(key) {
    return get(key) !== null;
  }

  return { set, get, invalidate, invalidatePrefix, clear, has };
})();
