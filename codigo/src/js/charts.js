// Gráfico de projeção (SVG feito à mão): por mês, uma barra de Entradas e uma barra de Saídas
// (despesas + investimento empilhados). Um único eixo em R$, barras finas com topo arredondado.
import { num, monthShort } from './util.js';

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

export function projectionSVG(rows, width, { height = 198 } = {}) {
  const W = Math.max(260, Math.round(width));
  const H = height;
  const padL = 34, padR = 2, padT = 8, padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxV = niceMax(Math.max(1, ...rows.map((r) => Math.max(r.receita, r.despesa + r.invest))));
  const y = (v) => padT + plotH - (v / maxV) * plotH;
  const n = rows.length;
  const slot = plotW / n;
  const barW = Math.max(4, Math.min(24, (slot - 2 - Math.max(6, slot * 0.28)) / 2));
  const groupW = barW * 2 + 2;
  let s = '';

  // grade recessiva + rótulos do eixo
  for (const t of [0, maxV / 2, maxV]) {
    const yy = y(t).toFixed(1);
    s += `<line class="c-grid${t === 0 ? ' c-base' : ''}" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/>`;
    s += `<text class="c-tick" x="${padL - 6}" y="${(+yy + 3.5).toFixed(1)}" text-anchor="end">${num(t, { compact: true })}</text>`;
  }

  rows.forEach((r, i) => {
    const x0 = padL + i * slot + (slot - groupW) / 2;
    const base = y(0);
    s += bar(x0, y(r.receita), barW, base - y(r.receita), 'c-in', true);
    const xs = x0 + barW + 2;
    const hasInv = r.invest > 0;
    const hD = base - y(r.despesa);
    s += bar(xs, y(r.despesa), barW, hD, 'c-out', !hasInv);
    if (hasInv) {
      const top = y(r.despesa + r.invest);
      const gap = r.despesa > 0 ? 2 : 0;
      s += bar(xs, top, barW, y(r.despesa) - top - gap, 'c-inv', true);
    }
    const cx = (x0 + groupW / 2).toFixed(1);
    const mm = monthShort(r.mk);
    s += `<text class="c-month" x="${cx}" y="${H - padB + 15}" text-anchor="middle">${mm}</text>`;
    if (r.mk.endsWith('-01') || i === 0) s += `<text class="c-year" x="${cx}" y="${H - padB + 27}" text-anchor="middle">${r.mk.slice(0, 4)}</text>`;
    if (r.saldo < 0) {
      const wy = H - padB + (r.mk.endsWith('-01') || i === 0 ? 38 : 26);
      s += `<g class="c-warn"><circle cx="${cx}" cy="${wy}" r="5.5"/><text x="${cx}" y="${wy + 3.4}" text-anchor="middle">!</text></g>`;
    }
    s += `<rect class="c-hit" data-tip="${i}" x="${(padL + i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}"/>`;
  });

  const label = 'Projeção mês a mês: barras de entradas e de saídas (despesas mais investimento).';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${label}">${s}</svg>`;
}
