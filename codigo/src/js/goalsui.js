// Metas: criar/editar (quanto custa, para quando, quanto guardar por mês), ver o andamento e marcar "Guardei".
import { ctx, curMk } from './ctx.js';
import * as U from './util.js';
import * as M from './model.js';
import * as A from './actions.js';
import { $, IC, openSheet, sheetHead, confirmDialog, toast, confetti } from './ui.js';
import { monthPicker, readMonth } from './sheets.js';
import { txRowHTML } from './views.js';

const S = () => ctx.S;
const { esc } = U;
const m0 = (v) => U.money(v, { cents: false });
const rerender = () => ctx.render();
const mesesTxt = (n) => `${n} ${n === 1 ? 'mês' : 'meses'}`;

/** Criar ou editar uma meta. idea = atalho de GOAL_IDEAS (só preenche nome e emoji). */
export function openGoalEditor(goal = null, { idea = null } = {}) {
  const st = S();
  const cm = curMk();
  const isNew = !goal;
  const info = goal ? M.goalInfo(st, goal, cm) : null;
  const f = {
    name: goal ? goal.name : idea ? idea.name : '',
    emoji: goal ? goal.emoji : idea ? idea.emoji : '🎯',
    target: goal ? goal.target : 0,
    due: goal && goal.due && goal.due >= cm ? goal.due : U.addMonths(cm, 11),
    saved: goal ? info.saved : 0,
    monthly: goal ? info.planned : 0,
    plan: goal ? !!info.line : true,
  };
  let manual = !!(goal && info.line); // valor por mês digitado (ou o do plano): não recalcula sozinho

  openSheet(
    `${sheetHead(isNew ? 'Nova meta' : 'Editar meta', isNew ? 'Diga quanto custa e para quando: o app calcula quanto guardar por mês.' : '')}
    <form class="form goal-form">
      ${isNew ? `<div class="cat-chips">${M.GOAL_IDEAS.map((x, k) => `<button type="button" class="cchip sm ${idea && idea.name === x.name ? 'on' : ''}" data-idea="${k}"><span>${x.emoji}</span>${esc(x.name)}</button>`).join('')}</div>` : ''}
      <div class="emo-name">
        <label class="field emo-field"><span>Emoji</span><input name="emoji" maxlength="8" value="${esc(f.emoji)}" aria-label="Emoji da meta"></label>
        <label class="field"><span>Nome da meta</span><input name="name" maxlength="40" required value="${esc(f.name)}" placeholder="Ex.: Viagem em família"></label>
      </div>
      <label class="field"><span>Quanto custa?</span><div class="money-in"><span>R$</span><input name="target" inputmode="decimal" value="${U.moneyInput(f.target)}" placeholder="0,00"></div></label>
      <div class="field"><span>Para quando?</span>${monthPicker('due', f.due, { from: 0, to: 10 })}</div>
      <label class="field"><span>${isNew ? 'Já tem algum dinheiro guardado para ela? (opcional)' : 'Quanto já tem guardado para ela'}</span><div class="money-in"><span>R$</span><input name="saved" inputmode="decimal" value="${U.moneyInput(f.saved)}" placeholder="0,00"></div></label>
      <p class="calc" data-calc></p>
      <label class="tog inline"><input type="checkbox" name="plan" ${f.plan ? 'checked' : ''}><span>Pôr no plano: lembra todo mês em “Contas do mês”, para marcar “Guardei”</span></label>
      <label class="field" data-monthly ${f.plan ? '' : 'hidden'}><span>Guardar por mês</span><div class="money-in"><span>R$</span><input name="monthly" inputmode="decimal" value="${U.moneyInput(f.monthly)}" placeholder="0,00"></div><small class="help" data-eta></small></label>
      <p class="goal-impact" data-impact hidden></p>
      <div class="row-btns">${isNew ? '' : '<button type="button" class="btn ghost danger-text" data-del>Apagar meta</button>'}<button class="btn primary" type="submit">${isNew ? 'Criar meta' : 'Salvar'}</button></div>
    </form>`,
    {
      cls: 'sheet-tall',
      label: isNew ? 'Nova meta' : 'Editar meta',
      onMount: (el, close) => {
        const form = $('form', el);
        const E = form.elements;
        // sobra média do plano por mês (12 meses), sem contar o que esta meta já guarda hoje
        const split = M.planSplit(st, cm);
        const window12 = Array.from({ length: 12 }, (_, k) => U.addMonths(cm, k));
        const own = info && info.line ? U.sum(window12, (mk) => (M.occurs(info.line, mk) ? info.line.amount : 0)) / 12 : 0;
        const freeBase = split.sobra + own;
        const impact = () => {
          const box = $('[data-impact]', form);
          const monthly = E.plan.checked ? U.parseMoney(E.monthly.value) : 0;
          if (!split.renda || !monthly) return (box.hidden = true);
          const due = readMonth(form, 'due');
          const n = Math.min(12, Math.max(1, U.monthDiff(cm, due) + 1));
          const after = Math.round(freeBase - (monthly * n) / 12);
          box.hidden = false;
          box.classList.toggle('neg', after < 0);
          box.innerHTML =
            after < 0
              ? `<span class="flag-ic crit">!</span> Com esta meta, a sobra média do plano fica em <b>${m0(after)}</b> por mês: o plano vai para o vermelho. Diminua o valor por mês ou aumente o prazo.`
              : `Com esta meta, sobram em média <b>${m0(after)}</b> por mês no plano.`;
        };
        const calc = () => {
          const target = U.parseMoney(E.target.value);
          const saved = U.parseMoney(E.saved.value);
          const due = readMonth(form, 'due');
          const months = Math.max(1, U.monthDiff(cm, due) + 1);
          const left = Math.max(0, target - saved);
          const need = M.roundUp10(left / months);
          const out = $('[data-calc]', form);
          if (!target) out.innerHTML = 'Preencha quanto custa para ver quanto guardar por mês.';
          else if (!left) out.innerHTML = 'Você já tem o valor da meta! 🎉';
          else if (due < cm) out.innerHTML = 'Escolha um mês daqui para a frente.';
          else {
            const cur = U.parseMoney(E.monthly.value);
            out.innerHTML = `Faltam <b>${m0(left)}</b> em ${mesesTxt(months)}: guarde <b>${m0(need)}</b> por mês.${manual && E.plan.checked && cur !== need ? ` <button type="button" class="link" data-use="${need}">Usar ${m0(need)}</button>` : ''}`;
          }
          if (!manual) E.monthly.value = need ? U.moneyInput(need) : '';
          const monthly = U.parseMoney(E.monthly.value);
          const eta = $('[data-eta]', form);
          if (monthly > 0 && left > 0) {
            const at = U.addMonths(cm, Math.ceil(left / monthly) - 1);
            eta.textContent = `Nesse ritmo, chega lá em ${U.monthShortYear(at)}${at > due ? ' (depois do prazo)' : ''}.`;
          } else eta.textContent = '';
          impact();
        };
        form.addEventListener('input', (e) => {
          if (e.target === E.monthly) manual = true;
          calc();
        });
        form.addEventListener('change', (e) => {
          if (e.target === E.plan) $('[data-monthly]', form).hidden = !E.plan.checked;
          calc();
        });
        el.addEventListener('click', async (e) => {
          const ib = e.target.closest('[data-idea]');
          if (ib) {
            const x = M.GOAL_IDEAS[+ib.dataset.idea];
            E.name.value = x.name;
            E.emoji.value = x.emoji;
            el.querySelectorAll('[data-idea]').forEach((b) => b.classList.toggle('on', b === ib));
            if (!E.target.value) E.target.focus();
            return;
          }
          const use = e.target.closest('[data-use]');
          if (use) {
            E.monthly.value = U.moneyInput(+use.dataset.use);
            calc();
            return;
          }
          if (e.target.closest('[data-del]')) {
            const ok = await confirmDialog({ title: `Apagar “${esc(goal.name)}”?`, text: 'Ela sai das metas e do plano. O que já foi guardado continua no histórico, em “Metas”.', ok: 'Apagar', danger: true });
            if (!ok) return;
            A.deleteGoal(goal.id);
            close();
            rerender();
            toast('Meta apagada.');
          }
        });
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const name = E.name.value.trim().replace(/\s+/g, ' ');
          if (!name) return E.name.focus();
          const target = U.parseMoney(E.target.value);
          if (target <= 0) return E.target.focus();
          const due = readMonth(form, 'due');
          if (due < cm) return toast('Escolha um mês daqui para a frente.');
          const saved = Math.max(0, U.parseMoney(E.saved.value));
          const monthly = E.plan.checked ? Math.max(0, U.parseMoney(E.monthly.value)) : 0;
          const emoji = E.emoji.value.trim() || '🎯';
          const reds = () => M.projection(S(), cm, 12).filter((r) => r.saldo < 0).length;
          const red0 = reds();
          const warn = () => {
            const red1 = reds();
            return red1 > red0 ? ` <b>Atenção:</b> agora ${red1 === 1 ? '1 mês fecha' : `${red1} meses fecham`} no vermelho no plano.` : '';
          };
          if (isNew) {
            const { events } = A.createGoal({ name, emoji, target, due, saved0: saved, monthly });
            close();
            ctx.ui.tab = 'metas';
            rerender();
            A.notify(`${esc(emoji)} Meta criada: <b>${esc(name)}</b>.${monthly ? ` Os ${m0(monthly)} por mês já estão no plano.` : ''}${warn()}`, events, null, 6500);
          } else {
            const events = A.updateGoal(goal.id, { name, emoji, target, due, saved, monthly });
            close();
            rerender();
            A.notify(`Meta atualizada.${warn()}`, events);
          }
        });
        calc();
      },
    }
  );
}

function paceHTML(g, i) {
  if (g.done) return `<p class="gh-pace">Concluída em ${U.dayLabel(g.done).toLowerCase()}.</p>`;
  if (i.reached) return `<p class="gh-pace ok">🎉 Meta alcançada! Quando usar o dinheiro, toque em “Concluir”.</p>`;
  if (i.overdue) return `<p class="gh-pace late"><span class="flag-ic crit">!</span>O prazo (${U.monthShortYear(g.due)}) passou e faltam ${m0(i.left)}. Toque em “Editar” para escolher outro prazo.</p>`;
  if (!i.line) return `<p class="gh-pace">Sem valor por mês no plano. ${i.need ? `Para chegar até ${U.monthShortYear(g.due)}, guarde <b>${m0(i.need)}</b> por mês.` : ''}</p>`;
  if (i.late) return `<p class="gh-pace late"><span class="flag-ic crit">!</span>Para chegar até ${U.monthShortYear(g.due)}, guarde <b>${m0(i.need)}</b> por mês. No plano estão ${m0(i.planned)}${i.eta ? `: nesse ritmo, chega em ${U.monthShortYear(i.eta)}` : ''}.</p>`;
  return `<p class="gh-pace ok"><span class="ok-ic">${IC.check}</span>No ritmo: guardando ${m0(i.planned)} por mês, chega lá${i.eta ? ` em ${U.monthShortYear(i.eta)}` : ''}.</p>`;
}

/** Folha da meta: quanto já tem, ritmo, “Guardei” e os últimos depósitos. */
export function openGoal(id) {
  const st = S();
  const g = M.goalById(st, id);
  if (!g) return;
  const cm = curMk();
  const i = M.goalInfo(st, g, cm);
  const txs = [];
  for (const mk of Object.keys(st.months)) for (const t of st.months[mk].tx) if (t.c === g.cat) txs.push({ ...t, mk });
  txs.sort((a, b) => b.d.localeCompare(a.d) || (b.t || 0) - (a.t || 0));
  const pct = Math.round(i.pct * 100);

  openSheet(
    `<header class="sheet-head"><div><p class="eyebrow">Meta${g.done ? ' concluída' : ''}</p><h2>${esc(g.emoji || '🎯')} ${esc(g.name)}</h2></div><button class="icon-btn" data-sheet-close aria-label="Fechar">${IC.close}</button></header>
    <div class="goal-hero">
      <p class="gh-val"><b>${m0(i.saved)}</b> de ${m0(i.target)}</p>
      <div class="meter inv big" role="img" aria-label="${pct}% da meta"><i style="width:${(i.pct * 100).toFixed(1)}%"></i></div>
      <p class="gh-sub">${pct}% · ${i.reached ? 'meta alcançada' : `faltam ${m0(i.left)}`}${g.due ? ` · prazo: ${U.monthLabel(g.due)}` : ''}</p>
    </div>
    ${paceHTML(g, i)}
    ${
      g.done
        ? ''
        : `<div class="row-btns">${i.reached ? '<button type="button" class="btn lime" data-conclude>Concluir 🎉</button>' : '<button type="button" class="btn lime" data-deposit>Guardei</button>'}<button type="button" class="btn ghost" data-edit>Editar</button></div>`
    }
    <h3 class="group">Guardado nesta meta<span>${txs.length ? U.plural(txs.length, 'lançamento', 'lançamentos') : ''}</span></h3>
    ${txs.length ? `<ul class="txs">${txs.slice(0, 8).map(txRowHTML).join('')}</ul>` : `<p class="help">${g.saved0 ? `Você começou com ${m0(g.saved0)}. ` : ''}Cada “Guardei” aparece aqui. Também dá para lançar pelo <b>+</b> › Guardei › ${esc(g.name)}.</p>`}
    <div class="more-opts">
      ${g.done ? '<button type="button" class="link" data-reopen>Reabrir meta</button>' : i.reached ? '' : '<button type="button" class="link" data-conclude>Concluir agora (usei o dinheiro ou desisti)</button>'}
      <button type="button" class="link danger-text" data-del>Apagar meta</button>
    </div>`,
    {
      cls: 'sheet-tall',
      label: g.name,
      onMount: (el, close) => {
        el.addEventListener('click', async (e) => {
          if (e.target.closest('[data-edit]')) {
            close();
            setTimeout(() => openGoalEditor(M.goalById(S(), id)), 150);
            return;
          }
          if (e.target.closest('[data-deposit]')) {
            const v = await askAmount(g, i);
            if (!v) return;
            const res = A.goalDeposit(id, v);
            close();
            rerender();
            if (res)
              A.notify(`${esc(g.emoji || '🎯')} Guardado em ${esc(g.name)}: <b>${U.money(v)}</b>`, res.events, {
                label: 'Desfazer',
                fn: () => {
                  A.undoAdd(res);
                  A.refreshGoals();
                  rerender();
                  toast('Desfeito.');
                },
              });
            return;
          }
          if (e.target.closest('[data-conclude]')) {
            const ok = await confirmDialog({
              title: `Concluir “${esc(g.name)}”?`,
              text: `Ela sai da lista de metas e para de entrar no plano. ${i.reached ? 'Aproveite!' : 'O que você juntou fica no histórico.'}`,
              ok: 'Concluir',
            });
            if (!ok) return;
            A.concludeGoal(id);
            close();
            rerender();
            if (i.reached) confetti();
            toast(i.reached ? `${esc(g.emoji || '🎯')} Meta concluída. Você conseguiu!` : 'Meta concluída.');
            return;
          }
          if (e.target.closest('[data-reopen]')) {
            A.reopenGoal(id);
            close();
            rerender();
            toast('Meta reaberta.');
            return;
          }
          if (e.target.closest('[data-del]')) {
            const ok = await confirmDialog({ title: `Apagar “${esc(g.name)}”?`, text: 'Ela sai das metas e do plano. O que já foi guardado continua no histórico, em “Metas”.', ok: 'Apagar', danger: true });
            if (!ok) return;
            A.deleteGoal(id);
            close();
            rerender();
            toast('Meta apagada.');
          }
        });
      },
    }
  );
}

/** Pergunta quanto foi guardado (já vem com o valor do mês). Resolve com centavos ou 0. */
function askAmount(g, i) {
  const sug = i.planned || i.need || 0;
  return new Promise((resolve) => {
    let done = false;
    openSheet(
      `<div class="dialog"><h2>Quanto você guardou?</h2><p>${esc(g.emoji || '🎯')} ${esc(g.name)}</p>
      <form class="form"><div class="money-in"><span>R$</span><input name="v" inputmode="decimal" value="${U.moneyInput(Math.min(sug, i.left) || sug)}" placeholder="0,00" aria-label="Valor guardado"></div>
      <div class="row-btns"><button type="button" class="btn ghost" data-sheet-close>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form></div>`,
      {
        cls: 'sheet-dialog',
        onMount: (el, close) => {
          const f = $('form', el);
          f.addEventListener('submit', (e) => {
            e.preventDefault();
            const v = U.parseMoney(f.elements.v.value);
            if (v <= 0) return f.elements.v.focus();
            done = true;
            resolve(v);
            close();
          });
          setTimeout(() => {
            f.elements.v.focus();
            f.elements.v.select();
          }, 120);
        },
        onClose: () => {
          if (!done) resolve(0);
        },
      }
    );
  });
}

/** Outros investimentos (fora reserva e metas): informar quanto tem hoje. */
export function openInvestEdit() {
  const st = S();
  const sv = M.savings(st, curMk());
  openSheet(
    `${sheetHead('Outros investimentos', 'Fora a reserva de emergência e as metas: Tesouro, CDB, ações, previdência…')}
    <form class="form">
      <label class="field"><span>Quanto você tem hoje nesses investimentos?</span><div class="money-in"><span>R$</span><input name="v" inputmode="decimal" value="${U.moneyInput(sv.other)}" placeholder="0,00"></div>
      <small class="help">Daqui para a frente, cada “Guardei” em Investimentos soma aqui. Rendeu ou caiu? Volte e atualize quando quiser.</small></label>
      <button class="btn primary wide" type="submit">Salvar</button>
    </form>`,
    {
      onMount: (el, close) => {
        const form = $('form', el);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          A.setInvestStart(U.parseMoney(form.elements.v.value));
          close();
          rerender();
          toast('Investimentos atualizados.');
        });
      },
    }
  );
}
