// Utilitários: dinheiro (em centavos), datas locais, texto.

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const NBSP = ' ';
const fmt2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Formata centavos como "R$ 1.234,56". */
export function money(cents, opts = {}) {
  const { sign = false, cents: showCents = true, compact = false } = opts;
  const v = Math.round(cents || 0);
  const abs = Math.abs(v) / 100;
  let body;
  if (compact && abs >= 1000) {
    body = abs >= 1e6 ? fmt1.format(abs / 1e6) + NBSP + 'mi' : fmt1.format(abs / 1e3) + NBSP + 'mil';
  } else {
    body = showCents ? fmt2.format(abs) : fmt0.format(Math.round(abs));
  }
  const s = v < 0 ? '−' : sign && v > 0 ? '+' : '';
  return `${s}R$${NBSP}${body}`;
}

/** Só o número, sem "R$" (para eixos e tabelas compactas). */
export function num(cents, { compact = false } = {}) {
  const abs = Math.abs(cents || 0) / 100;
  const s = cents < 0 ? '−' : '';
  if (compact && abs >= 1000) return s + (abs >= 1e6 ? fmt1.format(abs / 1e6) + NBSP + 'mi' : fmt1.format(abs / 1e3) + NBSP + 'mil');
  return s + fmt0.format(Math.round(abs));
}

/** Converte texto digitado ("1.234,56", "1234,5", "R$ 12", "12.5") em centavos. */
export function parseMoney(input) {
  if (typeof input === 'number') return Math.round(input * 100);
  let s = String(input ?? '').trim().replace(/[R$\s ]/g, '');
  if (!s) return 0;
  const neg = /^[-−]/.test(s);
  s = s.replace(/^[-−]/, '');
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && lc > ld) s = s.replace(/\./g, '').replace(',', '.');
  else if (ld > -1 && lc > -1) s = s.replace(/,/g, '');
  else if (ld > -1) {
    const parts = s.split('.');
    if (parts.length > 2 || parts[parts.length - 1].length === 3) s = parts.join('');
  }
  const v = parseFloat(s);
  if (!isFinite(v)) return 0;
  return Math.round(v * 100) * (neg ? -1 : 1);
}

/** Centavos -> texto para preencher um campo ("1.234,56" ou "" se zero). */
export function moneyInput(cents) {
  return cents ? fmt2.format(Math.abs(cents) / 100) : '';
}

// ---------- datas (sempre no fuso local) ----------
export const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}
export const mkOf = (iso) => iso.slice(0, 7);
export function addMonths(mk, n) {
  const [y, m] = mk.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
export function monthDiff(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
export function daysInMonth(mk) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
/** Chave da semana = data da segunda-feira daquela semana. */
export function weekKey(iso) {
  const d = parseISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDate(d);
}

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const monthName = (mk) => MESES[+mk.slice(5, 7) - 1];
export const monthShort = (mk) => MES_CURTO[+mk.slice(5, 7) - 1];
export const monthLabel = (mk, withYear = true) => (withYear ? `${cap(monthName(mk))} de ${mk.slice(0, 4)}` : cap(monthName(mk)));
export const monthShortYear = (mk) => `${monthShort(mk)}/${mk.slice(2, 4)}`;

export function dayLabel(iso, today = isoDate()) {
  const diff = daysBetween(iso, today);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff === -1) return 'Amanhã';
  const d = parseISO(iso);
  return `${DIAS[d.getDay()].slice(0, 3)}, ${d.getDate()} ${MES_CURTO[d.getMonth()]}`;
}
export function longDate(iso) {
  const d = parseISO(iso);
  return `${cap(DIAS[d.getDay()])}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

// ---------- texto / listas ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + f(x), 0);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** ['a','b','c'] -> 'a, b e c' */
export function listPT(items) {
  const a = items.filter(Boolean);
  if (a.length <= 1) return a.join('');
  return a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1];
}
