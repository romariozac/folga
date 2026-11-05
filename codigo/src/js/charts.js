// Gráfico de projeção (SVG feito à mão), em dois painéis alinhados mês a mês:
// em cima, uma barra de Entradas e uma de Saídas (despesas + investimento empilhados);
// embaixo, numa faixa própria, a curva da sobra acumulada (com área suave; abaixo de zero fica vermelha).
// Cada painel tem a sua escala, então as barras não encolhem quando o acumulado cresce ou fica negativo.
import { num, monthShort } from './util.js';

let uid = 0; // ids únicos para os recortes (pode haver mais de um gráfico na tela)

function niceMax(v) {
  if (v <= 0) return 100000; // R$ 1.000
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const n = f <= 1 ? 1 : f <= 1.5 ? 1.5 : f <= 2 ? 2 : f <= 3 ? 3 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 6 ? 6 : f <= 8 ? 8 : 10;
  return n * exp;
}

/** Barra com 4px arredondados no topo e reta na base. */
function bar(x, y, w, h, cls, roundTop) {
  if (h < 0.75) return '';
  if (!roundTop) return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" class="${cls}"/>`;
  const r = Math.min(4, w / 2, h);
  const X = x.toFixed(1), Y = y.toFixed(1), B = (y + h).toFixed(1), R = (x + w).toFixed(1);
  return `<path class="${cls}" d="M${X},${B} V${(y + r).toFixed(1)} Q${X},${Y} ${(x + r).toFixed(1)},${Y} H${(x + w - r).toFixed(1)} Q${R},${Y} ${R},${(y + r).toFixed(1)} V${B} Z"/>`;
}

/** Curva suave que passa pelos pontos sem "passar do ponto" (interpolação monotônica de Fritsch–Carlson). */
function smoothPath(pts) {
  const n = pts.length;
  const f = (v) => v.toFixed(1);
  if (n === 1) return `M${f(pts[0][0])},${f(pts[0][1])}`;
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
  }
  const t = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${f(pts[i][0] + h)},${f(pts[i][1] + t[i] * h)} ${f(pts[i + 1][0] - h)},${f(pts[i + 1][1] - t[i + 1] * h)} ${f(pts[i + 1][0])},${f(pts[i + 1][1])}`;
  }
  return d;
}

export function projectionSVG(rows, width) {
  const W = Math.max(260, Math.round(width));
  const padL = 34, padR = 2, padT = 8;
  const barsH = 130; // painel das barras
  const gap = 26; // espaço entre os painéis (com o título "Acumulado")
  const laneH = 50; // faixa do acumulado
  const padB = 46; // meses, anos e alertas
  const H = padT + barsH + gap + laneH + padB;
  const plotW = W - padL - padR;
  const n = rows.length;
  const slot = plotW / n;
  const cx = (i) => padL + i * slot + slot / 2;
  let s = '';

  // ---- painel das barras: escala de 0 ao maior valor ----
  const maxV = niceMax(Math.max(1, ...rows.map((r) => Math.max(r.receita, r.despesa + r.invest))));
  const y = (v) => padT + barsH - (v / maxV) * barsH;
  const base = y(0);
  for (const t of [0, maxV / 2, maxV]) {
    const yy = y(t).toFixed(1);
    s += `<line class="c-grid${t === 0 ? ' c-base' : ''}" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/>`;
    s += `<text class="c-tick" x="${padL - 6}" y="${(+yy + 3.5).toFixed(1)}" text-anchor="end">${num(t, { compact: true })}</text>`;
  }
  const barW = Math.max(4, Math.min(24, (slot - 2 - Math.max(6, slot * 0.28)) / 2));
  const groupW = barW * 2 + 2;
  rows.forEach((r, i) => {
    const x0 = cx(i) - groupW / 2;
    s += bar(x0, y(r.receita), barW, base - y(r.receita), 'c-in', true);
    const xs = x0 + barW + 2;
    const hasInv = r.invest > 0;
    s += bar(xs, y(r.despesa), barW, base - y(r.despesa), 'c-out', !hasInv);
    if (hasInv) {
      const top = y(r.despesa + r.invest);
      const g2 = r.despesa > 0 ? 2 : 0;
      s += bar(xs, top, barW, y(r.despesa) - top - g2, 'c-inv', true);
    }
  });

  // ---- faixa do acumulado: escala própria, sempre com o zero ----
  const laneTop = padT + barsH + gap;
  const accs = rows.map((r) => r.acc || 0);
  let lo = Math.min(0, ...accs);
  let hi = Math.max(0, ...accs);
  if (hi - lo < 100) hi = lo + 100;
  const room = (hi - lo) * 0.14;
  if (lo < 0) lo -= room;
  if (hi > 0) hi += room;
  const ya = (v) => laneTop + laneH - ((v - lo) / (hi - lo)) * laneH;
  const z = ya(0);
  s += `<text class="c-lane-cap" x="${padL}" y="${(laneTop - 9).toFixed(1)}">Acumulado</text>`;
  s += `<line class="c-grid c-base" x1="${padL}" x2="${W - padR}" y1="${z.toFixed(1)}" y2="${z.toFixed(1)}"/>`;
  s += `<text class="c-tick" x="${padL - 6}" y="${(z + 3.5).toFixed(1)}" text-anchor="end">0</text>`;
  const pts = accs.map((v, i) => [cx(i), ya(v)]);
  const line = smoothPath(pts);
  const area = `${line} L${pts[n - 1][0].toFixed(1)},${z.toFixed(1)} L${pts[0][0].toFixed(1)},${z.toFixed(1)} Z`;
  const id = ++uid;
  s += `<defs><clipPath id="acc-up-${id}"><rect x="0" y="${laneTop - 30}" width="${W}" height="${(z - laneTop + 30).toFixed(1)}"/></clipPath>`;
  s += `<clipPath id="acc-dn-${id}"><rect x="0" y="${z.toFixed(1)}" width="${W}" height="${(laneTop + laneH + 30 - z).toFixed(1)}"/></clipPath></defs>`;
  s += `<path class="c-acc-area" clip-path="url(#acc-up-${id})" d="${area}"/>`;
  s += `<path class="c-acc-area neg" clip-path="url(#acc-dn-${id})" d="${area}"/>`;
  s += `<path class="c-acc" d="${line}"/>`;
  pts.forEach(([px, py], i) => {
    s += `<g class="c-accdot${i === n - 1 ? ' end' : ''}" data-i="${i}"><circle class="c-ring" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="6"/><circle class="c-dot" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4"/></g>`;
  });
  // valor final escrito junto ao último ponto (acima dele, ou abaixo se não couber)
  const [ex, ey] = pts[n - 1];
  const ly = ey - laneTop > 15 ? ey - 9 : ey + 17;
  s += `<text class="c-acc-label" x="${(ex - 8).toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="end">${num(accs[n - 1], { compact: true })}</text>`;

  // ---- meses, alertas e áreas de toque (a coluna inteira, nos dois painéis) ----
  const lab = laneTop + laneH;
  rows.forEach((r, i) => {
    const x = cx(i).toFixed(1);
    s += `<text class="c-month" x="${x}" y="${lab + 17}" text-anchor="middle">${monthShort(r.mk)}</text>`;
    const first = r.mk.endsWith('-01') || i === 0;
    if (first) s += `<text class="c-year" x="${x}" y="${lab + 29}" text-anchor="middle">${r.mk.slice(0, 4)}</text>`;
    if (r.saldo < 0) {
      const wy = lab + (first ? 40 : 28);
      s += `<g class="c-warn"><circle cx="${x}" cy="${wy}" r="5.5"/><text x="${x}" y="${wy + 3.4}" text-anchor="middle">!</text></g>`;
    }
    s += `<rect class="c-hit" data-tip="${i}" x="${(padL + i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}"/>`;
  });

  const label = 'Projeção mês a mês: barras de entradas e de saídas (despesas mais investimento) e, abaixo, a curva da sobra acumulada.';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${label}">${s}</svg>`;
}
