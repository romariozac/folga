// Operações sobre o estado (lançar, marcar contas, check-in, plano) + recompensas.
import { ctx, today, curMk } from './ctx.js';
import * as U from './util.js';
import * as M from './model.js';
import * as G from './game.js';
import { store } from './store.js';
import { toast, celebrate } from './ui.js';

const S = () => ctx.S;
export const xpOf = (events) => (events.find((e) => e.type === 'xp') || {}).amount || 0;

/** Celebra medalhas e níveis (o XP aparece no toast de quem chamou). */
export function celebrateEvents(events) {
  const order = { badge: 0, monthBlue: 1, level: 2 };
  const firstBlue = events.some((e) => e.type === 'badge' && e.badge && e.badge.id === 'azul');
  const list = events
    .filter((e) => e.type in order && !(firstBlue && e.type === 'badge' && e.badge.id === 'azul'))
    .sort((a, b) => order[a.type] - order[b.type]);
  for (const e of list) {
    if (e.type === 'badge' && e.badge) celebrate({ emoji: e.badge.emoji, kicker: 'Nova medalha · +25 XP', title: e.badge.name, text: e.badge.desc });
    else if (e.type === 'level') celebrate({ emoji: '⭐', kicker: `Nível ${e.level}`, title: e.name, text: 'Cada pequeno passo conta. Siga no seu ritmo.', cta: 'Bora!' });
    else if (e.type === 'monthBlue')
      celebrate({ emoji: '🔵', kicker: firstBlue ? 'Nova medalha · Mês no azul' : 'Mês fechado', title: `${U.cap(U.monthName(e.mk))} no azul`, text: `Você recebeu mais do que gastou: sobraram ${U.money(e.saldo)}. +${firstBlue ? 125 : 100} XP.` });
  }
}

/** Toast padrão + celebrações. */
export function notify(msgHtml, events = [], action = null, ms) {
  const cb = events.find((e) => e.type === 'comeback');
  const msg = cb ? `${msgHtml}<br><small>Que bom te ver de volta! Recomeçar conta.</small>` : msgHtml;
  toast(msg, { xp: xpOf(events), action, ...(ms ? { ms } : {}) });
  celebrateEvents(events);
}

function checkAllBills(m, events) {
  const g = S().core.game;
  const c = M.monthCalc(S(), m);
  if (c.bills.length >= 2 && c.bills.every((b) => b.tx) && !g.billsDone[m]) {
    g.billsDone[m] = 1;
    G.gainXP(S().core, G.XP.allBills, events);
    G.giveBadge(S().core, 'contas', events);
  }
}

export function checkReserve(events) {
  const st = S();
  const cv = M.custoDeVida(st, curMk());
  if (!cv) return;
  const months = M.reserveBalance(st) / cv;
  if (months >= 1) G.giveBadge(st.core, 'reserva1', events);
  if (months >= 3) G.giveBadge(st.core, 'reserva3', events);
  if (months >= 6) G.giveBadge(st.core, 'reserva6', events);
}

export function checkVisao(events) {
  const st = S();
  if (!st.core.plan.some((l) => l.kind === 'receita')) return;
  if (M.projection(st, curMk(), 12).every((r) => r.saldo >= 0)) G.giveBadge(st.core, 'visao', events);
}

export function addTx({ v, k, c, d = today(), n = '', p = null, ap = false, mk = null }) {
  const st = S();
  const m = mk || U.mkOf(d);
  const bucket = (st.months[m] ||= { updatedAt: 0, tx: [] });
  const t = { id: U.uid(), d, v: Math.round(v), k, c, t: Date.now() };
  if (n && n.trim()) t.n = n.trim().slice(0, 80);
  if (p) t.p = p;
  if (ap) t.ap = 1;
  bucket.tx.push(t);
  const events = [];
  const core = st.core;
  const g = core.game;
  g.totalTx = (g.totalTx || 0) + 1;
  G.markActivity(core, today(), 'entry', events);
  if (p) G.gainXP(core, G.XP.bill, events);
  else G.entryXP(core, today(), events);
  G.giveBadge(core, 'primeiro', events);
  if (g.totalTx >= 25) G.giveBadge(core, 'relampago', events);
  if (k === 'invest' && !g.paidMonths[m]) {
    g.paidMonths[m] = 1;
    G.gainXP(core, G.XP.pay, events);
    G.giveBadge(core, 'pague', events);
  }
  if (c === 'reserva') checkReserve(events);
  if (p) checkAllBills(m, events);
  store.save(['core', 'm-' + m]);
  return { t, m, events };
}

export function removeTx(m, id) {
  const b = S().months[m];
  if (!b) return null;
  const i = b.tx.findIndex((t) => t.id === id);
  if (i < 0) return null;
  const [t] = b.tx.splice(i, 1);
  store.save(['m-' + m]);
  return t;
}

/** Desfaz um lançamento recém-feito (inclusive o XP que ele deu). */
export function undoAdd(res) {
  removeTx(res.m, res.t.id);
  const g = S().core.game;
  g.xp = Math.max(0, g.xp - xpOf(res.events));
  g.totalTx = Math.max(0, (g.totalTx || 1) - 1);
  const w = g.weeks[U.weekKey(today())];
  if (w && w.e > 0) w.e--;
  if (g.xpDays && g.xpDays[today()]) g.xpDays[today()] = Math.max(0, g.xpDays[today()] - G.XP.entry);
  store.save(['core']);
}

export function updateTx(m, id, patch) {
  const st = S();
  const b = st.months[m];
  const t = b && b.tx.find((x) => x.id === id);
  if (!t) return;
  Object.assign(t, patch);
  if (!t.n) delete t.n;
  const nm = t.p ? m : U.mkOf(t.d);
  const keys = ['m-' + m];
  if (nm !== m) {
    b.tx = b.tx.filter((x) => x.id !== id);
    (st.months[nm] ||= { updatedAt: 0, tx: [] }).tx.push(t);
    keys.push('m-' + nm);
  }
  store.save(keys);
}

export function findTx(m, id) {
  const b = S().months[m];
  return b ? b.tx.find((t) => t.id === id) : null;
}

export const lineById = (id) => S().core.plan.find((l) => l.id === id);

export function payBill(line, mk, amount = line.amount, d = null) {
  const cm = curMk();
  const date = d || (mk < cm ? `${mk}-${U.pad(Math.min(line.day || 28, U.daysInMonth(mk)))}` : today());
  return addTx({ v: amount, k: line.kind, c: line.cat, d: date, n: line.name, p: line.id, mk });
}

export function completeCheckin() {
  const st = S();
  const events = [];
  const wk = U.weekKey(today());
  const already = !!(st.core.game.weeks[wk] && st.core.game.weeks[wk].c);
  G.markActivity(st.core, today(), 'checkin', events);
  if (!already) {
    G.gainXP(st.core, G.XP.checkin, events);
    G.giveBadge(st.core, 'checkin', events);
  }
  store.save(['core']);
  return { events, already };
}

/** "Seguir daqui": recomeço sem acerto. Conta como volta. */
export function freshStart() {
  const events = [];
  G.markActivity(S().core, today(), 'fresh', events);
  store.save(['core']);
  return events;
}

/** Ao abrir num mês novo, fecha o mês anterior (só celebra; nunca pune). */
export function closePastMonths() {
  const st = S();
  const g = st.core.game;
  const events = [];
  const prev = U.addMonths(curMk(), -1);
  if (g.monthsClosed[prev]) return events;
  const c = M.monthCalc(st, prev);
  if (c.txs.length < 3 || !c.real.receita) return events;
  g.monthsClosed[prev] = c.saldoReal >= 0 ? 'azul' : 'vermelho';
  if (c.saldoReal >= 0) {
    G.gainXP(st.core, G.XP.monthBlue, events);
    G.giveBadge(st.core, 'azul', events);
    events.push({ type: 'monthBlue', mk: prev, saldo: c.saldoReal });
  }
  store.save(['core']);
  return events;
}

export function saveLine(line) {
  const st = S();
  const i = st.core.plan.findIndex((l) => l.id === line.id);
  if (i >= 0) st.core.plan[i] = line;
  else st.core.plan.push(line);
  const events = [];
  checkVisao(events);
  store.save(['core']);
  return events;
}

export function deleteLine(id) {
  S().core.plan = S().core.plan.filter((l) => l.id !== id);
  store.save(['core']);
}

export function applyOnboarding(lines, { name, reserveStart, replace }) {
  const st = S();
  const events = [];
  if (replace) st.core.plan = [];
  st.core.plan.push(...lines);
  if (name != null) st.core.settings.name = name;
  if (reserveStart) st.core.settings.reserveStart = reserveStart;
  st.core.settings.onboarded = true;
  if (lines.length && !st.core.game.badges.plano) {
    G.gainXP(st.core, G.XP.plan, events);
    G.giveBadge(st.core, 'plano', events);
  }
  checkVisao(events);
  checkReserve(events);
  store.save(['core']);
  return events;
}

export function setReserve(balance, goalMonths) {
  const st = S();
  let fromTx = 0;
  for (const mk in st.months) for (const t of st.months[mk].tx) if (t.c === 'reserva') fromTx += t.v;
  st.core.settings.reserveStart = balance - fromTx;
  if (goalMonths) st.core.settings.reserveGoalMonths = goalMonths;
  const events = [];
  checkReserve(events);
  store.save(['core']);
  return events;
}

// ---------- exportações ----------
const csvNum = (c) => ((c || 0) / 100).toFixed(2).replace('.', ',');
const csvCell = (v) => (/[;"\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const toCSV = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');

export function backupJSON() {
  const st = S();
  return JSON.stringify({ app: 'folga', v: 1, exportedAt: new Date().toISOString(), core: st.core, months: st.months });
}

/** Planilha no formato previsto x realizado por categoria: 12 meses lado a lado, a partir de fromMk. */
export function planilhaCSV(fromMk) {
  const st = S();
  const months = Array.from({ length: 12 }, (_, i) => U.addMonths(fromMk, i));
  const calcs = months.map((mk) => M.monthCalc(st, mk));
  const head = ['Tipo', 'Categoria', ...months.flatMap((mk) => [`${U.monthShortYear(mk)} previsto`, `${U.monthShortYear(mk)} realizado`]), 'Total previsto', 'Total realizado'];
  const rows = [head];
  const totals = {};
  for (const kind of ['receita', 'invest', 'despesa']) {
    const kp = months.map(() => 0);
    const kr = months.map(() => 0);
    for (const cat of st.core.cats.filter((c) => c.kind === kind)) {
      const vals = calcs.map((c) => c.byCat[cat.id] || { prev: 0, real: 0 });
      if (vals.every((v) => !v.prev && !v.real)) continue;
      vals.forEach((v, i) => {
        kp[i] += v.prev;
        kr[i] += v.real;
      });
      rows.push([M.KIND_LABEL[kind], cat.name, ...vals.flatMap((v) => [csvNum(v.prev), csvNum(v.real)]), csvNum(U.sum(vals, (v) => v.prev)), csvNum(U.sum(vals, (v) => v.real))]);
    }
    totals[kind] = { kp, kr };
  }
  rows.push([]);
  const label = { receita: 'Total de receitas', invest: 'Total investido (pague-se primeiro)', despesa: 'Total de despesas' };
  for (const kind of ['receita', 'invest', 'despesa']) {
    const { kp, kr } = totals[kind];
    rows.push(['', label[kind], ...kp.flatMap((v, i) => [csvNum(v), csvNum(kr[i])]), csvNum(U.sum(kp)), csvNum(U.sum(kr))]);
  }
  const sp = months.map((_, i) => totals.receita.kp[i] - totals.invest.kp[i] - totals.despesa.kp[i]);
  const sr = months.map((_, i) => totals.receita.kr[i] - totals.invest.kr[i] - totals.despesa.kr[i]);
  rows.push(['', 'Saldo do mês', ...sp.flatMap((v, i) => [csvNum(v), csvNum(sr[i])]), csvNum(U.sum(sp)), csvNum(U.sum(sr))]);
  return toCSV(rows);
}

export function lancamentosCSV() {
  const st = S();
  const rows = [['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Aproximado']];
  for (const mk of Object.keys(st.months).sort()) {
    for (const t of st.months[mk].tx.slice().sort((a, b) => a.d.localeCompare(b.d))) {
      rows.push([t.d.split('-').reverse().join('/'), M.KIND_LABEL[t.k], M.catById(st, t.c).name, t.n || '', csvNum(t.v), t.ap ? 'sim' : '']);
    }
  }
  return toCSV(rows);
}

// ---------- categorias ----------
export function toggleFav(id) {
  const s = S().core.settings;
  if (!Array.isArray(s.favs)) s.favs = [...M.DEFAULT_FAVS];
  if (s.favs.includes(id)) s.favs = s.favs.filter((x) => x !== id);
  else {
    if (s.favs.length >= M.MAX_FAVS) return false;
    s.favs.push(id);
  }
  store.save(['core']);
  return true;
}

export function addCustomCat({ name, emoji, kind, parent }) {
  const st = S();
  const c = { id: 'u_' + U.uid(), name: name.trim().slice(0, 40), emoji: (emoji || '').trim() || (parent ? M.catById(st, parent).emoji : '🏷️'), kind, custom: true };
  if (parent) c.parent = parent;
  st.core.cats.push(c);
  store.save(['core']);
  return c;
}

export function removeCustomCat(id) {
  const st = S();
  const c = st.core.cats.find((x) => x.id === id);
  if (!c || !c.custom) return;
  const to = c.parent || { despesa: 'outros', receita: 'outras_rec', invest: 'investir' }[c.kind];
  const ids = new Set([id, ...st.core.cats.filter((x) => x.parent === id).map((x) => x.id)]);
  st.core.cats = st.core.cats.filter((x) => !ids.has(x.id));
  const keys = ['core'];
  for (const mk in st.months) {
    let ch = false;
    for (const t of st.months[mk].tx)
      if (ids.has(t.c)) {
        t.c = to;
        ch = true;
      }
    if (ch) keys.push('m-' + mk);
  }
  for (const l of st.core.plan) if (ids.has(l.cat)) l.cat = to;
  for (const k of Object.keys(st.core.rules)) if (ids.has(st.core.rules[k])) delete st.core.rules[k];
  st.core.settings.favs = (st.core.settings.favs || []).filter((x) => !ids.has(x));
  store.save(keys);
}

export function forgetRule(key) {
  delete S().core.rules[key];
  store.save(['core']);
}

/** Lançamentos ligados a um item do plano acompanham o detalhe (subcategoria) do item. */
export function syncLinkedTxCats() {
  const st = S();
  const lines = Object.fromEntries(st.core.plan.map((l) => [l.id, l]));
  const keys = [];
  for (const mk in st.months) {
    let ch = false;
    for (const t of st.months[mk].tx) {
      const l = t.p && lines[t.p];
      if (l && t.c !== l.cat && M.groupId(st, l.cat) === t.c) {
        t.c = l.cat;
        ch = true;
      }
    }
    if (ch) keys.push('m-' + mk);
  }
  if (keys.length) store.save(keys);
}

// ---------- débito automático ----------
/** Marca sozinhas as contas automáticas que já venceram (mês atual e anterior). */
export function autoPayDue() {
  const st = S();
  const cm = curMk();
  const dayNow = new Date().getDate();
  const since = U.mkOf(st.core.settings.createdAt || today());
  const done = [];
  const keys = new Set();
  for (const mk of [U.addMonths(cm, -1), cm]) {
    if (mk < since) continue;
    for (const l of st.core.plan) {
      if (!l.auto || l.type === 'verba' || !l.day || !M.occurs(l, mk)) continue;
      const d = Math.min(l.day, U.daysInMonth(mk));
      if (mk === cm && d > dayNow) continue;
      if (st.core.autoSkip[`${l.id}@${mk}`]) continue;
      const id = `auto-${l.id}-${mk}`;
      if (M.txOf(st, mk).some((t) => t.p === l.id || t.id === id)) continue;
      (st.months[mk] ||= { updatedAt: 0, tx: [] }).tx.push({ id, d: `${mk}-${U.pad(d)}`, v: l.amount, k: l.kind, c: l.cat, n: l.name, p: l.id, auto: 1, t: Date.now() });
      done.push(l.name);
      keys.add('m-' + mk);
    }
  }
  if (keys.size) store.save([...keys]);
  return done;
}

export function skipAuto(lineId, mk) {
  S().core.autoSkip[`${lineId}@${mk}`] = 1;
  store.save(['core']);
}

// ---------- importação ----------
export function commitImport(items, { replaceAcertos = null, learn = [] } = {}) {
  const st = S();
  const g = st.core.game;
  const events = [];
  const keys = new Set(['core']);
  const added = [];
  const removed = [];
  const prevRules = [];
  const xp0 = g.xp;
  if (replaceAcertos && replaceAcertos.list.length) {
    for (const a of replaceAcertos.list) {
      const b = st.months[a.mk];
      if (!b) continue;
      for (const t of b.tx) if (t.id === a.id) removed.push({ mk: a.mk, t });
      b.tx = b.tx.filter((t) => t.id !== a.id);
      keys.add('m-' + a.mk);
    }
  }
  let count = 0;
  let out = 0;
  let inn = 0;
  const investMonths = new Set();
  for (const it of items) {
    if (it.status !== 'add' || !it.cat) continue;
    const mk = it.p ? it.billMk : U.mkOf(it.date);
    const t = { id: U.uid() + count, d: it.date, v: it.refund ? -it.amount : it.amount, k: it.kind, c: it.cat, n: it.desc, im: 1, fp: it.fp, t: Date.now() + count };
    if (it.p) t.p = it.p;
    (st.months[mk] ||= { updatedAt: 0, tx: [] }).tx.push(t);
    added.push({ mk, id: t.id });
    keys.add('m-' + mk);
    count++;
    if (it.kind === 'receita') inn += it.amount;
    else if (it.kind === 'despesa') out += it.refund ? -it.amount : it.amount;
    if (it.kind === 'invest') investMonths.add(mk);
  }
  for (const r of learn) {
    prevRules.push([r.key, st.core.rules[r.key]]);
    st.core.rules[r.key] = r.cat;
  }
  if (count) {
    g.totalTx = (g.totalTx || 0) + count;
    G.markActivity(st.core, today(), 'entry', events);
    G.gainXP(st.core, G.XP.import, events);
    G.giveBadge(st.core, 'extrato', events);
    G.giveBadge(st.core, 'primeiro', events);
    if (g.totalTx >= 25) G.giveBadge(st.core, 'relampago', events);
    for (const m of investMonths) {
      if (g.paidMonths[m]) continue;
      g.paidMonths[m] = 1;
      G.gainXP(st.core, G.XP.pay, events);
      G.giveBadge(st.core, 'pague', events);
    }
    checkReserve(events);
    for (const k of keys) if (k.startsWith('m-')) checkAllBills(k.slice(2), events);
  }
  store.save([...keys]);
  return { events, count, out, inn, undo: { added, removed, prevRules, xp: g.xp - xp0, count } };
}

/** Desfaz uma importação: tira os lançamentos que ela criou, devolve os acertos trocados e as regras e o XP. */
export function undoImport(res) {
  const st = S();
  const u = res.undo;
  const keys = new Set(['core']);
  for (const { mk, id } of u.added) {
    const b = st.months[mk];
    if (!b) continue;
    b.tx = b.tx.filter((t) => t.id !== id);
    keys.add('m-' + mk);
  }
  for (const { mk, t } of u.removed) {
    (st.months[mk] ||= { updatedAt: 0, tx: [] }).tx.push(t);
    keys.add('m-' + mk);
  }
  for (const [k, v] of u.prevRules) {
    if (v === undefined) delete st.core.rules[k];
    else st.core.rules[k] = v;
  }
  const g = st.core.game;
  g.xp = Math.max(0, g.xp - u.xp);
  g.totalTx = Math.max(0, (g.totalTx || 0) - u.count);
  store.save([...keys]);
}
