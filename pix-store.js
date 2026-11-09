"use strict";

window.ReisPixStore = (() => {
  const STORE = "reis-cash-pix-sync-v1";
  const LEGACY = "reis-cash-pix-creditors-v1";

  function check(event) {
    if (!event || typeof event.id !== "string" || !/^[a-zA-Z0-9-]{1,150}$/.test(event.id) ||
        !Number.isSafeInteger(event.clock) || event.clock < 0 ||
        !Array.isArray(event.changes) || event.changes.length > 10000) throw Error("Histórico Pix inválido.");
    for (const change of event.changes) {
      if (!change || typeof change.id !== "string" || !change.id || change.id.length > 150) throw Error("Credor Pix inválido.");
      const value = change.value;
      if (value === null) continue;
      if (!value || value.id !== change.id ||
          !["label", "receiver", "city", "key", "type"].every(field => typeof value[field] === "string" && value[field].length <= 120)) throw Error("Cadastro Pix inválido.");
      ReisPix.payload(value, 1);
    }
    return event;
  }

  function create(storage, uuid = () => crypto.randomUUID(), now = () => Date.now()) {
    let state;
    const union = (...lists) => ReisSyncCore.union(...lists);
    function refresh() {
      const raw = storage.getItem(STORE);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.version !== 1 || !Array.isArray(saved.events) || !Array.isArray(saved.uploaded) ||
          (saved.account !== null && (typeof saved.account?.sub !== "string" || typeof saved.account?.email !== "string"))) throw Error("Armazenamento Pix inválido.");
      saved.events.forEach(check);
      if (state?.account && saved.account && state.account.sub !== saved.account.sub) throw Error("A conta Google do cadastro Pix mudou.");
      state = { ...saved, account: saved.account || state?.account || null, events: union(state?.events || [], saved.events),
        uploaded: [...new Set([...(state?.uploaded || []), ...saved.uploaded])] };
    }

    function records() {
      const result = new Map();
      for (const event of state.events) {
        for (const change of event.changes) {
          if (change.value === null) result.delete(change.id);
          else result.set(change.id, change.value);
        }
      }
      return structuredClone([...result.values()]);
    }

    function commit(next) {
      storage.setItem(STORE, JSON.stringify(next));
      state = next;
      return records();
    }

    refresh();
    if (!state) {
      const legacy = JSON.parse(storage.getItem(LEGACY) || "[]");
      if (!Array.isArray(legacy)) throw Error("Cadastro Pix local inválido.");
      const changes = legacy.map(value => ({ id: value.id, value: { ...value, label: value.label || value.receiver } }));
      // Legacy entries have no edit timestamps. Synced edits and removals take precedence.
      const events = changes.length ? [check({ id: uuid(), clock: 0, changes })] : [];
      commit({ version: 1, account: null, events, uploaded: [], lastSync: null });
    }
    return {
      read() { refresh(); return records(); },
      write(id, value, previous) {
        refresh();
        const current = records().find(record => record.id === id) || null;
        if (JSON.stringify(previous) !== JSON.stringify(current)) throw Error("Este cadastro foi alterado em outro navegador. Selecione o credor novamente antes de salvar.");
        if (JSON.stringify(current) === JSON.stringify(value)) return records();
        const clock = state.events.reduce((max, event) => Math.max(max, event.clock + 1), Math.max(1, now()));
        const event = check({ id: uuid(), clock, changes: [{ id, value }] });
        return commit({ ...state, events: union(state.events, [event]) });
      },
      merge(events, uploaded = []) {
        events.forEach(check);
        refresh();
        return commit({ ...state, events: union(state.events, events), uploaded: [...new Set([...state.uploaded, ...uploaded])] });
      },
      bind(account) {
        refresh();
        if (state.account && state.account.sub !== account.sub) throw Error("As chaves Pix pertencem à conta " + state.account.email + ".");
        commit({ ...state, account });
      },
      info() { refresh(); return structuredClone(state); },
      pending() { refresh(); return state.events.filter(event => !state.uploaded.includes(event.id)); },
      synced() { refresh(); commit({ ...state, lastSync: new Date().toISOString() }); }
    };
  }

  return { STORE, create, check };
})();
