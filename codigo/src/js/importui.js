// Tela de importação: escolher arquivo/colar → resumo → perguntas (só as dúvidas) → revisão → lançar.
import { ctx } from './ctx.js';
import * as U from './util.js';
import * as M from './model.js';
import * as A from './actions.js';
import * as IM from './importer.js';
import { readPrints } from './ocr.js';
import { IC, $, openSheet, sheetHead, vibrate, toast } from './ui.js';
import { catBrowserHTML, createFromSearch, pickCategory } from './catui.js';

const S = () => ctx.S;
const { esc, money } = U;
const m0 = (v) => money(v, { cents: false });
const FALLBACK = { despesa: 'outros', receita: 'outras_rec', invest: 'investir' };
const TYPE_LABEL = { conta: 'extrato da conta', cartao: 'fatura do cartão' };

const MAX_PRINTS = 12;
// endereço do app instalável (GitHub Pages), onde a leitura de prints funciona
const APP_URL = 'https://romariozac.github.io/folga/';
// No link do Claude a página não pode baixar o leitor de prints (o Claude só libera alguns sites), e ler pelo
// Claude gastaria seus tokens: lá o botão explica onde ler.
const printsHere = () => !(window.claude && typeof window.claude.use === 'function');

// Passo a passo por banco (os nomes dos menus mudam de vez em quando).
const BANK_HELP = {
  Nubank: {
    conta: 'No app: toque em <b>Conta</b> → <b>Pedir extrato</b> → escolha o período → <b>Exportar extrato</b> → <b>OFX</b> ou <b>CSV</b>. O arquivo chega no seu e-mail: baixe e escolha aqui.',
    cartao: 'Na fatura do cartão, procure <b>Exportar</b> ou <b>Enviar por e-mail</b> (CSV). Se não aparecer, use o <b>PDF</b> da fatura.',
  },
  Itaú: {
    conta: 'Pelo <b>site</b> (computador): <b>Conta corrente</b> → <b>Extrato</b> (por período) → <b>Salvar em</b> → <b>OFX</b>. Evite “Excel”. O PDF do extrato do app também funciona.',
    cartao: 'No app: <b>Cartões</b> → <b>Fatura</b> → baixe ou compartilhe o <b>PDF</b>.',
  },
  Santander: {
    conta: 'Pelo <b>site</b>: <b>Conta Corrente</b> → <b>Extrato (Money)</b> → escolha o período → <b>OFX</b>.',
    cartao: 'No app ou site: abra a <b>fatura</b> do cartão e baixe o <b>PDF</b>.',
  },
  Caixa: {
    conta: 'Pelo <b>site</b>: <b>Minha Conta</b> → <b>Extrato em arquivo (txt, ofc e ofx)</b> → escolha o mês → <b>Gerar arquivo para gerenciadores financeiros</b> → <b>OFX</b>.',
    cartao: 'No app ou site do cartão Caixa: baixe o <b>PDF</b> da fatura.',
  },
};

export function openImport() {
  const st = {
    step: 'source',
    parsed: null,
    source: '',
    type: 'conta',
    flip: false,
    items: [],
    questions: [],
    qi: 0,
    learnOn: true,
    learned: new Map(),
    replace: true,
    acertos: null,
    open: { add: false, ign: false, dup: false },
    error: '',
    q: '',
    more: false,
    bank: 'Nubank',
    errorDetail: '',
    guessed: 0,
    ctl: null,
    loadingMsg: '',
    pbills: [], // contas do plano no período do extrato (para conciliar à mão)
    concAll: false, // "No plano, sem par aqui" aberto
    nudge: null, // conciliação: item que ainda falta responder (destacado)
    qplan: [], // pergunta: itens do plano oferecidos (na ordem dos botões)
  };

  openSheet('<div class="imp"></div>', {
    cls: 'sheet-full',
    label: 'Importar extrato ou fatura',
    onMount: (el, close) => {
      const box = $('.imp', el);
      const sheet = () => box.closest('.sheet');

      const regroup = () => {
        const groups = new Map();
        for (const it of st.items) {
          if (it.status !== 'ask') continue;
          const k = it.key ? `${it.kind}:${it.key}` : `#${it.fp}`;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push(it);
        }
        st.questions = [...groups.values()];
        st.qi = 0;
      };
      const rebuild = () => {
        st.items = IM.buildBatch(S(), st.parsed, st.type, st.flip);
        st.pbills = IM.periodBills(S(), st.items, st.type);
        st.concAll = false;
        st.nudge = null;
        st.guessed = 0;
        regroup();
        st.acertos = IM.acertosInRange(S(), st.items);
      };

      // ---------- conciliação com o plano ----------
      const src = () => (st.type === 'cartao' ? 'da fatura' : 'do extrato');
      const srcIn = () => (st.type === 'cartao' ? 'na fatura' : 'no extrato');
      const pairs = () => st.items.map((it, i) => ({ it, i })).filter(({ it }) => it.match);
      const undecided = () => st.items.filter((it) => it.match && it.match.tier === 'talvez' && !it.link && !it.decided);
      // contas do período sem lançamento ligado (nem sugerido, esperando resposta)
      const looseBills = () => st.pbills.filter((b) => !st.items.some((it) => it.match && it.match.type === 'bill' && it.match.key === b.key && (it.link || !it.decided)));
      const hasConc = () => st.items.some((it) => it.match) || st.pbills.length > 0;
      const afterConc = () => {
        st.nudge = null;
        regroup();
        st.step = st.questions.length ? 'ask' : 'review';
        draw();
      };

      const counts = () => {
        const c = { add: 0, ask: 0, ignore: 0, dup: 0 };
        for (const it of st.items) c[it.status]++;
        return c;
      };

      const load = async (fn, msg = 'Lendo os lançamentos…') => {
        st.step = 'loading';
        st.error = '';
        st.errorDetail = '';
        st.loadingMsg = msg;
        draw();
        try {
          const parsed = await fn();
          if (!parsed.rows.length) {
            st.step = 'source';
            st.error = /print/.test(parsed.source || '')
              ? 'Não encontrei lançamentos nesses prints. Use prints nítidos da lista de lançamentos, sem cortar os valores, ou o PDF/OFX/CSV do banco.'
              : 'Não encontrei lançamentos aí. Se o PDF for uma imagem escaneada, não dá para ler: tente o OFX/CSV do banco ou cole o texto.';
          } else {
            st.parsed = parsed;
            st.source = parsed.source;
            st.type = parsed.type || 'conta';
            st.flip = false;
            rebuild();
            st.step = 'found';
          }
        } catch (err) {
          st.step = 'source';
          const msg = String((err && (err.message || err.code)) || err);
          st.errorDetail = msg === 'excel' ? '' : msg;
          if (err && err.code === 'cancelled') {
            st.step = 'source';
            st.errorDetail = '';
            draw();
            return;
          }
          st.error = msg === 'excel'
            ? 'Esse é um arquivo do Excel, que o app não lê. No site do banco, escolha OFX (ou CSV) na hora de salvar o extrato.'
            : /leitor de imagens|vendor\/ocr|imagem inválida|tesseract/i.test(msg)
              ? 'Não consegui abrir o leitor de prints. Na primeira vez ele precisa de internet para baixar uns 5 MB: confira a conexão e tente de novo. Se continuar, use o PDF, OFX ou CSV do banco.'
              : /pdf/i.test(msg) || /Não carregou/.test(msg)
                ? 'Não consegui abrir o PDF aqui. Tente o arquivo OFX/CSV do banco, ou copie o texto da fatura e use “Colar o texto”.'
                : 'Não consegui ler esse arquivo. Tente OFX, CSV, PDF da fatura ou cole o texto.';
        }
        draw();
      };

      // ---------- telas ----------
      const sourceHTML = () => `${sheetHead('Importar extrato ou fatura', 'O app lança sozinho e só pergunta o que ficar em dúvida.')}
        ${st.error ? `<div class="warn-box"><span class="flag-ic crit">!</span><div>${esc(st.error)}${st.errorDetail ? `<details class="tech"><summary>Detalhe técnico</summary><code>${esc(st.errorDetail)}</code></details>` : ''}</div></div>` : ''}
        <label class="imp-drop"><input type="file" accept=".ofx,.ofc,.qfx,.csv,.txt,.pdf,.xls,.xlsx,text/csv,text/plain,application/pdf,application/x-ofx" data-file hidden>
          <span class="imp-ic">📄</span><span><b>Escolher arquivo</b><small>OFX ou CSV do banco, PDF ou CSV da fatura</small></span></label>
        ${
          printsHere()
            ? `<label class="imp-drop"><input type="file" accept="image/*" multiple data-print hidden>
          <span class="imp-ic">📸</span><span><b>Ler prints da fatura ou do extrato</b><small>Até ${MAX_PRINTS} imagens. A leitura é feita no seu celular, sem usar o Claude</small></span></label>`
            : `<button type="button" class="imp-drop off" data-print-info><span class="imp-ic">📸</span><span><b>Ler prints da fatura ou do extrato</b><small>Funciona no app instalado (ícone do Folga). Toque para saber como</small></span></button>`
        }
        <button type="button" class="imp-drop" data-paste-open><span class="imp-ic">📋</span><span><b>Colar o texto</b><small>Copie as linhas do extrato ou da fatura e cole</small></span></button>
        <div data-paste hidden class="form">
          <textarea class="dump" data-paste-text placeholder="05/11 IFOOD *IFOOD 45,90&#10;06/11 UBER *TRIP 12,50&#10;07/11 PIX ENVIADO MARIA 150,00 D"></textarea>
          <button type="button" class="btn primary wide" data-paste-go>Ler o texto</button>
        </div>
        <div class="prose small bank-help">
          <h3>Como pegar o arquivo no seu banco</h3>
          <div class="seg full wrap" data-bank>${Object.keys(BANK_HELP).map((b) => `<button type="button" data-v="${b}" class="${st.bank === b ? 'on' : ''}">${b}</button>`).join('')}</div>
          <p><b>Extrato da conta:</b> ${BANK_HELP[st.bank].conta}</p>
          <p><b>Fatura do cartão:</b> ${BANK_HELP[st.bank].cartao}</p>
          <p class="help">Pode importar a fatura <i>e</i> o extrato: o pagamento da fatura que aparece no extrato é ignorado, para não contar duas vezes. Importou o mesmo período de novo? O app reconhece e não duplica. Os nomes dos menus podem mudar com as atualizações do banco.</p>
        </div>`;

      const foundHTML = () => {
        const c = counts();
        const dates = st.items.map((i) => i.date).sort();
        const span = dates.length ? `de ${U.dayLabel(dates[0]).toLowerCase()} a ${U.dayLabel(dates[dates.length - 1]).toLowerCase()}` : '';
        return `${sheetHead('Encontrei ' + U.plural(st.items.length, 'lançamento', 'lançamentos'), `${st.parsed.bank ? st.parsed.bank + ' · ' : ''}${st.source} · ${span}`)}
          ${st.error ? `<div class="warn-box"><span class="flag-ic crit">!</span><div>${esc(st.error)}</div></div>` : ''}
          <div class="field"><span>Isto é</span><div class="seg full" data-type>
            <button type="button" data-v="conta" class="${st.type === 'conta' ? 'on' : ''}">Extrato da conta</button>
            <button type="button" data-v="cartao" class="${st.type === 'cartao' ? 'on' : ''}">Fatura do cartão</button></div></div>
          <ul class="imp-stats">
            <li><b>${c.add}</b><span>categorizados sozinhos</span></li>
            <li class="${c.ask ? 'hl' : ''}"><b>${st.questions.length}</b><span>${st.questions.length === 1 ? 'pergunta' : 'perguntas'} para você</span></li>
            <li><b>${c.ignore + c.dup}</b><span>ignorados ou repetidos</span></li>
          </ul>
          ${checkHTML()}
          ${st.items.some((i) => i.moved) ? `<p class="help">${U.plural(st.items.filter((i) => i.moved).length, 'parcela ou crédito com data antiga entra', 'parcelas ou créditos com data antiga entram')} no mês desta fatura, que é quando você paga.</p>` : ''}
          ${/print/.test(st.source) ? '<p class="help">Lido dos prints aqui no celular. Confira datas e valores na revisão: dá para mudar o que vier errado.</p>' : ''}
          <p class="card-sub">Eu reconheço estabelecimentos comuns (iFood, Uber, Netflix, postos, farmácias…) e aprendo com as suas respostas: da próxima vez, pergunto menos.</p>
          ${st.guessed ? `<p class="ok-line">${IC.check} ${U.plural(st.guessed, 'palpite aceito', 'palpites aceitos')}. Você confere na revisão.</p>` : ''}
          ${guessHTML()}
          ${concSumHTML()}
          <div class="row-btns stick">${
            hasConc()
              ? `<button type="button" class="btn lime wide" data-go="conc">Conciliar com o plano</button>`
              : st.questions.length
                ? `<button type="button" class="btn lime wide" data-go="ask">Responder ${U.plural(st.questions.length, 'pergunta', 'perguntas')}</button>`
                : `<button type="button" class="btn primary wide" data-go="review">Revisar e lançar</button>`
          }</div>`;
      };

      /** Resumo da conciliação na primeira tela: o que já está no plano e o que falta conferir. */
      const concSumHTML = () => {
        if (!hasConc()) return '';
        const ok = st.items.filter((it) => it.link && it.match.type === 'bill');
        const dup = st.items.filter((it) => it.link && it.match.type === 'tx');
        const tv = undecided();
        const lines = [];
        const names = ok.map((it) => it.billName);
        if (ok.length) lines.push(`<b>${U.plural(ok.length, 'já está', 'já estão')} no plano:</b> ${esc(names.length > 4 ? `${names.slice(0, 3).join(', ')} e mais ${names.length - 3}` : U.listPT(names))}`);
        if (tv.length) lines.push(`<b>${tv.length} para conferir:</b> ${tv.length === 1 ? 'pode ser do plano' : 'podem ser do plano'}`);
        if (dup.length) lines.push(`${U.plural(dup.length, 'lançamento que você já tinha feito', 'lançamentos que você já tinha feito')}`);
        if (!lines.length) lines.push(`Nada bateu sozinho com o plano. Confira as contas deste período na próxima tela.`);
        return `<div class="conc-sum"><span class="imp-ic">🔗</span><div><h3>Conciliação com o plano</h3>${lines.map((l) => `<p>${l}</p>`).join('')}</div></div>`;
      };

      const LBL = {
        despesa: { done: 'paga', open: 'a pagar' },
        receita: { done: 'recebida', open: 'a receber' },
        invest: { done: 'guardada', open: 'a guardar' },
      };
      /** "dia 5", "dia 5 de novembro" (conta de outro mês), "novembro" (sem dia) e a parcela. */
      const billWhen = (b, refMk = null) => {
        const parts = [];
        const other = refMk && b.mk !== refMk;
        if (b.line.day) parts.push(`dia ${b.line.day}${other ? ` de ${U.monthName(b.mk)}` : ''}`);
        else parts.push(U.monthName(b.mk));
        const par = M.parcelaOf(b.line, b.mk);
        if (par) parts.push(`parcela ${par.n} de ${par.total}`);
        return parts.join(' · ');
      };
      const billState = (b) => {
        const t = b.tx;
        if (!t) return LBL[b.line.kind].open;
        return `${t.auto ? 'marcada sozinha' : 'marcada por você'}${t.v !== b.line.amount ? ` com ${money(t.v)}` : ''}`;
      };

      /** Um par: o lançamento do extrato em cima, o item do plano (ou o que você já lançou) embaixo. */
      const cardHTML = ({ it, i }) => {
        const m = it.match;
        const on = !!it.link;
        const und = m.tier === 'talvez' && !on && !it.decided;
        const sign = it.kind === 'receita' ? '+' : '−';
        const ext = `<div class="cc-row"><span class="cc-tag">${st.type === 'cartao' ? 'Fatura' : 'Extrato'}</span><span class="cc-txt"><b>${esc(it.desc)}</b><small>${U.dayLabel(it.date)}</small></span><span class="cc-amt${it.kind === 'receita' ? ' k-receita' : ''}">${sign}${money(it.amount)}</span></div>`;
        let other;
        let out;
        let warn = false;
        if (m.type === 'bill') {
          const c = M.catById(S(), m.line.cat);
          const name = `“${esc(m.line.name)}”`;
          other = `<div class="cc-row"><span class="cc-tag">Plano</span><span class="cc-txt"><b>${c.emoji} ${esc(m.line.name)}</b><small>${billWhen(m, U.mkOf(it.date))} · ${billState(m)}</small></span><span class="cc-amt">${money(m.line.amount)}</span></div>`;
          if (on && m.tx) out = m.tx.v === it.amount ? `Fica só o lançamento ${src()}, no lugar da marcação.` : `Fica só o lançamento ${src()}: ${money(it.amount)} no lugar dos ${money(m.tx.v)} marcados.`;
          else if (on) out = `${name} fica ${LBL[m.line.kind].done}, com ${money(it.amount)}.`;
          else if (und) out = 'É o mesmo? Se não for, ele entra separado.';
          else if (m.tx) {
            out = `Entra separado e ${name} continua marcada: conta duas vezes.`;
            warn = true;
          } else out = `Entra separado; ${name} continua ${LBL[m.line.kind].open}.`;
        } else {
          const t = m.tx;
          const c = M.catById(S(), t.c);
          other = `<div class="cc-row"><span class="cc-tag">Lançado</span><span class="cc-txt"><b>${c.emoji} ${esc(m.name)}</b><small>por você · ${U.dayLabel(t.d).toLowerCase()}</small></span><span class="cc-amt">${money(t.v)}</span></div>`;
          if (on) out = 'Não lança de novo: fica o que você lançou.';
          else {
            out = 'Lança de novo: fica duas vezes.';
            warn = true;
          }
        }
        const why = m.why && m.why.length ? `<p class="cc-why">${esc(m.why.join(' · '))}</p>` : '';
        return `<li class="cc${on ? ' on' : ''}${und ? ' und' : ''}${st.nudge === i ? ' nudge' : ''}" data-cc="${i}">
          ${ext}${other}${why}
          <div class="seg full cc-seg" role="group" aria-label="É o mesmo?">
            <button type="button" data-link="${i}" data-on="1" class="${on ? 'on' : ''}" aria-pressed="${on}">${IC.check}É o mesmo</button>
            <button type="button" data-link="${i}" data-on="0" class="${!on && !und ? 'on' : ''}" aria-pressed="${!on && !und}">Não é</button>
          </div>
          <p class="cc-out${warn ? ' warn' : ''}">${out}</p>
          ${m.type === 'bill' && !on ? `<button type="button" class="link small" data-other="${i}">Escolher outro item do plano</button>` : ''}
        </li>`;
      };

      const looseRowHTML = (b) => {
        const c = M.catById(S(), b.line.cat);
        return `<li><button type="button" class="tx" data-find="${esc(b.key)}"><span class="emo">${c.emoji}</span><span class="tx-txt"><b>${esc(b.line.name)}</b><small>${billWhen(b)} · ${billState(b)}</small></span><span class="tx-amt">${money(b.tx ? b.tx.v : b.line.amount)}</span></button></li>`;
      };

      const concHTML = () => {
        const all = pairs();
        const byDate = (a, b) => a.it.date.localeCompare(b.it.date);
        const tv = all.filter(({ it }) => it.match.tier === 'talvez').sort(byDate);
        const ok = all.filter(({ it }) => it.match.tier !== 'talvez' && it.match.type === 'bill').sort(byDate);
        const dup = all.filter(({ it }) => it.match.tier !== 'talvez' && it.match.type === 'tx').sort(byDate);
        const loose = looseBills();
        const showLoose = st.concAll || !all.length;
        const left = undecided().length;
        return `${sheetHead('Conciliação com o plano', `O que veio ${srcIn()} e já está no seu plano. Confirme para nada contar duas vezes.`)}
          ${tv.length ? `<h3 class="group">Confira<span>${tv.length === 1 ? 'é o mesmo?' : 'são os mesmos?'}</span></h3><ul class="cc-list">${tv.map(cardHTML).join('')}</ul>` : ''}
          ${ok.length ? `<h3 class="group">Já estão no plano<span>${ok.length}</span></h3><ul class="cc-list">${ok.map(cardHTML).join('')}</ul>` : ''}
          ${dup.length ? `<h3 class="group">Você já tinha lançado<span>${dup.length}</span></h3><ul class="cc-list">${dup.map(cardHTML).join('')}</ul>` : ''}
          ${all.length ? '' : `<p class="card-sub">Nenhum lançamento ${src()} bateu sozinho com o plano.</p>`}
          ${
            loose.length
              ? `<h3 class="group">No plano, sem par aqui<span>${loose.length}</span></h3>${
                  showLoose
                    ? `<p class="help">Alguma delas está ${srcIn()} com outro nome ou valor? Toque nela e escolha o lançamento: assim não conta duas vezes.</p><ul class="txs">${loose.map(looseRowHTML).join('')}</ul>`
                    : `<button type="button" class="link" data-conc-all>Ver ${loose.length === 1 ? 'a conta' : `as ${loose.length} contas`}</button>`
                }`
              : ''
          }
          <div class="row-btns stick conc-btns">
            <button type="button" class="btn ghost" data-go="found">Voltar</button>
            <button type="button" class="btn lime" data-conc-done>${left ? `Continuar · falta${left > 1 ? 'm' : ''} ${left}` : 'Continuar'}</button>
          </div>`;
      };

      /** Folha para escolher: qual lançamento do extrato é esta conta do plano. */
      const findFor = (key) => {
        const b = st.pbills.find((x) => x.key === key);
        if (!b) return;
        const list = IM.itemsFor(st.items, b);
        let picked = null;
        const rows = list
          .map(({ it, i }) => {
            const c = it.cat ? M.catById(S(), it.cat) : { emoji: '❔' };
            const tag = it.status === 'ignore' ? ' · ignorado: pagamento de fatura' : it.match && it.match.type === 'bill' && !it.decided ? ` · sugerido para “${esc(it.match.line.name)}”` : '';
            return `<li><button type="button" class="tx" data-pick="${i}"><span class="emo">${c.emoji}</span><span class="tx-txt"><b>${esc(it.desc)}</b><small>${U.dayLabel(it.date)}${tag}</small></span><span class="tx-amt${it.kind === 'receita' ? ' k-receita' : ''}">${money(it.amount)}</span></button></li>`;
          })
          .join('');
        openSheet(
          `${sheetHead(`Qual é “${esc(b.line.name)}”?`, `No plano: ${money(b.line.amount)} · ${billWhen(b)}. Escolha entre os lançamentos ${src()} que ainda não estão conciliados.`)}
          ${rows ? `<ul class="txs">${rows}</ul>` : `<p class="card-sub">Não há ${b.line.kind === 'receita' ? 'entradas' : b.line.kind === 'invest' ? 'aplicações' : 'gastos'} ${src()} sem par: todos já estão conciliados.</p>`}`,
          {
            cls: 'sheet-tall',
            label: 'Escolher o lançamento',
            onMount: (el, close) =>
              el.addEventListener('click', (e) => {
                const r = e.target.closest('[data-pick]');
                if (!r) return;
                picked = st.items[+r.dataset.pick];
                close();
              }),
            onClose: () => {
              if (!picked) return;
              IM.linkTo(st.items, picked, b);
              picked.decided = true;
              vibrate(8);
              draw(true);
            },
          }
        );
      };

      // item do plano já ligado a outro lançamento desta importação
      const takenBy = (b, it) => st.items.find((o) => o !== it && o.link && o.match && o.match.type === 'bill' && o.match.key === b.key);
      /** Itens do plano ainda sem par que podem ser este lançamento (o atual dele também entra). */
      const freeBills = (it) => (it.refund ? [] : IM.billsFor(S(), it).filter((b) => !takenBy(b, it)));

      /** Folha: qual item do plano é este lançamento. onPick recebe o item escolhido (ou 'none', se none). */
      const pickBill = (it, onPick, { none = true } = {}) => {
        const list = freeBills(it);
        let picked = null;
        const rows = list
          .map((b, k) => {
            const c = M.catById(S(), b.line.cat);
            const cur = it.link && it.match && it.match.type === 'bill' && it.match.key === b.key;
            return `<li><button type="button" class="tx${cur ? ' cur' : ''}" data-pickb="${k}"><span class="emo">${c.emoji}</span><span class="tx-txt"><b>${esc(b.line.name)}</b><small>${billWhen(b, U.mkOf(it.date))} · ${billState(b)}</small></span><span class="tx-amt">${cur ? IC.check : ''}${money(b.line.amount)}</span></button></li>`;
          })
          .join('');
        const noneRow = none ? '<li><button type="button" class="tx" data-pickb="none"><span class="emo">➖</span><span class="tx-txt"><b>Nenhum</b><small>Entra separado, como um lançamento comum</small></span></button></li>' : '';
        openSheet(
          `${sheetHead('Qual item do plano é este?', `${esc(it.desc)} · ${money(it.amount)} · ${U.dayLabel(it.date).toLowerCase()}`)}
          ${list.length ? '<p class="help">Só os itens do plano que ainda não estão conciliados com outro lançamento.</p>' : '<p class="card-sub">Os itens do plano deste mês já estão conciliados com outros lançamentos.</p>'}
          ${rows || noneRow ? `<ul class="txs">${rows}${noneRow}</ul>` : ''}`,
          {
            cls: 'sheet-tall',
            label: 'Escolher o item do plano',
            onMount: (el, close) =>
              el.addEventListener('click', (e) => {
                const r = e.target.closest('[data-pickb]');
                if (!r) return;
                picked = r.dataset.pickb === 'none' ? 'none' : list[+r.dataset.pickb];
                close();
              }),
            onClose: () => {
              if (picked) onPick(picked);
            },
          }
        );
      };

      /** Na conciliação: escolher outro item do plano para um lançamento (ou nenhum). */
      const otherFor = (i) => {
        const it = st.items[i];
        pickBill(it, (picked) => {
          if (picked === 'none') IM.setLink(it, false);
          else IM.linkTo(st.items, it, picked);
          it.decided = true;
          vibrate(8);
          draw(true);
        });
      };

      /** Na pergunta: “é este item do plano”. Liga o lançamento mostrado; se havia outros iguais, a pergunta segue com eles. */
      const linkQuestion = (b) => {
        const group = st.questions[st.qi];
        const it = group[0];
        IM.linkTo(st.items, it, b);
        it.decided = true;
        if (it.key && st.learnOn) st.learned.set(`${it.kind}:${it.key}`, b.line.cat);
        toast(`🔗 Conciliado com “${esc(b.line.name)}”, do plano.`);
        if (group.length > 1) {
          st.questions[st.qi] = group.slice(1);
          st.q = '';
          st.more = false;
          vibrate(8);
          draw();
        } else next();
      };
      // respondeu a pergunta de outro jeito (categoria, não lançar, pular): o que estava ligado ao plano se solta
      const freeGroup = (group) => {
        for (const it of group)
          if (it.link) {
            IM.setLink(it, false);
            it.decided = true;
          }
      };

      const guessHTML = () => {
        const n = st.questions.filter((g) => g[0].guess).length;
        if (!n) return '';
        return `<button type="button" class="imp-drop slim" data-guess><span class="imp-ic">✨</span><span><b>${n === 1 ? 'Aceitar meu palpite' : `Aceitar meus ${n} palpites`}</b><small>Escolho a categoria mais provável ${n === 1 ? 'de 1 dúvida' : `de ${n} dúvidas`} (pelo seu histórico e pelo nome da loja); você confere na revisão</small></span></button>`;
      };

      const checkHTML = () => {
        const chk = st.parsed && st.parsed.check;
        if (!chk || !chk.total || st.type !== 'cartao') return '';
        const read = U.sum(
          st.items.filter((i) => !(i.status === 'ignore' && i.reason === 'Pagamento da fatura')),
          (i) => (i.dir === 'out' ? i.amount : -i.amount)
        );
        const diff = read - chk.total;
        if (Math.abs(diff) <= 1) return `<p class="ok-line">${IC.check} Conferido: a soma bate com o ${esc(chk.label.toLowerCase())} (${money(chk.total)}).</p>`;
        if (/print/.test(st.source))
          return `<div class="warn-box"><span class="flag-ic crit">!</span><div>A soma dos prints (${money(read)}) não bate com o total da fatura (${money(chk.total)}): ${diff < 0 ? `faltam ${money(-diff)}. Se algum lançamento ficou fora dos prints, tire print do resto e leia todos juntos.` : `sobram ${money(diff)}. Confira se algum valor foi lido errado.`}</div></div>`;
        return `<div class="warn-box"><span class="flag-ic crit">!</span><div>A soma lida (${money(read)}) é diferente do ${esc(chk.label.toLowerCase())} (${money(chk.total)}): ${money(Math.abs(diff))} ${diff < 0 ? 'a menos' : 'a mais'}. Confira os lançamentos antes de lançar.</div></div>`;
      };

      /** Na pergunta: os itens do plano (ainda sem par) mais parecidos com o lançamento, para conciliar ali mesmo. */
      const planAskHTML = (it) => {
        const list = freeBills(it);
        st.qplan = list;
        if (!list.length) return '';
        const near = list.filter((b) => Math.abs(it.amount - b.line.amount) <= Math.max(100, it.amount * 0.4)).slice(0, 2);
        const opts = near
          .map((b) => {
            const c = M.catById(S(), b.line.cat);
            const cur = it.link && it.match && it.match.type === 'bill' && it.match.key === b.key;
            return `<button type="button" class="q-opt q-bill${cur ? ' guess' : ''}" data-qbill="${list.indexOf(b)}"><span class="emo">${c.emoji}</span><span>${esc(b.line.name)}<small>${money(b.line.amount)} · ${billWhen(b, U.mkOf(it.date))} · ${billState(b)}</small></span></button>`;
          })
          .join('');
        return `<div class="q-plan"><p class="q-plan-h">🔗 É de um item do plano?</p>${opts}<button type="button" class="link small" data-qplan>${near.length ? 'Outro item do plano' : 'Escolher o item do plano'}</button></div>`;
      };

      const askHTML = () => {
        const group = st.questions[st.qi];
        const it = group[0];
        const total = U.sum(group, (i) => i.amount);
        const sugg = IM.suggestionsFor(S(), it.kind, [...(it.ranked || []), ...(it.kind === 'despesa' && /\b(pix|ted|doc|transf)/.test(it.nd) ? ['outros'] : [])]);
        const title = it.kind === 'receita' ? 'Que dinheiro é esse?' : it.refund ? 'Estorno ou crédito: de qual categoria?' : it.kind === 'invest' ? 'Para onde foi?' : 'Em que categoria entra?';
        const skip = it.kind === 'receita' ? 'Não é receita (transferência minha)' : 'Não lançar (transferência minha)';
        return `<header class="sheet-head"><div><p class="eyebrow">Pergunta ${st.qi + 1} de ${st.questions.length}</p><h2>${title}</h2></div><button class="icon-btn" data-sheet-close aria-label="Fechar">${IC.close}</button></header>
          <div class="steps">${st.questions.map((_, i) => `<i class="${i <= st.qi ? 'on' : ''}"></i>`).slice(0, 24).join('')}</div>
          <div class="q-card">
            <p class="q-desc">${esc(it.desc)}</p>
            <p class="q-meta"><b class="${it.kind === 'receita' ? 'pos' : ''}">${it.kind === 'receita' || it.refund ? '+' : '−'}${money(it.amount)}</b> · ${U.dayLabel(it.date)}${group.length > 1 ? ` · e mais ${group.length - 1} igual${group.length > 2 ? 'is' : ''} (${m0(total)} no total)` : ''}${it.bankHint ? ` · no banco: ${esc(it.bankHint)}` : ''}</p>
          </div>
          ${planAskHTML(it)}
          <div class="q-opts">${sugg.map((c) => `<button type="button" class="q-opt${c.id === it.guess ? ' guess' : ''}" data-qcat="${c.id}"><span class="emo">${c.emoji}</span><span>${esc(c.name)}${c.id === it.guess ? '<small>palpite</small>' : ''}</span></button>`).join('')}</div>
          <div class="search"><input type="search" placeholder="Outra categoria: buscar ou criar…" data-qsearch value="${esc(st.q)}" aria-label="Buscar categoria"></div>
          <div class="cat-browser" data-qlist ${st.more || st.q ? '' : 'hidden'}>${catBrowserHTML(it.kind, st.q, 'data-qcat')}</div>
          ${st.more || st.q ? '' : '<button type="button" class="link" data-qmore>Ver todas as categorias</button>'}
          ${it.key ? `<label class="tog inline"><input type="checkbox" data-learn ${st.learnOn ? 'checked' : ''}><span>Lembrar para “${esc(it.key)}” nas próximas importações</span></label>` : ''}
          <div class="row-btns stick">
            ${st.qi > 0 ? '<button type="button" class="btn ghost" data-qback>Voltar</button>' : ''}
            <button type="button" class="btn ghost" data-qskip>${skip}</button>
            <button type="button" class="btn ghost" data-qlater>Pular</button>
          </div>`;
      };

      const rowHTML = (it, i, extra = '') => {
        const c = it.cat ? M.catById(S(), it.cat) : { emoji: '❔', name: 'Sem categoria' };
        const sign = it.kind === 'receita' || it.refund ? '+' : '−';
        return `<li><button type="button" class="tx" data-change="${i}">
          <span class="emo">${c.emoji}</span>
          <span class="tx-txt"><b>${esc(it.desc)}</b><small>${U.dayLabel(it.date)} · ${it.billName ? `🔗 ${esc(it.billName)}` : esc(c.name)}${it.refund ? ' · estorno' : ''}${it.parc ? ' · parcela' : ''}${it.how === 'palpite' ? ' · palpite' : it.how === 'banco' ? ' · categoria do banco' : ''}${extra}</small></span>
          <span class="tx-amt ${it.kind === 'receita' || it.refund ? 'k-receita' : ''}">${sign}${money(it.amount)}</span></button></li>`;
      };

      const reviewHTML = () => {
        const add = st.items.map((it, i) => ({ it, i })).filter(({ it }) => it.status === 'add');
        const ign = st.items.map((it, i) => ({ it, i })).filter(({ it }) => it.status === 'ignore');
        const dup = st.items.map((it, i) => ({ it, i })).filter(({ it }) => it.status === 'dup');
        const gastos = U.sum(add.filter(({ it }) => it.kind === 'despesa'), ({ it }) => (it.refund ? -it.amount : it.amount));
        const receitas = U.sum(add.filter(({ it }) => it.kind === 'receita'), ({ it }) => it.amount);
        const guardado = U.sum(add.filter(({ it }) => it.kind === 'invest'), ({ it }) => it.amount);
        const bills = add.filter(({ it }) => it.p);
        const showN = st.open.add ? add.length : Math.min(add.length, 8);
        const toggleRow = ({ it, i }) =>
          `<li class="imp-skip"><span class="tx-txt"><b>${esc(it.desc)}</b><small>${U.dayLabel(it.date)} · ${money(it.amount)} · ${esc(it.reason)}</small></span><button type="button" class="btn ghost small" data-include="${i}">Lançar</button></li>`;
        return `${sheetHead('Tudo pronto para lançar', `${st.parsed.bank ? st.parsed.bank + ' · ' : ''}${st.source} · ${TYPE_LABEL[st.type]}`)}
          <div class="totals imp-totals">
            <div><span>Gastos</span><b>${m0(gastos)}</b></div>
            <div><span>Receitas</span><b>${m0(receitas)}</b></div>
            ${guardado ? `<div><span>Guardado</span><b>${m0(guardado)}</b></div>` : ''}
            <div><span>Lançamentos</span><b>${add.length}</b></div>
          </div>
          ${bills.length ? `<p class="ok-line">${IC.check} ${U.plural(bills.length, 'conciliado', 'conciliados')} com o plano: ${esc(U.listPT(bills.map(({ it }) => it.billName)))}.</p>` : ''}
          ${hasConc() ? `<button type="button" class="link" data-go="conc">${bills.length ? 'Rever a conciliação' : 'Conciliar com o plano'}</button>` : ''}
          ${
            st.acertos && st.acertos.list.length
              ? `<label class="tog"><input type="checkbox" data-replace ${st.replace ? 'checked' : ''}><span>Trocar ${m0(st.acertos.total)} de acertos aproximados (de ${U.dayLabel(st.acertos.from).toLowerCase()} a ${U.dayLabel(st.acertos.to).toLowerCase()}) pelos valores reais</span></label>`
              : ''
          }
          <h3 class="group">Lançamentos<span>toque para mudar a categoria</span></h3>
          <ul class="txs">${add.slice(0, showN).map(({ it, i }) => rowHTML(it, i)).join('')}</ul>
          ${add.length > showN ? `<button type="button" class="link" data-open="add">Ver todos (${add.length})</button>` : ''}
          ${ign.length ? `<h3 class="group">Ignorados<span>${ign.length}</span></h3>${st.open.ign ? `<ul class="txs">${ign.map(toggleRow).join('')}</ul>` : `<button type="button" class="link" data-open="ign">Ver por quê</button>`}` : ''}
          ${dup.length ? `<h3 class="group">Já lançados antes<span>${dup.length}</span></h3>${st.open.dup ? `<ul class="txs">${dup.map(toggleRow).join('')}</ul>` : `<button type="button" class="link" data-open="dup">Ver quais</button>`}` : ''}
          <p class="help">Entradas e saídas vieram trocadas? <button type="button" class="link" data-flip>Inverter</button></p>
          <div class="row-btns stick"><button type="button" class="btn lime wide" data-commit ${add.length ? '' : 'disabled'}>Lançar ${U.plural(add.length, 'item', 'itens')} · +30 XP</button></div>`;
      };

      const draw = (keepScroll = false) => {
        const s0 = sheet();
        const y = s0 ? s0.scrollTop : 0;
        if (st.step === 'loading')
          box.innerHTML = `${sheetHead('Lendo…')}<div class="splash small"><span class="brand-mark big">f</span><p data-loading-msg>${esc(st.loadingMsg)}</p>${st.ctl ? '<button type="button" class="btn ghost" data-stop>Parar</button>' : ''}</div>`;
        else if (st.step === 'found') box.innerHTML = foundHTML();
        else if (st.step === 'ask') box.innerHTML = askHTML();
        else if (st.step === 'review') box.innerHTML = reviewHTML();
        else if (st.step === 'conc') box.innerHTML = concHTML();
        else box.innerHTML = sourceHTML();
        const s = sheet();
        if (s) s.scrollTop = keepScroll ? y : 0;
      };

      const answer = (cat) => {
        const group = st.questions[st.qi];
        freeGroup(group);
        for (const it of group) Object.assign(it, { cat, status: 'add', how: 'você' });
        const it = group[0];
        if (it.key && st.learnOn) st.learned.set(`${it.kind}:${it.key}`, cat);
        next();
      };
      const next = () => {
        st.q = '';
        st.more = false;
        vibrate(8);
        if (st.qi < st.questions.length - 1) st.qi++;
        else st.step = 'review';
        draw();
      };

      el.addEventListener('change', (e) => {
        if (e.target.matches('[data-file]') && e.target.files[0]) {
          const f = e.target.files[0];
          load(() => IM.readStatement(f));
        }
        if (e.target.matches('[data-print]') && e.target.files.length) {
          const files = [...e.target.files].slice(0, MAX_PRINTS);
          e.target.value = '';
          const ctl = new AbortController();
          st.ctl = ctl;
          const status = (m) => {
            st.loadingMsg = m;
            const p = $('[data-loading-msg]', box);
            if (p) p.textContent = m;
          };
          load(async () => {
            try {
              return await readPrints(files, { signal: ctl.signal, onStatus: status });
            } finally {
              st.ctl = null;
            }
          }, 'Preparando o leitor de prints…');
        }
        if (e.target.matches('[data-learn]')) st.learnOn = e.target.checked;
        if (e.target.matches('[data-replace]')) st.replace = e.target.checked;
      });
      el.addEventListener('input', (e) => {
        if (e.target.matches('[data-qsearch]')) {
          st.q = e.target.value;
          const list = $('[data-qlist]', box);
          list.hidden = false;
          list.innerHTML = catBrowserHTML(st.questions[st.qi][0].kind, st.q, 'data-qcat');
        }
      });
      el.addEventListener('click', async (e) => {
        const t = (sel) => e.target.closest(sel);
        if (t('[data-guess]')) {
          let n = 0;
          for (const g of st.questions) {
            const cat = g[0].guess;
            if (!cat) continue;
            for (const it of g) Object.assign(it, { cat, status: 'add', how: 'palpite' });
            n++;
          }
          st.guessed += n;
          regroup();
          vibrate(8);
          draw();
          return;
        }
        if (t('[data-print-info]')) {
          st.error = `Os prints são lidos no próprio celular, no app instalado: abra ${APP_URL} no Chrome e toque em ⋮ → Instalar app. Aqui no link do Claude a leitura não roda (e ler pelo Claude gastaria seus tokens). Para levar seus dados: Ajustes → Fazer backup aqui, e Restaurar backup lá.`;
          st.errorDetail = '';
          draw();
          return;
        }
        if (t('[data-stop]')) {
          if (st.ctl) st.ctl.abort();
          return;
        }
        if (t('[data-paste-open]')) {
          $('[data-paste]', box).hidden = false;
          t('[data-paste-open]').hidden = true;
          $('[data-paste-text]', box).focus();
          return;
        }
        if (t('[data-paste-go]')) {
          const text = $('[data-paste-text]', box).value;
          if (text.trim()) load(async () => ({ ...IM.parseText(text), source: 'texto colado' }));
          return;
        }
        const bk = t('[data-bank] [data-v]');
        if (bk) {
          st.bank = bk.dataset.v;
          draw();
          return;
        }
        const ty = t('[data-type] [data-v]');
        if (ty) {
          st.type = ty.dataset.v;
          rebuild();
          draw();
          return;
        }
        const lk = t('[data-link]');
        if (lk) {
          const i = +lk.dataset.link;
          const it = st.items[i];
          if (lk.dataset.on === '1') IM.linkOnly(st.items, it);
          else IM.setLink(it, false);
          it.decided = true;
          if (st.nudge === i) st.nudge = null;
          vibrate(8);
          draw(true);
          return;
        }
        const ot = t('[data-other]');
        if (ot) return otherFor(+ot.dataset.other);
        const fd = t('[data-find]');
        if (fd) return findFor(fd.dataset.find);
        if (t('[data-conc-all]')) {
          st.concAll = true;
          draw(true);
          return;
        }
        if (t('[data-conc-done]')) {
          const left = undecided();
          if (left.length) {
            // falta responder: leva até o primeiro que está em dúvida
            st.nudge = st.items.indexOf(left[0]);
            draw(true);
            const card = $(`[data-cc="${st.nudge}"]`, box);
            if (card) card.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
            toast(left.length === 1 ? 'Falta responder este: é o mesmo ou não?' : `Faltam ${left.length}: é o mesmo ou não?`);
            return;
          }
          return afterConc();
        }
        const go = t('[data-go]');
        if (go) {
          st.step = go.dataset.go;
          draw();
          return;
        }
        const qb = t('[data-qbill]');
        if (qb) return linkQuestion(st.qplan[+qb.dataset.qbill]);
        if (t('[data-qplan]')) return pickBill(st.questions[st.qi][0], linkQuestion, { none: false });
        const qc = t('[data-qcat]');
        if (qc) return answer(qc.dataset.qcat);
        if (st.step === 'ask') {
          const nc = createFromSearch(e, st.questions[st.qi][0].kind);
          if (nc) {
            const c = await nc;
            if (c) answer(c.id);
            return;
          }
        }
        if (t('[data-qmore]')) {
          st.more = true;
          draw();
          return;
        }
        if (t('[data-qskip]')) {
          const group = st.questions[st.qi];
          freeGroup(group);
          for (const it of group) Object.assign(it, { status: 'ignore', reason: 'Você escolheu não lançar' });
          if (group[0].key && st.learnOn) st.learned.set(`${group[0].kind}:${group[0].key}`, '__ignore');
          return next();
        }
        if (t('[data-qlater]')) {
          freeGroup(st.questions[st.qi]);
          for (const it of st.questions[st.qi]) Object.assign(it, { cat: FALLBACK[it.kind], status: 'add', how: 'pulado' });
          return next();
        }
        if (t('[data-qback]')) {
          st.qi = Math.max(0, st.qi - 1);
          st.q = '';
          draw();
          return;
        }
        const op = t('[data-open]');
        if (op) {
          st.open[op.dataset.open] = true;
          draw();
          return;
        }
        if (t('[data-flip]')) {
          st.flip = !st.flip;
          rebuild();
          st.step = st.questions.length || hasConc() ? 'found' : 'review';
          draw();
          return;
        }
        const ch = t('[data-change]');
        if (ch) {
          const it = st.items[+ch.dataset.change];
          const cat = await pickCategory(it.kind, { title: 'Mudar categoria', sub: it.desc });
          if (cat) {
            Object.assign(it, { cat, how: 'você' });
            if (it.key) st.learned.set(`${it.kind}:${it.key}`, cat);
            draw();
          }
          return;
        }
        const inc = t('[data-include]');
        if (inc) {
          const it = st.items[+inc.dataset.include];
          if (it.link) {
            IM.setLink(it, false);
            it.decided = true;
          }
          let cat = it.cat;
          if (!cat) cat = await pickCategory(it.kind, { title: 'Categoria', sub: it.desc });
          if (cat) {
            Object.assign(it, { cat, status: 'add', how: 'você' });
            draw();
          }
          return;
        }
        if (t('[data-commit]')) {
          const learn = [...st.learned].map(([key, cat]) => ({ key, cat }));
          const res = A.commitImport(st.items, { replaceAcertos: st.replace ? st.acertos : null, learn });
          close();
          ctx.render();
          A.notify(
            `Importado: <b>${U.plural(res.count, 'lançamento', 'lançamentos')}</b>${res.linked ? ` (${U.plural(res.linked, 'conciliado', 'conciliados')} com o plano)` : ''}${res.out ? ` · gastos ${m0(res.out)}` : ''}${res.inn ? ` · receitas ${m0(res.inn)}` : ''}.`,
            res.events,
            res.count
              ? {
                  label: 'Desfazer',
                  fn: () => {
                    A.undoImport(res);
                    ctx.render();
                    toast('Importação desfeita.');
                  },
                }
              : null,
            10000
          );
        }
      });
      draw();
    },
  });
}
