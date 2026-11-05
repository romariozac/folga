// Persistência: localStorage sempre (rápido, offline) e, quando o app roda como artefato
// do Claude, sincroniza com o banco privado do usuário (data/users/<id>/...).
// Documentos: "core" (plano, ajustes, jogo) e "m-YYYY-MM" (lançamentos do mês).
import { emptyState, defaultCore, migrateCore } from './model.js';
import { sleep } from './util.js';

const LS_KEY = 'folga:v1';
const clone = (o) => JSON.parse(JSON.stringify(o));

export function normalize(raw) {
  const base = emptyState();
  const src = raw && typeof raw === 'object' ? raw : {};
  const core = Object.assign(base.core, clone(src.core || {}));
  const d = defaultCore();
  core.settings = Object.assign(d.settings, core.settings || {});
  core.game = Object.assign(d.game, core.game || {});
  if (!Array.isArray(core.cats)) core.cats = d.cats;
  if (!Array.isArray(core.plan)) core.plan = [];
  const migrated = migrateCore(core);
  const months = {};
  for (const [mk, m] of Object.entries(src.months || {})) {
    if (/^\d{4}-\d{2}$/.test(mk) && m && Array.isArray(m.tx)) months[mk] = { updatedAt: m.updatedAt || 0, tx: clone(m.tx) };
  }
  return { core, months, migrated };
}

export const store = {
  S: null,
  lsOK: true,
  mode: 'local', // 'local' | 'cloud'
  status: 'local', // local | connecting | synced | offline | quota | error
  _col: null,
  _dirty: new Set(),
  _timer: null,
  _writing: false,
  _onStatus: () => {},

  loadLocal() {
    let raw = null;
    try {
      raw = localStorage.getItem(LS_KEY);
    } catch {
      this.lsOK = false;
    }
    let parsed = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
    }
    const n = normalize(parsed);
    this.S = { core: n.core, months: n.months };
    this.migrated = !!parsed && n.migrated;
    return { S: this.S, hadLocal: !!parsed };
  },

  writeLocal() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.S));
      this.lsOK = true;
    } catch {
      this.lsOK = false;
    }
  },

  /** Salva as partes alteradas: 'core' e/ou 'm-YYYY-MM'. */
  save(keys) {
    const now = Date.now();
    for (const k of keys) {
      if (k === 'core') this.S.core.updatedAt = now;
      else {
        const mk = k.slice(2);
        if (this.S.months[mk]) this.S.months[mk].updatedAt = now;
      }
      this._dirty.add(k);
    }
    this.writeLocal();
    this._schedule();
  },

  /** Substitui tudo (importar backup / apagar). Mantém a identidade do objeto S. */
  replaceAll(raw) {
    const prevMonths = Object.keys(this.S.months);
    const n = normalize(raw);
    this.S.core = n.core;
    this.S.months = n.months;
    const keys = ['core', ...Object.keys(n.months).map((mk) => 'm-' + mk)];
    for (const mk of prevMonths) if (!n.months[mk]) this._dirty.add('m-' + mk); // apagar no remoto
    this.save(keys);
  },

  setStatus(s) {
    this.status = s;
    this._onStatus(s);
  },

  async initRemote({ onRemote, onStatus }) {
    this._onStatus = onStatus || (() => {});
    const C = typeof window !== 'undefined' ? window.claude : null;
    if (!C || typeof C.use !== 'function') return false;
    this.setStatus('connecting');
    let db = null;
    let user = null;
    try {
      [db, user] = await Promise.all([C.use('db'), C.use('user')]);
    } catch {
      db = null;
    }
    let id = null;
    if (db && user && typeof user.id === 'function') {
      try {
        id = await user.id();
      } catch {
        id = null;
      }
    }
    if (!db || !id) {
      this.setStatus('local');
      return false;
    }
    this.mode = 'cloud';
    this._col = db.collection('data/users/' + id);
    let first = true;
    let resolveFirst;
    const firstData = new Promise((r) => (resolveFirst = r));
    const timer = setTimeout(() => {
      if (first) this.setStatus('offline');
      resolveFirst(false);
    }, 10000);
    this._col.onSnapshot(
      (qs) => {
        const docs = qs.docs.filter((d) => !d.metadata.hasPendingWrites);
        const changed = this._merge(docs, first && !qs.metadata.fromCache);
        if (!qs.metadata.fromCache || qs.size > 0) resolveFirst(true);
        if (!qs.metadata.fromCache) {
          if (first) clearTimeout(timer);
          first = false;
          if (this.status !== 'quota') this.setStatus('synced');
        }
        if (changed) onRemote();
      },
      (err) => {
        clearTimeout(timer);
        resolveFirst(false);
        this.setStatus(err && err.code === 'revoked' ? 'local' : 'offline');
      }
    );
    return firstData;
  },

  _merge(docs, initial) {
    const S = this.S;
    let changed = false;
    const seen = new Set();
    for (const d of docs) {
      if (!d.exists) continue;
      const body = d.data() || {};
      const key = d.id;
      seen.add(key);
      const rU = body.updatedAt || 0;
      if (key === 'core') {
        const lU = S.core.updatedAt || 0;
        if (rU > lU && body.core) {
          const n = normalize({ core: body.core });
          S.core = n.core;
          S.core.updatedAt = rU;
          changed = true;
          if (n.migrated) this._dirty.add('core');
        } else if (rU < lU) this._dirty.add('core');
      } else if (key.startsWith('m-')) {
        const mk = key.slice(2);
        const lm = S.months[mk];
        const lU = lm ? lm.updatedAt || 0 : 0;
        if (rU > lU) {
          if (Array.isArray(body.tx) && body.tx.length) S.months[mk] = { updatedAt: rU, tx: clone(body.tx) };
          else delete S.months[mk];
          changed = true;
        } else if (rU < lU) this._dirty.add(key);
      }
    }
    if (initial) {
      if (!seen.has('core') && S.core.updatedAt) this._dirty.add('core');
      for (const mk in S.months) if (!seen.has('m-' + mk) && S.months[mk].tx.length) this._dirty.add('m-' + mk);
    }
    if (changed) this.writeLocal();
    if (this._dirty.size) this._schedule();
    return changed;
  },

  _schedule(ms = 1200) {
    if (!this._col) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._flush(), ms);
  },

  async _flush() {
    if (!this._col || this._writing) return;
    this._writing = true;
    let retryLater = false;
    try {
      while (this._dirty.size) {
        const key = this._dirty.values().next().value;
        this._dirty.delete(key);
        const S = this.S;
        let body = null;
        if (key === 'core') body = { updatedAt: S.core.updatedAt || Date.now(), core: S.core };
        else {
          const m = S.months[key.slice(2)];
          body = { updatedAt: (m && m.updatedAt) || Date.now(), tx: m ? m.tx : [] };
        }
        const ref = this._col.doc(key);
        try {
          await ref.set(clone(body));
        } catch (e) {
          const code = e && e.code;
          if (code === 'unavailable') {
            await sleep(400 + Math.random() * 900);
            try {
              await ref.set(clone(body));
              continue;
            } catch {
              /* cai abaixo */
            }
            this._dirty.add(key);
            retryLater = true;
            this.setStatus('offline');
            break;
          } else if (code === 'quota_exceeded') {
            this.setStatus('quota');
          } else if (code === 'resource_exhausted') {
            this._dirty.add(key);
            retryLater = true;
            break;
          } else {
            this.setStatus('error');
          }
        }
      }
    } finally {
      this._writing = false;
    }
    if (retryLater) this._schedule(15000);
    else if (this._dirty.size) this._schedule();
  },
};
