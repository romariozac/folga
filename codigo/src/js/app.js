// Folga: inicialização, navegação por abas e ações globais.
import { ctx, curMk } from './ctx.js';
import * as U from './util.js';
import * as A from './actions.js';
import * as V from './views.js';
import * as SH from './sheets.js';
import { openImport } from './importui.js';
import * as GU from './goalsui.js';
import * as M from './model.js';
import * as G from './game.js';
import { toast } from './ui.js';
import { store } from './store.js';
import { IC, $, $$, closeAllSheets, sheetOpen } from './ui.js';

// "conquistas" não fica na barra: abre pelo nível/XP, no topo
const TABS = ['inicio', 'mes', 'plano', 'metas', 'conquistas'];
let inArtifact = false;

/** Dentro do Claude (artefato) a conexão com a nuvem pode chegar um instante depois do carregamento. */
async function detectClaude() {
  const has = () => !!(window.claude && typeof window.claude.use === 'function');
  if (has()) return true;
  let framed = false;
  try {
    framed = window.self !== window.top;
  } catch {
    framed = true;
  }
  if (!framed) return false;
  for (let i = 0; i < 12; i++) {
    await U.sleep(100);
    if (has()) return true;
  }
  return false;
}

function applyTheme() {
  const t = ctx.S.core.settings.theme;
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t;
  else delete root.dataset.theme;
  const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]:not([media])') || document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }));
  meta.content = dark ? '#0f0f0d' : '#f3f0e8';
}

function render() {
  $('#topbar').innerHTML = V.topbarHTML();
  const view = $('#view');
  const t = ctx.ui.tab;
  view.innerHTML = t === 'mes' ? V.monthHTML() : t === 'plano' ? V.planHTML() : t === 'metas' ? V.goalsHTML() : t === 'conquistas' ? V.gameHTML() : V.homeHTML();
  view.classList.toggle('animate', ctx.ui.animate);
  ctx.ui.animate = false;
  V.mountCharts(view);
  // Conquistas não fica na barra: abre pelo nível, no topo
  $$('#tabbar [data-tab]').forEach((b) => {
    const on = b.dataset.tab === t;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  applyTheme();
}
ctx.render = render;

function setTab(tab, { scroll = true } = {}) {
  if (!TABS.includes(tab)) tab = 'inicio';
  if (ctx.ui.tab !== tab) {
    ctx.ui.tab = tab;
    ctx.ui.animate = true;
    if (tab === 'mes') ctx.ui.mk = curMk();
    if (scroll) window.scrollTo({ top: 0 });
  }
  try {
    history.replaceState(history.state, '', '#' + tab);
  } catch {
    /* ignorado */
  }
  render();
}

function tabbarHTML() {
  const item = (tab, icon, label) => `<button class="tab" data-act="tab" data-tab="${tab}">${icon}<span>${label}</span></button>`;
  const fab = `<button class="fab" data-act="add" aria-label="Novo lançamento">${IC.plus}</button>`;
  return `${item('inicio', IC.home, 'Início')}${item('mes', IC.month, 'Mês')}${fab}${item('plano', IC.plan, 'Plano')}${item('metas', IC.target, 'Metas')}`;
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const d = el.dataset;
  switch (act) {
    case 'tab':
      setTab(d.tab);
      break;
    case 'add':
      SH.openQuickAdd(d.kind || 'despesa');
      break;
    case 'settings':
      SH.openSettings();
      break;
    case 'checkin':
      SH.openCheckin();
      break;
    case 'catchup':
      SH.openCatchUp();
      break;
    case 'import':
      openImport();
      break;
    case 'cat-toggle': {
      const set = ctx.ui.openCats;
      if (set.has(d.id)) set.delete(d.id);
      else set.add(d.id);
      render();
      break;
    }
    case 'fresh-start':
      A.notify('Recomeço feito. Daqui pra frente, no seu ritmo.', A.freshStart());
      render();
      break;
    case 'onboarding':
      SH.openOnboarding({ redo: ctx.S.core.plan.length > 0 });
      break;
    case 'bill-pay':
      SH.payBillQuick(d.line, d.mk);
      break;
    case 'bill-undo':
      SH.unpayBill(d.line, d.mk);
      break;
    case 'bill-open':
      SH.openBill(d.line, d.mk);
      break;
    case 'bills-expand':
      ctx.ui.billsExpanded = !ctx.ui.billsExpanded;
      render();
      break;
    case 'tx-open':
      SH.openTxEdit(d.mk, d.id);
      break;
    case 'mk-prev':
      ctx.ui.mk = U.addMonths(ctx.ui.mk, -1);
      render();
      break;
    case 'mk-next':
      ctx.ui.mk = U.addMonths(ctx.ui.mk, 1);
      render();
      break;
    case 'line-new':
      SH.openLineEditor(null, d.kind ? { kind: d.kind } : {});
      break;
    case 'line-open': {
      const line = A.lineById(d.line);
      if (line) SH.openLineEditor(line);
      break;
    }
    case 'reserve-edit':
      SH.openReserve();
      break;
    case 'goal-new':
      GU.openGoalEditor(null, { idea: d.idea != null ? M.GOAL_IDEAS[+d.idea] : null });
      break;
    case 'goal-open':
      GU.openGoal(d.id);
      break;
    case 'goals-done':
      ctx.ui.showDoneGoals = !ctx.ui.showDoneGoals;
      render();
      break;
    case 'invest-edit':
      GU.openInvestEdit();
      break;
    case 'plan-group': {
      const set = ctx.ui.planOpen;
      if (set.has(d.id)) set.delete(d.id);
      else set.add(d.id);
      render();
      break;
    }
    case 'badge-info': {
      const b = G.badgeById(d.id);
      if (b) toast(`${b.emoji} <b>${U.esc(b.name)}</b>: ${U.esc(b.desc)}${ctx.S.core.game.badges[b.id] ? '' : ' <small>(ainda não conquistada)</small>'}`);
      break;
    }
    default:
      break;
  }
});

function routeHash() {
  const h = decodeURIComponent((location.hash || '').slice(1));
  if (TABS.includes(h)) return setTab(h);
  const actions = {
    'novo-gasto': () => SH.openQuickAdd('despesa'),
    'novo-receita': () => SH.openQuickAdd('receita'),
    'novo-investimento': () => SH.openQuickAdd('invest'),
    checkin: () => SH.openCheckin(),
    acerto: () => SH.openCatchUp(),
    importar: () => openImport(),
    ajustes: () => SH.openSettings(),
    'nova-meta': () => GU.openGoalEditor(),
  };
  if (actions[h]) {
    setTab(ctx.ui.tab || 'inicio');
    if (!sheetOpen()) actions[h]();
    return;
  }
  setTab(ctx.ui.tab);
}

function registerSW() {
  if (inArtifact || !('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (location.protocol !== 'https:' && !local) return;
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  try {
    navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(() => {});
  } catch {
    /* ignorado */
  }
}

let resizeT = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => V.mountCharts($('#view')), 160);
});
try {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
} catch {
  /* ignorado */
}

async function boot() {
  const { S, hadLocal } = store.loadLocal();
  ctx.S = S;
  $('#tabbar').innerHTML = tabbarHTML();
  applyTheme();

  inArtifact = await detectClaude();
  let first = null;
  if (inArtifact) {
    first = store.initRemote({
      onRemote: () => {
        render();
      },
      onStatus: () => {},
    });
  }
  if (inArtifact && !hadLocal) {
    $('#view').innerHTML = `<div class="splash"><span class="brand-mark big">f</span><p>Carregando seus dados…</p></div>`;
    await Promise.race([first, U.sleep(10000)]);
  }

  const startHash = (location.hash || '').slice(1);
  if (store.migrated) store.save(['core']);
  A.syncLinkedTxCats();
  const autoDone = A.autoPayDue();
  const events = A.closePastMonths();
  routeHash();
  window.addEventListener('hashchange', routeHash);
  const s = ctx.S.core.settings;
  if (!s.onboarded && !ctx.S.core.plan.length && !startHash.startsWith('novo')) SH.openOnboarding({ first: true });
  if (events.length) A.celebrateEvents(events);
  if (autoDone.length) setTimeout(() => toast(`Marcado sozinho (automático): ${U.esc(U.listPT(autoDone))}.`), 600);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const done = A.autoPayDue();
    if (done.length) {
      render();
      toast(`Marcado sozinho (automático): ${U.esc(U.listPT(done))}.`);
    }
  });
  registerSW();
}

boot();
