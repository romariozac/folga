// Gráfico de projeção (SVG feito à mão): por mês, uma barra de Entradas e uma de Saídas (despesas +
// investimento empilhados) e, por cima, a curva suave da sobra acumulada, com um ponto em cada mês.
// Um único eixo em R$ (as barras e o acumulado são a mesma unidade). Abaixo de zero, a curva fica vermelha.
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
  const padL = 34, padR = 4, padT = 18, padB = 46;
  const H = 236;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = rows.length;
  const slot = plotW / n;
  const cx = (i) => padL + i * slot + slot / 2;
  const accs = rows.map((r) => r.acc || 0);
  let s = '';

  // um eixo só, em R$ (barras e acumulado são a mesma unidade); desce abaixo de zero se o acumulado ficar negativo
  const maxV = niceMax(Math.max(1, ...rows.map((r) => Math.max(r.receita, r.despesa + r.invest)), ...accs));
  const lo = Math.min(0, ...accs);
  const minV = lo < 0 ? -niceMax(-lo) : 0;
  const y = (v) => padT + plotH - ((v - minV) / (maxV - minV)) * plotH;
  const base = y(0);
  const used = [];
  for (const t of [0, minV, maxV / 2, maxV]) {
    if (t === minV && minV === 0) continue;
    const yy = y(t);
    if (used.some((u) => Math.abs(u - yy) < 12)) continue;
    used.push(yy);
    s += `<line class="c-grid${t === 0 ? ' c-base' : ''}" x1="${padL}" x2="${W - padR}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/>`;
    s += `<text class="c-tick" x="${padL - 6}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end">${num(t, { compact: true })}</text>`;
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

  // ---- curva do acumulado, por cima das barras ----
  // contorno da cor do fundo por baixo da curva e dos pontos: ela "flutua" sobre as barras sem embolar com elas;
  // abaixo de zero, a curva e os pontos ficam vermelhos
  const pts = accs.map((v, i) => [cx(i), y(v)]);
  const line = smoothPath(pts);
  const id = ++uid;
  const clip = (cls, where) => (minV < 0 ? `<path class="${cls}" clip-path="url(#acc-${where}-${id})" d="${line}"/>` : where === 'up' ? `<path class="${cls}" d="${line}"/>` : '');
  if (minV < 0)
    s += `<defs><clipPath id="acc-up-${id}"><rect x="0" y="0" width="${W}" height="${base.toFixed(1)}"/></clipPath><clipPath id="acc-dn-${id}"><rect x="0" y="${base.toFixed(1)}" width="${W}" height="${(H - base).toFixed(1)}"/></clipPath></defs>`;
  s += `<path class="c-acc-halo" d="${line}"/>`;
  s += clip('c-acc', 'up') + clip('c-acc neg', 'dn');
  pts.forEach(([px, py], i) => {
    const X = px.toFixed(1), Y = py.toFixed(1);
    s += `<g class="c-accdot${accs[i] < 0 ? ' neg' : ''}" data-i="${i}"><circle class="c-sel" cx="${X}" cy="${Y}" r="10"/><circle class="c-ring" cx="${X}" cy="${Y}" r="6"/><circle class="c-dot" cx="${X}" cy="${Y}" r="4"/></g>`;
  });
  // valor final escrito junto ao último ponto (acima dele, ou abaixo se não couber)
  const [ex, ey] = pts[n - 1];
  const ly = ey - 12 < padT - 6 ? ey + 20 : ey - 12;
  s += `<text class="c-acc-label" x="${(ex + 4).toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="end">${num(accs[n - 1], { compact: true })}</text>`;

  // ---- meses, alertas e áreas de toque (a coluna inteira) ----
  const lab = H - padB;
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

  const label = 'Projeção mês a mês: barras de entradas e de saídas (despesas mais investimento) e a curva da sobra acumulada.';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${label}">${s}</svg>`;
}
