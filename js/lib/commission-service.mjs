/** RPC adapter. Financial writes are atomic and recalculated on the server. */
export function commissionService(db) {
  async function rpc(name, parameters) {
    try {
      const { data, error } = await db.rpc(name, parameters);
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[MSY][comissionamento-api]', error);
      throw error; // Page owns the visible error and retry state.
    }
  }
  return {
    read: (id = null, own = false) => rpc('commission_read', { p_id: id, p_own: own }),
    command: (action, id, version, payload = {}) => rpc('commission_command', { p_action: action, p_id: id, p_version: version, p_payload: payload }),
    delete: (id, version) => rpc('commission_delete', { p_id: id, p_version: version }),
  };
}
