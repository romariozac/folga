// Lê lançamentos de prints (capturas de tela de app de banco) a partir das palavras que o OCR achou,
// com a posição de cada uma. Não depende de layout de um banco: junta palavras em linhas, linhas em
// "cartões" (um item da lista), entende cabeçalhos de data ("Hoje", "Seg, 3 de novembro") e decide
// se o dinheiro entrou ou saiu pelo sinal, pela cor do valor e pelas palavras.
import * as U from './util.js';
import { norm } from './model.js';
import { parseDate, bankCatToId } from './importer.js';

/** Conserta o que o OCR costuma errar em valores: "RS 45,90", "R$45.90", "1.234 ,56", "1O,00". */
export function fixOcrText(t) {
  let s = String(t || '')
    .replace(/[—–−]/g, '-')
    .replace(/\s+/g, ' ');
  s = s.replace(/(^|[\s(+-])R\s?[$S5§s]\s?(?=-?\s?[\dOo])/g, '$1R$ ');
  s = s.replace(/(\d)\s+,\s*(\d{2})(?!\d)/g, '$1,$2').replace(/(\d),\s+(\d{2})(?![\d/])/g, '$1,$2');
  s = s.replace(/(?<=\d[\d.,]*)[Oo](?=[\d.,]*(?:,\d{2}|\d)(?![\d]))/g, '0').replace(/(?<![A-Za-zÀ-ú])[Oo](?=\d[\d.]*,\d{2}(?!\d))/g, '0');
  s = s.replace(/(R\$\s?-?\s?\d{1,3}(?:\.\d{3})*)\.(\d{2})(?![\d,])/g, '$1,$2');
  s = s.replace(/(?<![\d.,])(\d{1,3})((?:,\d{3})+),(\d{2})(?!\d)/g, (m, a, b, c) => a + b.replace(/,/g, '.') + ',' + c);
  return s.trim();
}

const AMT = /(?<![\w,.])([+-]\s?)?(R\$\s?)?(-\s?)?(\d{1,3}(?:\.\d{3})+|\d{1,6}),(\d{2})(?![\d%])(\s?[DC](?![A-Za-zÀ-ú]))?(\s?-(?![\d\w]))?/g;
const LEAD_DATE = /^(\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?|\d{1,2}\s*(?:de\s+)?(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?)(?=\s|$)/;
const TIME = /\b\d{1,2}\s?[:h]\s?\d{2}(?::\d{2})?\b/g;
const WEEKDAY = /^(?:(?:segunda|terca|quarta|quinta|sexta)(?:[- ]?feira)?|sabado|domingo|seg|ter|qua|qui|sex|sab|dom)\b\.?,?\s*/;
const WD_IDX = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };

/** "Hoje", "Ontem", "Seg, 3 de novembro", "03/11/2026", "SEX 01 NOV" → data ISO (ou null). */
export function headerDate(text, today = U.isoDate()) {
  const s = norm(text).replace(/[|•·]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[.,:;-]+$/, '');
  if (!s || s.length > 48) return null;
  const onlyDate = (r) => (/^\d{1,2}(?:[/.-]\d{1,2}(?:[/.-]\d{2,4})?|\s*(?:de\s+)?[a-z]{3,9}\.?(?:\s*(?:de\s+)?\d{4})?)$/.test(r) ? parseDate(r) : null);
  // "Hoje", "Ontem, 4 de novembro": a data escrita vale mais (o print pode ser de outro dia)
  const rel = s.match(/^(hoje|ontem|anteontem)\b[\s,.-]*(.*)$/);
  if (rel) {
    if (!rel[2]) return rel[1] === 'hoje' ? today : U.addDays(today, rel[1] === 'ontem' ? -1 : -2);
    return onlyDate(rel[2].replace(WEEKDAY, '').trim());
  }
  const wd = s.match(WEEKDAY);
  const rest = (wd ? s.slice(wd[0].length) : s).replace(/^[,.\s-]+/, '').trim();
  if (!rest) {
    if (!wd) return null;
    const want = WD_IDX[wd[0].trim().slice(0, 3)];
    for (let i = 0; i < 7; i++) {
      const d = U.addDays(today, -i);
      if (U.parseISO(d).getDay() === want) return d;
    }
    return null;
  }
  return onlyDate(rest);
}

// rótulos que não são lançamento (saldo, limite, totais, datas de fatura)
const NOISE_START = /^(saldo|limite|total|subtotal|vencimento|vence|fechamento|fecha|melhor dia|pagamento minimo|valor minimo|minimo|disponivel|em aberto|a pagar|parcelar|pagar fatura|ver (fatura|extrato|mais|tudo)|resumo|fatura (atual|aberta|fechada|anterior|em aberto|paga|vencida|de [a-z]+))\b/;
const NOISE_ANY = /\b(saldo (do dia|anterior|disponivel|em conta|final|atual|total|bloqueado|inicial)|limite (disponivel|total|utilizado)|pagamento minimo|total (da|desta|a pagar|de compras|geral|nacional|internacional)|valor total|melhor dia de compra|saldo)\b/;
const TOTAL_RE = /\b(total (da|desta) fatura|valor (total )?da fatura|fatura (atual|aberta|fechada)|total a pagar|total dos lancamentos)\b/;
const STOP_RE = /\b(proximas faturas|lancamentos futuros|parcelas futuras|compras parceladas futuras|proximos lancamentos)\b/;
const RESUME_RE = /^(lancamentos|compras|despesas|transacoes|movimentacoes)\b/;

const IN_CARD = /\b(estorno|estornado|credito|pagamento|pagto|pgto|devolucao|reembolso|cashback|desconto|ajuste a credito)\b/;
const IN_CONTA = /\b(recebid[oa]s?|recebimento|deposito|salario|estorno|devolucao|reembolso|rendimentos?|rend pago|cashback|resgate|credito em conta|credito de salario|entrada|bonus|premio)\b/;
const OUT_CONTA = /\b(enviad[oa]s?|pagamento|pagto|pgto|compra|debito|saque|tarifa|boleto|aplicacao)\b/;

function median(arr, dflt) {
  if (!arr.length) return dflt;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Palavras → linhas visuais (pela altura do centro de cada palavra). */
export function toRows(words) {
  const ws = words
    .filter((w) => w && w.t && /[\p{L}\p{N}$+-]/u.test(w.t))
    .map((w) => ({ ...w, t: String(w.t), cy: (w.y0 + w.y1) / 2, h: Math.max(1, w.y1 - w.y0) }))
    .sort((a, b) => a.cy - b.cy);
  const rows = [];
  for (const w of ws) {
    const r = rows[rows.length - 1];
    if (r && Math.abs(w.cy - r.cy) <= 0.5 * Math.min(w.h, r.h)) {
      r.words.push(w);
      const n = r.words.length;
      r.cy = (r.cy * (n - 1) + w.cy) / n;
      r.h = (r.h * (n - 1) + w.h) / n;
      r.y0 = Math.min(r.y0, w.y0);
      r.y1 = Math.max(r.y1, w.y1);
    } else rows.push({ words: [w], cy: w.cy, y0: w.y0, y1: w.y1, h: w.h });
  }
  for (const r of rows) {
    r.words.sort((a, b) => a.x0 - b.x0);
    r.text = r.words.map((w) => w.t).join(' ');
    r.x0 = r.words[0].x0;
    r.x1 = Math.max(...r.words.map((w) => w.x1));
  }
  return rows;
}

/** Linhas → cartões (itens da lista), separados por espaço vertical maior que o normal entre linhas. */
export function toCards(rows) {
  const medH = median(rows.map((r) => r.h), 20);
  const cards = [];
  let cur = null;
  for (const r of rows) {
    if (cur && r.y0 - cur.y1 <= 0.8 * medH) {
      cur.rows.push(r);
      cur.y1 = Math.max(cur.y1, r.y1);
    } else {
      cur = { rows: [r], y0: r.y0, y1: r.y1 };
      cards.push(cur);
    }
  }
  return cards;
}

function amountsOf(row, text) {
  const out = [];
  for (const m of text.matchAll(AMT)) {
    const cents = parseInt(m[4].replace(/\./g, ''), 10) * 100 + parseInt(m[5], 10);
    if (!cents) continue;
    const dc = m[6] ? m[6].trim().toUpperCase() : null;
    const minus = /-/.test(m[1] || '') || /-/.test(m[3] || '') || !!m[7];
    const plus = /\+/.test(m[1] || '');
    const numTxt = `${m[4]},${m[5]}`;
    const w = row.words.find((x) => fixOcrText(x.t).includes(numTxt)) || row.words.find((x) => /\d,\d{2}/.test(fixOcrText(x.t)));
    out.push({ cents, dc, minus, plus, brl: !!m[2], raw: m[0], ink: w ? w.ink || null : null, x: w ? w.x0 : row.x1 });
  }
  return out;
}

function analyze(row, today) {
  const text = fixLeadDay(fixOcrText(row.text));
  const nt = norm(text).replace(/\s+/g, ' ').trim();
  const amts = amountsOf(row, text);
  let hdr = amts.length ? null : headerDate(text, today);
  // data grudada na linha de cima (e longe da de baixo) é a data daquele item, não um cabeçalho
  if (hdr && (row.gapAbove <= 0 || row.gapAbove < 0.8 * row.gapBelow)) hdr = null;
  // "23/10" sozinho na coluna dos valores é um valor com a vírgula mal lida, não uma data
  const last = row.words[row.words.length - 1];
  if (hdr && row.amtRight != null && Math.abs(last.x1 - row.amtRight) <= row.pageW * 0.03 && /^-?\d{1,3}(?:\.\d{3})*[/.]\d{2}$/.test(last.t)) hdr = null;
  const lead = !hdr ? nt.match(LEAD_DATE) : null;
  return { row, text, nt, amts, hdr, lead: lead ? lead[1] : null };
}

/** Texto da linha sem valores, datas do começo, horários e símbolos soltos. */
function cleanDesc(a) {
  let s = a.text.replace(AMT, ' ');
  if (a.lead) s = s.replace(new RegExp('^\\s*' + a.lead.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
  s = s
    .replace(TIME, ' ')
    .replace(/\bR\$\s*/g, ' ')
    .replace(/(^|\s)[-+•·|>›»<‹«*©®@#~_=]+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

const MONTHS = /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?$/;
// dígitos que o OCR troca por letras em textos pequenos ("os" = 05, "o3" = 03, "l2" = 12)
const DIGITISH = { o: '0', d: '0', q: '0', i: '1', l: '1', '|': '1', z: '2', s: '5', b: '6', g: '9' };
function dayOf(tok) {
  const t = norm(tok).replace(/[.,:]$/, '');
  if (!/^[0-9odqilzsbg|]{1,2}$/.test(t) || (t.length < 2 && !/[0-9]/.test(t))) return null;
  const d = +t.replace(/[^0-9]/g, (c) => DIGITISH[c] || 'x');
  return d >= 1 && d <= 31 ? d : null;
}
/** Data quebrada em duas linhas no começo do item: "05" numa linha e "NOV" na de baixo. */
function splitDate(rows) {
  for (let i = 0; i < rows.length - 1; i++) {
    const w1 = rows[i].row.words[0];
    const d = w1 && dayOf(w1.t);
    if (!d) continue;
    const tol = Math.max(30, (w1.y1 - w1.y0) * 1.5);
    for (let j = i + 1; j < rows.length && j <= i + 3; j++) {
      const w2 = rows[j].row.words[0];
      const m = w2 && Math.abs(w1.x0 - w2.x0) <= tol && norm(w2.t).match(MONTHS);
      if (m) return { date: parseDate(`${d} ${m[1]}`), rows: [rows[i], rows[j]] };
    }
  }
  return null;
}
/** "O1 NOV ..." / "os nov" no começo da linha: conserta o dia. */
function fixLeadDay(text) {
  const m = text.match(/^(\S{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/i);
  if (!m || /^\d+$/.test(m[1])) return text;
  const d = dayOf(m[1]);
  return d ? String(d).padStart(2, '0') + text.slice(m[1].length) : text;
}

// rótulo de categoria que o app do banco mostra embaixo da compra ("Serviços", "Transporte")
const BANK_LABEL = /^(servicos|transporte|compras|outros|lazer|saude|educacao|viage(m|ns)|mercado|alimentacao|restaurantes?|supermercados?|vestuario|casa|eletronicos|posto|combustivel|pets?|beleza|farmacia|entretenimento|assinaturas?|academia|moradia|delivery|cuidados pessoais)$/;

// forma de pagamento mostrada em cima do nome da loja: não ajuda a categorizar
const WALLET = /^((android|google|apple|samsung|garmin|mercado|pic) ?pay|aproximacao|contactless|cartao (virtual|fisico|adicional)|carteira digital)$/;

const letters = (s) => (s.match(/\p{L}/gu) || []).length;
const isJunkLine = (s) => !s || letters(s) < 2 || /^(cartao|final|cart)\b.*\d{4}$/i.test(norm(s)) || /^\d+$/.test(s.replace(/\s/g, ''));

/**
 * Lê uma sequência de prints. pages: [{ words:[{t,x0,y0,x1,y1,ink}], w, h, today }] na ordem em que
 * foram tirados. Devolve { rows:[{date, desc, sa, saBy, bankCat}], type, bank, check, conv }.
 */
export function parseScreens(pages) {
  const items = [];
  let curDate = null;
  let check = null;
  let all = '';
  pages.forEach((pg, pi) => {
    const today = pg.today || U.isoDate();
    const rows = toRows(pg.words || []);
    // onde ficam os valores nesta tela (borda direita): ajuda a recuperar "23/10" que era "23,10"
    const amtRight = median((pg.words || []).filter((w) => /\d,\d{2}(?!\d)/.test(fixOcrText(w.t))).map((w) => w.x1), null);
    const pageW = pg.w || Math.max(1, ...(pg.words || []).map((w) => w.x1));
    for (const r of rows) {
      // ícone à esquerda lido como letra: palavra curta, sem número, longe da palavra seguinte
      const [w0, w1] = r.words;
      const n0 = norm(w0.t);
      if (!w1 || w0.t.length > 3 || /\d/.test(w0.t) || /^[-+]+$/.test(w0.t) || dayOf(w0.t) || MONTHS.test(n0) || /^(seg|ter|qua|qui|sex|sab|dom)\.?$/.test(n0) || !/^\p{L}/u.test(w1.t)) continue;
      const hh = median(r.words.slice(1).map((w) => w.y1 - w.y0), w1.y1 - w1.y0);
      if (w1.x0 - w0.x1 > 0.9 * hh) {
        r.words.shift();
        r.text = r.words.map((w) => w.t).join(' ');
        r.x0 = r.words[0].x0;
      }
    }
    rows.forEach((r, i) => {
      r.gapAbove = i ? r.y0 - rows[i - 1].y1 : Infinity;
      r.gapBelow = i < rows.length - 1 ? rows[i + 1].y0 - r.y1 : Infinity;
      r.amtRight = amtRight;
      r.pageW = pageW;
    });
    const cards = toCards(rows);
    all += ' ' + rows.map((r) => norm(r.text)).join(' ');
    let skip = false;
    for (const card of cards) {
      // um cabeçalho de data abre um bloco novo, mesmo colado no item de cima
      const segs = [];
      for (const a of card.rows.map((r) => analyze(r, today))) {
        if (a.hdr || !segs.length) segs.push({ date: a.hdr || null, A: [] });
        if (!a.hdr) segs[segs.length - 1].A.push(a);
      }
      for (const seg of segs) {
        if (seg.date) curDate = seg.date;
        const body = seg.A;
        if (body.some((a) => STOP_RE.test(a.nt))) {
          skip = true;
          continue;
        }
        if (skip && body.some((a) => RESUME_RE.test(a.nt))) skip = false;
        if (skip || !body.length) continue;
        let amtRows = body.filter((a) => a.amts.length);
        if (!amtRows.length && amtRight != null) {
          // nenhum valor no item: a vírgula pode ter virado "/" ou "." no OCR, na coluna dos valores
          for (const a of body) {
            const w = a.row.words[a.row.words.length - 1];
            if (!w || Math.abs(w.x1 - amtRight) > pageW * 0.03 || !/^-?\d{1,3}(?:\.\d{3})*[/.]\d{2}$/.test(w.t)) continue;
            const fixed = { ...a.row, amtRight: null, words: a.row.words.map((x) => (x === w ? { ...x, t: w.t.replace(/[/.](\d{2})$/, ',$1') } : x)) };
            fixed.text = fixed.words.map((x) => x.t).join(' ');
            Object.assign(a, analyze(fixed, today), { row: fixed });
            a.hdr = null;
          }
          amtRows = body.filter((a) => a.amts.length);
        }
        if (!check && amtRows.length === 1 && body.some((a) => TOTAL_RE.test(a.nt))) check = { label: 'Total mostrado no print', total: amtRows[0].amts[amtRows[0].amts.length - 1].cents };
        if (!amtRows.length) continue;
        const noisy = (a) => NOISE_START.test(a.nt) || NOISE_ANY.test(a.nt);
        const base = { page: pi, ctxDate: curDate, y: card.y0, h: pg.h || 0 };

        const pushItem = (descRows, a, amt) => {
          let bankCat = '';
          const parts = [];
          let date = a.lead ? parseDate(a.lead) : null;
          const sd = date ? null : splitDate(descRows.some((d) => d.lead) ? [] : descRows);
          if (sd) date = sd.date;
          const many = descRows.filter((d) => letters(cleanDesc(d)) >= 4).length >= 1;
          for (const d of descRows) {
            if (!date && d.lead) date = parseDate(d.lead);
            let s = cleanDesc(d);
            if (sd && sd.rows.includes(d)) s = s.replace(/^\S+\s*/, '');
            if (isJunkLine(s) || WALLET.test(norm(s))) continue;
            if (many && /^\p{L}{1,3}$/u.test(s) && letters(s) <= 3 && descRows.length > 1 && d !== a) continue;
            if (parts.length && s.split(' ').length <= 2 && (bankCatToId(s) || BANK_LABEL.test(norm(s)))) {
              bankCat = bankCat || s;
              continue;
            }
            parts.push(s);
          }
          const desc = parts.slice(0, 3).join(' ').replace(/\s+/g, ' ').trim();
          if (!desc) return;
          items.push({ ...base, date, desc, nd: norm(desc), amount: amt.cents, minus: amt.minus, plus: amt.plus, dc: amt.dc, ink: amt.ink, bankCat });
        };
        const best = (a) => a.amts.find((x) => x.brl || x.minus || x.plus || x.dc) || a.amts[a.amts.length - 1];
        // valor em moeda estrangeira + valor em reais no mesmo item ("USD 10,00" e "R$ 52,30"): é um item só
        const foreign = (a) => /\b(usd|us|eur|gbp|dolar|euro|cotacao)\b|us\$|u\$/.test(a.nt) && !a.amts.some((x) => x.brl);
        const real = amtRows.filter((a) => !foreign(a));

        if (real.length <= 1) {
          // um item: o bloco inteiro (título, subtítulo e valor)
          if (body.some(noisy)) continue;
          const a = real[0] || amtRows[0];
          pushItem(body, a, best(a));
        } else {
          // várias linhas com valor no mesmo bloco (lista apertada ou extrato em tabela): cada valor é um
          // lançamento, e cada linha sem valor fica com o lançamento mais próximo (título em cima, legenda embaixo)
          const anchors = real.filter((a) => !noisy(a));
          const groups = new Map(anchors.map((a) => [a, []]));
          for (const b of body) {
            if (b.amts.length || noisy(b)) continue;
            let near = null;
            let bd = Infinity;
            for (const a of anchors) {
              const d = Math.abs(a.row.cy - b.row.cy) * (b.row.cy > a.row.cy ? 1 : 1.15);
              if (d < bd) {
                bd = d;
                near = a;
              }
            }
            if (near) groups.get(near).push(b);
          }
          for (const a of anchors) {
            const list = [...groups.get(a), a].sort((x, y) => x.row.cy - y.row.cy);
            pushItem(list, a, best(a));
          }
        }
      }
    }
  });

  // tipo de documento: fatura do cartão ou extrato da conta
  const cardScore = (all.match(/\b(fatura|limite|vencimento|fechamento|parcela|cartao|anuidade)\b/g) || []).length;
  const contaScore = (all.match(/\b(saldo|extrato|pix|transferencia|ted|deposito|conta corrente|rendimento|boleto|recebid[oa])\b/g) || []).length;
  const type = cardScore >= contaScore ? 'cartao' : 'conta';
  const bank = /\bnubank\b|nu pagamentos/.test(all) ? 'Nubank' : /\bitau\b|itaucard/.test(all) ? 'Itaú' : /\bsantander\b/.test(all) ? 'Santander' : /\bcaixa\b/.test(all) ? 'Caixa' : '';

  // prints em sequência costumam repetir itens (a tela rola e sobra um pedaço): fica um só
  const keep = [];
  const when = (x) => x.date || x.ctxDate || null;
  for (const it of items) {
    const prev = keep.filter((k) => k.page < it.page && !k.matched && k.amount === it.amount && (k.page === it.page - 1 || (when(k) && when(k) === when(it))));
    const twin = prev.find((k) => {
      if (when(k) && when(it) && when(k) !== when(it)) return false;
      const a = new Set(k.nd.split(' ').filter((w) => w.length > 2));
      const b = it.nd.split(' ').filter((w) => w.length > 2);
      const inter = b.filter((w) => a.has(w)).length;
      const sim = inter / Math.max(1, Math.min(a.size, b.length));
      const edge = k.page === it.page - 1 && it.h && k.h ? it.y < it.h * 0.25 && k.y > k.h * 0.5 : false;
      return sim >= 0.5 || k.nd.includes(it.nd) || it.nd.includes(k.nd) || edge;
    });
    if (twin) {
      twin.matched = true;
      continue;
    }
    keep.push(it);
  }

  // datas: a do próprio item, a do cabeçalho acima; se faltar, a próxima conhecida (listas vêm da mais nova para a mais antiga)
  for (const it of keep) it.date = it.date || it.ctxDate || null;
  for (let i = 0; i < keep.length; i++) {
    if (keep[i].date) continue;
    const next = keep.slice(i + 1).find((k) => k.date);
    const prev = keep.slice(0, i).reverse().find((k) => k.date);
    keep[i].date = (next && next.date) || (prev && prev.date) || (pages[keep[i].page] && pages[keep[i].page].today) || U.isoDate();
  }

  const dirFor = (t, it) => {
    if (it.dc === 'C') return 'in';
    if (it.dc === 'D') return 'out';
    if (t === 'cartao') return it.minus || it.ink === 'green' || IN_CARD.test(it.nd) ? 'in' : 'out';
    if (it.minus || it.ink === 'red') return 'out';
    if (it.plus || it.ink === 'green') return 'in';
    return IN_CONTA.test(it.nd) && !OUT_CONTA.test(it.nd) ? 'in' : 'out';
  };
  const rows = keep.map((it) => {
    const saBy = {};
    for (const t of ['conta', 'cartao']) saBy[t] = dirFor(t, it) === 'out' ? -it.amount : it.amount;
    const row = { date: it.date, desc: it.desc.slice(0, 80), sa: saBy[type], saBy };
    if (it.bankCat) row.bankCat = it.bankCat;
    return row;
  });
  return { rows, type, bank, check, conv: 'neg-out' };
}
