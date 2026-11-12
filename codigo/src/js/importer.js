// Importação de extratos e faturas: lê OFX, CSV, PDF ou texto colado, categoriza sozinho
// (regras aprendidas → histórico → estabelecimentos conhecidos) e separa o que precisa de pergunta.
import * as U from './util.js';
import * as M from './model.js';
import { MERCHANTS } from './merchants.js';

const { norm } = M;

// ---------- leitura ----------
export async function readText(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

let pdfLib = null;
export function loadScript(src, ms = 20000) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    const t = setTimeout(() => reject(new Error('tempo esgotado: ' + src)), ms);
    s.src = src;
    s.onload = () => {
      clearTimeout(t);
      resolve();
    };
    s.onerror = () => {
      clearTimeout(t);
      reject(new Error('não carregou ' + src));
    };
    document.head.appendChild(s);
  });
}
// A mesma versão do pdf.js em três lugares. Na pasta local (app instalado) ele usa um Web Worker; nos CDNs
// (link do Claude, que é uma página só), o worker entra como script comum e a leitura roda na própria página.
const PDF_SOURCES = [
  { base: 'vendor/', main: false, local: true },
  { base: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/', main: true },
  { base: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/', main: true },
];
async function getPdfjs() {
  if (pdfLib) return pdfLib;
  const inClaude = !!(window.claude && typeof window.claude.use === 'function');
  const httpPage = /^https?:$/.test(location.protocol);
  const list = window.__folgaPdfBase
    ? [{ base: window.__folgaPdfBase, main: !!window.__folgaPdfMain }]
    : PDF_SOURCES.filter((src) => !(src.local && (inClaude || !httpPage)));
  pdfLib = (async () => {
    const errs = [];
    for (const src of list) {
      try {
        if (!window.pdfjsLib) await loadScript(src.base + 'pdf.min.js');
        if (src.main && !window.pdfjsWorker) await loadScript(src.base + 'pdf.worker.min.js');
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = src.base + 'pdf.worker.min.js';
        return window.pdfjsLib;
      } catch (e) {
        errs.push(e.message);
      }
    }
    throw new Error('leitor de PDF indisponível (' + errs.join(' | ') + ')');
  })().catch((err) => {
    pdfLib = null;
    throw err;
  });
  return pdfLib;
}

const ENTRY_CELL = /^\d{1,2}\/\d{1,2}\s+.*\d,\d{2}\s*$/;
const CAT_CELL = /^([a-zà-ú][a-zà-ú.]*(?:\s+(?:e|de|do|da)\s+[a-zà-ú.]+|\s+[a-zà-ú.]+)*)(?:\s+[A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 .'-]*)?$/;

/** Extrai o texto de um PDF, linha a linha, e as categorias que o banco imprime embaixo de cada compra. */
export async function pdfToText(file) {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const out = [];
  const hints = new Map();
  for (let p = 1; p <= Math.min(doc.numPages, 40); p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, h: Math.abs(it.transform[3]) || it.height || 8 }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const cells = [];
    let line = [];
    let y = null;
    const flush = () => {
      if (!line.length) return;
      line.sort((a, b) => a.x - b.x);
      let txt = '';
      let end = null;
      let cell = null;
      for (const i of line) {
        const gap = end === null ? 0 : i.x - end;
        txt += end === null ? i.s : (gap > Math.max(1, i.h * 0.18) ? ' ' : '') + i.s;
        // células: pedaços da linha separados por um vão grande (colunas)
        if (!cell || gap > Math.max(18, i.h * 2.2)) {
          cell = { x: i.x, y: i.y, h: i.h, t: '' };
          cells.push(cell);
          cell.t = i.s;
        } else cell.t += (gap > Math.max(1, i.h * 0.18) ? ' ' : '') + i.s;
        end = i.x + i.w;
      }
      out.push(txt.replace(/\s+/g, ' ').trim());
      line = [];
    };
    for (const it of items) {
      if (y === null || Math.abs(it.y - y) > 2.5) {
        flush();
        y = it.y;
      }
      line.push(it);
    }
    flush();
    // categoria do banco: célula só com palavras minúsculas (ex.: "supermercado ARACAJU") logo abaixo de uma compra
    // compra = célula que começa com data + o valor na mesma altura, mais à direita, na mesma coluna
    const AMT_CELL = /^-?\s*(?:R\$\s*)?-?\d{1,3}(?:\.\d{3})*,\d{2}$/;
    const entries = [];
    for (const c of cells) {
      const t = c.t.replace(/\s+/g, ' ').trim();
      if (ENTRY_CELL.test(t)) entries.push({ ...c, t });
      else if (/^\d{1,2}\/\d{1,2}\s+\S/.test(t)) {
        const amt = cells
          .filter((a) => a !== c && Math.abs(a.y - c.y) <= 2.5 && a.x > c.x && a.x - c.x < 260 && AMT_CELL.test(a.t.trim()))
          .sort((a, b) => a.x - b.x)[0];
        if (amt) entries.push({ ...c, t: `${t} ${amt.t.trim()}` });
      }
    }
    for (const c of cells) {
      const t = c.t.replace(/\s+/g, ' ').trim();
      const m = t.match(CAT_CELL);
      if (!m) continue;
      // a categoria fica alinhada com a data ou com o nome da loja, logo abaixo e na mesma coluna
      const above = entries
        .filter((e) => e.y > c.y && e.y - c.y < Math.max(18, c.h * 2.6) && c.x >= e.x - 6 && c.x - e.x < 120)
        .sort((a, b) => a.y - b.y || Math.abs(a.x - c.x) - Math.abs(b.x - c.x))[0];
      if (above) hints.set(hintKey(above.t), m[1].trim());
    }
  }
  return { text: out.join('\n'), hints };
}

/** Chave para casar a compra (data + valor + começo da descrição) com a pista de categoria. */
export function hintKey(t) {
  const s = norm(t).replace(/\s+/g, ' ').trim();
  const d = (s.match(/^\d{1,2}\/\d{1,2}/) || [''])[0];
  const v = (s.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}\s*$/) || [''])[0].trim();
  const desc = s.slice(d.length, s.length - v.length).replace(/[^a-z0-9]/g, '').slice(0, 14);
  return `${d}|${v}|${desc}`;
}

// Categorias que os bancos imprimem na fatura → categorias do app ("outros"/"serviços" não ajudam).
const BANK_CATS = [
  [/supermercad|mercado|hipermercad|atacad/, 'supermercado'],
  [/restaurante|alimentac|lanchonete|bares/, 'restaurante'],
  [/saude|farmac|drogari|hospital|clinic|medic/, 'saude'],
  [/vestuar|roupa|calcad|moda/, 'roupas'],
  [/^casa|moveis|decorac|material de constr/, 'casa_itens'],
  [/posto|combustiv/, 'combustivel'],
  [/veicul|automot/, 'transporte'],
  [/educac|escola|livrar/, 'educacao'],
  [/turismo|viage|hotel|hospedag|aere/, 'viagens'],
  [/entreten|lazer|hobby|cinema/, 'lazer'],
  [/pet|veterin/, 'pets'],
  [/^transporte/, 'transporte'],
  [/assinatura|streaming/, 'streaming'],
  [/delivery/, 'delivery'],
  [/academia|esporte/, 'academia'],
  [/beleza|estetica|cuidados pessoais/, 'beleza'],
];
export function bankCatToId(word) {
  const n = norm(word);
  for (const [re, id] of BANK_CATS) if (re.test(n)) return id;
  return null;
}

// ---------- valores e datas ----------
export function parseAmount(raw) {
  if (raw == null) return null;
  let s = String(raw).replace(/ /g, ' ').trim();
  if (!/\d/.test(s)) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/\s*[-−]$/.test(s)) {
    sign = -1;
    s = s.replace(/\s*[-−]$/, '');
  } else if (/\s+D$/i.test(s) || /\d\s?D$/.test(s)) {
    sign = -1;
    s = s.replace(/\s*D$/i, '');
  } else if (/\s*C$/i.test(s)) s = s.replace(/\s*C$/i, '');
  if (/^[-−]|R\$\s*[-−]/.test(s)) sign = -1;
  s = s.replace(/R\$|[-−+\s]/g, '');
  const v = Math.abs(U.parseMoney(s));
  if (!v && !/^0+([.,]0+)?$/.test(s)) return null;
  return sign * v;
}

const MON = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12, feb: 2, apr: 4, may: 5, aug: 8, sep: 9, oct: 10, dec: 12 };
function inferYear(d, m) {
  const now = new Date();
  let y = now.getFullYear();
  if (new Date(y, m - 1, d) - now > 7 * 86400000) y--;
  return y;
}
export function parseDate(raw) {
  const s = norm(String(raw || '')).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/))) {
    const d = +m[1];
    const mo = +m[2];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    let y = m[3] ? +m[3] : inferYear(d, mo);
    if (y < 100) y += 2000;
    return `${y}-${U.pad(mo)}-${U.pad(d)}`;
  }
  if ((m = s.match(/^(\d{1,2})\s*(?:de\s+)?([a-z]{3})[a-z]*\.?(?:\s*(?:de\s+)?(\d{4}))?/))) {
    const mo = MON[m[2]];
    if (!mo) return null;
    const d = +m[1];
    const y = m[3] ? +m[3] : inferYear(d, mo);
    return `${y}-${U.pad(mo)}-${U.pad(d)}`;
  }
  return null;
}

// ---------- formatos ----------
export function parseOFX(text) {
  const isCard = /<CCSTMTRS>|<CREDITCARDMSGSRSV1>/i.test(text);
  const rows = [];
  for (const chunk of text.split(/<STMTTRN>/i).slice(1)) {
    const body = chunk.split(/<\/STMTTRN>/i)[0];
    const tag = (t) => {
      const m = body.match(new RegExp('<' + t + '>([^<\\r\\n]*)', 'i'));
      return m ? m[1].trim() : '';
    };
    const date = parseDate(tag('DTPOSTED'));
    const rawAmt = tag('TRNAMT');
    const sa = parseAmount(rawAmt.includes('.') ? rawAmt : rawAmt.replace(',', '.'));
    const memo = tag('MEMO');
    const name = tag('NAME');
    const desc = memo && name && !norm(memo).includes(norm(name)) ? `${name} ${memo}` : memo || name;
    if (date && sa) rows.push({ date, desc, sa, fitid: tag('FITID') });
  }
  return { rows, type: isCard ? 'cartao' : 'conta', conv: 'neg-out', bank: bankOf(text) };
}

const BANKS = { '341': 'Itaú', '104': 'Caixa', '033': 'Santander', '33': 'Santander', '260': 'Nubank', '001': 'Banco do Brasil', '237': 'Bradesco', '077': 'Inter' };
export function bankOf(text) {
  const id = (text.match(/<BANKID>\s*0*(\d{1,3})/i) || text.match(/<FID>\s*0*(\d{1,3})/i) || [])[1];
  if (id && BANKS[id.padStart(3, '0')]) return BANKS[id.padStart(3, '0')];
  if (id && BANKS[id]) return BANKS[id];
  const org = (text.match(/<ORG>([^<\r\n]+)/i) || [])[1] || '';
  const n = norm(org);
  if (/itau/.test(n)) return 'Itaú';
  if (/caixa/.test(n)) return 'Caixa';
  if (/santander/.test(n)) return 'Santander';
  if (/nu ?pagamentos|nubank/.test(n)) return 'Nubank';
  return '';
}

function splitCSV(line, d) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function looksCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 8);
  if (lines.length < 2) return false;
  return [';', ',', '\t'].some((d) => {
    const n = lines.map((l) => splitCSV(l, d).length);
    return n[0] >= 3 && n.every((x) => x === n[0]);
  });
}

export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  let delim = ';';
  let bestScore = -1;
  for (const d of [';', ',', '\t']) {
    const counts = lines.slice(0, 15).map((l) => splitCSV(l, d).length);
    const mode = counts.sort((a, b) => counts.filter((x) => x === b).length - counts.filter((x) => x === a).length)[0];
    const score = mode >= 2 ? counts.filter((x) => x === mode).length * mode : 0;
    if (score > bestScore) {
      bestScore = score;
      delim = d;
    }
  }
  const table = lines.map((l) => splitCSV(l, delim));
  const H = (c) => norm(c).trim();
  let hi = table.findIndex((r) => r.some((c) => /^(data|date|dt)\b/.test(H(c))) && r.some((c) => /(valor|amount|value|quantia|debito|credito|saida|entrada)/.test(H(c))));
  let col = null;
  if (hi >= 0) {
    const h = table[hi].map(H);
    const find = (re, not) => h.findIndex((c) => re.test(c) && !(not && not.test(c)));
    col = {
      date: find(/^(data|date|dt)\b/),
      desc: find(/(descri|histor|lancamento|title|titulo|estabelecimento|memo|detalhe|identificacao)/, /^(data|date)/),
      amount: find(/^(valor|amount|value|quantia)|valor \(r\$\)|valor r\$/),
      debit: find(/(debito|saida)/, /^data/),
      credit: find(/(credito|entrada)/, /^data/),
    };
    if (col.amount < 0) col.amount = find(/valor/);
  } else {
    // sem cabeçalho: data na primeira coluna que parece data, valor na última que parece valor
    const sample = table.find((r) => r.some((c) => parseDate(c)));
    if (!sample) return { rows: [], type: null };
    const date = sample.findIndex((c) => parseDate(c));
    let amount = -1;
    sample.forEach((c, i) => {
      if (i !== date && /\d[.,]\d{2}\b/.test(c) && parseAmount(c) != null) amount = i;
    });
    const desc = sample.reduce((best, c, i) => (i !== date && i !== amount && c.length > (sample[best] || '').length ? i : best), -1);
    col = { date, desc, amount, debit: -1, credit: -1 };
    hi = -1;
  }
  const rows = [];
  for (const r of table.slice(hi + 1)) {
    const date = parseDate(r[col.date]);
    if (!date) continue;
    let desc = col.desc >= 0 ? r[col.desc] : '';
    if (!desc) desc = r.filter((c, i) => i !== col.date && i !== col.amount && !parseAmount(c)).join(' ');
    let sa = null;
    if (col.amount >= 0) sa = parseAmount(r[col.amount]);
    if (!sa && col.debit >= 0 && r[col.debit]) sa = -Math.abs(parseAmount(r[col.debit]) || 0);
    if (!sa && col.credit >= 0 && r[col.credit]) sa = Math.abs(parseAmount(r[col.credit]) || 0);
    if (!sa || /^saldo|saldo (anterior|do dia|final)/.test(norm(desc))) continue;
    rows.push({ date, desc: desc.trim(), sa });
  }
  const header = hi >= 0 ? table[hi].map(H).join(' ') : '';
  const neg = rows.filter((r) => r.sa < 0).length;
  const nuCard = /\btitle\b/.test(header) && /\bamount\b/.test(header);
  const nuConta = /\bidentificador\b/.test(header) && /\bdescricao\b/.test(header);
  const type = nuCard ? 'cartao' : nuConta ? 'conta' : neg > rows.length * 0.3 ? 'conta' : 'cartao';
  return { rows, type, conv: neg > rows.length / 2 ? 'neg-out' : 'pos-out', bank: nuCard || nuConta ? 'Nubank' : '' };
}

const DATE_START = /^(\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\s*(?:de\s+)?(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?(?:\s*(?:de\s+)?\d{4})?)\s+/i;
const AMOUNT = /(?:[-−+]\s*)?(?:R\$\s*)?[-−]?\s*\d{1,3}(?:\.\d{3})*,\d{2}(?:\s?[-−](?![\d]))?(?:\s?[DC](?![a-zA-ZÀ-ÿ]))?/g;
const SPLIT = /(?<=\d,\d{2}(?:\s?[-−DC])?)\s+(?=\d{1,2}[/.-]\d{1,2}\s|\d{1,2}\s+(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b)/i;

const DATE_ANY = /(?<![\d/.-])(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?|\d{1,2}\s*(?:de\s+)?(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?(?:\s*(?:de\s+)?\d{4})?)(?=\s)/gi;
const AMOUNT_ONE = /(?:[-−+]\s*)?(?:R\$\s*)?[-−]?\s*\d{1,3}(?:\.\d{3})*,\d{2}/;

/** Quebra uma linha em lançamentos: cada um começa numa data seguida de texto e termina num valor.
 * Funciona com duas colunas na mesma linha e com títulos antes do lançamento; "08/10" de parcela
 * (data sem texto antes do valor) continua dentro do lançamento anterior. */
function segments(line) {
  const starts = [];
  for (const m of line.matchAll(DATE_ANY)) {
    // no meio da linha, data com ano é do resumo ("Vencimento: 09/11/2026 ... Total 4.729,86"), não lançamento
    if (m.index > 0 && (/\d{4}/.test(m[1]) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2}$/.test(m[1]))) continue;
    const after = line.slice(m.index + m[0].length);
    const a = after.match(AMOUNT_ONE);
    if (!a) continue;
    if (/[a-zA-ZÀ-ú]{2,}/.test(after.slice(0, a.index))) starts.push(m.index);
  }
  if (!starts.length) return [];
  return starts.map((st, i) => line.slice(st, i + 1 < starts.length ? starts[i + 1] : undefined).trim());
}

/** Texto colado ou extraído de PDF: uma transação por linha (data … descrição … valor). */
export function parseText(text, typeHint = null, hints = null) {
  const type = typeHint || (/fatura|limite (total|dispon)|pagamento m[ií]nimo|cart[aã]o de cr[eé]dito/i.test(text) ? 'cartao' : 'conta');
  const rows = [];
  let skip = false;
  let check = null;
  const extras = [];
  for (const raw of text.split(/\r?\n/)) {
    const nl = norm(raw).replace(/\s+/g, ' ');
    const tot = nl.match(/total dos lancamentos atuais:?\s*(?:r\$\s*)?([\d.]+,\d{2})/);
    if (tot) check = { label: 'Total dos lançamentos atuais', total: parseAmount(tot[1]) };
    const iof = nl.match(/repasse de iof em r\$\s*([\d.]+,\d{2})/);
    if (iof && !skip) extras.push({ desc: 'IOF de compras internacionais', sa: parseAmount(iof[1]) });
    if (/total para proximas faturas/.test(nl)) {
      skip = false;
      continue;
    }
    if (/proximas faturas|parcelas futuras|lancamentos futuros/.test(nl)) {
      skip = true;
      continue;
    }
    if (skip && /limites? de credito|lancamentos:|lancamentos internacionais|resumo da fatura/.test(nl)) skip = false;
    if (skip) continue;
    for (const part of segments(raw.replace(/\s+/g, ' ').trim())) {
      const line = part.trim();
      const dm = line.match(DATE_START);
      if (!dm) continue;
      const rest = line.slice(dm[0].length);
      const amts = [...rest.matchAll(AMOUNT)].filter((a) => /\d,\d{2}/.test(a[0]));
      if (!amts.length) continue;
      // Fatura: o último valor só vale quando entre eles há apenas moeda ("10,00 USD 52,30").
      // Texto entre os valores = outra coluna (ex.: subtotal do cartão ao lado), então fica o primeiro.
      let pi = 0;
      for (let k = 1; k < amts.length; k++) {
        const between = norm(rest.slice(amts[k - 1].index + amts[k - 1][0].length, amts[k].index)).replace(/\b(usd|us|eur|gbp|brl|dolar|cotacao|r)\b|\$/g, '');
        if (/[a-z]{2,}/.test(between)) break;
        pi = k;
      }
      const pick = type === 'conta' && amts.length >= 2 ? amts[0] : amts[pi];
      let desc = rest.slice(0, amts[0].index).replace(/\s*R\$\s*$/, '').replace(/\s*[-–]\s*$/, '').trim();
      desc = desc.replace(DATE_START, '').trim();
      const nd0 = norm(desc).replace(/^[^a-z0-9]+/, '');
      if (!nd0 || /^(saldo|total|subtotal|pagamento minimo|limite|valor total)|\btotal (d[aeo]s?|desta|para|a pagar|geral|nacional|internacional)\b|\bsaldo (anterior|do dia|final|disponivel)\b|\blimite (total|disponivel|utilizado)\b|\bvencimento\b|\bfechamento\b|\bpagamento minimo\b/.test(nd0)) continue;
      desc = desc.replace(/^[=:\-–\s]+/, '');
      const date = parseDate(dm[1]);
      const sa = parseAmount(pick[0]);
      if (date && sa) {
        const row = { date, desc, sa };
        const hint = hints && hints.get(hintKey(`${dm[1]} ${desc} ${pick[0].trim()}`));
        if (hint) row.bankCat = hint;
        rows.push(row);
      }
    }
  }
  const neg = rows.filter((r) => r.sa < 0).length;
  const conv = neg > rows.length / 2 ? 'neg-out' : 'pos-out';
  if (extras.length && rows.length) {
    const last = rows.map((r) => r.date).sort().pop();
    for (const e of extras) rows.push({ date: last, desc: e.desc, sa: conv === 'neg-out' ? -Math.abs(e.sa) : Math.abs(e.sa) });
  }
  return { rows, type, conv, check };
}

/** Lê um arquivo e devolve as linhas brutas. */
export async function readStatement(file) {
  const name = (file.name || '').toLowerCase();
  if (/\.xlsx?$/.test(name)) throw new Error('excel');
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const { text, hints } = await pdfToText(file);
    return { ...parseText(text, null, hints), source: 'PDF' };
  }
  const text = await readText(file);
  if (/<STMTTRN>|OFXHEADER|<OFX>/i.test(text)) return { ...parseOFX(text), source: 'OFX' };
  if (name.endsWith('.csv') || looksCSV(text)) {
    const r = parseCSV(text);
    if (r.rows.length) return { ...r, source: 'CSV' };
  }
  return { ...parseText(text), source: 'texto' };
}

// ---------- categorização ----------
const NOISE = new Set(
  'compra compras cartao credito debito pagamento pag pgto pagto pix ted doc tev transf transferencia enviado enviada enviadas recebido recebida pelo pela com no na em de do da dos das mp pg ec br ltda me sa cia loja lojas www pay pagseguro ebanx int internacional nacional parc parcela parcelas sp rj mg pr rs sc ba pe ce go df sao paulo rio janeiro belo horizonte curitiba via online qrcode qr qrs agencia conta ag cc ip nu pagamentos instituicao banco bco eireli epp servicos comercio cred deb envio recebimento efetuado efetuada compra no debito unibanco itau tit titulo titulos boleto boletos int tributo tributos convenio automatico aut sispag'.split(
    ' '
  )
);

/** Chave do estabelecimento/pessoa, usada para aprender ("pix maria silva" → "maria silva"). */
export function merchantKey(desc) {
  let base = norm(desc);
  // Nubank: "Transferência enviada pelo Pix - MARIA SILVA - •••.123.456-•• - BANCO..." → só o nome
  const nu = base.match(/(?:pelo pix|pix|boleto[a-z ]*|debito)\s+-\s+([^-]+?)\s+-/);
  if (nu) base = nu[1];
  return base
    .replace(/\b(parc(ela)?s?)\s*\d+\s*(\/|de)\s*\d+/g, ' ')
    .replace(/\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?/g, ' ')
    .replace(/[^a-z0-9& ]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^\d+(?=[a-z])/, ''))
    .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !NOISE.has(w))
    .slice(0, 3)
    .join(' ');
}

const FATURA_RE = /(pagamento|pgto|pagto|pag)\b.*\b(fatura|fat|cartao)\b|\bfatura\b.*\bcartao\b|\bnu pagamentos\b|\bpagamento de fatura\b|\bdeb(ito)? aut(omatico)? fatura\b|\bitaucard\b|\bcartao credito\b/;
// aplicações/resgates automáticos (Itaú Aplic Aut Mais, Santander ContaMax...): dinheiro que continua disponível
const SWEEP_RE = /\baut(o)? mais\b|\baplic(acao)? aut|\bres(g|gate)? aplic|\bcontamax\b|\bconta max\b|\binvest facil\b|\bpoupanca integrada\b|\bapl(ic)? automatica\b|\bresgate automatico\b/;
const REND_RE = /\brend(imento)?s?\b|\brend pago\b/;
const CARD_PAYMENT_RE = /(pagamento|pgto|pagto)\s*(recebido|efetuado|em|de fatura|fatura|debito automatico)|credito de pagamento|pagamento recebido/;
const OWN_RE = /mesma titularidade|entre contas|transferencia propria|conta propria|para minha conta/;
const RESGATE_RE = /\bresgate\b|\bresg\b|\bresgatado\b|\bdinheiro resgatado\b/;
const INVEST_RE = /\baplic(acao)?\b|\binvest(imento)?\b|\bcdb\b|\btesouro\b|\blci\b|\blca\b|\brdb\b|\bpoupanca\b|\bcaixinha\b|\bcofrinho\b|\bporquinho\b|\bprevidencia\b|\bpgbl\b|\bvgbl\b|\bdinheiro guardado\b|\bguardado\b/;
const GENERIC_RE = /\b(pix|ted|doc|transf|transferencia|boleto|pagamento|pagseguro|picpay|mercadopago|mp|pag|sumup|stone|cielo|getnet|infinitepay|ton)\b/;

// ---------- palpites (sem internet e sem IA): banco, lançamentos parecidos, começo de palavra ----------
const tokensOf = (s) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !NOISE.has(w) && !/^\d+$/.test(w));

/** Índices usados pelos palpites: histórico de descrições e palavras-chave para começo de palavra. */
export function guessContext(S, matcher = M.buildMatcher(S)) {
  const hist = [];
  for (const mk of Object.keys(S.months).sort().slice(-12)) {
    for (const t of S.months[mk].tx) {
      if (!t.n || t.ap || !t.c) continue;
      const toks = tokensOf(merchantKey(t.n) || t.n);
      if (toks.length) hist.push({ kind: t.k, cat: t.c, toks: new Set(toks) });
    }
  }
  // palavras inteiras das palavras-chave (5+ letras), para reconhecer palavras cortadas ("SUPERMER", "FARMAC")
  const words = new Map();
  const addWords = (c, str) => {
    for (const w of norm(str).replace(/\*/g, '').split(/[^a-z0-9]+/)) {
      if (w.length < 5 || !/^[a-z]+$/.test(w)) continue;
      const k = `${c.kind}:${w}`;
      if (!words.has(k)) words.set(k, c.id);
    }
  };
  for (const c of S.core.cats) {
    if (c.hidden) continue;
    addWords(c, c.name);
    addWords(c, c.kw || '');
    addWords(c, MERCHANTS[c.id] || '');
  }
  return { matcher, hist, words };
}

/** Categorias prováveis para um lançamento em dúvida, da mais para a menos provável. */
export function rankCats(S, it, ctx = guessContext(S)) {
  const score = new Map();
  const bump = (id, v) => {
    const c = S.core.cats.find((x) => x.id === id && !x.hidden);
    if (c && c.kind === it.kind) score.set(id, (score.get(id) || 0) + v);
  };
  if (it.bankHint && it.kind === 'despesa') {
    const id = bankCatToId(it.bankHint);
    if (id) bump(id, 3);
  }
  const generic = GENERIC_RE.test(it.nd || norm(it.desc));
  const toks = tokensOf(it.key || it.desc);
  if (toks.length) {
    const votes = new Map();
    for (const h of ctx.hist) {
      if (h.kind !== it.kind) continue;
      const inter = toks.filter((w) => h.toks.has(w)).length;
      // Pix e transferências: só vale com nome e sobrenome iguais (evita confundir duas Marias)
      if (!inter || (generic && inter < 2)) continue;
      const v = inter / Math.max(toks.length, h.toks.size);
      if (v >= 0.34) votes.set(h.cat, Math.max(votes.get(h.cat) || 0, v));
    }
    for (const [id, v] of votes) bump(id, 2.5 * v);
    // palavra cortada: "SUPERMER" → supermercado, "DROGARIAS" → drogaria
    for (const w of tokensOf(it.desc)) {
      if (w.length < 5) continue;
      for (const [k, id] of ctx.words) {
        const [kind, kw] = k.split(':');
        if (kind !== it.kind || kw === w) continue;
        // palavra cortada ("SUPERMER"), com sobra no fim ("DROGARIAS") ou colada a iniciais ("MP*GDBURGUERS")
        if ((kw.startsWith(w) && w.length >= 5) || (w.startsWith(kw) && kw.length >= 6) || (w.length >= 7 && kw.length >= 6 && w.includes(kw))) bump(id, 1.5);
      }
    }
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ id, v }));
}

/** Palpite seguro o bastante para oferecer de uma vez ("Aceitar palpites"); null se não houver. */
export function bestGuess(ranked) {
  if (!ranked.length || ranked[0].v < 1.4) return null;
  if (ranked[1] && ranked[0].v - ranked[1].v < 0.5) return null;
  return ranked[0].id;
}

export function suggestionsFor(S, kind, extra = []) {
  const freq = {};
  for (const mk of Object.keys(S.months).sort().slice(-3)) for (const t of S.months[mk].tx) if (t.k === kind && !t.p && !t.ap) freq[t.c] = (freq[t.c] || 0) + 1;
  const base = { despesa: ['outros', 'mercado', 'lazer', 'moradia', 'pessoal'], receita: ['extra', 'outras_rec', 'reembolso', 'salario'], invest: ['investir', 'reserva'] }[kind];
  const ids = [...extra, ...Object.keys(freq).sort((a, b) => freq[b] - freq[a]), ...base];
  const out = [];
  for (const id of ids) {
    if (out.length >= 6) break;
    const c = S.core.cats.find((x) => x.id === id && x.kind === kind && !x.hidden);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * Monta o lote de importação a partir das linhas lidas.
 * Cada item: { date, desc, amount, dir, kind, cat, refund, how, status:'add'|'ask'|'ignore'|'dup', reason, key, fp, p? }
 */
export function buildBatch(S, parsed, type = parsed.type || 'conta', flip = false) {
  const matcher = M.buildMatcher(S);
  let gctx = null;
  const history = new Map();
  for (const mk of Object.keys(S.months).sort()) {
    for (const t of S.months[mk].tx) {
      if (!t.n || t.ap) continue;
      const k = merchantKey(t.n);
      if (k) history.set(`${t.k}:${k}`, t.c);
    }
  }
  // índice do que já existe, para não duplicar
  const existing = [];
  for (const mk of Object.keys(S.months)) for (const t of S.months[mk].tx) existing.push({ ...t, mk, used: false });
  const fps = new Set(existing.filter((t) => t.fp).map((t) => t.fp));
  // já importado antes com a descrição um pouco diferente (o mesmo print lido de novo, outro recorte da tela)
  const imported = existing.filter((t) => t.im && t.n);
  const sameDesc = (a, b) => {
    const A = new Set(tokensOf(a));
    const B = tokensOf(b);
    if (!A.size || !B.length) return norm(a).trim() === norm(b).trim();
    const inter = B.filter((w) => A.has(w)).length;
    return inter / Math.min(A.size, B.length) >= 0.6;
  };

  // Parcelas (ex.: "LOJA 08/10") aparecem com a data da compra original: contam no mês desta fatura.
  const PARC = /\b(\d{1,2})\/(\d{1,2})\b/;
  const isParc = (d) => {
    const m = d.match(PARC);
    return !!m && +m[1] >= 1 && +m[1] <= +m[2] && +m[2] <= 48;
  };
  let ref = null;
  if (type === 'cartao') ref = parsed.rows.filter((r) => !isParc(r.desc)).map((r) => r.date).sort().pop() || null;
  const items = parsed.rows.map((r0) => {
    const r = { ...r0 };
    if (ref && U.daysBetween(r.date, ref) > 35) {
      r.date = ref;
      r.parc = isParc(r.desc);
      r.moved = true;
    }
    // prints: o sinal depende de ser fatura ou extrato ("-" é crédito na fatura e saída no extrato)
    const sa = r.saBy && r.saBy[type] != null ? r.saBy[type] : r.sa;
    let out = sa < 0;
    if (parsed.conv === 'pos-out') out = sa > 0;
    if (flip) out = !out;
    const amount = Math.abs(sa);
    const desc = r.desc.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Sem descrição';
    const nd = norm(desc);
    const key = merchantKey(desc);
    const fp = r.fitid ? `ofx:${r.fitid}:${amount}` : `${r.date}|${amount}|${key || nd.slice(0, 20)}`;
    const it = { date: r.date, desc, amount, dir: out ? 'out' : 'in', key, fp, nd, kind: out ? 'despesa' : 'receita', cat: null, how: '', status: 'add', reason: '', parc: !!r.parc, moved: !!r.moved };

    // 1) o que não deve virar lançamento
    if (fps.has(fp)) return { ...it, status: 'dup', reason: 'Já importado antes' };
    const again = imported.find((t) => !t.used && t.d === r.date && Math.abs(t.v) === amount && sameDesc(t.n, desc));
    if (again) {
      again.used = true;
      return { ...it, status: 'dup', reason: 'Já importado antes' };
    }
    if (type === 'cartao' && !out && (CARD_PAYMENT_RE.test(nd) || /\b(pagamento|pgto|pagto)\b/.test(nd))) return { ...it, status: 'ignore', reason: 'Pagamento da fatura' };
    if (type !== 'cartao' && out && FATURA_RE.test(nd)) return { ...it, status: 'ignore', reason: 'Pagamento da fatura do cartão: os gastos entram pela própria fatura' };
    if (SWEEP_RE.test(nd) && !(!out && REND_RE.test(nd))) return { ...it, status: 'ignore', reason: 'Aplicação ou resgate automático do banco (o dinheiro continua disponível)' };
    if (!out && RESGATE_RE.test(nd) && !REND_RE.test(nd)) return { ...it, status: 'ignore', reason: 'Resgate de investimento (não é receita)' };
    if (OWN_RE.test(nd)) return { ...it, status: 'ignore', reason: 'Transferência entre suas contas' };

    // 2) tipo
    if (out && INVEST_RE.test(nd)) it.kind = 'invest';
    if (type === 'cartao' && !out) {
      it.kind = 'despesa';
      it.refund = true; // estorno ou crédito na fatura: abate do gasto
    }

    // 3) regras aprendidas, histórico, estabelecimentos conhecidos
    const rk = `${it.kind}:${key}`;
    const rule = key && S.core.rules && S.core.rules[rk];
    if (rule === '__ignore') return { ...it, status: 'ignore', reason: 'Você pediu para não lançar este' };
    if (rule && S.core.cats.some((c) => c.id === rule)) return { ...it, cat: rule, how: 'regra' };
    const kw = M.kwMatch(matcher, it.kind, nd);
    if (kw && !GENERIC_RE.test(nd)) return { ...it, cat: kw, how: 'auto' };
    if (key && history.has(rk)) return { ...it, cat: history.get(rk), how: 'histórico' };
    if (kw) return { ...it, cat: kw, how: 'auto' };
    if (it.kind === 'invest') return { ...it, cat: 'investir', how: 'auto' };
    const bank = r.bankCat && it.kind === 'despesa' ? bankCatToId(r.bankCat) : null;
    if (bank && S.core.cats.some((c) => c.id === bank)) return { ...it, cat: bank, how: 'banco' };
    const q = { ...it, status: 'ask', bankHint: r.bankCat || '' };
    gctx = gctx || guessContext(S, matcher);
    const ranked = rankCats(S, q, gctx);
    q.ranked = ranked.slice(0, 6).map((x) => x.id);
    q.guess = bestGuess(ranked);
    return q;
  });

  // 4) já lançado à mão (mesmo valor, até 3 dias de diferença): não lança de novo. Aparece na conciliação,
  // onde dá para dizer que não é o mesmo. Contas do plano já marcadas ficam para o passo 5.
  for (const it of items) {
    if (it.status === 'ignore' || it.status === 'dup' || it.refund) continue;
    const t = existing.find((x) => !x.used && !x.im && !x.ap && !x.p && x.k === it.kind && x.v === it.amount && Math.abs(U.daysBetween(x.d, it.date)) <= 3);
    if (!t) continue;
    t.used = true;
    it.match = { type: 'tx', tx: t, mk: t.mk, name: t.n || M.catById(S, t.c).name, tier: 'ok' };
    setLink(it, true);
  }

  // 5) contas do plano (pagas ou não): conciliação
  reconcile(S, items);
  return items;
}

// ---------- conciliação com o plano ----------
// Um lançamento do extrato pode ser o pagamento de uma conta do plano (aluguel, luz, Netflix, salário…).
// Ligado à conta, ele a deixa paga; se ela já estava marcada (à mão ou no automático), ele fica no lugar da
// marcação, com o valor e a data reais. Assim nada conta duas vezes.

export const CONC_MIN = 4.5; // a partir desta nota o par aparece na conciliação
export const CONC_LINK = 6; // a partir desta nota já vem ligado (a pessoa pode desligar)
const PAY_RE = /\b(pix|ted|doc|tev|transf|transferencia|boleto|pagamento|pagto|pgto|pag|debito automatico|deb aut|debito aut|convenio|titulo|tit|cobranca|sispag)\b/;
const PARC_RE = /\b(\d{1,2})\s*\/\s*(\d{1,2})\b/;
const SURE_HOW = new Set(['regra', 'auto', 'histórico', 'banco']);
// palavras comuns em nomes de itens do plano; o resto ("Netflix", "Maria") é nome próprio e precisa aparecer no extrato
const PLAN_WORDS =
  'conta contas mensalidade mensal parcela parcelas fatura casa carro moto plano escola faculdade curso aula aulas ingles natacao seguro vida residencial financiamento emprestimo consorcio cartao anuidade tarifa assinatura assinaturas clube academia internet telefone celular energia agua luz gas diarista faxina empregada pagamento aluguel prestacao condominio iptu ipva saude remedio remedios escolar material matricula salario renda extra bolsa pensao auxilio beneficio aposentadoria comissao bonus vale reserva investimento investimentos guardar guardado meta poupanca previdencia combustivel gasolina mercado pague primeiro filho filhos filha escolinha creche mesada apartamento apto imovel ajuda mae pai avo irmao irma tia tio sogra sogro esposa marido dizimo oferta igreja doacao'.split(
    ' '
  );

/** Contas do plano (não as verbas) de um mês, com o pagamento já marcado, se houver. */
export function billsOf(S, mk) {
  const txs = M.txOf(S, mk);
  return S.core.plan
    .filter((l) => l.type !== 'verba' && M.occurs(l, mk))
    .map((l) => ({ key: `${l.id}@${mk}`, line: l, mk, due: l.day ? `${mk}-${U.pad(Math.min(l.day, U.daysInMonth(mk)))}` : null, tx: txs.find((t) => t.p === l.id) || null }));
}

/** Índices usados para dar nota aos pares. */
export function concContext(S) {
  const matcher = M.buildMatcher(S);
  const months = new Map();
  const billsAt = (mk) => {
    if (!months.has(mk)) months.set(mk, billsOf(S, mk));
    return months.get(mk);
  };
  // de quem vieram os pagamentos já conciliados de cada conta ("JOAO SILVA" foi o aluguel da última vez)
  const keys = new Map();
  for (const mk of Object.keys(S.months))
    for (const t of S.months[mk].tx) {
      if (!t.p || !t.im || !t.n) continue;
      const k = merchantKey(t.n);
      if (!k) continue;
      if (!keys.has(t.p)) keys.set(t.p, new Set());
      keys.get(t.p).add(k);
    }
  const vocab = new Set(PLAN_WORDS);
  for (const c of S.core.cats) for (const w of tokensOf(c.name)) vocab.add(w);
  const cats = new Map();
  // a categoria do item e a que o nome dele indica ("Luz" num item de Moradia → Luz)
  const catsOf = (l) => {
    if (!cats.has(l.id)) {
      const set = new Set([l.cat]);
      const k = M.kwMatch(matcher, l.kind, l.name);
      if (k && M.groupId(S, k) === M.groupId(S, l.cat)) set.add(k);
      cats.set(l.id, set);
    }
    return cats.get(l.id);
  };
  const toks = new Map();
  const toksOf = (str) => {
    if (!toks.has(str)) toks.set(str, tokensOf(str));
    return toks.get(str);
  };
  return { billsAt, keys, vocab, catsOf, toksOf };
}

/**
 * Nota de um par (lançamento do extrato, conta do plano), os motivos e se há sinal de que é a mesma coisa
 * (idn: mesmo nome, mesma categoria, igual da última vez, a parcela certa). Só o valor batendo não basta para
 * ligar sozinho: aí a pessoa confirma. null = não pode ser.
 */
export function scorePair(S, it, b, cx) {
  const line = b.line;
  if (line.kind !== it.kind) return null;
  const paid = b.tx && !b.tx.im ? b.tx : null;
  // vale o valor do plano ou o que já foi marcado, o que estiver mais perto
  const ad = Math.min(Math.abs(it.amount - line.amount), paid ? Math.abs(it.amount - paid.v) : Infinity);
  const rel = ad / Math.max(it.amount, 1);
  const why = [];
  let s;
  if (ad <= 1) {
    s = 5;
    why.push('mesmo valor');
  } else if (ad <= 100 || rel <= 0.02) {
    s = 4;
    why.push('valor quase igual');
  } else if (rel <= 0.1) s = 2;
  else if (rel <= 0.4) s = 0;
  else return null;
  const dd = b.due ? Math.abs(U.daysBetween(it.date, b.due)) : 99;
  if (b.mk === U.mkOf(it.date)) {
    if (dd <= 5) {
      s += 1.5;
      why.push('perto do vencimento');
    }
  } else if (dd > 10) return null;
  else s -= 1;
  let idn = false;
  let sure = false;
  // marcada à mão com um valor digitado (não o do plano) e o extrato traz exatamente esse valor
  if (paid && !paid.auto && paid.v !== line.amount && Math.abs(it.amount - paid.v) <= 1) {
    s += 3;
    idn = true;
    why.push('o valor que você marcou');
  }
  // quem é: o mesmo da última vez, o mesmo nome, a parcela certa
  if (it.key && cx.keys.has(line.id) && cx.keys.get(line.id).has(it.key)) {
    s += 6;
    idn = sure = true;
    why.push('igual da última vez');
  }
  const lt = cx.toksOf(line.name);
  const dt = cx.toksOf(it.desc);
  const near = (a, c) => a === c || (a.length >= 5 && c.length >= 5 && (a.startsWith(c) || c.startsWith(a)));
  if (lt.some((w) => dt.some((d) => near(w, d)))) {
    s += 4;
    idn = sure = true;
    why.push('mesmo nome');
  }
  const pm = line.rec === 'parcelas' && it.desc.match(PARC_RE);
  if (pm && +pm[2] === line.count) {
    const n = M.parcelaOf(line, b.mk).n;
    if (+pm[1] === n) {
      s += 5;
      idn = sure = true;
      why.push(`parcela ${n} de ${line.count}`);
    } else if (Math.abs(+pm[1] - n) === 1) s += 2;
  }
  // a categoria do lançamento (quando o app já sabe)
  const cats = cx.catsOf(line);
  if (it.cat && cats.has(it.cat)) {
    s += 4;
    idn = true;
    why.push('mesma categoria');
    if (cx.billsAt(b.mk).filter((o) => o.line.kind === it.kind && cx.catsOf(o.line).has(it.cat)).length === 1) s += 1.5;
  } else if (it.cat && M.groupId(S, it.cat) === M.groupId(S, line.cat)) {
    s += 1.5;
    idn = true;
  } else if (!sure && it.cat && it.kind === 'despesa' && SURE_HOW.has(it.how)) s -= 3;
  // nome próprio no plano ("Netflix", "Diarista Maria") que não aparece no extrato
  if (!sure && it.kind !== 'invest' && lt.some((w) => !cx.vocab.has(w))) s -= 4;
  if (it.kind !== 'invest' && PAY_RE.test(it.nd || norm(it.desc))) s += 1;
  // investimento e receita: poucas contas de cada, então o mesmo valor já diz bastante
  if (it.kind !== 'despesa' && ad <= 100) idn = true;
  return { s, why, dd, ad, idn };
}

/** Pode entrar na conciliação: vai ser lançado (ou é pergunta) e não é estorno. */
const concOpen = (it) => (it.status === 'add' || it.status === 'ask') && !it.refund && !it.match;

/**
 * Acha a conta do plano de cada lançamento, uma conta para cada lançamento. Pares com sinal de que é a mesma
 * coisa vêm primeiro (o débito da Energisa ganha do Pix de mesmo valor para a conta de luz) e já vêm ligados;
 * os outros ficam para a pessoa confirmar.
 */
export function reconcile(S, items, cx = concContext(S)) {
  const pairs = [];
  for (const it of items) {
    if (!concOpen(it)) continue;
    const mk = U.mkOf(it.date);
    for (const m of [U.addMonths(mk, -1), mk, U.addMonths(mk, 1)])
      for (const b of cx.billsAt(m)) {
        if (b.tx && b.tx.im) continue; // já conciliada numa importação anterior
        const r = scorePair(S, it, b, cx);
        if (r && r.s >= CONC_MIN) pairs.push({ it, b, ...r });
      }
  }
  pairs.sort((x, y) => y.idn - x.idn || y.s - x.s || x.dd - y.dd || x.ad - y.ad);
  const usedB = new Set();
  const usedI = new Set();
  const chosen = [];
  for (const p of pairs) {
    if (usedB.has(p.b.key) || usedI.has(p.it)) continue;
    usedB.add(p.b.key);
    usedI.add(p.it);
    chosen.push(p);
  }
  for (const p of chosen) {
    // empate com outra conta que ficou sem par (ex.: duas contas de mesmo valor): a pessoa escolhe
    const tie = pairs.some((q) => q.it === p.it && q.b.key !== p.b.key && q.idn === p.idn && q.s >= p.s - 0.01 && !usedB.has(q.b.key));
    const ok = p.idn && p.s >= CONC_LINK && !tie;
    p.it.match = { type: 'bill', ...p.b, s: p.s, why: p.why, tier: ok ? 'ok' : 'talvez' };
    if (ok) setLink(p.it, true);
  }
}

/** Liga (ou desliga) o lançamento ao par. Guarda como ele estava, para voltar igual se desligar. */
export function setLink(it, on) {
  if (!it.match || !!it.link === on) return;
  if (on) {
    it.pre = { status: it.status, cat: it.cat, how: it.how, reason: it.reason };
    const m = it.match;
    if (m.type === 'bill') Object.assign(it, { status: 'add', cat: m.line.cat, how: 'plano', p: m.line.id, billName: m.line.name, billMk: m.mk, replaces: m.tx ? { mk: m.mk, id: m.tx.id } : null });
    else Object.assign(it, { status: 'dup', reason: `Você já lançou: ${m.name} em ${U.dayLabel(m.tx.d).toLowerCase()}`, dupOf: m.tx.id });
    it.link = true;
  } else {
    Object.assign(it, it.pre);
    for (const k of ['p', 'billName', 'billMk', 'replaces', 'dupOf']) delete it[k];
    it.link = false;
  }
}

/** Liga um lançamento ao par dele e desliga quem estava com a mesma conta (cada conta paga uma vez). */
export function linkOnly(items, it) {
  if (it.match && it.match.type === 'bill') for (const o of items) if (o !== it && o.link && o.match && o.match.type === 'bill' && o.match.key === it.match.key) setLink(o, false);
  setLink(it, true);
}

/** “É esta conta”, escolhida à mão: troca o par do lançamento. */
export function linkTo(items, it, b) {
  setLink(it, false);
  it.match = { type: 'bill', ...b, s: 99, why: ['você escolheu'], tier: it.match ? it.match.tier : 'ok', manual: true };
  linkOnly(items, it);
}

/** Contas do plano no período do extrato, para achar à mão as que não bateram sozinhas. */
export function periodBills(S, items, type) {
  const dates = items.filter((i) => i.status !== 'ignore').map((i) => i.date).sort();
  if (!dates.length) return [];
  const from = U.addDays(dates[0], -3);
  const to = U.addDays(dates[dates.length - 1], 3);
  const out = [];
  for (let mk = U.mkOf(from); mk <= U.mkOf(to); mk = U.addMonths(mk, 1))
    for (const b of billsOf(S, mk)) {
      if (b.tx && b.tx.im) continue;
      // na fatura do cartão só há gastos
      if (type === 'cartao' && b.line.kind !== 'despesa') continue;
      if (b.due && (b.due < from || b.due > to)) continue;
      out.push(b);
    }
  return out.sort((a, b) => (a.due || `${a.mk}-32`).localeCompare(b.due || `${b.mk}-32`) || a.line.name.localeCompare(b.line.name));
}

/** Contas do plano que podem ser este lançamento (mesmo tipo, no mês dele ou perto), da mais provável para a menos. */
export function billsFor(S, it) {
  const cx = concContext(S);
  const mk = U.mkOf(it.date);
  const out = [];
  for (const m of [mk, U.addMonths(mk, -1), U.addMonths(mk, 1)])
    for (const b of cx.billsAt(m)) {
      if (b.line.kind !== it.kind || (b.tx && b.tx.im)) continue;
      if (m !== mk && !(b.due && Math.abs(U.daysBetween(it.date, b.due)) <= 10)) continue;
      const r = scorePair(S, it, b, cx);
      out.push({ b, s: r ? r.s : -99, d: Math.abs(it.amount - b.line.amount) });
    }
  return out.sort((x, y) => y.s - x.s || x.d - y.d).map((x) => x.b);
}

/**
 * Lançamentos do extrato ainda sem par que podem ser esta conta, do valor mais parecido para o menos. Os já ligados
 * (a outra conta do plano ou ao que você lançou à mão) ficam de fora. Se a conta do plano é a fatura do cartão, o
 * pagamento da fatura que a importação ignorou também pode ser ela.
 */
export function itemsFor(items, b) {
  const card = b.line.kind === 'despesa' && (b.line.cat === 'cartao' || /\b(fatura|cartao)\b/.test(norm(b.line.name)));
  const open = (it) => it.status === 'add' || it.status === 'ask' || (card && it.status === 'ignore' && /^Pagamento da fatura/.test(it.reason || ''));
  return items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => it.kind === b.line.kind && !it.refund && !it.link && open(it))
    .map((x) => ({ ...x, d: Math.abs(x.it.amount - b.line.amount), dd: b.due ? Math.abs(U.daysBetween(x.it.date, b.due)) : 0 }))
    .sort((x, y) => x.d - y.d || x.dd - y.dd);
}

/**
 * Conciliar depois, no mês: lançamentos do extrato já importados, sem ligação com o plano, que são o pagamento
 * de uma conta. Se a conta também estava marcada (à mão ou no automático), o pagamento entrou em dobro.
 * Só pares bem prováveis; os que a pessoa disse que não são ficam em settings.dupSkip.
 */
export function doubledIn(S, mk, { unpaid = true } = {}) {
  const skip = new Set(S.core.settings.dupSkip || []);
  const plan = S.core.plan.filter((l) => l.type !== 'verba' && M.occurs(l, mk));
  if (!plan.length) return [];
  const imported = [];
  for (const m of [U.addMonths(mk, -1), mk, U.addMonths(mk, 1)]) for (const t of M.txOf(S, m)) if (t.im && !t.p && !t.ap && t.v > 0) imported.push({ t, mk: m });
  if (!imported.length) return [];
  const marks = M.txOf(S, mk);
  // primeiro um filtro barato (tipo e valor perto), para não dar nota a tudo com tudo
  const close = (a, b) => Math.abs(a - b) <= Math.max(100, a * 0.4);
  const todo = [];
  for (const line of plan) {
    const mark = marks.find((t) => t.p === line.id) || null;
    if (mark && (mark.im || mark.ap)) continue;
    if (!mark && !unpaid) continue;
    const cands = imported.filter(({ t }) => t.k === line.kind && (close(t.v, line.amount) || (mark && close(t.v, mark.v))));
    if (cands.length) todo.push({ line, mark, cands });
  }
  if (!todo.length) return [];
  const cx = concContext(S);
  const pairs = [];
  const gid = new Map();
  const groupOf = (c) => {
    if (!gid.has(c)) gid.set(c, M.groupId(S, c));
    return gid.get(c);
  };
  for (const { line, mark, cands } of todo) {
    const b = { key: `${line.id}@${mk}`, line, mk, due: line.day ? `${mk}-${U.pad(Math.min(line.day, U.daysInMonth(mk)))}` : null, tx: mark };
    const lt = cx.toksOf(line.name);
    const seen = cx.keys.get(line.id);
    for (const { t, mk: txMk } of cands) {
      const key = `${b.key}|${t.id}`;
      if (skip.has(key)) continue;
      // só dá nota a quem tem algum sinal de ser esta conta (a nota exige isso para aparecer)
      const maybe =
        line.kind !== 'despesa' ||
        line.rec === 'parcelas' ||
        groupOf(t.c) === groupOf(line.cat) ||
        (mark && Math.abs(t.v - mark.v) <= 1) ||
        (seen && seen.has(merchantKey(t.n || ''))) ||
        cx.toksOf(t.n || '').some((d) => lt.some((w) => w === d || (w.length >= 5 && d.length >= 5 && (w.startsWith(d) || d.startsWith(w)))));
      if (!maybe) continue;
      const it = { date: t.d, desc: t.n || '', amount: t.v, kind: t.k, cat: t.c, how: 'regra', key: merchantKey(t.n || ''), nd: norm(t.n || '') };
      const r = scorePair(S, it, b, cx);
      if (r && r.idn && r.s >= CONC_LINK) pairs.push({ key, line, mk, mark, tx: t, txMk, s: r.s, why: r.why });
    }
  }
  // primeiro os pares mais certos; na lista, o que está em dobro de verdade vem antes
  pairs.sort((x, y) => y.s - x.s);
  const usedL = new Set();
  const usedT = new Set();
  return pairs
    .filter((p) => {
      if (usedL.has(p.line.id) || usedT.has(p.tx.id)) return false;
      usedL.add(p.line.id);
      usedT.add(p.tx.id);
      return true;
    })
    .sort((x, y) => !!y.mark - !!x.mark || y.s - x.s);
}

/** Acertos aproximados no período do extrato (podem ser substituídos pelos valores reais). */
export function acertosInRange(S, items) {
  const dates = items.filter((i) => i.status !== 'ignore').map((i) => i.date).sort();
  if (!dates.length) return { total: 0, list: [] };
  const [a, b] = [dates[0], dates[dates.length - 1]];
  const list = [];
  for (const mk of Object.keys(S.months)) for (const t of S.months[mk].tx) if (t.ap && t.d >= a && t.d <= b) list.push({ mk, id: t.id, v: t.v });
  return { total: U.sum(list, (t) => t.v), list, from: a, to: b };
}
