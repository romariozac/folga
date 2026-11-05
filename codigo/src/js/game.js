// Gamificação pensada para quem para de usar apps: nada de punição.
// Semana "em dia" = qualquer lançamento ou check-in. Voltar depois de uma pausa dá bônus.
import { isoDate, weekKey, addDays, daysBetween } from './util.js';

export const LEVELS = [
  { xp: 0, name: 'Começando' },
  { xp: 100, name: 'Curioso' },
  { xp: 250, name: 'Organizado' },
  { xp: 500, name: 'Planejador' },
  { xp: 900, name: 'Poupador' },
  { xp: 1400, name: 'Estrategista' },
  { xp: 2000, name: 'Investidor' },
  { xp: 2800, name: 'Mestre do plano' },
  { xp: 3800, name: 'Inteligência financeira' },
  { xp: 5000, name: 'Independente' },
  { xp: 6500, name: 'Lenda da folga' },
];

export const XP = { entry: 5, entryDailyCap: 30, bill: 5, checkin: 50, comeback: 30, pay: 50, plan: 100, monthBlue: 100, badge: 25, allBills: 20, import: 30 };
export const COMEBACK_DAYS = 4;

export function levelOf(xp) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1];
  return { level: i + 1, name: cur.name, from: cur.xp, to: next ? next.xp : null, pct: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1, nextName: next ? next.name : null };
}

export const BADGES = [
  { id: 'primeiro', emoji: '🌱', name: 'Primeiro passo', desc: 'Fez o primeiro lançamento.' },
  { id: 'plano', emoji: '🗺️', name: 'Plano traçado', desc: 'Montou a projeção dos próximos 12 meses.' },
  { id: 'checkin', emoji: '📋', name: 'Check-in feito', desc: 'Completou o primeiro check-in semanal.' },
  { id: 'extrato', emoji: '📥', name: 'Extrato em dia', desc: 'Importou um extrato ou fatura e deixou o app lançar.' },
  { id: 'pague', emoji: '💰', name: 'Pague-se primeiro', desc: 'Guardou dinheiro para o futuro no mês.' },
  { id: 'contas', emoji: '✅', name: 'Tudo em dia', desc: 'Marcou todas as contas de um mês.' },
  { id: 'volta', emoji: '🪃', name: 'De volta ao jogo', desc: 'Voltou depois de uma pausa. Recomeçar é o que conta.' },
  { id: 'semanas4', emoji: '🔥', name: '4 semanas em dia', desc: 'Quatro semanas seguidas usando o app.' },
  { id: 'semanas12', emoji: '☄️', name: '12 semanas em dia', desc: 'Doze semanas seguidas. Virou hábito.' },
  { id: 'azul', emoji: '🔵', name: 'Mês no azul', desc: 'Fechou um mês recebendo mais do que gastou.' },
  { id: 'visao', emoji: '🔭', name: 'Ano sem sustos', desc: 'Nenhum mês no vermelho na projeção de 12 meses.' },
  { id: 'relampago', emoji: '⚡', name: 'Relâmpago', desc: '25 lançamentos feitos.' },
  { id: 'reserva1', emoji: '🛟', name: 'Reserva: 1 mês', desc: 'A reserva cobre 1 mês de custo de vida.' },
  { id: 'reserva3', emoji: '🛡️', name: 'Reserva: 3 meses', desc: 'O mínimo que Cerbasi recomenda.' },
  { id: 'reserva6', emoji: '🏰', name: 'Reserva: 6 meses', desc: 'A meta: seis meses de tranquilidade.' },
  { id: 'meta', emoji: '🎯', name: 'Sonho com data', desc: 'Criou uma meta com valor e prazo.' },
  { id: 'metaok', emoji: '🏁', name: 'Meta alcançada', desc: 'Juntou todo o valor de uma meta.' },
];

export const badgeById = (id) => BADGES.find((b) => b.id === id);

export function gainXP(core, amount, events) {
  if (!amount) return;
  const before = levelOf(core.game.xp).level;
  core.game.xp += amount;
  const xpEv = events.find((e) => e.type === 'xp');
  if (xpEv) xpEv.amount += amount;
  else events.push({ type: 'xp', amount });
  const after = levelOf(core.game.xp);
  if (after.level > before) events.push({ type: 'level', level: after.level, name: after.name });
}

export function giveBadge(core, id, events) {
  if (core.game.badges[id]) return false;
  core.game.badges[id] = isoDate();
  events.push({ type: 'badge', badge: badgeById(id) });
  gainXP(core, XP.badge, events);
  return true;
}

export function weekActive(g, k) {
  const w = g.weeks[k];
  return !!(w && (w.e > 0 || w.c));
}

export function streakOf(core, today = isoDate()) {
  const g = core.game;
  const thisWeek = weekKey(today);
  let wk = weekActive(g, thisWeek) ? thisWeek : addDays(thisWeek, -7);
  let current = 0;
  while (weekActive(g, wk)) {
    current++;
    wk = addDays(wk, -7);
  }
  const weeks = [];
  let k = thisWeek;
  for (let i = 0; i < 12; i++) {
    weeks.unshift({ key: k, active: weekActive(g, k), checkin: !!(g.weeks[k] && g.weeks[k].c), current: k === thisWeek });
    k = addDays(k, -7);
  }
  const totalWeeks = Object.keys(g.weeks).filter((x) => weekActive(g, x)).length;
  return { current, best: Math.max(current, g.bestStreak || 0), weeks, thisWeek: weekActive(g, thisWeek), checkinThisWeek: !!(g.weeks[thisWeek] && g.weeks[thisWeek].c), totalWeeks };
}

/** Registra atividade (lançamento ou check-in). Detecta a volta depois de uma pausa. */
export function markActivity(core, today, kind, events) {
  const g = core.game;
  if (g.lastActive) {
    const gap = daysBetween(g.lastActive, today);
    if (gap >= COMEBACK_DAYS) {
      events.push({ type: 'comeback', days: gap });
      gainXP(core, XP.comeback, events);
      giveBadge(core, 'volta', events);
    }
  }
  if (!g.lastActive || today > g.lastActive) g.lastActive = today;
  const wk = weekKey(today);
  const w = (g.weeks[wk] ||= { e: 0, c: 0 });
  if (kind === 'checkin') w.c = 1;
  else w.e++;
  const st = streakOf(core, today);
  if (st.current > (g.bestStreak || 0)) g.bestStreak = st.current;
  if (st.current >= 4) giveBadge(core, 'semanas4', events);
  if (st.current >= 12) giveBadge(core, 'semanas12', events);
}

/** XP por lançamento avulso, com teto diário (para não virar spam). */
export function entryXP(core, today, events) {
  const g = core.game;
  g.xpDays ||= {};
  const used = g.xpDays[today] || 0;
  if (used < XP.entryDailyCap) {
    const amt = Math.min(XP.entry, XP.entryDailyCap - used);
    g.xpDays[today] = used + amt;
    gainXP(core, amt, events);
  }
  for (const d of Object.keys(g.xpDays)) if (daysBetween(d, today) > 10) delete g.xpDays[d];
}
