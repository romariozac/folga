// Leitura de prints no próprio aparelho, com Tesseract.js (OCR de código aberto). A imagem não sai do
// celular e não usa o Claude. Os arquivos do leitor ficam em vendor/ocr/ e só são baixados na primeira
// leitura (uns 5 MB); depois o navegador guarda.
import * as U from './util.js';
import { loadScript } from './importer.js';
import { parseScreens } from './screen.js';

const BASE = 'vendor/ocr/';
const opts = () => Object.assign({ psm: '11', contrast: true, scale: 1 }, (typeof window !== 'undefined' && window.__folgaOcrOpts) || {});
// testes de suporte a SIMD do WebAssembly (os mesmos do pacote wasm-feature-detect)
const SIMD = [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11];
const RELAXED = [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 15, 1, 13, 0, 65, 1, 253, 15, 65, 2, 253, 15, 253, 128, 2, 11];

function coreFile() {
  const ok = (bytes) => {
    try {
      return WebAssembly.validate(new Uint8Array(bytes));
    } catch {
      return false;
    }
  };
  if (ok(RELAXED)) return 'tesseract-core-relaxedsimd-lstm.wasm.js';
  if (ok(SIMD)) return 'tesseract-core-simd-lstm.wasm.js';
  return 'tesseract-core-lstm.wasm.js';
}

async function fetchOk(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`não baixou ${url} (${r.status})`);
  return r;
}

const timeout = (p, ms, msg) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

/**
 * Cria o leitor. O núcleo (WebAssembly) e o script do worker vão juntos num blob, e o idioma vai pela
 * memória: o worker não precisa buscar nada sozinho (funciona igual no app instalado e no link do Claude).
 */
async function createReader(signal, onProgress) {
  if (!window.Tesseract) await loadScript(BASE + 'tesseract.min.js', 30000);
  const [core, worker, lang] = await Promise.all([
    fetchOk(BASE + coreFile(), signal).then((r) => r.text()),
    fetchOk(BASE + 'worker.min.js', signal).then((r) => r.text()),
    fetchOk(BASE + 'por.traineddata.gz', signal).then((r) => r.arrayBuffer()),
  ]);
  const url = URL.createObjectURL(new Blob([core, '\n;\n', worker], { type: 'text/javascript' }));
  try {
    const w = await timeout(
      window.Tesseract.createWorker([{ code: 'por', data: new Uint8Array(lang) }], 1, {
        workerPath: url,
        workerBlobURL: false,
        corePath: BASE,
        cacheMethod: 'none',
        gzip: true,
        logger: (m) => {
          if (m && m.status === 'recognizing text' && typeof m.progress === 'number') onProgress(m.progress);
        },
        errorHandler: () => {},
      }),
      90000,
      'o leitor de imagens não iniciou'
    );
    await w.setParameters({ tessedit_pageseg_mode: opts().psm, user_defined_dpi: '300' });
    return w;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const cdist = (d, i, c) => Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]);

/** Nome da cor de uma etiqueta (para saber, por exemplo, que o status está em vermelho). */
function hueName([r, g, b]) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx - mn < 40) return 'gray';
  const d = mx - mn;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 18 || h >= 330) return 'red';
  if (h < 45) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 170) return 'green';
  if (h < 260) return 'blue';
  return 'purple';
}

/**
 * Etiquetas coloridas, como o status “Negada” ao lado da compra: retângulos cheios de uma cor só, com texto
 * dentro. Texto claro sobre cor (branco no vermelho) o OCR quase não lê: depois de achadas, elas viram texto
 * escuro sobre fundo branco (paintBadges). color: RGBA da imagem. Devolve [{ x0, y0, x1, y1, rgb, name }].
 */
export function findBadges(color, w, h) {
  const B = 4;
  const bw = Math.floor(w / B);
  const bh = Math.floor(h / B);
  if (bw < 4 || bh < 4) return [];
  // fundo da tela: a cor mais comum
  const hist = new Map();
  for (let y = 0; y < h; y += 6)
    for (let x = 0; x < w; x += 6) {
      const i = (y * w + x) * 4;
      const k = ((color[i] >> 4) << 8) | ((color[i + 1] >> 4) << 4) | (color[i + 2] >> 4);
      hist.set(k, (hist.get(k) || 0) + 1);
    }
  let bgK = 0;
  let bgN = -1;
  for (const [k, n] of hist)
    if (n > bgN) {
      bgN = n;
      bgK = k;
    }
  const bg = [((bgK >> 8) & 15) * 16 + 8, ((bgK >> 4) & 15) * 16 + 8, (bgK & 15) * 16 + 8];
  // blocos 4×4 de uma cor só e longe da cor do fundo
  const solid = new Uint8Array(bw * bh);
  const mean = new Float32Array(bw * bh * 3);
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let yy = 0; yy < B; yy++)
        for (let xx = 0; xx < B; xx++) {
          const i = ((by * B + yy) * w + bx * B + xx) * 4;
          r += color[i];
          g += color[i + 1];
          b += color[i + 2];
        }
      const c = [r / 16, g / 16, b / 16];
      const k = by * bw + bx;
      mean[k * 3] = c[0];
      mean[k * 3 + 1] = c[1];
      mean[k * 3 + 2] = c[2];
      if (Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]) <= 90) continue;
      let ok = true;
      for (let yy = 0; yy < B && ok; yy++)
        for (let xx = 0; xx < B; xx++)
          if (cdist(color, ((by * B + yy) * w + bx * B + xx) * 4, c) > 40) {
            ok = false;
            break;
          }
      if (ok) solid[k] = 1;
    }
  // regiões ligadas de blocos da mesma cor; ficam as do tamanho e formato de uma etiqueta, com texto dentro
  const seen = new Uint8Array(bw * bh);
  const out = [];
  const near = (k, c) => Math.abs(mean[k * 3] - c[0]) + Math.abs(mean[k * 3 + 1] - c[1]) + Math.abs(mean[k * 3 + 2] - c[2]) < 60;
  for (let k0 = 0; k0 < solid.length; k0++) {
    if (!solid[k0] || seen[k0]) continue;
    const c0 = [mean[k0 * 3], mean[k0 * 3 + 1], mean[k0 * 3 + 2]];
    const stack = [k0];
    seen[k0] = 1;
    let n = 0;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    while (stack.length) {
      const k = stack.pop();
      n++;
      const bx = k % bw;
      const by = (k / bw) | 0;
      if (bx < x0) x0 = bx;
      if (bx > x1) x1 = bx;
      if (by < y0) y0 = by;
      if (by > y1) y1 = by;
      const nb = [bx > 0 ? k - 1 : -1, bx < bw - 1 ? k + 1 : -1, by > 0 ? k - bw : -1, by < bh - 1 ? k + bw : -1];
      for (const q of nb)
        if (q >= 0 && solid[q] && !seen[q] && near(q, c0)) {
          seen[q] = 1;
          stack.push(q);
        }
    }
    const px0 = x0 * B;
    const py0 = y0 * B;
    const px1 = (x1 + 1) * B;
    const py1 = (y1 + 1) * B;
    const bwid = px1 - px0;
    const bhei = py1 - py0;
    if (bhei < w * 0.015 || bhei > w * 0.09 || bwid < 1.3 * bhei || bwid > 0.6 * w) continue;
    if (n / ((x1 - x0 + 1) * (y1 - y0 + 1)) < 0.35) continue;
    // texto dentro: pontos bem diferentes da cor da etiqueta, entre as bordas dela em cada linha
    let txt = 0;
    let tot = 0;
    for (let y = py0; y < py1; y++) {
      let l = -1;
      let r = -1;
      for (let x = px0; x < px1; x++)
        if (cdist(color, (y * w + x) * 4, c0) < 60) {
          if (l < 0) l = x;
          r = x;
        }
      for (let x = l; l >= 0 && x <= r; x++) {
        tot++;
        if (cdist(color, (y * w + x) * 4, c0) > 160) txt++;
      }
    }
    if (!tot || txt / tot < 0.03 || txt / tot > 0.6) continue;
    out.push({ x0: px0, y0: py0, x1: px1, y1: py1, rgb: c0.map(Math.round), name: hueName(c0) });
  }
  return out;
}

/** Redesenha cada etiqueta na imagem em tons de cinza: o texto dela escuro, o resto branco. */
export function paintBadges(gray, color, w, h, badges) {
  for (const bd of badges) {
    const x0 = Math.max(0, bd.x0 - 4);
    const x1 = Math.min(w, bd.x1 + 4);
    const y0 = Math.max(0, bd.y0 - 4);
    const y1 = Math.min(h, bd.y1 + 4);
    for (let y = y0; y < y1; y++) {
      let l = -1;
      let r = -1;
      for (let x = x0; x < x1; x++)
        if (cdist(color, (y * w + x) * 4, bd.rgb) < 60) {
          if (l < 0) l = x;
          r = x;
        }
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        let v = 255;
        if (l >= 0 && x >= l && x <= r) v = Math.round(255 * (1 - Math.min(1, Math.max(0, (cdist(color, i, bd.rgb) - 60) / 140))));
        gray[i] = gray[i + 1] = gray[i + 2] = v;
      }
    }
  }
}

/** Ajusta a imagem para o OCR: tamanho bom, tons de cinza e modo escuro invertido. Guarda as cores originais. */
async function prepare(file) {
  let src;
  try {
    src = await createImageBitmap(file);
  } catch {
    src = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('imagem inválida'));
      img.src = URL.createObjectURL(file);
    });
  }
  const W = src.width;
  const H = src.height;
  let scale = opts().scale;
  if (W * scale < 800) scale = Math.min(2, 1000 / W);
  else if (W * scale > 2200) scale = 1400 / W;
  const w = Math.round(W * scale);
  const h = Math.round(H * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, w, h);
  if (src.close) src.close();
  const img = g.getImageData(0, 0, w, h);
  const color = img.data.slice();
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = d[i + 1] = d[i + 2] = y;
    sum += y;
  }
  const dark = sum / (d.length / 4) < 115;
  // texto cinza-claro (datas, legendas) fica mais escuro; fundo continua branco
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    const x = dark ? 255 - v : v;
    lut[v] = opts().contrast ? (x >= 235 ? 255 : Math.round(Math.pow(x / 235, 1.8) * 235)) : x;
  }
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = lut[d[i]];
  // etiquetas coloridas (status como “Negada”): texto escuro sobre branco, para o OCR conseguir ler
  const badges = findBadges(color, w, h);
  paintBadges(d, color, w, h, badges);
  g.putImageData(img, 0, 0);
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  return { blob, color, w, h, dark, badges };
}

/** Cor da tinta de uma palavra: verde costuma ser dinheiro que entrou; vermelho, que saiu. */
export function inkOf(color, w, h, box) {
  const x0 = Math.max(0, Math.floor(box.x0));
  const x1 = Math.min(w - 1, Math.ceil(box.x1));
  const y0 = Math.max(0, Math.floor(box.y0));
  const y1 = Math.min(h - 1, Math.ceil(box.y1));
  if (x1 - x0 < 3 || y1 - y0 < 3) return null;
  let br = 0;
  let bg = 0;
  let bb = 0;
  let bn = 0;
  const add = (x, y) => {
    const i = (y * w + x) * 4;
    br += color[i];
    bg += color[i + 1];
    bb += color[i + 2];
    bn++;
  };
  for (let x = x0; x <= x1; x++) {
    add(x, y0);
    add(x, y1);
  }
  for (let y = y0; y <= y1; y++) {
    add(x0, y);
    add(x1, y);
  }
  br /= bn;
  bg /= bn;
  bb /= bn;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4;
      if (Math.abs(color[i] - br) + Math.abs(color[i + 1] - bg) + Math.abs(color[i + 2] - bb) > 120) {
        r += color[i];
        g += color[i + 1];
        b += color[i + 2];
        n++;
      }
    }
  if (n < 6) return null;
  r /= n;
  g /= n;
  b /= n;
  if (g - Math.max(r, b) > 30) return 'green';
  if (r - Math.max(g, b) > 50) return 'red';
  return null;
}

function parseTSV(tsv) {
  const words = [];
  for (const line of String(tsv || '').split('\n')) {
    const c = line.split('\t');
    if (c.length < 12 || c[0] !== '5') continue;
    const t = c.slice(11).join(' ').trim();
    if (!t) continue;
    const conf = +c[10];
    const x0 = +c[6];
    const y0 = +c[7];
    const isAmt = /\d,\s?\d{2}/.test(t);
    if (conf < 30 && !isAmt) continue;
    words.push({ t, conf, x0, y0, x1: x0 + +c[8], y1: y0 + +c[9] });
  }
  return words;
}

const cancelled = () => Object.assign(new Error('cancelled'), { code: 'cancelled' });

/**
 * Lê prints de fatura ou extrato e devolve as linhas no mesmo formato dos outros leitores.
 * onStatus(texto) informa o andamento.
 */
export async function readPrints(files, { signal, onStatus = () => {} } = {}) {
  const list = [...files].sort((a, b) => (a.lastModified || 0) - (b.lastModified || 0) || String(a.name).localeCompare(String(b.name)));
  let worker = null;
  let label = '';
  const onAbort = () => {
    if (worker) worker.terminate().catch(() => {});
  };
  if (signal) signal.addEventListener('abort', onAbort);
  try {
    onStatus('Preparando o leitor de imagens… Na primeira vez ele baixa uns 5 MB; depois fica guardado.');
    worker = await createReader(signal, (p) => onStatus(`${label} ${Math.round(p * 100)}%`));
    const pages = [];
    const now = Date.now();
    for (let i = 0; i < list.length; i++) {
      if (signal && signal.aborted) throw cancelled();
      label = list.length > 1 ? `Lendo o print ${i + 1} de ${list.length}…` : 'Lendo o print…';
      onStatus(label);
      const prep = await prepare(list[i]);
      const { data } = await worker.recognize(prep.blob, {}, { text: false, tsv: true });
      const words = parseTSV(data.tsv);
      for (const w of words) if (/\d,\s?\d{2}/.test(w.t)) w.ink = inkOf(prep.color, prep.w, prep.h, w);
      // palavras dentro de uma etiqueta colorida; se a leitura da tela inteira não pegou nada nela, lê só a etiqueta
      for (const bd of prep.badges) {
        const inside = (w) => {
          const cx = (w.x0 + w.x1) / 2;
          const cy = (w.y0 + w.y1) / 2;
          return cx >= bd.x0 - 4 && cx <= bd.x1 + 4 && cy >= bd.y0 - 4 && cy <= bd.y1 + 4;
        };
        let got = words.filter(inside);
        if (!got.length) {
          const pad = Math.round((bd.y1 - bd.y0) * 0.4);
          const rect = { left: Math.max(0, bd.x0 - pad), top: Math.max(0, bd.y0 - pad), width: Math.min(prep.w, bd.x1 + pad) - Math.max(0, bd.x0 - pad), height: Math.min(prep.h, bd.y1 + pad) - Math.max(0, bd.y0 - pad) };
          const r = await worker.recognize(prep.blob, { rectangle: rect }, { text: false, tsv: true });
          got = parseTSV(r.data.tsv).filter(inside);
          words.push(...got);
        }
        for (const w of got) w.badge = bd.name;
      }
      const lm = list[i].lastModified;
      const today = lm && now - lm < 400 * 86400000 && lm <= now + 86400000 ? U.isoDate(new Date(lm)) : U.isoDate();
      pages.push({ words, w: prep.w, h: prep.h, today });
    }
    if (typeof window !== 'undefined' && Array.isArray(window.__folgaOcrDebug)) window.__folgaOcrDebug.push(pages);
    return { ...parseScreens(pages), source: U.plural(list.length, 'print', 'prints') };
  } catch (err) {
    if (signal && signal.aborted) throw cancelled();
    throw err;
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
    if (worker) worker.terminate().catch(() => {});
  }
}
