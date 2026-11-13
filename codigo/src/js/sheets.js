// Fluxos em folhas: lançamento rápido, edição, contas, acerto, check-in, plano, reserva, ajustes, assistente.
import { ctx, today, curMk } from './ctx.js';
import * as U from './util.js';
import * as M from './model.js';
import * as G from './game.js';
import * as A from './actions.js';
import { store } from './store.js';
import { IC, $, $$, openSheet, closeSheet, sheetHead, confirmDialog, toast, vibrate } from './ui.js';
import { legendHTML, mountChart, billsByFlowHTML, carryNote } from './views.js';
import { catBrowserHTML, catPickerHTML, catPickerClick, createFromSearch, openCategories } from './catui.js';
import { openImport } from './importui.js';

const AUTO_LABEL = {
  despesa: 'Débito automático: marcar como pago sozinho no dia',
  receita: 'Cai sozinho na conta: marcar como recebido no dia',
  invest: 'Aplicação automática: marcar como guardado no dia',
};

const S = () => ctx.S;
const { esc, money } = U;
const m0 = (v) => money(v, { cents: false });
const rerender = () => ctx.render();

export function monthPicker(name, value, { from = -1, to = 3 } = {}) {
  const [vy, vm] = (value || curMk()).split('-').map(Number);
  const y0 = new Date().getFullYear();
  const years = [];
  for (let y = y0 + from; y <= y0 + to; y++) years.push(y);
  if (!years.includes(vy)) years.unshift(vy);
  return `<span class="mpick"><select name="${name}_m" aria-label="Mês">${U.MESES.map((m, i) => `<option value="${i + 1}" ${i + 1 === vm ? 'selected' : ''}>${U.cap(m)}</option>`).join('')}</select><select name="${name}_y" aria-label="Ano">${years.map((y) => `<option ${y === vy ? 'selected' : ''}>${y}</option>`).join('')}</select></span>`;
}
export const readMonth = (form, name) => `${form.elements[name + '_y'].value}-${U.pad(form.elements[name + '_m'].value)}`;


// =============== LANÇAMENTO RÁPIDO ===============
export function openQuickAdd(kind = 'despesa') {
  const q = { kind, cents: 0, cat: null, date: today(), note: '' };
  const maxCents = 9999999999;

  const dateOptions = () => {
    let o = '';
    for (let i = 0; i < 7; i++) {
      const d = U.addDays(today(), -i);
      o += `<option value="${d}" ${d === q.date ? 'selected' : ''}>${i === 0 ? 'Hoje' : i === 1 ? 'Ontem' : U.dayLabel(d)}</option>`;
    }
    if (U.daysBetween(q.date, today()) > 6 || q.date > today()) o += `<option value="${q.date}" selected>${U.dayLabel(q.date)}</option>`;
    return o + '<option value="outra">Outra data…</option>';
  };
  const hint = () =>
    q.kind === 'invest'
      ? 'Guardou dinheiro? Lance aqui: pague-se primeiro vale +50 XP no mês.'
      : 'Digite o valor e toque na categoria. Salva na hora.';

  const html = `<div class="qa">
    <header class="qa-head">
      <div class="seg" role="tablist" aria-label="Tipo">
        <button type="button" data-k="despesa">Gasto</button><button type="button" data-k="receita">Receita</button><button type="button" data-k="invest">Guardei</button>
      </div>
      <div class="qa-head-actions"><button type="button" class="icon-btn" data-qa-import aria-label="Importar extrato ou fatura" title="Importar extrato">${IC.download}</button><button class="icon-btn" data-sheet-close aria-label="Fechar">${IC.close}</button></div>
    </header>
    <div class="qa-amount zero" aria-live="polite"><span class="cur">R$</span><span class="val">0,00</span></div>
    <div class="qa-meta">
      <label class="date-chip">${IC.month}<select data-f="date" aria-label="Data"></select><input type="date" data-f="date2" hidden></label>
      <input class="qa-note" data-f="note" placeholder="Descrição (opcional)" maxlength="80" aria-label="Descrição">
    </div>
    <p class="qa-hint"></p>
    <div class="qa-pick" hidden></div>
    <div class="qa-cats" role="group" aria-label="Categoria"></div>
    <div class="qa-more" hidden><div class="search"><input type="search" placeholder="Buscar ou criar: pilates, farmácia, uber…" data-more-q aria-label="Buscar categoria"></div><div class="cat-browser" data-more-list></div><button type="button" class="link center" data-more-close>Voltar ao teclado</button></div>
    <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'].map((k) => `<button type="button" data-key="${k}" aria-label="${k === 'del' ? 'Apagar' : k}">${k === 'del' ? IC.backspace : k}</button>`).join('')}</div>
    <button type="button" class="btn primary wide qa-save" disabled>Salvar</button>
  </div>`;

  openSheet(html, {
    cls: 'sheet-tall',
    label: 'Novo lançamento',
    onMount: (el, close) => {
      const amountEl = $('.qa-amount', el);
      const valEl = $('.val', el);
      const saveBtn = $('.qa-save', el);
      const dateSel = $('[data-f="date"]', el);
      const date2 = $('[data-f="date2"]', el);
      const noteEl = $('[data-f="note"]', el);

      const matcher = M.buildMatcher(S());
      const drawPick = () => {
        const pick = $('.qa-pick', el);
        const visible = !!(q.cat && $(`.qa-cats [data-cat="${q.cat}"]`, el));
        let html = '';
        if (q.cat && !visible) {
          const c = M.catById(S(), q.cat);
          html = `<span class="pill-sel">${c.emoji} ${esc(M.catPath(S(), q.cat))}</span>`;
        } else if (q.sug && q.sug !== q.cat) {
          const c = M.catById(S(), q.sug);
          html = `<button type="button" class="pill-sug" data-cat="${c.id}">Sugestão: ${c.emoji} ${esc(c.name)}</button>`;
        }
        pick.innerHTML = html;
        pick.hidden = !html;
      };
      const closeMore = () => {
        $('.qa-more', el).hidden = true;
        $('.qa-cats', el).hidden = false;
        $('.keypad', el).hidden = false;
      };
      const drawKind = () => {
        $$('.seg [data-k]', el).forEach((b) => b.classList.toggle('on', b.dataset.k === q.kind));
        const { list, more } = M.quickCats(S(), q.kind);
        $('.qa-cats', el).innerHTML =
          list.map((c) => `<button type="button" class="cat ${c.id === q.cat ? 'on' : ''}" data-cat="${c.id}"><span class="emo">${c.emoji}</span><span class="cat-name">${esc(c.name)}</span></button>`).join('') +
          (more ? `<button type="button" class="cat" data-more-open><span class="emo more-emo">${IC.dots}</span><span class="cat-name">Mais</span></button>` : '');
        $('.qa-hint', el).textContent = hint();
        el.querySelector('.qa').dataset.kind = q.kind;
        drawPick();
      };
      const drawAmount = () => {
        valEl.textContent = U.money(q.cents).replace(/^R\$\s/, '');
        amountEl.classList.toggle('zero', !q.cents);
        saveBtn.disabled = !(q.cents && q.cat);
      };
      const drawDate = () => (dateSel.innerHTML = dateOptions());

      const save = () => {
        if (!q.cents || !q.cat) return;
        const res = A.addTx({ v: q.cents, k: q.kind, c: q.cat, d: q.date, n: q.note });
        const cat = M.catById(S(), q.cat);
        close();
        vibrate(14);
        rerender();
        A.notify(`${cat.emoji} ${esc(q.note || cat.name)} · <b>${money(q.cents)}</b>`, res.events, {
          label: 'Desfazer',
          fn: () => {
            A.undoAdd(res);
            rerender();
            toast('Lançamento desfeito.');
          },
        });
      };

      const choose = (id) => {
        q.cat = id;
        $$('.qa-cats [data-cat]', el).forEach((b) => b.classList.toggle('on', b.dataset.cat === q.cat));
        if (q.cents) return save();
        closeMore();
        drawPick();
        amountEl.classList.remove('shake');
        void amountEl.offsetWidth;
        amountEl.classList.add('shake');
        $('.qa-hint', el).textContent = 'Agora digite o valor.';
        drawAmount();
      };

      el.addEventListener('input', (e) => {
        if (e.target.matches('[data-more-q]')) $('[data-more-list]', el).innerHTML = catBrowserHTML(q.kind, e.target.value, 'data-cat');
      });
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-qa-import]')) {
          close();
          setTimeout(() => openImport(), 150);
          return;
        }
        if (e.target.closest('[data-more-open]')) {
          $('.qa-more', el).hidden = false;
          $('.qa-cats', el).hidden = true;
          $('.keypad', el).hidden = true;
          $('[data-more-q]', el).value = '';
          $('[data-more-list]', el).innerHTML = catBrowserHTML(q.kind, '', 'data-cat');
          return;
        }
        if (e.target.closest('[data-more-close]')) return closeMore();
        const k = e.target.closest('[data-k]');
        if (k) {
          q.kind = k.dataset.k;
          q.cat = null;
          q.sug = null;
          closeMore();
          drawKind();
          drawAmount();
          return;
        }
        const key = e.target.closest('[data-key]');
        if (key) {
          const v = key.dataset.key;
          if (v === 'del') q.cents = Math.floor(q.cents / 10);
          else if (v === '00') q.cents = Math.min(maxCents, q.cents * 100);
          else q.cents = Math.min(maxCents, q.cents * 10 + +v);
          vibrate(6);
          drawAmount();
          return;
        }
        const nc = createFromSearch(e, q.kind);
        if (nc) {
          nc.then((c) => c && choose(c.id));
          return;
        }
        const c = e.target.closest('[data-cat]');
        if (c) return choose(c.dataset.cat);
        if (e.target.closest('.qa-save')) save();
      });
      dateSel.addEventListener('change', () => {
        if (dateSel.value === 'outra') {
          dateSel.hidden = true;
          date2.hidden = false;
          date2.value = q.date;
          date2.max = today();
          try {
            date2.showPicker ? date2.showPicker() : date2.focus();
          } catch {
            date2.focus();
          }
        } else q.date = dateSel.value;
      });
      const endDate2 = () => {
        if (date2.hidden) return;
        if (date2.value) q.date = date2.value;
        date2.hidden = true;
        dateSel.hidden = false;
        drawDate();
      };
      date2.addEventListener('change', endDate2);
      date2.addEventListener('blur', endDate2);
      noteEl.addEventListener('input', () => {
        q.note = noteEl.value;
        q.sug = M.suggestCat(S(), q.kind, q.note, matcher);
        drawPick();
      });
      noteEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          noteEl.blur();
        }
      });
      el.addEventListener('keydown', (e) => {
        if (e.target === noteEl || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
        if (/^\d$/.test(e.key)) q.cents = Math.min(maxCents, q.cents * 10 + +e.key);
        else if (e.key === 'Backspace') q.cents = Math.floor(q.cents / 10);
        else if (e.key === 'Enter') return save();
        else return;
        e.preventDefault();
        drawAmount();
      });
      drawKind();
      drawAmount();
      drawDate();
      setTimeout(() => saveBtn.closest('.sheet').focus?.(), 50);
    },
  });
}

// =============== EDITAR LANÇAMENTO ===============
export function openTxEdit(mk, id) {
  const t = A.findTx(mk, id);
  if (!t) return;
  let cat = t.c;
  const line = t.p ? A.lineById(t.p) : null;
  openSheet(
    `${sheetHead('Editar lançamento', M.KIND_LABEL[t.k])}
    <form class="form">
      <label class="field"><span>Valor</span><div class="money-in"><span>R$</span><input name="v" inputmode="decimal" value="${U.moneyInput(t.v)}" required></div></label>
      <label class="field"><span>Descrição</span><input name="n" value="${esc(t.n || '')}" maxlength="80" placeholder="Opcional"></label>
      <label class="field"><span>Data</span><input type="date" name="d" value="${t.d}" required></label>
      <div class="field"><span>Categoria</span><div class="cat-picker">${catPickerHTML(t.k, t.c)}</div></div>
      ${t.ap ? '<p class="card-sub">Lançamento aproximado, feito num acerto.</p>' : ''}
      ${line ? `<p class="card-sub">Ligado ao item do plano “${esc(line.name)}”.</p>` : ''}
      <div class="row-btns"><button type="button" class="btn ghost danger-text" data-del>Excluir</button><button class="btn primary" type="submit">Salvar</button></div>
    </form>`,
    {
      onMount: (el, close) => {
        const form = $('form', el);
        el.addEventListener('click', async (e) => {
          if (
            catPickerClick(e, (id) => {
              cat = id;
              $('.cat-picker', el).innerHTML = catPickerHTML(t.k, cat);
            })
          )
            return;
          if (e.target.closest('[data-del]')) {
            const ok = await confirmDialog({ title: 'Excluir lançamento?', text: `${esc(t.n || M.catById(S(), t.c).name)} · ${money(t.v)}`, ok: 'Excluir', danger: true });
            if (!ok) return;
            const removed = A.removeTx(mk, id);
            const rest = A.dropRest(removed);
            close();
            rerender();
            toast(`Lançamento excluído.${rest ? ` O resto que tinha ido para ${U.monthName(rest.start)} saiu também.` : ''}`, {
              action: {
                label: 'Desfazer',
                fn: () => {
                  A.restoreRest(rest);
                  (S().months[mk] ||= { updatedAt: 0, tx: [] }).tx.push(removed);
                  store.save(['m-' + mk]);
                  rerender();
                },
              },
            });
          }
        });
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const v = U.parseMoney(form.elements.v.value);
          if (v <= 0) return form.elements.v.focus();
          A.updateTx(mk, id, { v, n: form.elements.n.value.trim(), d: form.elements.d.value || t.d, c: cat });
          // pagamento com resto no mês seguinte: o resto acompanha o valor novo (some se pagou tudo)
          const nt = A.findTx(mk, id);
          if (nt && nt.carry && line) A.setRest(line, mk, nt, true);
          close();
          rerender();
          toast('Lançamento atualizado.');
        });
      },
    }
  );
}

// =============== CONTA DO PLANO ===============
export function payBillQuick(lineId, mk) {
  const line = A.lineById(lineId);
  if (!line) return;
  const res = A.payBill(line, mk);
  vibrate(14);
  rerender();
  const verb = line.kind === 'receita' ? 'recebido' : line.kind === 'invest' ? 'guardado' : 'pago';
  A.notify(`${esc(line.name)} ${verb} · <b>${m0(line.amount)}</b>`, res.events, {
    label: 'Desfazer',
    fn: () => {
      A.undoAdd(res);
      rerender();
    },
  });
}

export function unpayBill(lineId, mk) {
  const c = M.monthCalc(S(), mk);
  const b = c.bills.find((x) => x.line.id === lineId);
  if (!b || !b.tx) return;
  const removed = A.removeTx(mk, b.tx.id);
  const rest = A.dropRest(removed);
  if (b.line.auto) A.skipAuto(b.line.id, mk);
  rerender();
  toast(`${esc(b.line.name)} desmarcado.${rest ? ` O resto que tinha ido para ${U.monthName(rest.start)} saiu também.` : ''}`, {
    action: {
      label: 'Desfazer',
      fn: () => {
        A.restoreRest(rest);
        (S().months[mk] ||= { updatedAt: 0, tx: [] }).tx.push(removed);
        delete S().core.autoSkip[`${b.line.id}@${mk}`];
        store.save(['core', 'm-' + mk]);
        rerender();
      },
    },
  });
}

export function openBill(lineId, mk) {
  const line = A.lineById(lineId);
  if (!line) return;
  const c = M.monthCalc(S(), mk);
  const b = c.bills.find((x) => x.line.id === lineId);
  const tx = b && b.tx;
  const verb = line.kind === 'receita' ? 'Recebi' : line.kind === 'invest' ? 'Guardei' : 'Paguei';
  const q = line.kind === 'receita' ? 'Quanto entrou?' : line.kind === 'invest' ? 'Quanto guardou?' : 'Quanto pagou?';
  // pagou menos que o previsto: o resto pode ir para o mês seguinte (vira um item “só em” lá)
  const mes = U.monthName(U.addMonths(mk, 1));
  const restLabel = (v) => (line.kind === 'receita' ? `Receber o resto (${money(line.amount - v)}) em ${mes}` : `Passar o resto (${money(line.amount - v)}) para ${mes}`);
  const restHelp =
    line.kind === 'receita'
      ? 'Marque se o resto ainda vai entrar. Se veio menor mesmo, deixe desmarcado.'
      : `Marque se ficou faltando pagar (por exemplo, só parte da fatura). Se a conta veio menor, deixe desmarcado.${M.isCardBill(line) ? ' No banco, o que fica da fatura entra no rotativo, com juros: a próxima vem maior.' : ''}`;
  const v0 = tx ? tx.v : line.amount;
  openSheet(
    `${sheetHead(esc(line.name), `${M.recText(line)} · ${U.monthLabel(mk)}`)}
    <form class="form">
      <label class="field"><span>${q}</span><div class="money-in"><span>R$</span><input name="v" inputmode="decimal" value="${U.moneyInput(v0)}" required></div><small class="help">Previsto: ${money(line.amount)}</small></label>
      <label class="tog rest-tog" data-rest-wrap ${A.canRest(line, v0) ? '' : 'hidden'}><input type="checkbox" name="rest" ${tx && tx.carry ? 'checked' : ''}><span><span data-rest-txt>${restLabel(v0)}</span><small class="help">${restHelp}</small></span></label>
      <label class="field"><span>Quando</span><input type="date" name="d" value="${tx ? tx.d : mk === curMk() ? today() : `${mk}-${U.pad(Math.min(line.day || 1, U.daysInMonth(mk)))}`}"></label>
      <label class="tog"><input type="checkbox" data-auto ${line.auto ? 'checked' : ''}><span>${AUTO_LABEL[line.kind]}</span></label>
      <div class="row-btns">${tx ? '<button type="button" class="btn ghost" data-unpay>Desmarcar</button>' : ''}<button class="btn primary" type="submit">${tx ? 'Salvar' : verb}</button></div>
      <button type="button" class="link center" data-edit-line>Editar este item no plano</button>
    </form>`,
    {
      onMount: (el, close) => {
        const form = $('form', el);
        // a opção do resto aparece só quando o valor fica abaixo do previsto
        form.elements.v.addEventListener('input', () => {
          const v = U.parseMoney(form.elements.v.value);
          const wrap = $('[data-rest-wrap]', el);
          wrap.hidden = !A.canRest(line, v);
          if (!wrap.hidden) $('[data-rest-txt]', el).textContent = restLabel(v);
        });
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const v = U.parseMoney(form.elements.v.value);
          if (v <= 0) return form.elements.v.focus();
          const d = form.elements.d.value || today();
          const wantRest = form.elements.rest.checked && A.canRest(line, v);
          const restMsg = (l2) => (l2 ? `<br><small>O resto (${money(l2.amount)}) foi para ${mes}.</small>` : '');
          if (tx) {
            A.updateTx(mk, tx.id, { v, d });
            const t = A.findTx(mk, tx.id);
            const l2 = t && (wantRest || t.carry) ? A.setRest(line, mk, t, wantRest) : null;
            close();
            rerender();
            toast(`Atualizado.${restMsg(l2)}`);
          } else {
            const res = A.payBill(line, mk, v, d);
            const l2 = wantRest ? A.setRest(line, mk, res.t, true) : null;
            close();
            rerender();
            A.notify(`${esc(line.name)} · <b>${m0(v)}</b>${restMsg(l2)}`, res.events);
          }
        });
        el.addEventListener('change', (e) => {
          if (!e.target.matches('[data-auto]')) return;
          line.auto = e.target.checked;
          if (line.auto && !line.day) line.day = Math.min(new Date().getDate(), 28);
          store.save(['core']);
          const done = line.auto ? A.autoPayDue() : [];
          rerender();
          toast(line.auto ? (done.includes(line.name) ? `Automático ligado: “${esc(line.name)}” já foi marcado.` : `Automático ligado: “${esc(line.name)}” será marcado sozinho no dia ${line.day}.`) : 'Automático desligado.');
          if (done.includes(line.name)) close();
        });
        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-unpay]')) {
            close();
            unpayBill(lineId, mk);
          }
          if (e.target.closest('[data-edit-line]')) {
            close();
            setTimeout(() => openLineEditor(line), 120);
          }
        });
      },
    }
  );
}

// =============== ACERTO RÁPIDO ===============
function catchupRowsHTML(cats) {
  return cats
    .map((c) => `<label class="cu-row"><span class="emo">${c.emoji}</span><span class="cu-name">${esc(c.name)}</span><span class="money-in sm"><span>R$</span><input inputmode="decimal" data-cu="${c.id}" placeholder="0,00" aria-label="${esc(c.name)}"></span></label>`)
    .join('');
}
function collectCatchup(el) {
  const items = [];
  for (const inp of $$('[data-cu]', el)) {
    const v = U.parseMoney(inp.value);
    if (v > 0) items.push({ c: inp.dataset.cu, v });
  }
  return items;
}
function saveCatchup(items) {
  const events = [];
  let total = 0;
  for (const it of items) {
    const r = A.addTx({ v: it.v, k: 'despesa', c: it.c, d: today(), n: 'Acerto (aprox.)', ap: true });
    total += it.v;
    for (const e of r.events) {
      if (e.type === 'xp') {
        const x = events.find((y) => y.type === 'xp');
        if (x) x.amount += e.amount;
        else events.push({ ...e });
      } else events.push(e);
    }
  }
  return { events, total };
}

export function openCatchUp() {
  const st = S();
  const last = st.core.game.lastActive;
  // só as categorias principais: num acerto aproximado, subcategoria só encheria a lista
  const cats = M.groupsOf(st, 'despesa');
  const first = cats.filter((c) => ['mercado', 'comer', 'transporte', 'lazer', 'outros'].includes(c.id));
  const rest = cats.filter((c) => !first.includes(c));
  openSheet(
    `${sheetHead('Acerto rápido', last ? `Desde ${U.dayLabel(last).toLowerCase()}. Não precisa ser exato.` : 'Não precisa ser exato.')}
    <button type="button" class="imp-drop slim" data-cu-import><span class="imp-ic">📥</span><span><b>Tem o extrato? Importe</b><small>Valores exatos, sem digitar nada</small></span></button>
    <p class="card-sub">Ou dê uma olhada no app do banco ou do cartão e some por cima. Um valor aproximado vale muito mais do que nenhum.</p>
    <div class="catchup">${catchupRowsHTML(first)}</div>
    <div class="catchup more" hidden>${catchupRowsHTML(rest)}</div>
    <button type="button" class="link" data-more>+ outras categorias</button>
    <div class="row-btns stick"><button type="button" class="btn ghost" data-skip>Só seguir daqui</button><button type="button" class="btn primary" data-save>Lançar acerto</button></div>`,
    {
      cls: 'sheet-tall',
      onMount: (el, close) => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-cu-import]')) {
            close();
            setTimeout(() => openImport(), 150);
            return;
          }
          if (e.target.closest('[data-more]')) {
            $('.catchup.more', el).hidden = false;
            e.target.closest('[data-more]').remove();
          }
          if (e.target.closest('[data-skip]')) {
            const events = A.freshStart();
            close();
            rerender();
            A.notify('Recomeço feito. Daqui pra frente, no seu ritmo.', events);
          }
          if (e.target.closest('[data-save]')) {
            const items = collectCatchup(el);
            if (!items.length) {
              toast('Preencha pelo menos um valor, ou toque em “Só seguir daqui”.');
              return;
            }
            const { events, total } = saveCatchup(items);
            close();
            rerender();
            A.notify(`Acerto lançado: <b>${m0(total)}</b> em ${U.plural(items.length, 'categoria', 'categorias')}.`, events);
          }
        });
      },
    }
  );
}

// =============== CHECK-IN SEMANAL ===============
/** Check-in: o saldo previsto para o fim do mês, igual ao do Início (com o que sobrou ou faltou do mês anterior). */
function ckProjHTML(c, carry) {
  const end = carry + c.saldoExp;
  const note = carryNote(carry, c.saldoExp, c.mk);
  return `<div class="ck-proj"><span>Previsão de sobra no fim do mês${note ? `<small>${note.html}</small>` : ''}</span><b class="${end < 0 ? 'neg' : ''}">${money(end)}</b></div>`;
}

export function openCheckin() {
  let step = 0;
  const steps = ['Contas', 'O que faltou', 'O mês'];
  const tip = M.TIPS[Math.floor(Date.now() / (7 * 86400000)) % M.TIPS.length];

  openSheet('<div class="ck"></div>', {
    cls: 'sheet-tall',
    label: 'Check-in da semana',
    onMount: (el, close) => {
      const box = $('.ck', el);
      const draw = () => {
        const st = S();
        const mk = curMk();
        const c = M.monthCalc(st, mk);
        const head = `<header class="sheet-head"><div><p class="eyebrow">Check-in da semana · passo ${step + 1} de 3</p><h2>${steps[step]}</h2></div><button class="icon-btn" data-sheet-close aria-label="Fechar">${IC.close}</button></header>
          <div class="steps">${steps.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>`;
        let body = '';
        if (step === 0) {
          const dayNow = new Date().getDate();
          const pend = c.bills.filter((b) => !b.tx && (!b.line.day || b.line.day <= dayNow + 3));
          body = pend.length
            ? `<p class="card-sub">Contas do plano que já venceram ou vencem nos próximos dias. Um toque marca.</p>${billsByFlowHTML(pend, mk, 'data-ck')}`
            : `<div class="empty ok"><p>${IC.check} Nenhuma conta pendente até aqui.</p></div>`;
          body += `<div class="row-btns stick"><button type="button" class="btn primary wide" data-next>Próximo</button></div>`;
        } else if (step === 1) {
          const wk = U.weekKey(today());
          const weekTx = c.txs.filter((t) => t.d >= wk && t.k === 'despesa');
          const prevMonthTx = mk !== U.mkOf(wk) ? M.txOf(st, U.mkOf(wk)).filter((t) => t.d >= wk && t.k === 'despesa') : [];
          const all = weekTx.concat(prevMonthTx);
          const cats = st.core.cats.filter((x) => ['mercado', 'comer', 'transporte', 'lazer', 'outros'].includes(x.id));
          body = `<p class="week-sum">Nesta semana: <b>${m0(U.sum(all, (t) => t.v))}</b> em ${U.plural(all.length, 'gasto lançado', 'gastos lançados')}.</p>
            <button type="button" class="imp-drop" data-ck-import><span class="imp-ic">📥</span><span><b>Importe o extrato ou a fatura</b><small>O jeito mais fácil: o app lança tudo e só pergunta as dúvidas</small></span></button>
            <p class="card-sub">Sem o extrato agora? Lance um total aproximado por categoria. Nada de caçar centavo.</p>
            <div class="catchup">${catchupRowsHTML(cats)}</div>
            <div class="row-btns stick"><button type="button" class="btn ghost" data-next>Pular</button><button type="button" class="btn primary" data-save-next>Lançar e seguir</button></div>`;
        } else {
          const days = U.daysInMonth(mk);
          const pctMonth = Math.round((new Date().getDate() / days) * 100);
          const verbas = st.core.plan.filter((l) => l.kind === 'despesa' && l.type === 'verba' && M.occurs(l, mk));
          const vcats = [...new Set(verbas.map((l) => l.cat))];
          const rows = vcats
            .map((id) => {
              // ritmo da verba: só gastos avulsos (contas do plano ficam de fora)
              const prev = U.sum(verbas.filter((l) => l.cat === id), (l) => l.amount);
              const real = U.sum(c.txs.filter((t) => t.c === id && t.k === 'despesa' && !t.p), (t) => t.v);
              const cat = M.catById(st, id);
              const pct = prev ? Math.round((real / prev) * 100) : 0;
              const over = pct > pctMonth + 10;
              return `<li class="bl ${real > prev ? 'over' : ''}"><span class="emo">${cat.emoji}</span><div class="bl-main"><div class="bl-top"><b>${esc(cat.name)}</b><span><b>${pct}%</b> <small>da verba</small></span></div>
                <div class="bullet"><i style="width:${Math.min(100, pct)}%"></i><em style="left:${Math.min(100, pctMonth)}%"></em></div>${over ? `<p class="bl-flag"><span class="flag-ic crit">!</span>Acima do ritmo do mês</p>` : ''}</div></li>`;
            })
            .join('');
          body = `<p class="card-sub">O mês está <b>${pctMonth}%</b> concluído. Nas barras abaixo, o traço marca esse ritmo: barra antes do traço = tudo sob controle.</p>
            ${rows ? `<ul class="bullets">${rows}</ul>` : '<p class="card-sub">Defina verbas do dia a dia no plano para acompanhar o ritmo aqui.</p>'}
            ${st.core.plan.length ? ckProjHTML(c, M.carryIn(st, mk)) : ''}
            <blockquote class="quote">“${esc(tip.t)}”<cite>${esc(tip.s)}</cite></blockquote>
            <div class="row-btns stick"><button type="button" class="btn lime wide" data-finish>Concluir check-in · +50 XP</button></div>`;
        }
        box.innerHTML = head + body;
      };
      el.addEventListener('click', (e) => {
        const ck = e.target.closest('[data-ck]');
        if (ck) {
          const act = ck.dataset.ck;
          if (act === 'bill-pay') {
            const line = A.lineById(ck.dataset.line);
            const res = A.payBill(line, ck.dataset.mk);
            vibrate(12);
            A.celebrateEvents(res.events);
          } else if (act === 'bill-undo') unpayBill(ck.dataset.line, ck.dataset.mk);
          else if (act === 'bill-open') {
            openBill(ck.dataset.line, ck.dataset.mk);
            return;
          }
          rerender();
          draw();
          return;
        }
        if (e.target.closest('[data-ck-import]')) {
          openImport();
          return;
        }
        if (e.target.closest('[data-next]')) {
          step++;
          draw();
          box.closest('.sheet').scrollTop = 0;
        }
        if (e.target.closest('[data-save-next]')) {
          const items = collectCatchup(box);
          if (items.length) {
            const { events, total } = saveCatchup(items);
            A.celebrateEvents(events);
            toast(`Lançado: <b>${m0(total)}</b> aproximados.`);
            rerender();
          }
          step++;
          draw();
          box.closest('.sheet').scrollTop = 0;
        }
        if (e.target.closest('[data-finish]')) {
          const { events, already } = A.completeCheckin();
          close();
          rerender();
          A.notify(already ? 'Check-in atualizado.' : 'Check-in feito! Semana em dia. 🔥', events);
        }
      });
      draw();
    },
  });
}

// =============== EDITOR DE ITEM DO PLANO ===============
/** O item já acontecia antes deste mês (nos últimos 3 anos)? Então dá para mudar o valor só deste mês em diante. */
function occursBefore(l, mk) {
  const start = l.start || '2000-01';
  for (let m = U.addMonths(mk, -1), i = 0; i < 36 && m >= start; m = U.addMonths(m, -1), i++) if (M.occurs(l, m)) return true;
  return false;
}

/**
 * Editor de um item do plano. viewMk: o mês escolhido na aba Plano quando o item foi aberto pela lista daquele
 * mês. Aí, ao mudar o valor de um item de todo mês ou de meses do ano, a tela pergunta se o valor novo vale
 * daquele mês em diante (o item vira dois: o de antes termina no mês anterior) ou em todos os meses.
 */
export function openLineEditor(line = null, defaults = {}, { mk: viewMk = null } = {}) {
  const isNew = !line;
  const L = line
    ? { ...line, months: [...(line.months || [])] }
    : { id: U.uid(), name: '', kind: 'despesa', cat: 'moradia', amount: 0, type: 'conta', rec: 'mensal', start: curMk(), months: [], count: 2, day: null, ...defaults };
  if (!L.months.length) L.months = [+curMk().slice(5)];
  const defaultCat = { receita: 'salario', despesa: 'moradia', invest: 'reserva' };
  const mesAno = (mk) => `${U.monthName(mk)} de ${mk.slice(0, 4)}`;
  const canSplit = !isNew && !!viewMk && (line.rec === 'mensal' || line.rec === 'anual') && !line.goal && !line.rest && !line.cover && M.occurs(line, viewMk) && occursBefore(line, viewMk);
  let split = 'from';
  const sub = !isNew && viewMk ? `Você está vendo <b>${mesAno(viewMk)}</b>` : isNew && viewMk && viewMk !== curMk() ? `Começa em <b>${mesAno(viewMk)}</b>, o mês escolhido no gráfico. Dá para mudar em “A partir de”.` : 'Tudo que entra, sai ou é guardado, mês a mês.';

  openSheet(
    `${sheetHead(isNew ? 'Novo item do plano' : 'Editar item do plano', sub)}
    <form class="form line-form">
      <div class="seg full" data-seg="kind"><button type="button" data-v="receita">Receita</button><button type="button" data-v="despesa">Gasto</button><button type="button" data-v="invest">Guardar</button></div>
      <label class="field"><span>Nome</span><input name="name" value="${esc(L.name)}" placeholder="Ex.: Aluguel, IPVA, Salário" required maxlength="60"></label>
      <label class="field"><span data-amount-label>Valor</span><div class="money-in"><span>R$</span><input name="amount" inputmode="decimal" value="${U.moneyInput(L.amount)}" placeholder="0,00" required></div></label>
      ${
        canSplit
          ? `<div class="field" data-split hidden><span>O novo valor vale para quais meses?</span>
        <div class="seg full" data-seg="split"><button type="button" data-v="from" class="on">De ${U.monthName(viewMk)} em diante</button><button type="button" data-v="all">Todos os meses</button></div>
        <small class="help" data-split-help></small></div>`
          : ''
      }
      <details class="dream" data-only="invest"><summary>Calcular pelo seu sonho</summary>
        <div class="two"><label class="field"><span>Quanto custa o sonho?</span><div class="money-in sm"><span>R$</span><input name="dream" inputmode="decimal" placeholder="0,00"></div></label>
        <label class="field"><span>Em quantos meses?</span><input name="dreamMonths" type="number" min="1" max="600" inputmode="numeric" placeholder="24"></label></div>
        <p class="calc" data-dream-out>Preencha para ver quanto guardar por mês.</p>
      </details>
      <div class="field"><span>Categoria</span><div class="cat-chips" data-cats></div></div>
      <div class="field" data-only="despesa"><span>Como é esse gasto?</span>
        <div class="seg full" data-seg="type"><button type="button" data-v="conta">Conta (paga de uma vez)</button><button type="button" data-v="verba">Verba (aos poucos)</button></div>
        <small class="help">Conta aparece na lista “Contas do mês” para marcar como paga. Verba é um limite para gastos do dia a dia, como mercado.</small>
      </div>
      <div class="field"><span>Quando acontece?</span>
        <div class="seg full wrap" data-seg="rec"><button type="button" data-v="mensal">Todo mês</button><button type="button" data-v="anual">Meses do ano</button><button type="button" data-v="parcelas">Parcelado</button><button type="button" data-v="unico">Uma vez</button></div>
      </div>
      <div class="field" data-rec="anual"><span>Em quais meses? (repete todo ano)</span><div class="months-grid">${U.MES_CURTO.map((m, i) => `<button type="button" class="mtog ${L.months.includes(i + 1) ? 'on' : ''}" data-m="${i + 1}">${m}</button>`).join('')}</div></div>
      <div class="field" data-rec="parcelas"><span>Número de parcelas</span><input name="count" type="number" min="1" max="360" inputmode="numeric" value="${L.count || 2}"></div>
      <div class="field" data-rec-start><span data-start-label>A partir de</span>${monthPicker('start', L.start)}</div>
      <div class="field" data-rec="mensal" data-end-field><span>Termina em (opcional)</span><label class="tog inline"><input type="checkbox" name="hasEnd" ${L.end ? 'checked' : ''}><span>Tem data para acabar</span></label><div data-end ${L.end ? '' : 'hidden'}>${monthPicker('end', L.end || U.addMonths(curMk(), 11))}</div></div>
      <label class="field" data-only-conta><span>Dia do vencimento (opcional)</span><input name="day" type="number" min="1" max="31" inputmode="numeric" value="${L.day || ''}" placeholder="Ex.: 10"></label>
      <label class="tog inline" data-only-conta><input type="checkbox" name="auto" ${L.auto ? 'checked' : ''}><span data-auto-label></span></label>
      <div class="row-btns">${isNew ? '' : '<button type="button" class="btn ghost danger-text" data-del>Excluir</button>'}<button class="btn primary" type="submit">Salvar</button></div>
    </form>`,
    {
      cls: 'sheet-tall',
      onMount: (el, close) => {
        const form = $('form', el);
        const sync = () => {
          form.dataset.kind = L.kind;
          form.dataset.type = L.kind === 'despesa' ? L.type : 'conta';
          form.dataset.rec = L.rec;
          $$('[data-seg] [data-v]', form).forEach((b) => {
            const seg = b.parentElement.dataset.seg;
            if (seg === 'split') return;
            const cur = seg === 'kind' ? L.kind : seg === 'type' ? L.type : L.rec;
            b.classList.toggle('on', b.dataset.v === cur);
          });
          $('[data-cats]', form).innerHTML = catPickerHTML(L.kind, L.cat);
          $('[data-auto-label]', form).textContent = AUTO_LABEL[L.kind];
          $('[data-amount-label]', form).textContent = L.rec === 'parcelas' ? 'Valor de cada parcela' : L.kind === 'despesa' && L.type === 'verba' ? 'Limite por mês' : 'Valor';
          $('[data-start-label]', form).textContent = L.rec === 'parcelas' ? 'Primeira parcela em' : L.rec === 'unico' ? 'Em qual mês?' : 'A partir de';
          syncSplit();
        };
        // valor diferente do que estava, olhando um mês: de qual mês em diante ele vale
        const syncSplit = () => {
          const box = $('[data-split]', form);
          if (!box) return;
          const v = U.parseMoney(form.elements.amount.value);
          box.hidden = !(v > 0 && v !== line.amount && L.rec === line.rec);
          if (box.hidden) return;
          $$('[data-v]', box).forEach((b) => b.classList.toggle('on', b.dataset.v === split));
          const prev = U.addMonths(viewMk, -1);
          $('[data-split-help]', box).innerHTML =
            split === 'from'
              ? `Até ${mesAno(prev)} continua <b>${m0(line.amount)}</b>; de ${mesAno(viewMk)} em diante passa a <b>${m0(v)}</b>.`
              : `Todos os meses do item passam a <b>${m0(v)}</b>, inclusive os anteriores a ${mesAno(viewMk)}.`;
        };
        form.elements.amount.addEventListener('input', syncSplit);
        el.addEventListener('click', async (e) => {
          const sv = e.target.closest('[data-seg] [data-v]');
          if (sv) {
            const seg = sv.parentElement.dataset.seg;
            if (seg === 'split') {
              split = sv.dataset.v;
              syncSplit();
              return;
            }
            if (seg === 'kind') {
              L.kind = sv.dataset.v;
              L.cat = defaultCat[L.kind];
              if (L.kind !== 'despesa') L.type = 'conta';
            } else if (seg === 'type') L.type = sv.dataset.v;
            else L.rec = sv.dataset.v;
            sync();
            return;
          }
          if (
            catPickerClick(e, (id) => {
              L.cat = id;
              $('[data-cats]', form).innerHTML = catPickerHTML(L.kind, L.cat);
            })
          )
            return;
          const mt = e.target.closest('[data-m]');
          if (mt) {
            const m = +mt.dataset.m;
            L.months = L.months.includes(m) ? L.months.filter((x) => x !== m) : [...L.months, m].sort((a, b) => a - b);
            mt.classList.toggle('on', L.months.includes(m));
            return;
          }
          if (e.target.closest('[data-del]')) {
            const ok = await confirmDialog({ title: 'Excluir este item do plano?', text: 'Os lançamentos já feitos continuam no histórico.', ok: 'Excluir', danger: true });
            if (!ok) return;
            A.deleteLine(L.id);
            close();
            rerender();
            toast('Item removido do plano.');
          }
        });
        form.elements.hasEnd.addEventListener('change', () => ($('[data-end]', form).hidden = !form.elements.hasEnd.checked));
        const dreamCalc = () => {
          const v = U.parseMoney(form.elements.dream.value);
          const n = +form.elements.dreamMonths.value;
          const out = $('[data-dream-out]', form);
          if (v > 0 && n > 0) {
            const per = Math.ceil(v / n / 100) * 100;
            out.innerHTML = `Guarde <b>${m0(per)}</b> por mês. <button type="button" class="link" data-use="${per}">Usar este valor</button>`;
          } else out.textContent = 'Preencha para ver quanto guardar por mês.';
        };
        form.elements.dream.addEventListener('input', dreamCalc);
        form.elements.dreamMonths.addEventListener('input', dreamCalc);
        form.addEventListener('click', (e) => {
          const u = e.target.closest('[data-use]');
          if (u) {
            form.elements.amount.value = U.moneyInput(+u.dataset.use);
            syncSplit();
          }
        });
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const amount = U.parseMoney(form.elements.amount.value);
          const name = form.elements.name.value.trim();
          if (!name) return form.elements.name.focus();
          if (amount <= 0) return form.elements.amount.focus();
          if (L.rec === 'anual' && !L.months.length) return toast('Escolha pelo menos um mês.');
          const out = { id: L.id, name, kind: L.kind, cat: L.cat, amount, type: L.kind === 'despesa' ? L.type : 'conta', rec: L.rec, start: readMonth(form, 'start') };
          if (L.rec === 'anual') out.months = L.months;
          if (L.rec === 'parcelas') out.count = Math.max(1, Math.min(360, +form.elements.count.value || 1));
          if ((L.rec === 'mensal' || L.rec === 'anual') && form.elements.hasEnd.checked) out.end = readMonth(form, 'end');
          // o que a tela não mostra continua no item: o resto de uma conta paga em parte, a resposta do fechamento, a meta
          for (const k of ['rest', 'cover', 'goal']) if (line && line[k] != null) out[k] = line[k];
          const day = +form.elements.day.value;
          if (out.type === 'conta' && day >= 1 && day <= 31) out.day = day;
          if (out.type === 'conta' && form.elements.auto.checked) {
            if (!out.day) return toast('Para marcar sozinho, informe o dia do vencimento.');
            out.auto = true;
          }
          if (L.rec === 'anual') {
            // começa a valer no mês corrente para não "sumir" com meses do ano já passados
            out.start = out.start > curMk() ? out.start : U.mkOf(today()).slice(0, 4) + '-01';
          }
          const splitBox = $('[data-split]', form);
          if (splitBox && !splitBox.hidden && split === 'from') {
            const res = A.splitLine(line, out, viewMk);
            A.autoPayDue();
            close();
            rerender();
            A.notify(`Plano atualizado: de ${mesAno(viewMk)} em diante, <b>${m0(amount)}</b>.<br><small>Até ${mesAno(U.addMonths(viewMk, -1))} continua ${m0(line.amount)}.</small>`, res.events);
            return;
          }
          const events = A.saveLine(out);
          A.autoPayDue();
          close();
          rerender();
          A.notify(isNew ? `“${esc(name)}” entrou no plano.` : 'Plano atualizado.', events);
        });
        sync();
      },
    }
  );
}

// =============== SALDO QUE PASSA DE UM MÊS PARA O OUTRO ===============
/** Ajustar o “saldo anterior” do mês para bater com o banco; os outros meses acompanham. */
export function openCarry(mk) {
  const prev = U.addMonths(mk, -1);
  openSheet(
    `${sheetHead(`Saldo no fim de ${U.monthName(prev)}`, 'Quanto você tinha na conta? Os meses seguintes partem desse valor, como no extrato do banco.')}
    <form class="form">
      <label class="field"><span>Saldo</span><div class="money-in"><span>R$</span><input name="v" inputmode="decimal" value="${U.moneyInput(M.carryIn(S(), mk))}" placeholder="0,00"></div>
      <small class="help">Para saldo negativo, comece com o sinal de menos (ex.: -150,00).</small></label>
      <button class="btn primary wide" type="submit">Salvar</button>
    </form>`,
    {
      onMount: (el, close) => {
        const form = $('form', el);
        const input = form.elements.v;
        // moneyInput não mostra o sinal: o campo começa com o valor e o sinal de menos, se houver
        const cur = M.carryIn(S(), mk);
        if (cur < 0) input.value = '-' + U.moneyInput(cur);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          A.setCarry(mk, U.parseMoney(input.value));
          close();
          rerender();
          toast('Saldo ajustado.');
        });
      },
    }
  );
}

// =============== FECHAMENTO DO MÊS ===============
const CLOSE_ORDER = ['cartao', 'rotativo', 'cheque', 'parcelado', 'reserva'];

/**
 * O mês mk (já fechado) terminou faltando dinheiro: como isso ficou no banco? Pode marcar mais de uma opção;
 * com mais de uma, cada uma leva o seu valor e a soma tem de bater com o que faltou.
 */
export function openClose(mk) {
  const st = S();
  const H = M.CLOSE_HOW;
  const g = M.shortfall(st, mk);
  const rec = M.closeOf(st, mk);
  const mes = U.monthName(mk);
  const next = U.addMonths(mk, 1);
  const prox = U.monthName(next);
  const parse = (s) => U.parseMoney(s || '');
  if (g < 100) {
    openSheet(
      `${sheetHead(`Fechar ${mes}`, `Pelo que está lançado hoje, ${mes} não terminou faltando dinheiro.`)}
      ${rec ? `<div class="row-btns"><button type="button" class="btn ghost" data-drop>Apagar a resposta de antes</button></div>` : '<div class="row-btns"><button type="button" class="btn primary" data-sheet-close>Ok</button></div>'}`,
      { onMount: (el, close) => mountDrop(el, close) }
    );
    return;
  }
  // reserva antes da resposta de agora (a resposta de antes já tirou dela)
  const coverRes = U.sum(M.txOf(st, mk).filter((t) => t.cv && t.c === 'reserva'), (t) => t.v);
  const reserve = M.reserveBalance(st) - coverRes;
  const was = rec && !rec.parts.some((p) => p.all) ? U.sum(rec.parts, (p) => p.v) : null;
  const pre = new Map((rec ? rec.parts : []).map((p) => [p.how, p]));

  const moneyIn = (f, v, extra = '') => `<div class="money-in"><span>R$</span><input data-f="${f}" inputmode="decimal" value="${v ? U.moneyInput(v) : ''}" ${extra}></div>`;
  const moreHTML = (how) => {
    const p = pre.get(how) || {};
    const amt = `<label class="field cl-amt"><span>Quanto foi assim</span>${moneyIn('v', p.v || 0, 'placeholder="0,00"')}</label>`;
    let body = '';
    if (how === 'cartao') body = `<p class="help">Nada a lançar: as compras já contam em ${mes}. ${U.cap(prox)} começa com esse valor negativo, que sai do salário de ${prox} quando você paga a fatura.</p>`;
    if (how === 'rotativo' || how === 'cheque') {
      const rate = M.CLOSE_RATE[how];
      body = `<label class="field"><span>Juros estimados em ${prox}</span>${moneyIn('juros', p.juros || 0, 'data-auto="' + (p.juros ? 0 : 1) + '" placeholder="0,00"')}
        <small class="help">${how === 'rotativo' ? `Estimativa de ${rate * 100}% ao mês. O valor certo entra quando você importar a fatura.` : `Até ${rate * 100}% ao mês. O valor certo entra quando você importar o extrato.`}</small></label>`;
    }
    if (how === 'parcelado')
      body = `<div class="two">
          <label class="field"><span>Parcelas</span><input data-f="n" inputmode="numeric" value="${p.n || ''}" placeholder="6"></label>
          <label class="field"><span>Valor de cada parcela</span>${moneyIn('p', p.p || 0, 'placeholder="0,00"')}</label>
        </div>
        <p class="help" data-prev></p>`;
    if (how === 'reserva')
      body = `<p class="help" data-res></p>
        <label class="tog inline"><input type="checkbox" data-f="reporOn" ${p.repor ? 'checked' : ''}><span>Repor a reserva aos poucos</span></label>
        <div class="cl-repor" data-repor ${p.repor ? '' : 'hidden'}><label class="field"><span>Quanto por mês</span>${moneyIn('repor', p.repor || 0, 'placeholder="0,00"')}</label><p class="help" data-repor-txt></p></div>`;
    return `${amt}${body}`;
  };
  const optHTML = (how) => {
    const o = H[how];
    return `<div class="cl-opt" data-how="${how}">
      <label class="tog cl-tog"><input type="checkbox" data-pick="${how}" ${pre.has(how) ? 'checked' : ''}><span class="cl-emo" aria-hidden="true">${o.emo}</span><span class="cl-txt"><b>${o.name}</b><small>${o.help}</small></span></label>
      <div class="cl-more" ${pre.has(how) ? '' : 'hidden'}>${moreHTML(how)}</div>
    </div>`;
  };
  openSheet(
    `${sheetHead(`Fechar ${mes}`, `Terminou faltando <b>${m0(g)}</b>. No banco não existe saldo negativo: o que faltou virou dívida ou saiu da reserva. Como ficou?`)}
    ${was != null && was !== g ? `<p class="cl-changed">Mudou desde a sua resposta: antes faltavam ${m0(was)}, agora faltam ${m0(g)}.</p>` : ''}
    <form class="form cl-form" novalidate>
      <p class="help">Pode marcar mais de uma.</p>
      <div class="cl-opts">${CLOSE_ORDER.map(optHTML).join('')}</div>
      <p class="cl-status" data-status role="status"></p>
      <button class="btn primary wide" type="submit" data-save>Salvar</button>
      ${rec ? '<button type="button" class="link small cl-drop" data-drop>Apagar a resposta</button>' : ''}
    </form>`,
    {
      label: `Fechar ${mes}`,
      onMount: (el, close) => {
        const form = $('form', el);
        const opt = (how) => $(`.cl-opt[data-how="${how}"]`, el);
        const f = (how, name) => $(`[data-f="${name}"]`, opt(how));
        const picked = () => CLOSE_ORDER.filter((h) => $(`[data-pick="${h}"]`, el).checked);
        // valor de cada opção: com uma só, é tudo o que faltou
        const amount = (how, list = picked()) => (list.length === 1 ? g : parse(f(how, 'v').value));
        const update = () => {
          const list = picked();
          const multi = list.length > 1;
          for (const h of CLOSE_ORDER) {
            const on = list.includes(h);
            opt(h).classList.toggle('on', on);
            $('.cl-more', opt(h)).hidden = !on;
            $('.cl-amt', opt(h)).hidden = !multi;
          }
          let ok = list.length > 0;
          for (const h of list) {
            const v = amount(h, list);
            if (v <= 0) ok = false;
            if (h === 'rotativo' || h === 'cheque') {
              const j = f(h, 'juros');
              if (j.dataset.auto === '1') j.value = v > 0 ? U.moneyInput(Math.round((v * M.CLOSE_RATE[h]) / 100) * 100) : '';
            }
            if (h === 'parcelado') {
              const n = parseInt(f(h, 'n').value, 10) || 0;
              const pv = parse(f(h, 'p').value);
              const prev = $('[data-prev]', opt(h));
              if (n > 0 && pv > 0) {
                const tot = n * pv;
                const juros = tot - v;
                prev.innerHTML = `${n} × ${m0(pv)} = <b>${m0(tot)}</b>${juros > 0 ? ` · ${m0(juros)} de juros` : ''} · de ${prox} a ${U.monthName(U.addMonths(next, n - 1))}`;
              } else {
                prev.textContent = `Veja no banco em quantas vezes ficou e o valor de cada parcela. Começa em ${prox}.`;
                ok = false;
              }
            }
            if (h === 'reserva') {
              $('[data-res]', opt(h)).innerHTML = `Reserva no app: ${m0(reserve)} → <b class="${reserve - v < 0 ? 'neg' : ''}">${m0(reserve - v)}</b>${reserve - v < 0 ? '. A reserva no app tem menos que isso: confira em Metas.' : ''}`;
              const rOn = f(h, 'reporOn').checked;
              const box = $('[data-repor]', opt(h));
              box.hidden = !rOn;
              if (rOn) {
                const r = f(h, 'repor');
                if (!parse(r.value) && v > 0) r.value = U.moneyInput(M.roundUp10(v / 6));
                const rv = parse(r.value);
                $('[data-repor-txt]', opt(h)).textContent = rv > 0 && v > 0 ? `Em ${U.plural(Math.ceil(v / rv), 'mês', 'meses')}, a partir de ${prox}.` : '';
                if (rv <= 0) ok = false;
              }
            }
          }
          const st2 = $('[data-status]', el);
          if (multi) {
            const tot = U.sum(list, (h) => amount(h, list));
            const diff = g - tot;
            if (diff !== 0) ok = false;
            st2.className = `cl-status ${diff === 0 ? 'done' : 'warn'}`;
            st2.textContent = diff > 0 ? `Falta distribuir ${m0(diff)} de ${m0(g)}.` : diff < 0 ? `Passou ${m0(-diff)} do que faltou (${m0(g)}).` : `Os ${m0(g)} estão distribuídos.`;
          } else {
            st2.className = 'cl-status';
            st2.textContent = '';
          }
          $('[data-save]', el).disabled = !ok;
        };
        el.addEventListener('change', (e) => {
          if (e.target.matches('[data-pick]')) {
            const list = picked();
            // ao passar a ter mais de uma, a primeira fica com tudo e as outras começam vazias
            if (list.length === 2 && e.target.checked) {
              const first = list.find((h) => h !== e.target.dataset.pick);
              if (!parse(f(first, 'v').value)) f(first, 'v').value = U.moneyInput(g);
            }
          }
          update();
        });
        el.addEventListener('input', (e) => {
          if (e.target.matches('[data-f="juros"]')) e.target.dataset.auto = '0';
          update();
        });
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          update();
          if ($('[data-save]', el).disabled) return;
          const list = picked();
          const parts = list.map((h) => {
            const p = { how: h, v: amount(h, list) };
            if (h === 'rotativo' || h === 'cheque') p.juros = parse(f(h, 'juros').value);
            if (h === 'parcelado') Object.assign(p, { n: parseInt(f(h, 'n').value, 10), p: parse(f(h, 'p').value) });
            if (h === 'reserva' && f(h, 'reporOn').checked) p.repor = parse(f(h, 'repor').value);
            return p;
          });
          const u = A.saveClose(mk, parts);
          close();
          rerender();
          toast(`${U.cap(mes)} fechado.`, { action: { label: 'Desfazer', fn: () => { A.undoClose(u); rerender(); } } });
        });
        mountDrop(el, close);
        update();
      },
    }
  );

  function mountDrop(el, close) {
    const b = $('[data-drop]', el);
    if (!b) return;
    b.addEventListener('click', () => {
      const u = A.dropClose(mk);
      close();
      rerender();
      toast('Resposta apagada.', { action: { label: 'Desfazer', fn: () => { A.undoClose(u); rerender(); } } });
    });
  }
}

// =============== RESERVA ===============
export function openReserve() {
  const st = S();
  let goal = st.core.settings.reserveGoalMonths || 6;
  const cv = M.custoDeVida(st, curMk());
  openSheet(
    `${sheetHead('Reserva de emergência', cv ? `Seu custo de vida: ${m0(cv)} por mês` : '')}
    <form class="form">
      <label class="field"><span>Quanto você tem guardado hoje na reserva?</span><div class="money-in"><span>R$</span><input name="v" inputmode="decimal" value="${U.moneyInput(M.reserveBalance(st))}" placeholder="0,00"></div></label>
      <div class="field"><span>Meta</span><div class="seg full" data-seg="goal">${[3, 6, 12].map((m) => `<button type="button" data-v="${m}" class="${m === goal ? 'on' : ''}">${m} meses</button>`).join('')}</div>
      <small class="help">Cerbasi recomenda no mínimo 3 meses de custo de vida e mirar em 6. Renda variável ou instável pede mais.</small></div>
      <button class="btn primary wide" type="submit">Salvar</button>
    </form>`,
    {
      onMount: (el, close) => {
        const form = $('form', el);
        el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-seg] [data-v]');
          if (b) {
            goal = +b.dataset.v;
            $$('[data-seg] [data-v]', el).forEach((x) => x.classList.toggle('on', x === b));
          }
        });
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const events = A.setReserve(U.parseMoney(form.elements.v.value), goal);
          close();
          rerender();
          A.notify('Reserva atualizada.', events);
        });
      },
    }
  );
}

// =============== AJUSTES ===============
async function offerFile(filename, text, mime) {
  const C = window.claude;
  if (C && typeof C.use === 'function') {
    try {
      const dl = await C.use('downloads');
      if (dl) {
        await dl.save({ filename, data: text });
        toast('Arquivo salvo.');
        return;
      }
    } catch (e) {
      if (e && e.code === 'declined') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Não deu para baixar aqui, então o conteúdo foi copiado. Cole num arquivo para guardar.');
    } catch {
      openSheet(`${sheetHead(esc(filename))}<p class="card-sub">Copie o texto abaixo e guarde num arquivo.</p><textarea class="dump" readonly>${esc(text)}</textarea>`);
    }
    return;
  }
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  toast('Arquivo baixado.');
}

const SYNC_TEXT = {
  local: [IC.device, 'Salvo neste aparelho'],
  connecting: [IC.cloud, 'Conectando à sua conta…'],
  synced: [IC.cloud, 'Sincronizado na sua conta (privado)'],
  offline: [IC.cloud, 'Sem conexão: salvo aqui e sincroniza depois'],
  quota: [IC.cloud, 'Espaço na nuvem cheio: faça um backup'],
  error: [IC.cloud, 'Erro ao sincronizar: faça um backup'],
};

export function openSettings() {
  const st = S();
  const s = st.core.settings;
  const [ic, txt] = SYNC_TEXT[store.status] || SYNC_TEXT.local;
  const warn = !store.lsOK && store.mode !== 'cloud';
  openSheet(
    `${sheetHead('Ajustes')}
    <div class="settings form">
      <p class="sync-line">${ic}<span>${txt}</span></p>
      ${warn ? '<p class="warn-box"><span class="flag-ic crit">!</span>Este navegador não está deixando salvar dados. Faça backups ou abra o app por outro navegador.</p>' : ''}
      <label class="field"><span>Seu nome</span><input name="name" value="${esc(s.name || '')}" maxlength="30" placeholder="Como quer ser chamado"></label>
      <label class="field"><span>Dia do check-in semanal</span><select name="checkinDay">${U.DIAS.map((d, i) => `<option value="${i}" ${i === (s.checkinDay ?? 0) ? 'selected' : ''}>${U.cap(d)}</option>`).join('')}</select></label>
      <div class="field"><span>Tema</span><div class="seg full" data-seg="theme">${[
        ['auto', 'Automático'],
        ['light', 'Claro'],
        ['dark', 'Escuro'],
      ]
        .map(([v, l]) => `<button type="button" data-v="${v}" class="${(s.theme || 'auto') === v ? 'on' : ''}">${l}</button>`)
        .join('')}</div></div>
      <h3 class="group">Seus dados</h3>
      <div class="set-list">
        <button type="button" class="set-row" data-s="importar"><span>📥</span><span>Importar extrato ou fatura<small>OFX, CSV, PDF ou texto: o app lança sozinho</small></span></button>
        <button type="button" class="set-row" data-s="backup"><span>💾</span><span>Fazer backup<small>Arquivo .json com tudo</small></span></button>
        <label class="set-row"><span>📂</span><span>Restaurar backup<small>Substitui os dados atuais</small></span><input type="file" accept=".json,application/json" data-s="import" hidden></label>
        <button type="button" class="set-row" data-s="planilha"><span>📊</span><span>Exportar planilha de 12 meses<small>Previsto x realizado por categoria, abre no Excel e no Google Planilhas (.csv)</small></span></button>
        <button type="button" class="set-row" data-s="lanc"><span>🧾</span><span>Exportar lançamentos<small>Todos, em .csv</small></span></button>
      </div>
      <h3 class="group">Plano e método</h3>
      <div class="set-list">
        <button type="button" class="set-row" data-s="cats"><span>🏷️</span><span>Categorias e atalhos<small>Atalhos de lançar, subcategorias e regras aprendidas</small></span></button>
        <button type="button" class="set-row" data-s="wizard"><span>🗺️</span><span>Refazer o assistente do plano<small>Renda, contas, verbas e gastos anuais</small></span></button>
        <button type="button" class="set-row" data-s="metodo"><span>📖</span><span>Sobre o método<small>Como o app aplica as ideias do Cerbasi</small></span></button>
        <button type="button" class="set-row" data-s="instalar"><span>📲</span><span>Usar como app no celular<small>Ícone na tela inicial e atalho “Novo gasto”</small></span></button>
      </div>
      <div class="set-list">
        <button type="button" class="set-row danger" data-s="reset"><span>🗑️</span><span>Apagar todos os dados</span></button>
      </div>
      <p class="fineprint">Folga · v1 · Seus dados ficam ${store.mode === 'cloud' ? 'na sua conta (privados) e neste aparelho' : 'só neste aparelho'}. Nenhum banco é conectado: você lança e o app planeja.</p>
    </div>`,
    {
      cls: 'sheet-tall',
      onMount: (el, close) => {
        const save = () => {
          store.save(['core']);
          rerender();
        };
        el.querySelector('[name="name"]').addEventListener('change', (e) => {
          s.name = e.target.value.trim();
          save();
        });
        el.querySelector('[name="checkinDay"]').addEventListener('change', (e) => {
          s.checkinDay = +e.target.value;
          save();
        });
        el.querySelector('[data-s="import"]').addEventListener('change', async (e) => {
          const file = e.target.files && e.target.files[0];
          e.target.value = '';
          if (!file) return;
          let data = null;
          try {
            data = JSON.parse(await file.text());
          } catch {
            data = null;
          }
          if (!data || !data.core || !data.months) return toast('Esse arquivo não parece um backup do Folga.');
          const ok = await confirmDialog({ title: 'Restaurar este backup?', text: 'Os dados atuais serão substituídos pelos do arquivo.', ok: 'Restaurar' });
          if (!ok) return;
          store.replaceAll(data);
          close();
          rerender();
          toast('Backup restaurado.');
        });
        el.addEventListener('click', async (e) => {
          const th = e.target.closest('[data-seg="theme"] [data-v]');
          if (th) {
            s.theme = th.dataset.v;
            $$('[data-seg="theme"] [data-v]', el).forEach((b) => b.classList.toggle('on', b === th));
            save();
            return;
          }
          const b = e.target.closest('button[data-s]');
          if (!b) return;
          const k = b.dataset.s;
          const stamp = today();
          if (k === 'backup') offerFile(`folga-backup-${stamp}.json`, A.backupJSON(), 'application/json');
          else if (k === 'planilha') offerFile(`folga-planilha-${curMk()}.csv`, A.planilhaCSV(curMk()), 'text/csv');
          else if (k === 'lanc') offerFile(`folga-lancamentos-${stamp}.csv`, A.lancamentosCSV(), 'text/csv');
          else if (k === 'wizard') {
            close();
            setTimeout(() => openOnboarding({ redo: true }), 150);
          } else if (k === 'metodo') openMethod();
          else if (k === 'cats') openCategories();
          else if (k === 'importar') {
            close();
            setTimeout(() => openImport(), 150);
          }
          else if (k === 'instalar') openInstall();
          else if (k === 'reset') {
            const ok = await confirmDialog({ title: 'Apagar tudo?', text: 'Plano, lançamentos e conquistas serão apagados. Considere fazer um backup antes.', ok: 'Apagar tudo', danger: true });
            if (!ok) return;
            store.replaceAll(M.emptyState());
            close();
            ctx.ui.tab = 'inicio';
            rerender();
            setTimeout(() => openOnboarding({ first: true }), 200);
          }
        });
      },
    }
  );
}

export function openMethod() {
  openSheet(
    `${sheetHead('Sobre o método', 'O que vem do Gustavo Cerbasi e como o app aplica')}
    <div class="prose">
      <h3>1. Orçamento é projetar o futuro</h3>
      <p>Para Cerbasi, orçamento não é só anotar o que já foi: é o hábito de projetar o que vem pela frente. A planilha de orçamento doméstico dele coloca os 12 meses lado a lado, com receitas e despesas por categoria (habitação, transporte, saúde, educação, despesas pessoais, lazer…), previsto e realizado. <b>No app:</b> aba Plano (projeção de 12 meses, com a sobra acumulada mês a mês) e aba Mês (previsto x realizado).</p>
      <h3>2. Pague-se primeiro</h3>
      <p>Inverter a ordem: estimar os sonhos, definir quanto guardar por mês e descontar isso da renda antes de qualquer gasto. O que sobra define o padrão de vida. Na planilha, o investimento entra como uma “despesa” do mês. <b>No app:</b> aba Metas: cada sonho com valor e prazo vira um “guardar por mês” no plano, com botão “Guardei”; e o item “Pague-se primeiro” para a reserva.</p>
      <h3>3. Os gastos que vêm uma vez por ano</h3>
      <p>IPVA, IPTU, matrícula, material escolar, seguro, presentes. Colocados no plano desde já, eles aparecem no mês certo e o app sugere quanto separar por mês. <b>No app:</b> itens “meses do ano”, e no Plano o grupo “Anuais e parcelas” mostra quanto separar por mês.</p>
      <h3>4. Reserva de emergência primeiro</h3>
      <p>Mínimo de 3 meses de custo de vida, mirando em 6 (mais, se a renda for instável). <b>No app:</b> o “pague-se primeiro” vai para a reserva até a meta, com medalhas em 1, 3 e 6 meses.</p>
      <h3>5. Controle semanal, sem neura</h3>
      <p>Um resumo do livro “Como Organizar Sua Vida Financeira” recomenda evitar o controle diário: além de tomar tempo, desanima quando você falha uma semana. O ideal é semanal ou quinzenal. <b>No app:</b> o check-in da semana, o acerto aproximado e semanas (não dias) em dia.</p>
      <h3>6. Revisar sempre</h3>
      <p>Revisar o plano pelo menos uma vez por mês e ajustar. Errar a previsão faz parte. <b>No app:</b> o mês mostra onde o realizado fugiu do previsto, e você ajusta o item no plano.</p>
      <p class="fineprint">O Folga não é um produto oficial do Gustavo Cerbasi; é um app inspirado em ideias públicas dele, de entrevistas, resumos de livros e da planilha de orçamento. Fontes no arquivo README.</p>
    </div>`,
    { cls: 'sheet-tall' }
  );
}

export function openInstall() {
  const inArtifact = !!(window.claude && typeof window.claude.use === 'function');
  openSheet(
    `${sheetHead('Usar como app no celular')}
    <div class="prose">
      ${
        inArtifact
          ? `<p>Você está usando o Folga pelo link do Claude. Seus dados ficam guardados na sua conta e aparecem em qualquer aparelho em que você abrir o link.</p>
      <h3>Atalho na tela inicial (Android)</h3>
      <ol><li>Abra este link no Chrome.</li><li>Toque no menu <b>⋮</b> e em <b>Adicionar à tela inicial</b>.</li></ol>
      <p>Esse atalho usa o ícone do site do Claude. Para ter o ícone do Folga, a leitura de prints, os atalhos “Novo gasto” e “Importar extrato” ao segurar o ícone e o uso sem internet, instale a versão publicada num endereço próprio (o README explica o passo a passo). Para levar seus dados: aqui, <b>Ajustes → Fazer backup</b>; lá, <b>Ajustes → Restaurar backup</b>.</p>`
          : `<h3>Android (Chrome)</h3>
      <ol><li>Toque no menu <b>⋮</b>.</li><li>Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li><li>Pronto: o Folga abre como um app, até sem internet.</li></ol>
      <h3>O atalho que muda tudo</h3>
      <p>Segure o dedo no ícone do Folga: aparecem <b>Novo gasto</b>, <b>Importar extrato</b> e <b>Check-in</b>. Arraste “Novo gasto” para a tela inicial e lançar vira coisa de 3 segundos.</p>
      <h3>iPhone (Safari)</h3>
      <ol><li>Toque em <b>Compartilhar</b>.</li><li>Escolha <b>Adicionar à Tela de Início</b>.</li></ol>`
      }
      <h3>Lembrete que funciona</h3>
      <p>Crie no Google Agenda um evento semanal no seu dia de check-in (“Check-in do Folga, 2 min”). Um lembrete só por semana, sem cobrança diária.</p>
    </div>`,
    { cls: 'sheet-tall' }
  );
}

// =============== ASSISTENTE (ONBOARDING) ===============
export function openOnboarding({ first = false, redo = false } = {}) {
  const st = S();
  const ob = {
    step: redo ? 1 : 0,
    name: st.core.settings.name || '',
    salary: 0,
    payday: 5,
    has13: false,
    hasFerias: false,
    feriasMonth: 1,
    other: 0,
    pct: 10,
    pay: 0,
    payManual: false,
    reserve: 0,
    bills: M.BILL_TEMPLATES.map((b) => ({ ...b, on: false, amount: 0 })),
    verbas: M.VERBA_TEMPLATES.map((v) => ({ ...v, amount: 0 })),
    seasonal: M.SEASONAL_TEMPLATES.map((s) => ({ ...s, on: false, amount: 0 })),
  };
  const TOTAL = 5;

  const buildLines = () => {
    const L = [];
    const start = curMk();
    const yearStart = start;
    const mk = (o) => ({ id: U.uid(), start, type: 'conta', rec: 'mensal', ...o });
    if (ob.salary) L.push(mk({ name: 'Salário', kind: 'receita', cat: 'salario', amount: ob.salary, day: ob.payday || null }));
    if (ob.salary && ob.has13) {
      const half = Math.round(ob.salary / 2);
      L.push(mk({ name: '13º salário (1ª parcela)', kind: 'receita', cat: 'outras_rec', amount: half, rec: 'anual', months: [11], start: yearStart, day: 30 }));
      L.push(mk({ name: '13º salário (2ª parcela)', kind: 'receita', cat: 'outras_rec', amount: ob.salary - half, rec: 'anual', months: [12], start: yearStart, day: 20 }));
    }
    if (ob.salary && ob.hasFerias) L.push(mk({ name: '1/3 de férias', kind: 'receita', cat: 'outras_rec', amount: Math.round(ob.salary / 3), rec: 'anual', months: [ob.feriasMonth], start: yearStart }));
    if (ob.other) L.push(mk({ name: 'Outra renda', kind: 'receita', cat: 'extra', amount: ob.other }));
    if (ob.pay) L.push(mk({ name: 'Pague-se primeiro', kind: 'invest', cat: 'reserva', amount: ob.pay, day: ob.payday || 5 }));
    for (const b of ob.bills) if (b.on && b.amount) L.push(mk({ name: b.name, kind: 'despesa', cat: b.cat, amount: b.amount, day: b.day || null }));
    for (const v of ob.verbas) if (v.amount) L.push(mk({ name: v.name, kind: 'despesa', cat: v.cat, amount: v.amount, type: 'verba' }));
    for (const s of ob.seasonal) if (s.on && s.amount) L.push(mk({ name: s.name, kind: 'despesa', cat: s.cat, amount: s.amount, rec: 'anual', months: [s.month], start: yearStart }));
    return L;
  };
  const income = () => ob.salary + ob.other;
  const payFromPct = () => Math.round((income() * ob.pct) / 100 / 100) * 100;

  const dayOptions = (sel) => `<option value="">—</option>` + Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${sel === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('');
  const monthOptions = (sel) => U.MESES.map((m, i) => `<option value="${i + 1}" ${sel === i + 1 ? 'selected' : ''}>${U.cap(m)}</option>`).join('');
  const nav = (nextLabel = 'Próximo') => `<div class="ob-nav"><button type="button" class="btn ghost" data-ob="back">Voltar</button><button type="button" class="btn primary" data-ob="next">${nextLabel}</button></div>`;
  const kicker = (n, t) => `<p class="eyebrow">Passo ${n} de ${TOTAL} · ${t}</p><div class="steps">${Array.from({ length: TOTAL }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`;

  const stepHTML = () => {
    switch (ob.step) {
      case 0:
        return `<div class="ob ob-welcome">
          <div class="ob-mark"><span class="brand-mark big">f</span></div>
          <h1>Seu dinheiro com folga.<br><span class="soft">E sem culpa.</span></h1>
          <ul class="ob-points">
            <li><span>⚡</span><p><b>2 toques para lançar:</b> valor e categoria. Só isso.</p></li>
            <li><span>🗓️</span><p><b>Projeção de 12 meses</b> no método do Gustavo Cerbasi: você vê hoje o aperto de janeiro.</p></li>
            <li><span>🪃</span><p><b>Sumiu uns dias?</b> Um acerto aproximado e pronto. Voltar dá XP, não bronca.</p></li>
          </ul>
          <label class="field"><span>Como quer ser chamado? (opcional)</span><input name="name" value="${esc(ob.name)}" maxlength="30" autocomplete="given-name"></label>
          <button type="button" class="btn primary wide" data-ob="next">Montar meu plano · 2 min</button>
          <button type="button" class="btn ghost wide" data-ob="skip">Explorar primeiro</button>
        </div>`;
      case 1:
        return `<div class="ob">${kicker(1, 'Receitas')}
          <h2>Quanto entra por mês?</h2>
          <p class="lede">O valor que cai na conta (líquido). Renda variável? Coloque o menor valor provável, como recomenda o Cerbasi.</p>
          <label class="field big"><span>Salário ou renda principal</span><div class="money-in"><span>R$</span><input name="salary" inputmode="decimal" placeholder="0,00" value="${U.moneyInput(ob.salary)}"></div></label>
          <label class="field"><span>Dia em que cai</span><select name="payday">${dayOptions(ob.payday)}</select></label>
          <div class="toggles">
            <label class="tog"><input type="checkbox" name="has13" ${ob.has13 ? 'checked' : ''}><span>Recebo 13º salário</span></label>
            <label class="tog"><input type="checkbox" name="hasFerias" ${ob.hasFerias ? 'checked' : ''}><span>Recebo 1/3 de férias</span></label>
          </div>
          <label class="field" data-show="ferias" ${ob.hasFerias ? '' : 'hidden'}><span>Mês das férias</span><select name="feriasMonth">${monthOptions(ob.feriasMonth)}</select></label>
          <label class="field"><span>Outra renda fixa por mês (opcional)</span><div class="money-in"><span>R$</span><input name="other" inputmode="decimal" placeholder="0,00" value="${U.moneyInput(ob.other)}"></div></label>
          ${nav()}
        </div>`;
      case 2: {
        const pay = ob.payManual ? ob.pay : payFromPct();
        return `<div class="ob">${kicker(2, 'Pague-se primeiro')}
          <h2>Quanto você vai guardar antes de gastar?</h2>
          <blockquote class="quote">“Decida quanto guardar para os seus sonhos e só depois gaste o que sobra. O que sobra define o seu padrão de vida.”<cite>A ideia central do orçamento de Cerbasi</cite></blockquote>
          <div class="pct-chips">${[5, 10, 15, 20].map((p) => `<button type="button" class="cchip ${!ob.payManual && ob.pct === p ? 'on' : ''}" data-pct="${p}">${p}%</button>`).join('')}</div>
          <label class="field"><span>Valor por mês</span><div class="money-in"><span>R$</span><input name="pay" inputmode="decimal" placeholder="0,00" value="${U.moneyInput(pay)}"></div></label>
          <p class="calc" data-pay-calc>${pay ? `= <b>${m0(pay * 12)}</b> em um ano.` : 'Comece pequeno se precisar: o hábito importa mais do que o valor.'}</p>
          <label class="field"><span>Já tem alguma reserva guardada? (opcional)</span><div class="money-in"><span>R$</span><input name="reserve" inputmode="decimal" placeholder="0,00" value="${U.moneyInput(ob.reserve)}"></div><small class="help">Enquanto a reserva de emergência não chegar a 6 meses de custo de vida, o que você guardar vai para ela.</small></label>
          ${nav()}
        </div>`;
      }
      case 3:
        return `<div class="ob">${kicker(3, 'Contas fixas')}
          <h2>Quais contas chegam todo mês?</h2>
          <p class="lede">Marque e ponha o valor aproximado. Elas viram a lista “Contas do mês”: um toque em “Paguei” e pronto, sem digitar nada.</p>
          <ul class="ob-list">${ob.bills
            .map(
              (b, i) => `<li class="ob-item ${b.on ? 'on' : ''}">
              <label class="ob-check"><input type="checkbox" data-bill="${i}" ${b.on ? 'checked' : ''}><span>${M.catById(st, b.cat).emoji}</span><b>${esc(b.name)}</b></label>
              <div class="ob-fields"><div class="money-in sm"><span>R$</span><input inputmode="decimal" data-bill-amt="${i}" value="${U.moneyInput(b.amount)}" placeholder="0,00" aria-label="Valor de ${esc(b.name)}"></div>
              <label class="mini"><span>dia</span><select data-bill-day="${i}" aria-label="Dia do vencimento">${dayOptions(b.day)}</select></label></div>
            </li>`
            )
            .join('')}</ul>
          ${nav()}
        </div>`;
      case 4:
        return `<div class="ob">${kicker(4, 'Dia a dia')}
          <h2>Quanto vai, mais ou menos, com…</h2>
          <p class="lede">São as suas verbas do mês. Não sabe? Chute. Depois de um mês o app mostra o realizado e você ajusta.</p>
          <div class="catchup">${ob.verbas
            .map((v, i) => `<label class="cu-row"><span class="emo">${M.catById(st, v.cat).emoji}</span><span class="cu-name">${esc(v.name)}</span><span class="money-in sm"><span>R$</span><input inputmode="decimal" data-verba="${i}" value="${U.moneyInput(v.amount)}" placeholder="0,00" aria-label="${esc(v.name)}"></span></label>`)
            .join('')}</div>
          ${nav()}
        </div>`;
      case 5:
        return `<div class="ob">${kicker(5, 'Os sustos do ano')}
          <h2>Gastos que vêm uma vez por ano</h2>
          <p class="lede">É aqui que a planilha do Cerbasi brilha: no plano desde já, janeiro deixa de ser surpresa.</p>
          <ul class="ob-list">${ob.seasonal
            .map(
              (s, i) => `<li class="ob-item ${s.on ? 'on' : ''}">
              <label class="ob-check"><input type="checkbox" data-sea="${i}" ${s.on ? 'checked' : ''}><span>${M.catById(st, s.cat).emoji}</span><b>${esc(s.name)}</b></label>
              <div class="ob-fields"><div class="money-in sm"><span>R$</span><input inputmode="decimal" data-sea-amt="${i}" value="${U.moneyInput(s.amount)}" placeholder="0,00" aria-label="Valor de ${esc(s.name)}"></div>
              <label class="mini"><span>em</span><select data-sea-month="${i}" aria-label="Mês">${monthOptions(s.month)}</select></label></div>
            </li>`
            )
            .join('')}</ul>
          ${nav('Ver meu ano')}
        </div>`;
      default: {
        const lines = buildLines();
        const rows = M.projection({ core: { plan: lines }, months: {} }, curMk(), 12);
        const tot = rows.reduce((a, r) => ({ receita: a.receita + r.receita, despesa: a.despesa + r.despesa, invest: a.invest + r.invest }), { receita: 0, despesa: 0, invest: 0 });
        const neg = rows.filter((r) => r.saldo < 0);
        return `<div class="ob">
          <p class="eyebrow">Pronto</p>
          <h2>Seu ano em um olhar</h2>
          ${
            lines.length
              ? `${legendHTML()}<div class="chart-box" data-chart="ob"></div>
          <div class="totals"><div><span>Vai entrar</span><b>${m0(tot.receita)}</b></div><div><span>Vai sair</span><b>${m0(tot.despesa)}</b></div><div><span>Vai guardar</span><b>${m0(tot.invest)}</b></div><div><span>Sobra</span><b class="${tot.receita - tot.despesa - tot.invest < 0 ? 'neg' : ''}">${m0(tot.receita - tot.despesa - tot.invest)}</b></div></div>
          ${neg.length ? `<ul class="alerts">${neg.slice(0, 3).map((r) => `<li><span class="flag-ic crit">!</span><span><b>${U.cap(U.monthName(r.mk))}</b> fecha no vermelho (${m0(r.saldo)}). Melhor saber agora do que em cima da hora.</span></li>`).join('')}</ul>` : `<p class="ok-line">${IC.check} Nenhum mês no vermelho. Bonito!</p>`}
          <p class="card-sub">Você pode ajustar tudo depois, na aba Plano.</p>`
              : `<p class="lede">Você não preencheu nada, e tudo bem. Dá para montar o plano aos poucos, na aba Plano.</p>`
          }
          <div class="ob-nav"><button type="button" class="btn ghost" data-ob="back">Voltar</button><button type="button" class="btn lime" data-ob="finish">${lines.length && !st.core.game.badges.plano ? 'Começar · +100 XP' : 'Começar'}</button></div>
        </div>`;
      }
    }
  };

  const collect = (el) => {
    const f = (n) => el.querySelector(`[name="${n}"]`);
    if (ob.step === 0 && f('name')) ob.name = f('name').value.trim();
    if (ob.step === 1) {
      ob.salary = U.parseMoney(f('salary').value);
      ob.payday = +f('payday').value || null;
      ob.has13 = f('has13').checked;
      ob.hasFerias = f('hasFerias').checked;
      ob.feriasMonth = +f('feriasMonth').value;
      ob.other = U.parseMoney(f('other').value);
    }
    if (ob.step === 2) {
      const v = U.parseMoney(f('pay').value);
      if (v !== payFromPct()) {
        ob.payManual = true;
        ob.pay = v;
      } else if (!ob.payManual) ob.pay = v;
      ob.reserve = U.parseMoney(f('reserve').value);
    }
    if (ob.step === 3)
      ob.bills.forEach((b, i) => {
        b.on = el.querySelector(`[data-bill="${i}"]`).checked;
        b.amount = U.parseMoney(el.querySelector(`[data-bill-amt="${i}"]`).value);
        b.day = +el.querySelector(`[data-bill-day="${i}"]`).value || null;
        if (b.amount && !b.on) b.on = true;
      });
    if (ob.step === 4) ob.verbas.forEach((v, i) => (v.amount = U.parseMoney(el.querySelector(`[data-verba="${i}"]`).value)));
    if (ob.step === 5)
      ob.seasonal.forEach((s, i) => {
        s.on = el.querySelector(`[data-sea="${i}"]`).checked;
        s.amount = U.parseMoney(el.querySelector(`[data-sea-amt="${i}"]`).value);
        s.month = +el.querySelector(`[data-sea-month="${i}"]`).value;
        if (s.amount && !s.on) s.on = true;
      });
  };

  openSheet('<div class="ob-root"></div>', {
    cls: 'sheet-full',
    label: 'Montar o plano',
    onMount: (el, close) => {
      const root = $('.ob-root', el);
      const draw = () => {
        root.innerHTML = stepHTML();
        const box = root.querySelector('[data-chart="ob"]');
        if (box) {
          box._rows = M.projection({ core: { plan: buildLines() }, months: {} }, curMk(), 12);
          requestAnimationFrame(() => mountChart(box, box._rows));
        }
        el.closest('.sheet').scrollTop = 0;
      };
      const finish = async () => {
        const lines = buildLines();
        const replace = redo && S().core.plan.length > 0;
        if (replace && lines.length) {
          const ok = await confirmDialog({ title: 'Substituir o plano atual?', text: 'Os itens do plano serão trocados pelos deste assistente. Seus lançamentos continuam.', ok: 'Substituir' });
          if (!ok) return;
        }
        const events = A.applyOnboarding(lines, { name: ob.name, reserveStart: ob.reserve, replace: replace && lines.length > 0 });
        close();
        ctx.ui.tab = lines.length ? 'plano' : 'inicio';
        ctx.ui.animate = true;
        rerender();
        A.notify(lines.length ? 'Plano montado. Agora é só lançar e marcar as contas.' : 'Tudo certo. Monte o plano quando quiser.', events);
      };
      el.addEventListener('click', (e) => {
        const pct = e.target.closest('[data-pct]');
        if (pct) {
          collect(root);
          ob.pct = +pct.dataset.pct;
          ob.payManual = false;
          ob.pay = payFromPct();
          draw();
          return;
        }
        const b = e.target.closest('[data-ob]');
        if (!b) return;
        const a = b.dataset.ob;
        if (a === 'skip') {
          collect(root);
          S().core.settings.onboarded = true;
          if (ob.name) S().core.settings.name = ob.name;
          store.save(['core']);
          close();
          rerender();
          return;
        }
        if (a === 'finish') return finish();
        collect(root);
        if (a === 'next') {
          if (ob.step === 1 && !ob.payManual) ob.pay = payFromPct();
          ob.step++;
        }
        if (a === 'back') ob.step = Math.max(redo ? 1 : 0, ob.step - 1);
        draw();
      });
      el.addEventListener('change', (e) => {
        if (e.target.name === 'hasFerias') root.querySelector('[data-show="ferias"]').hidden = !e.target.checked;
        const bi = e.target.dataset.bill ?? e.target.dataset.sea;
        if (bi != null) e.target.closest('.ob-item').classList.toggle('on', e.target.checked);
      });
      el.addEventListener('input', (e) => {
        const amt = e.target.dataset.billAmt ?? e.target.dataset.seaAmt;
        if (amt != null && e.target.value) {
          const item = e.target.closest('.ob-item');
          item.classList.add('on');
          item.querySelector('input[type="checkbox"]').checked = true;
        }
        if (e.target.name === 'pay') {
          const v = U.parseMoney(e.target.value);
          $$('[data-pct]', root).forEach((x) => x.classList.remove('on'));
          ob.payManual = true;
          ob.pay = v;
          const calc = root.querySelector('[data-pay-calc]');
          if (calc) calc.innerHTML = v ? `= <b>${m0(v * 12)}</b> em um ano.` : 'Comece pequeno se precisar: o hábito importa mais do que o valor.';
        }
      });
      draw();
    },
    onClose: () => {
      if (first && !S().core.settings.onboarded) {
        S().core.settings.onboarded = true;
        store.save(['core']);
      }
    },
  });
}
