// Telas principais: Início, Mês, Plano, Metas e Conquistas.
import { ctx, today, curMk } from './ctx.js';
import * as U from './util.js';
import * as M from './model.js';
import * as G from './game.js';
import { IC, $$ } from './ui.js';
import { projectionSVG } from './charts.js';

const S = () => ctx.S;
const { esc, money } = U;
const m0 = (v) => money(v, { cents: false });
let rv = 0; // índice para a entrada escalonada dos cartões
const reveal = () => `reveal" style="--i:${rv++}`;

function heroMoney(v, { cents = true } = {}) {
  if (!cents) return money(v, { cents: false });
  const s = money(v);
  const i = s.lastIndexOf(',');
  return `${s.slice(0, i)}<small>${s.slice(i)}</small>`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export const legendHTML = () =>
  `<div class="legend"><span><i class="sw in"></i>Entradas</span><span><i class="sw out"></i>Despesas</span><span><i class="sw inv"></i>Investimento</span><span><i class="sw-line"></i>Acumulado</span></div>`;

// ---------- topo ----------
export function topbarHTML() {
  const g = S().core.game;
  const lv = G.levelOf(g.xp);
  return `
  <button class="brand" data-act="tab" data-tab="inicio" aria-label="Folga, início"><span class="brand-mark">f</span><span class="brand-word">folga</span></button>
  <div class="top-actions">
    <button class="chip chip-level" data-act="tab" data-tab="conquistas" aria-label="Nível ${lv.level}, ${g.xp} XP">
      <span class="ring" style="--p:${Math.round(lv.pct * 100)}"><span>${lv.level}</span></span><b>${g.xp}</b><span class="xp-unit">XP</span>
    </button>
    <button class="icon-btn" data-act="settings" aria-label="Ajustes">${IC.settings}</button>
  </div>`;
}

// ---------- início ----------
/** O mês num olhar: a sobra prevista e quanto já foi gasto do previsto. O detalhe (previsto x realizado) fica na aba Mês. */
function monthCardHTML(c, hasPlan) {
  const hero = hasPlan ? c.saldoExp : c.saldoReal;
  const spent = c.real.despesa;
  const prev = c.prev.despesa;
  const pct = prev ? Math.round((spent / prev) * 100) : 0;
  const over = prev > 0 && spent > prev;
  return `<section class="card month-card ${reveal()}">
    <p class="eyebrow">${U.cap(U.monthName(c.mk))}</p>
    <p class="hero-label">${hasPlan ? 'Sobra prevista no fim do mês' : 'Saldo do mês até agora'}</p>
    <p class="hero ${hero < 0 ? 'neg' : ''}">${heroMoney(hero)}</p>
    ${hasPlan && hero < 0 ? '<p class="hero-sub"><span class="flag-ic crit">!</span> Pelo plano, este mês fecha no vermelho.</p>' : ''}
    ${
      prev
        ? `<div class="spent"><span>Gastou <b>${m0(spent)}</b> de ${m0(prev)}</span>${over ? `<span class="tile-flag"><span class="flag-ic crit">!</span>${m0(spent - prev)} acima</span>` : ''}</div>
    <div class="meter out" role="img" aria-label="${pct}% do previsto"><i style="width:${Math.min(100, pct)}%"></i></div>`
        : ''
    }
  </section>`;
}

function planCTAHTML() {
  return `<section class="card cta-card ${reveal()}">
    <h2>Monte seu plano em 2 minutos</h2>
    <p>Renda, contas e os gastos do ano: o app projeta os próximos 12 meses.</p>
    <button class="btn primary" data-act="onboarding">Montar meu plano</button>
  </section>`;
}

function comebackHTML(gap) {
  return `<section class="card note-card ${reveal()}">
    <span class="note-emo">🪃</span>
    <div>
      <h2>${gap} dias sem lançar? Tudo bem.</h2>
      <p>Importe o extrato ou faça um acerto aproximado.${gap >= G.COMEBACK_DAYS ? ' Voltar vale <b>+30 XP</b>.' : ''}</p>
      <div class="row-btns"><button class="btn primary" data-act="import">Importar extrato</button><button class="btn ghost" data-act="catchup">Acerto rápido</button></div>
      <button class="link" data-act="fresh-start">Só seguir daqui</button>
    </div>
  </section>`;
}

function checkinWindow() {
  const day = S().core.settings.checkinDay ?? 0;
  const until = (day - new Date().getDay() + 7) % 7;
  return until <= 1 || until >= 5;
}

function checkinCardHTML() {
  return `<section class="card note-card ${reveal()}">
    <span class="note-emo">📋</span>
    <div>
      <h2>Check-in da semana</h2>
      <p>2 minutos: contas, extrato e uma olhada no mês. <b>+50 XP</b></p>
      <button class="btn lime" data-act="checkin">Fazer check-in</button>
    </div>
  </section>`;
}

function dueText(line, mk, kind) {
  if (!line.day) return kind === 'receita' ? 'a receber' : kind === 'invest' ? 'a guardar' : 'a pagar';
  if (mk !== curMk()) return `dia ${line.day}`;
  const d = Math.min(line.day, U.daysInMonth(mk));
  const diff = d - new Date().getDate();
  if (kind === 'receita') return diff < 0 ? `previsto p/ dia ${d}` : diff === 0 ? 'cai hoje' : `cai dia ${d}`;
  if (kind === 'invest') return diff < 0 ? `previsto p/ dia ${d}` : diff === 0 ? 'guardar hoje' : `guardar dia ${d}`;
  if (diff === 0) return '<span class="due today">vence hoje</span>';
  if (diff === 1) return 'vence amanhã';
  if (diff < 0) return `<span class="due late">venceu dia ${d}</span>`;
  return `vence dia ${d}`;
}

export function billRowHTML({ line, tx }, mk, attr = 'data-act') {
  const cat = M.catById(S(), line.cat);
  const verb = line.kind === 'receita' ? 'Recebi' : line.kind === 'invest' ? 'Guardei' : 'Paguei';
  const doneVerb = line.kind === 'receita' ? 'Recebido' : line.kind === 'invest' ? 'Guardado' : 'Pago';
  const par = M.parcelaOf(line, mk);
  const sub = tx ? `${tx.auto ? 'Automático' : tx.im ? 'Do extrato' : doneVerb} · ${U.dayLabel(tx.d).toLowerCase()}` : dueText(line, mk, line.kind) + (line.auto ? ' · automático' : '');
  const a = (act) => `${attr}="${act}" data-line="${line.id}" data-mk="${mk}"`;
  return `<li class="bill ${tx ? 'done' : ''} k-${line.kind}">
    <button class="bill-main" ${a('bill-open')}>
      <span class="emo">${cat.emoji}</span>
      <span class="bill-txt"><b>${esc(line.name)}</b><small>${sub}${par ? ` · ${par.n}/${par.total}` : ''}</small></span>
      <span class="bill-amt">${line.kind === 'receita' ? '+' : ''}${m0(tx ? tx.v : line.amount)}</span>
    </button>
    <button class="tick ${tx ? 'on' : ''}" ${a(tx ? 'bill-undo' : 'bill-pay')} aria-label="${tx ? 'Desmarcar ' : verb + ': '}${esc(line.name)}">${tx ? IC.check : verb}</button>
  </li>`;
}

/** Entradas, despesas e o que é guardado, sempre nesta ordem e com as cores da legenda (como na tabela da aba Mês). */
const FLOWS = [
  { k: 'receita', cls: 'in', label: 'Entradas', bill: 'A receber' },
  { k: 'despesa', cls: 'out', label: 'Despesas', bill: 'A pagar' },
  { k: 'invest', cls: 'inv', label: 'Investimento', bill: 'A guardar' },
];

/** Contas separadas em “A receber”, “A pagar” e “A guardar”, para não misturar o que entra com o que sai. */
export function billsByFlowHTML(list, mk, attr = 'data-act') {
  return FLOWS.map((f) => {
    const items = list.filter((b) => b.line.kind === f.k);
    if (!items.length) return '';
    return `<div class="flow f-${f.cls}">
      <h3 class="flow-head"><i class="sw ${f.cls}"></i><b>${f.bill}</b></h3>
      <ul class="bills">${items.map((b) => billRowHTML(b, mk, attr)).join('')}</ul>
    </div>`;
  }).join('');
}

function billsHTML(c) {
  const done = c.bills.filter((b) => b.tx).length;
  const exp = ctx.ui.billsExpanded;
  const list = exp ? c.bills : c.bills.slice(0, 5);
  return `<section class="card ${reveal()}">
    <div class="card-head"><h2>Contas do mês</h2><span class="pill">${done} de ${c.bills.length}</span></div>
    ${billsByFlowHTML(list, c.mk)}
    ${c.bills.length > 5 ? `<button class="link more" data-act="bills-expand">${exp ? 'Mostrar menos' : `Ver todas (${c.bills.length})`}</button>` : ''}
  </section>`;
}

export function txRowHTML(t) {
  const cat = M.catById(S(), t.c);
  const refund = t.k === 'despesa' && t.v < 0;
  const sign = t.k === 'receita' || refund ? '+' : t.k === 'despesa' ? '−' : '';
  const tags = [t.ap ? 'aproximado' : '', t.im ? 'extrato' : '', t.auto ? 'automático' : '', refund ? 'estorno' : ''].filter(Boolean).join(' · ');
  return `<li><button class="tx" data-act="tx-open" data-id="${t.id}" data-mk="${t.mk}">
    <span class="emo">${cat.emoji}</span>
    <span class="tx-txt"><b>${esc(t.n || cat.name)}</b><small>${t.n ? esc(cat.name) + ' · ' : ''}${U.dayLabel(t.d)}${tags ? ' · ' + tags : ''}</small></span>
    <span class="tx-amt k-${refund ? 'receita' : t.k}">${sign}${money(Math.abs(t.v))}</span>
  </button></li>`;
}

// ---------- importar: o hábito principal ----------
/** Sem importar há 7 dias (ou nunca): o lembrete aparece no Início. */
function importDays() {
  const last = S().core.settings.lastImport;
  return last ? U.daysBetween(last, today()) : null;
}
const importDue = () => {
  const d = importDays();
  return d == null || d >= 7;
};

function importCardHTML() {
  const d = importDays();
  return `<section class="card note-card import-card ${reveal()}">
    <span class="note-emo">📥</span>
    <div>
      <h2>${d == null ? 'Importe a fatura ou o extrato' : `Faz ${d} dias da última importação`}</h2>
      <p>O app lança tudo sozinho e só pergunta as dúvidas.</p>
      <button class="btn lime" data-act="import">Importar agora</button>
    </div>
  </section>`;
}

export function homeHTML() {
  rv = 0;
  const st = S();
  const c = M.monthCalc(st, curMk());
  const hasPlan = st.core.plan.length > 0;
  const g = st.core.game;
  const gap = g.lastActive ? U.daysBetween(g.lastActive, today()) : null;
  const sk = G.streakOf(st.core, today());
  const name = st.core.settings.name;
  let h = `<section class="hello ${reveal()}"><p class="eyebrow">${U.longDate(today())}</p><h1>${greeting()}${name ? `, ${esc(name)}` : ''}</h1></section>`;
  if (!hasPlan) h += planCTAHTML();
  h += monthCardHTML(c, hasPlan);
  // um aviso por vez: a volta depois de uma pausa, a hora de importar ou o check-in da semana
  if (gap !== null && gap >= 2) h += comebackHTML(gap);
  else if (importDue()) h += importCardHTML();
  else if (!sk.checkinThisWeek && checkinWindow() && g.lastActive) h += checkinCardHTML();
  if (c.bills.length) h += billsHTML(c);
  return h;
}

// ---------- mês (previsto x realizado) ----------
/** Faixa que aparece quando os lançamentos estão filtrados por categoria, com o botão para ver todos de novo. */
function txFilterHTML(st, f) {
  const cat = M.catById(st, f.id);
  const gid = M.groupId(st, f.id);
  // num item, o grupo vai na linha de cima; “Geral” é o que foi lançado direto no grupo, sem escolher um item
  const geral = f.sub && gid === f.id;
  const where = f.sub ? ` · ${M.catById(st, gid).name}` : '';
  return `<div class="tx-filter" role="status">
    <span class="emo">${geral ? '•' : cat.emoji}</span>
    <span class="tf-txt"><small>Mostrando só${esc(where)}</small><b>${geral ? 'Geral' : esc(cat.name)}</b></span>
    <button class="btn small primary" data-act="tx-filter-clear">${IC.close}Ver todos</button>
  </div>`;
}

/** Lançamentos separados em entradas, despesas e investimento; dentro de cada parte, por dia (o mais novo primeiro). */
function txsByFlowHTML(txs, mk) {
  return FLOWS.map((fl) => {
    const list = txs.filter((t) => t.k === fl.k);
    if (!list.length) return '';
    const total = U.sum(list, (t) => t.v);
    // despesas saem (−), entradas entram (+); estornos podem deixar o total das despesas a favor
    const sign = fl.k === 'receita' ? '+' : fl.k === 'despesa' ? (total < 0 ? '+' : '−') : '';
    const byDay = {};
    for (const t of list) (byDay[t.d] ||= []).push({ ...t, mk });
    const days = Object.keys(byDay).sort().reverse();
    return `<div class="flow f-${fl.cls}">
      <h3 class="flow-head"><i class="sw ${fl.cls}"></i><b>${fl.label}</b><small>${list.length}</small><span class="flow-amt">${sign}${money(Math.abs(total))}</span></h3>
      ${days.map((d) => `<h4 class="day">${U.dayLabel(d)}</h4><ul class="txs">${byDay[d].sort((a, b) => (b.t || 0) - (a.t || 0)).map(txRowHTML).join('')}</ul>`).join('')}
    </div>`;
  }).join('');
}

export function monthHTML() {
  rv = 0;
  const st = S();
  const mk = ctx.ui.mk;
  const c = M.monthCalc(st, mk);
  const cm = curMk();
  const isCur = mk === cm;
  const future = mk > cm;
  const tr = (cls, label, p, r) => `<tr><th><i class="sw ${cls}"></i>${label}</th><td>${m0(p)}</td><td><b>${m0(r)}</b></td></tr>`;
  // como no extrato do banco: o saldo do fim do mês anterior entra no começo deste
  const carry = M.carryIn(st, mk);
  const neg = (v) => (v < 0 ? 'neg' : '');

  const f = ctx.ui.txFilter;
  const cats = Object.values(c.byCat)
    .filter((b) => b.kind === 'despesa' && (b.prev || b.real))
    .sort((a, b) => Math.max(b.prev, b.real) - Math.max(a.prev, a.real));
  const bullets = cats
    .map((b) => {
      const cat = M.catById(st, b.id);
      const max = Math.max(b.prev, b.real);
      const fill = max ? (b.real / max) * 100 : 0;
      const mark = b.prev && max ? (b.prev / max) * 100 : null;
      const over = b.prev > 0 && b.real > b.prev;
      const note = over
        ? `<p class="bl-flag"><span class="flag-ic crit">!</span>${m0(b.real - b.prev)} acima do previsto</p>`
        : b.prev && mk >= cm
          ? `<p class="bl-note">${b.real ? `Resta ${m0(b.prev - b.real)}` : 'Nada lançado ainda'}</p>`
          : !b.prev
            ? '<p class="bl-note">Fora do plano</p>'
            : '';
      const subs = Object.values(c.bySub)
        .filter((x) => M.groupId(st, x.id) === b.id && (x.prev || x.real))
        .sort((x, y) => Math.max(y.prev, y.real) - Math.max(x.prev, x.real));
      const canOpen = subs.length > 1 || (subs.length === 1 && subs[0].id !== b.id);
      const open = canOpen && ctx.ui.openCats.has(b.id);
      // tocar num item mostra, nos lançamentos, só os daquele item
      const drill = open
        ? `<ul class="drill">${subs
            .map((x) => {
              const sc = M.catById(st, x.id);
              const name = x.id === b.id ? 'Geral' : esc(sc.name);
              const on = !!f && f.sub && f.id === x.id;
              return `<li><button class="d-row${on ? ' on' : ''}" data-act="tx-filter" data-id="${x.id}" data-sub="1" aria-pressed="${on}" aria-label="Ver só os lançamentos de ${name}"><span>${x.id === b.id ? '•' : sc.emoji}</span><span class="d-name">${name}</span><span class="d-val"><b>${m0(x.real)}</b>${x.prev ? ` <small>/ ${m0(x.prev)}</small>` : ''}</span></button></li>`;
            })
            .join('')}</ul>`
        : '';
      const sel = !!f && !f.sub && f.id === b.id;
      return `<li class="bl ${over ? 'over' : ''}">
        <button class="emo emo-btn${sel ? ' on' : ''}" data-act="tx-filter" data-id="${b.id}" aria-pressed="${sel}" aria-label="Ver só os lançamentos de ${esc(cat.name)}">${cat.emoji}</button>
        <div class="bl-main">
          <div class="bl-top">${canOpen ? `<button class="bl-btn" data-act="cat-toggle" data-id="${b.id}" aria-expanded="${open}"><b>${esc(cat.name)}</b><span class="chev ${open ? 'up' : ''}">${IC.right}</span></button>` : `<b>${esc(cat.name)}</b>`}<span><b>${m0(b.real)}</b> <small>/ ${b.prev ? m0(b.prev) : '—'}</small></span></div>
          <div class="bullet" role="img" aria-label="${esc(cat.name)}: ${m0(b.real)} de ${b.prev ? m0(b.prev) : 'sem previsão'}"><i style="width:${fill.toFixed(1)}%"></i>${mark != null ? `<em style="left:${mark.toFixed(1)}%"></em>` : ''}</div>
          ${note}${drill}
        </div>
      </li>`;
    })
    .join('');

  const txs = f ? c.txs.filter((t) => (f.sub ? t.c === f.id : M.groupId(st, t.c) === f.id)) : c.txs;

  return `<section class="month-nav ${reveal()}">
      <button class="icon-btn" data-act="mk-prev" aria-label="Mês anterior">${IC.left}</button>
      <div><p class="eyebrow">${isCur ? 'Este mês' : mk > cm ? 'Mês futuro · só previsto' : 'Mês passado'}</p><h1>${U.monthLabel(mk)}</h1></div>
      <button class="icon-btn" data-act="mk-next" aria-label="Próximo mês">${IC.right}</button>
    </section>
    <section class="card ${reveal()}">
      <table class="pr-table">
        <thead><tr><th></th><th>Previsto</th><th>Realizado</th></tr></thead>
        <tbody>
          <tr class="carry"><th>Saldo anterior${future ? '' : ` <button class="link small" data-act="carry-edit" data-mk="${mk}">ajustar</button>`}</th><td class="${neg(carry)}">${m0(carry)}</td><td class="${future ? '' : neg(carry)}">${future ? '—' : m0(carry)}</td></tr>
          ${tr('in', 'Entradas', c.prev.receita, c.real.receita)}${tr('out', 'Despesas', c.prev.despesa, c.real.despesa)}${tr('inv', 'Investimento', c.prev.invest, c.real.invest)}
          <tr class="month-res"><th>Saldo do mês</th><td class="${neg(c.saldoPrev)}">${m0(c.saldoPrev)}</td><td class="${future ? '' : neg(c.saldoReal)}">${future ? '—' : m0(c.saldoReal)}</td></tr>
        </tbody>
        <tfoot><tr><th>Saldo final</th><td class="${neg(carry + c.saldoPrev)}">${m0(carry + c.saldoPrev)}</td><td class="${future ? '' : neg(carry + c.saldoReal)}"><b>${future ? '—' : m0(carry + c.saldoReal)}</b></td></tr></tfoot>
      </table>
    </section>
    <section class="card ${reveal()}">
      <div class="card-head"><h2>Gastos por categoria</h2></div>
      <p class="card-sub">Barra: quanto já foi. Traço: o previsto. Toque no ícone (ou num item aberto) para ver só os lançamentos dele.</p>
      ${bullets ? `<ul class="bullets">${bullets}</ul>` : `<div class="empty"><p>Sem gastos previstos ou lançados neste mês.</p></div>`}
    </section>
    <section class="card ${reveal()}" id="lancamentos">
      <div class="card-head"><h2>Lançamentos</h2><span class="pill">${f ? `${txs.length} de ${c.txs.length}` : c.txs.length}</span></div>
      ${f ? txFilterHTML(st, f) : ''}
      ${txs.length ? txsByFlowHTML(txs, mk) : `<div class="empty"><p>${f ? 'Nenhum lançamento desta categoria neste mês.' : 'Nenhum lançamento neste mês.'}</p></div>`}
    </section>`;
}

// ---------- plano (projeção) ----------
/**
 * Item dentro de um grupo do plano: mais leve que o grupo e com o nome inteiro à esquerda. O dia do vencimento
 * fica embaixo do valor (como o % embaixo do total do grupo); embaixo do nome, só o que o grupo ainda não diz
 * (mês do gasto anual, em que parcela está, quando acaba).
 */
function planItemHTML(l, mk) {
  const cat = M.catById(S(), l.cat);
  const meta = M.planMeta(l, mk);
  const day = M.planDay(l, mk);
  // item de uma meta abre a meta (valor, prazo e o que já foi guardado ficam juntos lá)
  const act = l.goal && M.goalById(S(), l.goal) ? `data-act="goal-open" data-id="${l.goal}"` : `data-act="line-open" data-line="${l.id}"`;
  return `<li${M.ended(l, mk) ? ' class="ended"' : ''}><button class="pl-item" ${act}>
    <span class="pl-emo">${cat.emoji}</span>
    <span class="pl-txt"><b>${esc(l.name)}</b>${meta ? `<small>${meta}</small>` : ''}</span>
    <span class="pl-amt">${m0(l.amount)}${day ? `<small>dia ${day}</small>` : ''}</span>
  </button></li>`;
}

/** Conferir o plano: por área, o que já está no plano e o que quase toda casa tem e ainda não entrou. */
function planCheckHTML(st, cm) {
  const ck = M.planCheck(st, cm);
  const done = ck.pending === 0;
  const status = done ? `<span class="ck-done"><span class="ok-ic">${IC.check}</span>Conferido</span>` : `<span class="pill">${ck.pending} para conferir</span>`;
  const sug = (c) => `<li class="ck-sug">
      <button class="ck-add" data-act="check-add" data-id="${c.id}" aria-label="Pôr ${esc(c.name)} no plano">${IC.plus}<span>${esc(c.name)}${c.yearly ? ' <small>todo ano</small>' : ''}</span></button>
      <button class="link small" data-act="check-skip" data-id="${c.id}" aria-label="Não tenho ${esc(c.name)}">Não tenho</button>
    </li>`;
  const area = (a) => `<li class="ck-area">
      <div class="ck-head"><span class="ck-emo">${a.emoji}</span><b>${esc(a.name)}</b>${a.pending.length ? '' : `<span class="ok-ic" role="img" aria-label="Conferido">${IC.check}</span>`}</div>
      ${a.items.length ? `<p class="ck-items">${a.items.map((l) => esc(l.name)).join(' · ')}</p>` : ''}
      ${a.pending.length ? `<ul class="ck-sugs">${a.pending.map(sug).join('')}</ul>` : ''}
    </li>`;
  const skipped = ck.skipped.length
    ? `<p class="ck-skipped">Você disse que não tem: ${ck.skipped.map((c) => `<button class="link small" data-act="check-undo" data-id="${c.id}" aria-label="Voltar ${esc(c.name)} para a lista">${esc(c.name)}</button>`).join(', ')}. Toque num deles para voltar à lista.</p>`
    : '';
  return `<details class="card table-card check-card ${reveal()}" data-keep="planCheck" ${ctx.ui.planCheck ? 'open' : ''}>
      <summary><span class="pg-txt"><b>Conferir o plano</b><small>Por área: o que já está e o que costuma ficar de fora</small></span>${status}<span class="chev">${IC.right}</span></summary>
      <p class="card-sub">${done ? 'Nada ficou de fora. Quando a vida mudar, confira de novo.' : 'Toque no item para pôr no plano, ou em “Não tenho” para tirar da lista.'}</p>
      <ul class="ck-list">${ck.areas.map(area).join('')}</ul>
      ${skipped}
    </details>`;
}

/** Barra fina dividida em partes, sem texto: as linhas logo abaixo trazem nome e valor de cada parte. */
function splitBarHTML(parts, label) {
  const shown = parts.filter((p) => p.v > 0);
  if (!shown.length) return '';
  const total = U.sum(shown, (p) => p.v);
  const desc = shown.map((p) => `${p.name}: ${m0(p.v)} (${Math.round((p.v / total) * 100)}%)`).join('; ');
  return `<div class="split-bar" role="img" aria-label="${esc(`${label}. ${desc}`)}">${shown.map((p) => `<i class="${p.cls}" style="flex-grow:${p.v}"></i>`).join('')}</div>`;
}

export function planHTML() {
  rv = 0;
  const st = S();
  const plan = st.core.plan;
  if (!plan.length) return planCTAHTML();
  const cm = curMk();
  const rows = M.projection(st, cm, 12);
  const last = rows[rows.length - 1];
  const neg = rows.filter((r) => r.saldo < 0);
  const s = M.planSplit(st, cm);
  const pct = (v) => (s.renda > 0 ? `${Math.round((v / s.renda) * 100)}%` : '');
  // os grupos do plano são as partes da renda: a mesma cor na barra e na linha do grupo
  const groups = [
    { id: 'receita', cls: 'in', name: 'Renda', v: s.renda, items: plan.filter((l) => l.kind === 'receita') },
    { id: 'fixas', cls: 'p-fixas', name: 'Contas fixas', v: s.fixas, items: plan.filter((l) => l.kind === 'despesa' && l.type !== 'verba' && l.rec === 'mensal') },
    { id: 'verbas', cls: 'p-verbas', name: 'Dia a dia', v: s.verbas, items: plan.filter((l) => l.kind === 'despesa' && l.type === 'verba') },
    { id: 'anuais', cls: 'p-anuais', name: 'Anuais e parcelas', v: s.anuais, sub: 'separe esse valor todo mês', items: plan.filter((l) => l.kind === 'despesa' && l.type !== 'verba' && l.rec !== 'mensal') },
    { id: 'guardar', cls: 'p-guardar', name: 'Guardar', v: s.guardar, items: plan.filter((l) => l.kind === 'invest') },
  ].filter((g) => g.items.length);
  const groupHTML = (gr) => {
    const open = ctx.ui.planOpen.has(gr.id);
    return `<div class="pg${open ? ' open' : ''}">
      <button class="pg-head" data-act="plan-group" data-id="${gr.id}" aria-expanded="${open}">
        <i class="sw ${gr.cls}"></i><span class="pg-txt"><b>${gr.name}</b><small>${gr.sub || U.plural(gr.items.length, 'item', 'itens')}</small></span>
        <span class="pg-amt">${m0(gr.v)}${gr.id === 'receita' ? '' : `<small>${pct(gr.v)}</small>`}</span><span class="chev ${open ? 'up' : ''}">${IC.right}</span>
      </button>
      ${open ? `<ul class="pl-list">${M.planOrder(gr.items, cm).map((l) => planItemHTML(l, cm)).join('')}</ul>` : ''}
    </div>`;
  };
  const parts = [...groups.filter((g) => g.id !== 'receita').map((g) => ({ cls: g.cls, name: g.name, v: g.v })), { cls: 'p-sobra', name: 'Sobra livre', v: Math.max(0, s.sobra) }];
  const sobraRow = `<div class="pg pg-static"><div class="pg-head"><i class="sw p-sobra"></i><span class="pg-txt"><b>${s.sobra < 0 ? 'Falta' : 'Sobra livre'}</b></span><span class="pg-amt ${s.sobra < 0 ? 'neg' : ''}">${m0(Math.abs(s.sobra))}<small>${s.sobra < 0 ? '' : pct(s.sobra)}</small></span><span class="chev-space"></span></div></div>`;
  const redMonths = neg.length > 4 ? `${neg.slice(0, 3).map((r) => U.monthShortYear(r.mk)).join(', ')} e mais ${neg.length - 3}` : U.listPT(neg.map((r) => U.monthShortYear(r.mk)));
  const redText = neg.length
    ? `<span class="flag-ic crit">!</span><span>${esc(redMonths)} ${neg.length === 1 ? 'fecha' : 'fecham'} no vermelho. Toque no mês para ver o porquê.</span>`
    : `<span class="ok-ic">${IC.check}</span><span>Nenhum mês no vermelho.</span>`;

  return `<section class="card ${reveal()}">
      <p class="hero-label">Sobra acumulada em 12 meses</p>
      <p class="hero ${last.acc < 0 ? 'neg' : ''}">${heroMoney(last.acc, { cents: false })}</p>
      <p class="hero-sub">${redText}</p>
      ${legendHTML()}
      <div class="chart-box" data-chart="plan"></div>
      <div class="m-detail" data-month-detail aria-live="polite"></div>
    </section>
    <section class="card ${reveal()}">
      <div class="card-head"><h2>Itens do plano</h2><button class="btn small lime" data-act="line-new">${IC.plus}Adicionar</button></div>
      <p class="eyebrow pg-eyebrow">Média por mês</p>
      ${splitBarHTML(parts, 'Para onde vai a renda, média por mês')}
      <div class="pg-list">${groups.map(groupHTML).join('')}${sobraRow}</div>
    </section>
    ${planCheckHTML(st, cm)}
    <details class="card table-card ${reveal()}" data-keep="planTable" ${ctx.ui.planTable ? 'open' : ''}>
      <summary><span class="pg-txt"><b>Tabela mês a mês</b><small>Como na planilha: entra, sai, sobra e acumulado</small></span><span class="chev">${IC.right}</span></summary>
      <table class="proj-table">
        <thead><tr><th>Mês</th><th>Entra</th><th>Sai</th><th>Sobra</th><th>Acumulado</th></tr></thead>
        <tbody>${rows
          .map(
            (r) =>
              `<tr class="${r.saldo < 0 ? 'row-neg' : ''}"><th>${U.monthShortYear(r.mk)}</th><td>${U.num(r.receita)}</td><td>${U.num(r.despesa + r.invest)}</td><td>${r.saldo < 0 ? '<span class="flag-ic crit">!</span>' : ''}${U.num(r.saldo)}</td><td class="${r.acc < 0 ? 'neg' : 'muted'}">${U.num(r.acc)}</td></tr>${r.extras.length ? `<tr class="extras"><td colspan="5">${esc(r.extras.map((l) => l.name).join(' · '))}</td></tr>` : ''}`
          )
          .join('')}</tbody>
      </table>
      <p class="card-sub">“Sai” inclui o que você guarda. “Acumulado” é a sobra somada mês a mês, se tudo sair como planejado.</p>
    </details>`;
}

// ---------- metas e investimentos ----------
/** Uma linha de progresso: reserva, metas e investimentos usam o mesmo formato. */
function progressRow({ act, id = '', emoji, name, pct = null, line }) {
  return `<li><button class="goal" data-act="${act}"${id ? ` data-id="${id}"` : ''}>
    <span class="emo">${emoji}</span>
    <span class="g-main">
      <span class="g-top"><b>${name}</b>${pct != null ? `<span class="g-pct">${pct}%</span>` : ''}</span>
      ${pct != null ? `<span class="meter inv" role="img" aria-label="${pct}%"><i style="width:${pct}%"></i></span>` : ''}
      <small>${line}</small>
    </span>
  </button></li>`;
}

function reserveRow(st, cm) {
  const cv = M.custoDeVida(st, cm);
  const res = M.reserveBalance(st);
  const goal = st.core.settings.reserveGoalMonths || 6;
  const months = cv ? res / cv : 0;
  return progressRow({
    act: 'reserve-edit',
    emoji: '🛟',
    name: 'Reserva de emergência',
    pct: cv ? Math.round(Math.min(1, Math.max(0, months / goal)) * 100) : null,
    line: cv ? `${m0(res)} de ${m0(cv * goal)} · ${months.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} de ${goal} meses` : `${m0(res)} guardados`,
  });
}

function goalRow(g, i) {
  const status = i.reached
    ? ' · 🎉 alcançada'
    : i.overdue || i.late
      ? ' · <span class="late"><span class="flag-ic crit">!</span> atrasada</span>'
      : '';
  return progressRow({
    act: 'goal-open',
    id: g.id,
    emoji: esc(g.emoji || '🎯'),
    name: esc(g.name),
    pct: Math.round(i.pct * 100),
    line: `${m0(i.saved)} de ${m0(i.target)}${i.planned ? ` · ${m0(i.planned)}/mês` : ''}${g.due ? ` · até ${U.monthShortYear(g.due)}` : ''}${status}`,
  });
}

export function goalsHTML() {
  rv = 0;
  const st = S();
  const cm = curMk();
  const sv = M.savings(st, cm);
  const by = M.investByCat(st);
  const active = M.activeGoals(st)
    .map((g) => ({ g, i: M.goalInfo(st, g, cm, by) }))
    .sort((a, b) => (a.g.due || '9999').localeCompare(b.g.due || '9999'));
  const done = (st.core.goals || []).filter((g) => g.done);
  const doneList = ctx.ui.showDoneGoals
    ? `<ul class="goals done">${done
        .map((g) => {
          const i = M.goalInfo(st, g, cm, by);
          return progressRow({ act: 'goal-open', id: g.id, emoji: esc(g.emoji || '🎯'), name: esc(g.name), line: `Concluída · juntou ${m0(i.saved)}` });
        })
        .join('')}</ul>`
    : '';

  return `<section class="card ${reveal()}">
      <p class="hero-label">Guardado até agora</p>
      <p class="hero">${heroMoney(sv.total)}</p>
      <p class="hero-sub">Em 12 meses, no ritmo do plano: <b>${m0(sv.in12)}</b></p>
    </section>
    <section class="card ${reveal()}">
      <div class="card-head"><h2>Minhas metas</h2><button class="btn small lime" data-act="goal-new">${IC.plus}Nova meta</button></div>
      <ul class="goals">
        ${reserveRow(st, cm)}
        ${active.map(({ g, i }) => goalRow(g, i)).join('')}
        ${progressRow({ act: 'invest-edit', emoji: '💼', name: 'Outros investimentos', line: sv.other ? m0(sv.other) : 'Toque para informar' })}
      </ul>
      ${active.length ? '' : `<div class="cat-chips goal-ideas">${M.GOAL_IDEAS.map((x, k) => `<button type="button" class="cchip sm" data-act="goal-new" data-idea="${k}"><span>${x.emoji}</span>${esc(x.name)}</button>`).join('')}</div>`}
      ${done.length ? `<button class="link more" data-act="goals-done">${ctx.ui.showDoneGoals ? 'Esconder concluídas' : `Ver concluídas (${done.length})`}</button>${doneList}` : ''}
    </section>`;
}

// ---------- conquistas ----------
export function gameHTML() {
  rv = 0;
  const st = S();
  const g = st.core.game;
  const lv = G.levelOf(g.xp);
  const sk = G.streakOf(st.core, today());
  const earned = G.BADGES.filter((b) => g.badges[b.id]).length;
  return `<section class="page-head ${reveal()}"><h1>Conquistas</h1></section>
    <section class="card level-card ${reveal()}">
      <div class="lv-badge"><span>${lv.level}</span></div>
      <div class="lv-txt"><p class="eyebrow">Nível ${lv.level}</p><h2>${lv.name}</h2>
        <div class="xpbar" role="img" aria-label="${Math.round(lv.pct * 100)}% para o próximo nível"><i style="width:${(lv.pct * 100).toFixed(1)}%"></i></div>
        <p class="muted">${g.xp} XP${lv.to ? ` · faltam ${lv.to - g.xp} para “${lv.nextName}”` : ' · nível máximo!'}</p></div>
    </section>
    <section class="card ${reveal()}">
      <div class="card-head"><h2>🔥 ${sk.current} ${sk.current === 1 ? 'semana' : 'semanas'} em dia</h2><span class="pill">recorde ${sk.best}</span></div>
      <div class="weeks" role="img" aria-label="Últimas 12 semanas">${sk.weeks.map((w) => `<span class="wk ${w.active ? 'on' : ''} ${w.checkin ? 'ck' : ''} ${w.current ? 'cur' : ''}"></span>`).join('')}</div>
    </section>
    <section class="card ${reveal()}">
      <div class="card-head"><h2>Medalhas</h2><span class="pill">${earned}/${G.BADGES.length}</span></div>
      <div class="badges compact">${G.BADGES.map((b) => `<button type="button" class="badge ${g.badges[b.id] ? 'on' : ''}" data-act="badge-info" data-id="${b.id}"><span class="b-emo">${b.emoji}</span><b>${b.name}</b></button>`).join('')}</div>
    </section>`;
}

// ---------- gráficos ----------
/** Valores de um mês da projeção (painel fixo abaixo do gráfico, na aba Plano). */
function monthDetailHTML(r) {
  const neg = r.saldo < 0;
  return `<div class="md-head"><b>${U.monthLabel(r.mk)}</b>${neg ? '<span class="md-flag"><span class="flag-ic crit">!</span>no vermelho</span>' : ''}</div>
    <dl class="md-grid">
      <dt><i class="sw in"></i>Entra</dt><dd>${m0(r.receita)}</dd>
      <dt><i class="sw out"></i>Despesas</dt><dd>${m0(r.despesa)}</dd>
      <dt><i class="sw inv"></i>Investimento</dt><dd>${m0(r.invest)}</dd>
      <dt class="md-sum">Sobra do mês</dt><dd class="md-sum ${neg ? 'neg' : ''}">${m0(r.saldo)}</dd>
      <dt><i class="sw-line"></i>Acumulado</dt><dd class="${r.acc < 0 ? 'neg' : ''}">${m0(r.acc)}</dd>
    </dl>
    ${r.extras.length ? `<p class="md-extras">Extras do mês: ${esc(U.listPT(r.extras.map((l) => l.name)))}</p>` : ''}`;
}

/**
 * Monta o gráfico de projeção. Com panel, tocar num mês mostra os valores no painel (aba Plano);
 * sem panel, num balão ao lado da coluna.
 */
export function mountChart(box, rows, { panel = null, initial = 0, onSelect = null } = {}) {
  if (!box) return;
  const w = box.clientWidth || 320;
  box.innerHTML = projectionSVG(rows, w) + (panel ? '' : '<div class="c-tip" hidden></div>');
  const svgEl = box.querySelector('svg');
  const tip = box.querySelector('.c-tip');
  const mark = (i) => {
    $$('.c-hit', svgEl).forEach((h) => h.classList.toggle('on', +h.dataset.tip === i));
    $$('.c-accdot', svgEl).forEach((d) => d.classList.toggle('on', +d.dataset.i === i));
  };
  const show = (i) => {
    const r = rows[i];
    if (!r) return;
    mark(i);
    if (panel) {
      panel.innerHTML = monthDetailHTML(r);
      if (onSelect) onSelect(i);
      return;
    }
    tip.innerHTML = `<b>${U.monthLabel(r.mk)}</b>
      <span><i class="sw in"></i>Entradas<em>${m0(r.receita)}</em></span>
      <span><i class="sw out"></i>Despesas<em>${m0(r.despesa)}</em></span>
      <span><i class="sw inv"></i>Investimento<em>${m0(r.invest)}</em></span>
      <span class="tip-total">Sobra<em class="${r.saldo < 0 ? 'neg' : ''}">${m0(r.saldo)}</em></span>
      <span><i class="sw-line"></i>Acumulado<em class="${r.acc < 0 ? 'neg' : ''}">${m0(r.acc)}</em></span>
      ${r.extras.length ? `<small>${esc(r.extras.map((l) => l.name).join(' · '))}</small>` : ''}`;
    tip.hidden = false;
    const hit = svgEl.querySelector(`.c-hit[data-tip="${i}"]`);
    const x = +hit.getAttribute('x');
    const sw = +hit.getAttribute('width');
    const tw = tip.offsetWidth;
    // ao lado da coluna, para não cobrir as barras que estão sendo lidas
    const left = x + sw / 2 < w / 2 ? x + sw + 4 : x - tw - 4;
    tip.style.left = `${U.clamp(left, 0, w - tw)}px`;
  };
  const hide = () => {
    if (panel) return;
    tip.hidden = true;
    mark(-1);
  };
  svgEl.addEventListener('pointerover', (e) => {
    const h = e.target.closest('.c-hit');
    if (h && (!panel || e.pointerType === 'mouse')) show(+h.dataset.tip);
  });
  svgEl.addEventListener('click', (e) => {
    const h = e.target.closest('.c-hit');
    if (h) show(+h.dataset.tip);
  });
  svgEl.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') hide();
  });
  if (panel) show(Math.min(rows.length - 1, Math.max(0, initial)));
}

export function mountCharts(root) {
  for (const box of $$('[data-chart]', root)) {
    const kind = box.dataset.chart;
    if (kind === 'home') mountChart(box, M.projection(S(), curMk(), 6));
    else if (kind === 'plan') {
      const rows = M.projection(S(), curMk(), 12);
      const firstNeg = rows.findIndex((r) => r.saldo < 0);
      mountChart(box, rows, {
        panel: root.querySelector('[data-month-detail]'),
        initial: ctx.ui.planSel ?? Math.max(0, firstNeg),
        onSelect: (i) => (ctx.ui.planSel = i),
      });
    } else if (box._rows) mountChart(box, box._rows);
  }
}
