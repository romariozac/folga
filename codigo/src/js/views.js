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

// a curva do acumulado tem faixa própria, com título, logo abaixo das barras (não precisa entrar na legenda)
export const legendHTML = () =>
  `<div class="legend"><span><i class="sw in"></i>Entradas</span><span><i class="sw out"></i>Despesas</span><span><i class="sw inv"></i>Investimento</span></div>`;

// ---------- topo ----------
export function topbarHTML() {
  const g = S().core.game;
  const lv = G.levelOf(g.xp);
  const sk = G.streakOf(S().core, today());
  return `
  <button class="brand" data-act="tab" data-tab="inicio" aria-label="Folga, início"><span class="brand-mark">f</span><span class="brand-word">folga</span></button>
  <div class="top-actions">
    ${sk.current ? `<button class="chip" data-act="tab" data-tab="conquistas" aria-label="${sk.current} semanas em dia">🔥<b>${sk.current}</b></button>` : ''}
    <button class="chip chip-level" data-act="tab" data-tab="conquistas" aria-label="Nível ${lv.level}, ${g.xp} XP">
      <span class="ring" style="--p:${Math.round(lv.pct * 100)}"><span>${lv.level}</span></span><b>${g.xp}</b><span class="xp-unit">XP</span>
    </button>
    <button class="icon-btn" data-act="settings" aria-label="Ajustes">${IC.settings}</button>
  </div>`;
}

// ---------- início ----------
function tile(kind, label, real, prev) {
  const pct = prev ? Math.round((real / prev) * 100) : 0;
  const over = kind === 'out' && prev && real > prev;
  return `<div class="tile ${kind}">
    <span class="tile-label"><i class="sw ${kind}"></i>${label}</span>
    <b class="tile-value">${m0(real)}</b>
    <span class="tile-prev">${prev ? `de ${m0(prev)} previstos` : 'sem previsão'}</span>
    <div class="meter ${kind}" role="img" aria-label="${prev ? pct + '% do previsto' : 'sem previsão'}"><i style="width:${Math.min(100, pct)}%"></i></div>
    ${over ? `<span class="tile-flag"><span class="flag-ic crit">!</span>${m0(real - prev)} acima</span>` : ''}
  </div>`;
}

function monthCardHTML(c, hasPlan) {
  const hero = hasPlan ? c.saldoExp : c.saldoReal;
  const inv = c.prev.invest || c.real.invest;
  return `<section class="card month-card ${reveal()}">
    <div class="card-head"><span class="eyebrow">${U.cap(U.monthName(c.mk))} · este mês</span><button class="link" data-act="tab" data-tab="mes">Previsto x realizado ${IC.right}</button></div>
    <p class="hero-label">${hasPlan ? 'Previsão de sobra no fim do mês' : 'Saldo do mês até agora'}</p>
    <p class="hero ${hero < 0 ? 'neg' : ''}">${heroMoney(hero)}</p>
    <p class="hero-sub">${hasPlan ? (hero < 0 ? '<span class="flag-ic crit">!</span> Pelo plano, este mês fecha no vermelho. Veja onde ajustar na aba Mês.' : 'Se o resto do mês seguir o plano.') : 'Monte o plano para ver a previsão do mês.'}</p>
    <div class="tiles">${tile('in', 'Entrou', c.real.receita, c.prev.receita)}${tile('out', 'Gastou', c.real.despesa, c.prev.despesa)}</div>
    ${inv ? `<div class="invest-row"><i class="sw inv"></i><span class="inv-txt"><small>Pague-se primeiro</small><span>Guardou <b>${m0(c.real.invest)}</b>${c.prev.invest ? ` de ${m0(c.prev.invest)}` : ''}</span></span>${c.prev.invest && c.real.invest >= c.prev.invest ? `<span class="ok">${IC.check}</span>` : ''}</div>` : ''}
  </section>`;
}

function planCTAHTML() {
  return `<section class="card cta-card ${reveal()}">
    <p class="eyebrow">Comece por aqui</p>
    <h2>Monte seu plano em 2 minutos</h2>
    <p>Renda, contas fixas, gastos do dia a dia e os “sustos do ano” (IPVA, IPTU, material escolar). O app projeta os próximos 12 meses, como a planilha do Cerbasi.</p>
    <button class="btn primary" data-act="onboarding">Montar meu plano</button>
  </section>`;
}

function comebackHTML(gap) {
  return `<section class="card note-card ${reveal()}">
    <span class="note-emo">🪃</span>
    <div>
      <h2>${gap} dias sem lançar? Tudo bem.</h2>
      <p>Não precisa lembrar de tudo. Importe o extrato (o app lança sozinho) ou faça um acerto aproximado.${gap >= G.COMEBACK_DAYS ? ' Voltar vale <b>+30 XP</b>.' : ''}</p>
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
      <p>Uns 2 minutos: contas, o que faltou lançar e uma olhada no mês. Cerbasi sugere controle semanal ou quinzenal, não diário. <b>+50 XP</b></p>
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

function billsHTML(c) {
  const done = c.bills.filter((b) => b.tx).length;
  const exp = ctx.ui.billsExpanded;
  const list = exp ? c.bills : c.bills.slice(0, 5);
  return `<section class="card ${reveal()}">
    <div class="card-head"><h2>Contas do mês</h2><span class="pill">${done} de ${c.bills.length}</span></div>
    <p class="card-sub">Vêm do seu plano. Um toque e está marcado.</p>
    <ul class="bills">${list.map((b) => billRowHTML(b, c.mk)).join('')}</ul>
    ${c.bills.length > 5 ? `<button class="link more" data-act="bills-expand">${exp ? 'Mostrar menos' : `Ver todas (${c.bills.length})`}</button>` : ''}
  </section>`;
}

function alertsHTML(rows, max = 2) {
  const neg = rows.filter((r) => r.saldo < 0);
  if (!neg.length) return `<p class="ok-line">${IC.check} Nenhum mês no vermelho à vista.</p>`;
  return `<ul class="alerts">${neg
    .slice(0, max)
    .map(
      (r) =>
        `<li><span class="flag-ic crit">!</span><span><b>${U.cap(U.monthName(r.mk))}</b>: saídas maiores que entradas (${m0(r.saldo)})${r.extras.length ? `, por causa de ${esc(U.listPT(r.extras.map((l) => l.name).slice(0, 3)))}` : ''}.</span></li>`
    )
    .join('')}${neg.length > max ? `<li class="muted">e mais ${neg.length - max} ${neg.length - max === 1 ? 'mês' : 'meses'}.</li>` : ''}</ul>`;
}

function projPreviewHTML() {
  const rows = M.projection(S(), curMk(), 6);
  return `<section class="card ${reveal()}">
    <div class="card-head"><h2>Próximos 6 meses</h2><button class="link" data-act="tab" data-tab="plano">Plano completo ${IC.right}</button></div>
    <p class="card-sub">Quanto vai entrar e sair, pelo seu plano. Toque numa coluna para ver os valores.</p>
    ${legendHTML()}
    <div class="chart-box" data-chart="home"></div>
    ${alertsHTML(rows)}
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

function recentHTML() {
  const list = M.recentTx(S(), 6);
  return `<section class="card ${reveal()}">
    <div class="card-head"><h2>Últimos lançamentos</h2>${list.length ? `<button class="link" data-act="tab" data-tab="mes">Ver o mês ${IC.right}</button>` : ''}</div>
    ${list.length ? `<ul class="txs">${list.map(txRowHTML).join('')}</ul>` : `<div class="empty"><p>Nada lançado ainda. Toque no <b>+</b> aqui embaixo (valor, categoria, pronto) ou importe o extrato do banco.</p></div>`}
    <button class="imp-drop slim" data-act="import"><span class="imp-ic">📥</span><span><b>Importar extrato ou fatura</b><small>O app lança sozinho e só pergunta as dúvidas</small></span></button>
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
  if (gap !== null && gap >= 2) h += comebackHTML(gap);
  else if (!sk.checkinThisWeek && checkinWindow() && g.lastActive) h += checkinCardHTML();
  if (c.bills.length) h += billsHTML(c);
  if (hasPlan) h += projPreviewHTML();
  h += recentHTML();
  return h;
}

// ---------- mês (previsto x realizado) ----------
export function monthHTML() {
  rv = 0;
  const st = S();
  const mk = ctx.ui.mk;
  const c = M.monthCalc(st, mk);
  const cm = curMk();
  const isCur = mk === cm;
  const hasPlan = st.core.plan.length > 0;
  const tr = (cls, label, p, r) => `<tr><th><i class="sw ${cls}"></i>${label}</th><td>${m0(p)}</td><td><b>${m0(r)}</b></td></tr>`;

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
      const drill = open
        ? `<ul class="drill">${subs
            .map((x) => {
              const sc = M.catById(st, x.id);
              return `<li><span>${x.id === b.id ? '•' : sc.emoji}</span><span class="d-name">${x.id === b.id ? 'Geral' : esc(sc.name)}</span><span class="d-val"><b>${m0(x.real)}</b>${x.prev ? ` <small>/ ${m0(x.prev)}</small>` : ''}</span></li>`;
            })
            .join('')}</ul>`
        : '';
      return `<li class="bl ${over ? 'over' : ''}">
        <span class="emo">${cat.emoji}</span>
        <div class="bl-main">
          <div class="bl-top">${canOpen ? `<button class="bl-btn" data-act="cat-toggle" data-id="${b.id}" aria-expanded="${open}"><b>${esc(cat.name)}</b><span class="chev ${open ? 'up' : ''}">${IC.right}</span></button>` : `<b>${esc(cat.name)}</b>`}<span><b>${m0(b.real)}</b> <small>/ ${b.prev ? m0(b.prev) : '—'}</small></span></div>
          <div class="bullet" role="img" aria-label="${esc(cat.name)}: ${m0(b.real)} de ${b.prev ? m0(b.prev) : 'sem previsão'}"><i style="width:${fill.toFixed(1)}%"></i>${mark != null ? `<em style="left:${mark.toFixed(1)}%"></em>` : ''}</div>
          ${note}${drill}
        </div>
      </li>`;
    })
    .join('');

  const byDay = {};
  for (const t of c.txs) (byDay[t.d] ||= []).push({ ...t, mk });
  const days = Object.keys(byDay).sort().reverse();

  return `<section class="month-nav ${reveal()}">
      <button class="icon-btn" data-act="mk-prev" aria-label="Mês anterior">${IC.left}</button>
      <div><p class="eyebrow">${isCur ? 'Este mês' : mk > cm ? 'Mês futuro · só previsto' : 'Mês passado'}</p><h1>${U.monthLabel(mk)}</h1></div>
      <button class="icon-btn" data-act="mk-next" aria-label="Próximo mês">${IC.right}</button>
    </section>
    <section class="card ${reveal()}">
      <table class="pr-table">
        <thead><tr><th></th><th>Previsto</th><th>Realizado</th></tr></thead>
        <tbody>${tr('in', 'Entradas', c.prev.receita, c.real.receita)}${tr('out', 'Despesas', c.prev.despesa, c.real.despesa)}${tr('inv', 'Investimento', c.prev.invest, c.real.invest)}</tbody>
        <tfoot><tr><th>Saldo</th><td class="${c.saldoPrev < 0 ? 'neg' : ''}">${m0(c.saldoPrev)}</td><td class="${c.saldoReal < 0 ? 'neg' : ''}"><b>${m0(c.saldoReal)}</b></td></tr></tfoot>
      </table>
      ${isCur && hasPlan ? `<p class="card-sub">Previsão de sobra no fim do mês: <b class="${c.saldoExp < 0 ? 'neg' : ''}">${money(c.saldoExp)}</b>.</p>` : ''}
    </section>
    <section class="card ${reveal()}">
      <div class="card-head"><h2>Gastos por categoria</h2></div>
      <p class="card-sub">A barra é quanto já foi; o traço é o previsto no plano. Toque no nome para ver os detalhes.</p>
      ${bullets ? `<ul class="bullets">${bullets}</ul>` : `<div class="empty"><p>Sem gastos previstos ou lançados neste mês.</p></div>`}
    </section>
    <section class="card ${reveal()}">
      <div class="card-head"><h2>Lançamentos</h2><span class="pill">${c.txs.length}</span></div>
      ${days.length ? days.map((d) => `<h3 class="day">${U.dayLabel(d)}</h3><ul class="txs">${byDay[d].sort((a, b) => (b.t || 0) - (a.t || 0)).map(txRowHTML).join('')}</ul>`).join('') : `<div class="empty"><p>Nenhum lançamento neste mês.</p></div>`}
    </section>`;
}

// ---------- plano (projeção) ----------
function planItemHTML(l) {
  const cat = M.catById(S(), l.cat);
  // item de uma meta abre a meta (valor, prazo e o que já foi guardado ficam juntos lá)
  const act = l.goal && M.goalById(S(), l.goal) ? `data-act="goal-open" data-id="${l.goal}"` : `data-act="line-open" data-line="${l.id}"`;
  return `<li><button class="pl-item" ${act}>
    <span class="emo">${cat.emoji}</span>
    <span class="pl-txt"><b>${esc(l.name)}</b><small>${M.recText(l)}</small></span>
    <span class="pl-amt">${m0(l.amount)}</span>
  </button></li>`;
}

/** Barra fina dividida em partes, sem texto: a lista logo abaixo traz nome e valor de cada parte. */
function splitBarHTML(parts, label) {
  const shown = parts.filter((p) => p.v > 0);
  if (!shown.length) return '';
  const total = U.sum(shown, (p) => p.v);
  const desc = shown.map((p) => `${p.name}: ${m0(p.v)} (${Math.round((p.v / total) * 100)}%)`).join('; ');
  return `<div class="split-bar" role="img" aria-label="${esc(`${label}. ${desc}`)}">${shown.map((p) => `<i class="${p.cls}" style="flex-grow:${p.v}"></i>`).join('')}</div>`;
}

/** Média mensal do plano: contas fixas, dia a dia, anuais, guardar e o que sobra (em % da renda). */
function splitCardHTML(st, cm) {
  const s = M.planSplit(st, cm);
  const out = s.fixas + s.verbas + s.anuais + s.guardar;
  if (!s.renda && !out) return '';
  const parts = [
    { cls: 'p-fixas', name: 'Contas fixas', v: s.fixas },
    { cls: 'p-verbas', name: 'Dia a dia', v: s.verbas },
    { cls: 'p-anuais', name: 'Anuais e parcelas', v: s.anuais },
    { cls: 'p-guardar', name: 'Guardar', v: s.guardar },
    { cls: 'p-sobra', name: 'Sobra livre', v: Math.max(0, s.sobra) },
  ];
  const pct = (v) => (s.renda > 0 ? `${Math.round((v / s.renda) * 100)}%` : '');
  return `<section class="card ${reveal()}">
    <div class="card-head"><h2>Para onde vai a renda</h2><span class="pill">média por mês</span></div>
    <p class="card-sub">Renda prevista: <b>${m0(s.renda)}</b> por mês, nos próximos 12 meses.</p>
    ${splitBarHTML(parts, 'Para onde vai a renda, média por mês')}
    <ul class="split-list">${parts
      .filter((p) => p.v > 0)
      .map((p) => `<li><i class="sw ${p.cls}"></i><span>${p.name}</span><b>${m0(p.v)}</b><small>${pct(p.v)}</small></li>`)
      .join('')}</ul>
    ${s.sobra < 0 ? `<p class="warn-line"><span class="flag-ic crit">!</span><span>Em média, saem <b>${m0(-s.sobra)}</b> a mais do que entra por mês.</span></p>` : ''}
  </section>`;
}

export function planHTML() {
  rv = 0;
  const st = S();
  const plan = st.core.plan;
  if (!plan.length) {
    return `<section class="page-head ${reveal()}"><p class="eyebrow">Planejamento</p><h1>Seu ano, mês a mês</h1>
      <p class="lede">No método do Gustavo Cerbasi, orçamento é projetar o que vem pela frente: tudo o que vai entrar e sair nos próximos meses, inclusive os gastos que só aparecem uma vez por ano.</p></section>
      ${planCTAHTML()}`;
  }
  const cm = curMk();
  const rows = M.projection(st, cm, 12);
  const last = rows[rows.length - 1];
  const neg = rows.filter((r) => r.saldo < 0);
  const prov = M.seasonalProvision(st, cm);
  const groups = [
    { id: 'receita', title: 'Receitas', items: plan.filter((l) => l.kind === 'receita') },
    { id: 'metas', title: 'Metas', items: plan.filter((l) => l.kind === 'invest' && l.goal) },
    { id: 'pague', title: 'Pague-se primeiro', items: plan.filter((l) => l.kind === 'invest' && !l.goal) },
    { id: 'fixas', title: 'Contas fixas', items: plan.filter((l) => l.kind === 'despesa' && l.type !== 'verba' && l.rec === 'mensal') },
    { id: 'verbas', title: 'Verbas do dia a dia', items: plan.filter((l) => l.kind === 'despesa' && l.type === 'verba') },
    { id: 'anuais', title: 'Anuais, parcelas e únicos', items: plan.filter((l) => l.kind === 'despesa' && l.type !== 'verba' && l.rec !== 'mensal') },
  ];
  // quanto o grupo pesa: por mês (itens mensais) ou somado nos próximos 12 meses (anuais e parcelas)
  const in12 = (l) => U.sum(rows, (r) => (M.occurs(l, r.mk) ? l.amount : 0));
  const weight = (items) => {
    const mm = U.sum(items.filter((l) => l.rec === 'mensal'), (l) => l.amount);
    return mm ? `${m0(mm)}/mês` : `${m0(U.sum(items, in12))} em 12 meses`;
  };
  const redMonths = neg.length > 4 ? `${neg.slice(0, 3).map((r) => U.monthShortYear(r.mk)).join(', ')} e mais ${neg.length - 3}` : U.listPT(neg.map((r) => U.monthShortYear(r.mk)));
  const redText = neg.length
    ? `<span class="flag-ic crit">!</span><span>${neg.length === 1 ? `${U.cap(U.monthName(neg[0].mk))} fecha` : `${neg.length} meses fecham`} no vermelho${neg.length > 1 ? ` (${esc(redMonths)})` : ''}. Toque no mês, no gráfico, para ver o porquê.</span>`
    : `<span class="ok-ic">${IC.check}</span><span>Nenhum mês no vermelho, se tudo sair como planejado.</span>`;

  return `<section class="page-head ${reveal()}"><p class="eyebrow">Planejamento · próximos 12 meses</p><h1>Seu ano, mês a mês</h1></section>
    <section class="card ${reveal()}">
      <p class="hero-label">Sobra acumulada em 12 meses</p>
      <p class="hero ${last.acc < 0 ? 'neg' : ''}">${heroMoney(last.acc, { cents: false })}</p>
      <p class="hero-sub">${redText}</p>
      ${legendHTML()}
      <div class="chart-box" data-chart="plan"></div>
      <div class="m-detail" data-month-detail aria-live="polite"></div>
    </section>
    ${splitCardHTML(st, cm)}
    ${
      prov.monthly
        ? `<section class="card tip-card ${reveal()}"><p class="eyebrow">Dica do método</p><h2>Separe ${m0(prov.monthly)} por mês para os gastos anuais</h2>
      <p>${esc(U.cap(U.listPT(prov.items)))} somam ${m0(prov.total)} nos próximos 12 meses. Guardando um pouco todo mês, numa conta ou “caixinha” separada, o mês do susto vira só mais um mês.</p></section>`
        : ''
    }
    <section class="card ${reveal()}">
      <div class="card-head"><h2>Itens do plano</h2><button class="btn small lime" data-act="line-new">${IC.plus}Adicionar</button></div>
      <p class="card-sub">Toque num grupo para ver e editar os itens.</p>
      <div class="pg-list">${groups
        .filter((gr) => gr.items.length)
        .map((gr) => {
          const open = ctx.ui.planOpen.has(gr.id);
          return `<div class="pg${open ? ' open' : ''}">
            <button class="pg-head" data-act="plan-group" data-id="${gr.id}" aria-expanded="${open}">
              <span class="pg-txt"><b>${gr.title}</b><small>${U.plural(gr.items.length, 'item', 'itens')}</small></span>
              <span class="pg-amt">${weight(gr.items)}</span><span class="chev ${open ? 'up' : ''}">${IC.right}</span>
            </button>
            ${open ? `<ul class="pl-list">${gr.items.map(planItemHTML).join('')}</ul>` : ''}
          </div>`;
        })
        .join('')}</div>
    </section>
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
function reserveCardHTML(st, cm) {
  const cv = M.custoDeVida(st, cm);
  const res = M.reserveBalance(st);
  const goal = st.core.settings.reserveGoalMonths || 6;
  const months = cv ? res / cv : 0;
  const resPct = cv ? Math.min(100, Math.max(0, (months / goal) * 100)) : 0;
  const marks = [1, 3, 6, 12].filter((m) => m < goal);
  return `<section class="card ${reveal()}">
      <div class="card-head"><h2>🛟 Reserva de emergência</h2><button class="link" data-act="reserve-edit">Atualizar</button></div>
      ${
        cv
          ? `<p class="res-value"><b>${m0(res)}</b> de ${m0(cv * goal)}</p>
        <div class="res-meter" role="img" aria-label="${months.toFixed(1)} de ${goal} meses"><i style="width:${resPct.toFixed(1)}%"></i>${marks.map((m) => `<em style="left:${((m / goal) * 100).toFixed(1)}%"><span>${m}m</span></em>`).join('')}</div>
        <p class="card-sub">Cobre <b>${months.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${months < 2 ? 'mês' : 'meses'}</b> do seu custo de vida (${m0(cv)}/mês). Meta: ${goal} meses. É a primeira meta do método: Cerbasi recomenda no mínimo 3 meses e mirar em 6.</p>`
          : `<p class="card-sub"><b>${m0(res)}</b> guardados. Monte o plano (ou lance alguns gastos) para o app calcular seu custo de vida e a meta da reserva.</p>`
      }
    </section>`;
}

function goalRowHTML(g, i) {
  let pace;
  if (i.reached) pace = `<small class="g-pace ok">🎉 Alcançada! Quando usar o dinheiro, toque para concluir.</small>`;
  else if (i.overdue) pace = `<small class="g-pace late"><span class="flag-ic crit">!</span>O prazo passou. Toque para ajustar.</small>`;
  else if (!i.line) pace = `<small class="g-pace">Sem valor por mês no plano${i.need ? `: guarde ${m0(i.need)}/mês para chegar no prazo` : ''}. Toque para definir.</small>`;
  else if (i.late) pace = `<small class="g-pace late"><span class="flag-ic crit">!</span>Para chegar no prazo, guarde ${m0(i.need)}/mês (no plano: ${m0(i.planned)}).</small>`;
  else pace = `<small class="g-pace ok"><span class="ok-ic">${IC.check}</span>No ritmo: ${m0(i.planned)} por mês${i.eta ? ` · chega em ${U.monthShortYear(i.eta)}` : ''}.</small>`;
  return `<li><button class="goal" data-act="goal-open" data-id="${g.id}">
    <span class="emo">${esc(g.emoji || '🎯')}</span>
    <span class="g-main">
      <span class="g-top"><b>${esc(g.name)}</b><span class="g-pct">${Math.round(i.pct * 100)}%</span></span>
      <span class="meter inv" role="img" aria-label="${Math.round(i.pct * 100)}% da meta"><i style="width:${(i.pct * 100).toFixed(1)}%"></i></span>
      <small>${m0(i.saved)} de ${m0(i.target)}${g.due ? ` · até ${U.monthShortYear(g.due)}` : ''}</small>
      ${pace}
    </span>
  </button></li>`;
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
  const parts = [
    { cls: 'p-res', name: 'Reserva de emergência', v: Math.max(0, sv.reserve) },
    { cls: 'p-metas', name: 'Metas', v: Math.max(0, sv.metas) },
    { cls: 'p-outros', name: 'Outros investimentos', v: Math.max(0, sv.other), act: 'invest-edit' },
  ];
  const lv = G.levelOf(st.core.game.xp);
  const earned = G.BADGES.filter((b) => st.core.game.badges[b.id]).length;
  const month = sv.plannedNow
    ? sv.realNow >= sv.plannedNow
      ? `<span class="ok-ic">${IC.check}</span><span>Este mês você já guardou ${m0(sv.realNow)}. Pague-se primeiro: feito!</span>`
      : `<span>Este mês: guardou <b>${m0(Math.max(0, sv.realNow))}</b> de ${m0(sv.plannedNow)} previstos.</span>`
    : '<span>Guardar todo mês, antes de gastar, é o “pague-se primeiro” do Cerbasi.</span>';

  return `<section class="page-head ${reveal()}"><p class="eyebrow">Pague-se primeiro</p><h1>Metas e investimentos</h1></section>
    <section class="card ${reveal()}">
      <p class="hero-label">Guardado até agora</p>
      <p class="hero">${heroMoney(sv.total)}</p>
      <p class="hero-sub">${month}</p>
      ${splitBarHTML(parts, 'Dinheiro guardado')}
      <ul class="split-list">${parts
        .map((p) => `<li><i class="sw ${p.cls}"></i><span>${p.name}${p.act ? ` <button class="link small" data-act="${p.act}">Atualizar</button>` : ''}</span><b>${m0(p.v)}</b></li>`)
        .join('')}</ul>
      <div class="sv-future"><span>Em 12 meses, seguindo o plano</span><b>${m0(sv.in12)}</b></div>
    </section>
    <section class="card ${reveal()}">
      <div class="card-head"><h2>Minhas metas</h2><button class="btn small lime" data-act="goal-new">${IC.plus}Nova meta</button></div>
      ${
        active.length
          ? `<ul class="goals">${active.map(({ g, i }) => goalRowHTML(g, i)).join('')}</ul>`
          : `<p class="card-sub">Viagem, carro, casa… Diga quanto custa e para quando: o app calcula quanto guardar por mês e põe no plano, para você marcar “Guardei” todo mês.</p>
        <div class="cat-chips">${M.GOAL_IDEAS.map((x, k) => `<button type="button" class="cchip sm" data-act="goal-new" data-idea="${k}"><span>${x.emoji}</span>${esc(x.name)}</button>`).join('')}</div>`
      }
      ${
        done.length
          ? `<button class="link more" data-act="goals-done">${ctx.ui.showDoneGoals ? 'Esconder concluídas' : `Ver concluídas (${done.length})`}</button>
        ${
          ctx.ui.showDoneGoals
            ? `<ul class="goals done">${done
                .map((g) => {
                  const i = M.goalInfo(st, g, cm, by);
                  return `<li><button class="goal" data-act="goal-open" data-id="${g.id}"><span class="emo">${esc(g.emoji || '🎯')}</span><span class="g-main"><span class="g-top"><b>${esc(g.name)}</b></span><small>Concluída em ${U.dayLabel(g.done).toLowerCase()} · juntou ${m0(i.saved)}</small></span></button></li>`;
                })
                .join('')}</ul>`
            : ''
        }`
          : ''
      }
    </section>
    ${reserveCardHTML(st, cm)}
    <section class="card ${reveal()}">
      <button class="pl-item link-row" data-act="tab" data-tab="conquistas"><span class="emo">🏆</span><span class="pl-txt"><b>Suas conquistas</b><small>Nível ${lv.level} · ${esc(lv.name)} · ${U.plural(earned, 'medalha', 'medalhas')}</small></span><span class="go">${IC.right}</span></button>
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
  const blue = Object.values(g.monthsClosed || {}).filter((v) => v === 'azul').length;
  const steps = [
    { t: 'Diagnóstico', d: 'Use o app por 4 semanas para conhecer seu padrão de gastos.', done: sk.totalWeeks >= 4, prog: `${Math.min(4, sk.totalWeeks)}/4 semanas` },
    { t: 'Plano de 12 meses', d: 'Projete tudo o que entra e sai, inclusive os gastos anuais.', done: !!g.badges.plano },
    { t: 'Pague-se primeiro', d: 'Guarde no começo do mês, antes de gastar.', done: !!g.badges.pague },
    { t: 'Reserva mínima', d: '3 meses de custo de vida guardados.', done: !!g.badges.reserva3 },
    { t: 'Reserva completa', d: '6 meses: tranquilidade para imprevistos.', done: !!g.badges.reserva6 },
    { t: 'Três meses no azul', d: 'Receber mais do que gastar, três vezes.', done: blue >= 3, prog: `${Math.min(3, blue)}/3` },
  ];

  return `<section class="page-head ${reveal()}"><p class="eyebrow">Seu progresso</p><h1>Conquistas</h1></section>
    <section class="card level-card ${reveal()}">
      <div class="lv-badge"><span>${lv.level}</span></div>
      <div class="lv-txt"><p class="eyebrow">Nível ${lv.level}</p><h2>${lv.name}</h2>
        <div class="xpbar" role="img" aria-label="${Math.round(lv.pct * 100)}% para o próximo nível"><i style="width:${(lv.pct * 100).toFixed(1)}%"></i></div>
        <p class="muted">${g.xp} XP${lv.to ? ` · faltam ${lv.to - g.xp} para “${lv.nextName}”` : ' · nível máximo!'}</p></div>
    </section>
    <section class="card ${reveal()}">
      <div class="card-head"><h2>🔥 ${sk.current} ${sk.current === 1 ? 'semana' : 'semanas'} em dia</h2><span class="pill">recorde ${sk.best}</span></div>
      <div class="weeks" role="img" aria-label="Últimas 12 semanas">${sk.weeks.map((w) => `<span class="wk ${w.active ? 'on' : ''} ${w.checkin ? 'ck' : ''} ${w.current ? 'cur' : ''}"></span>`).join('')}</div>
      <p class="card-sub">Uma semana conta se você lançar qualquer coisa ou fizer o check-in. Perdeu uma? Sem drama: o recorde fica guardado e voltar dá bônus.</p>
      ${sk.checkinThisWeek ? `<p class="ok-line">${IC.check} Check-in desta semana feito.</p>` : `<button class="btn lime wide" data-act="checkin">Fazer o check-in da semana · +50 XP</button>`}
    </section>
    <section class="card ${reveal()}">
      <div class="card-head"><h2>Jornada Cerbasi</h2><span class="pill">${steps.filter((s) => s.done).length}/${steps.length}</span></div>
      <ol class="journey">${steps.map((s, i) => `<li class="${s.done ? 'done' : ''}"><span class="j-dot">${s.done ? IC.check : i + 1}</span><div><b>${s.t}</b><small>${s.d}${!s.done && s.prog ? ` · ${s.prog}` : ''}</small></div></li>`).join('')}</ol>
    </section>
    <section class="card ${reveal()}">
      <div class="card-head"><h2>Medalhas</h2><span class="pill">${earned}/${G.BADGES.length}</span></div>
      <div class="badges">${G.BADGES.map((b) => `<div class="badge ${g.badges[b.id] ? 'on' : ''}"><span class="b-emo">${b.emoji}</span><b>${b.name}</b><small>${b.desc}</small></div>`).join('')}</div>
    </section>
    <section class="card ${reveal()}">
      <div class="card-head"><h2>Como ganhar XP</h2></div>
      <ul class="xp-list">
        <li><span>Lançar um gasto ou receita</span><b>+5</b></li>
        <li><span>Marcar uma conta do plano</span><b>+5</b></li>
        <li><span>Check-in da semana</span><b>+50</b></li>
        <li><span>Guardar dinheiro no mês</span><b>+50</b></li>
        <li><span>Voltar depois de uma pausa</span><b>+30</b></li>
        <li><span>Fechar o mês no azul</span><b>+100</b></li>
        <li><span>Cada medalha</span><b>+25</b></li>
      </ul>
      <p class="card-sub">Lançamentos avulsos rendem até 30 XP por dia.</p>
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
