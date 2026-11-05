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
  g.putImageData(img, 0, 0);
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  return { blob, color, w, h, dark };
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
