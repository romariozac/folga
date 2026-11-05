// Tela de importação: escolher arquivo/colar → resumo → perguntas (só as dúvidas) → revisão → lançar.
import { ctx } from './ctx.js';
import * as U from './util.js';
import * as M from './model.js';
import * as A from './actions.js';
import * as IM from './importer.js';
import { readPrints } from './ocr.js';
import { IC, $, openSheet, sheetHead, vibrate } from './ui.js';
import { catBrowserHTML, pickCategory } from './catui.js';

const S = () => ctx.S;
const { esc, money } = U;
const m0 = (v) => money(v, { cents: false });
const FALLBACK = { despesa: 'outros', receita: 'outras_rec', invest: 'investir' };
const TYPE_LABEL = { conta: 'extrato da conta', cartao: 'fatura do cartão' };

const MAX_PRINTS = 12;

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
        st.guessed = 0;
        const groups = new Map();
        for (const it of st.items) {
          if (it.status !== 'ask') continue;
          const k = it.key ? `${it.kind}:${it.key}` : `#${it.fp}`;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push(it);
        }
        st.questions = [...groups.values()];
        st.qi = 0;
        st.acertos = IM.acertosInRange(S(), st.items);
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
        <label class="imp-drop"><input type="file" accept="image/*" multiple data-print hidden>
          <span class="imp-ic">📸</span><span><b>Ler prints da fatura ou do extrato</b><small>Até ${MAX_PRINTS} imagens. A leitura é feita no seu celular, sem usar o Claude</small></span></label>
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
          <div class="row-btns stick">${
            st.questions.length
              ? `<button type="button" class="btn lime wide" data-go="ask">Responder ${U.plural(st.questions.length, 'pergunta', 'perguntas')}</button>`
              : `<button type="button" class="btn primary wide" data-go="review">Revisar e lançar</button>`
          }</div>`;
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
          <div class="q-opts">${sugg.map((c) => `<button type="button" class="q-opt${c.id === it.guess ? ' guess' : ''}" data-qcat="${c.id}"><span class="emo">${c.emoji}</span><span>${esc(c.name)}${c.id === it.guess ? '<small>palpite</small>' : ''}</span></button>`).join('')}</div>
          <div class="search"><input type="search" placeholder="Outra categoria: buscar…" data-qsearch value="${esc(st.q)}" aria-label="Buscar categoria"></div>
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
          <span class="tx-txt"><b>${esc(it.desc)}</b><small>${U.dayLabel(it.date)} · ${esc(c.name)}${it.billName ? ` · conta “${esc(it.billName)}”` : ''}${it.refund ? ' · estorno' : ''}${it.parc ? ' · parcela' : ''}${it.how === 'palpite' ? ' · palpite' : it.how === 'banco' ? ' · categoria do banco' : ''}${extra}</small></span>
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
          ${bills.length ? `<p class="ok-line">${IC.check} ${U.plural(bills.length, 'conta do plano encontrada', 'contas do plano encontradas')} e marcada${bills.length > 1 ? 's' : ''} como paga${bills.length > 1 ? 's' : ''}: ${esc(U.listPT(bills.map(({ it }) => it.billName)))}.</p>` : ''}
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

      const draw = () => {
        if (st.step === 'loading')
          box.innerHTML = `${sheetHead('Lendo…')}<div class="splash small"><span class="brand-mark big">f</span><p data-loading-msg>${esc(st.loadingMsg)}</p>${st.ctl ? '<button type="button" class="btn ghost" data-stop>Parar</button>' : ''}</div>`;
        else if (st.step === 'found') box.innerHTML = foundHTML();
        else if (st.step === 'ask') box.innerHTML = askHTML();
        else if (st.step === 'review') box.innerHTML = reviewHTML();
        else box.innerHTML = sourceHTML();
        const s = sheet();
        if (s) s.scrollTop = 0;
      };

      const answer = (cat) => {
        const group = st.questions[st.qi];
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
        const go = t('[data-go]');
        if (go) {
          st.step = go.dataset.go;
          draw();
          return;
        }
        const qc = t('[data-qcat]');
        if (qc) return answer(qc.dataset.qcat);
        if (t('[data-qmore]')) {
          st.more = true;
          draw();
          return;
        }
        if (t('[data-qskip]')) {
          const group = st.questions[st.qi];
          for (const it of group) Object.assign(it, { status: 'ignore', reason: 'Você escolheu não lançar' });
          if (group[0].key && st.learnOn) st.learned.set(`${group[0].kind}:${group[0].key}`, '__ignore');
          return next();
        }
        if (t('[data-qlater]')) {
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
          st.step = st.questions.length ? 'found' : 'review';
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
          A.notify(`Importado: <b>${U.plural(res.count, 'lançamento', 'lançamentos')}</b>${res.out ? ` · gastos ${m0(res.out)}` : ''}${res.inn ? ` · receitas ${m0(res.inn)}` : ''}.`, res.events);
        }
      });
      draw();
    },
  });
}
