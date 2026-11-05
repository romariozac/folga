// Infra de interface: ícones, folhas (bottom sheets), diálogos, toasts e celebrações.
import { esc } from './util.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" class="ic">${d}</svg>`;
export const IC = {
  home: svg('<path d="M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.2v-6h-5.6v6H5A1.5 1.5 0 0 1 3.5 19z"/>'),
  month: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8.5 3v4M15.5 3v4"/>'),
  plan: svg('<path d="M3.5 20.5h17M7 16.5v-4M12 16.5V7M17 16.5v-7"/>'),
  trophy: svg('<path d="M8 4.5h8V10a4 4 0 0 1-8 0zM8 6.5H5.5a2.5 2.5 0 0 0 2.6 3.5M16 6.5h2.5a2.5 2.5 0 0 1-2.6 3.5M12 14v3.5M8.5 20.5h7M10 17.5h4"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  check: svg('<path d="M5 12.5 9.5 17 19 7.5"/>'),
  left: svg('<path d="M14.5 6 8.5 12l6 6"/>'),
  right: svg('<path d="M9.5 6l6 6-6 6"/>'),
  close: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  settings: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  backspace: svg('<path d="M9 5.5h10a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H9L3.5 12z"/><path d="M12 9.5l5 5M17 9.5l-5 5"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  cloud: svg('<path d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 11a3.75 3.75 0 0 0 0 7.5z"/>'),
  device: svg('<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 17.5h2"/>'),
  download: svg('<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>'),
  dots: svg('<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>'),
  spark: svg('<path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
  target: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1"/>'),
};

export function vibrate(p = 12) {
  try {
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate && navigator.vibrate(p);
  } catch {
    /* ignorado */
  }
}

// ---------- folhas ----------
const stack = [];
let useHistory = false;
try {
  useHistory = matchMedia('(display-mode: standalone)').matches;
} catch {
  useHistory = false;
}
let backDepth = 0;
let ignorePop = 0;

function pushBack() {
  if (!useHistory) return;
  try {
    history.pushState({ folgaSheet: ++backDepth }, '');
  } catch {
    /* ignorado */
  }
}
function popBack() {
  if (!useHistory || backDepth <= 0) return;
  backDepth--;
  ignorePop++;
  try {
    history.back();
  } catch {
    ignorePop--;
  }
}
window.addEventListener('popstate', () => {
  if (ignorePop) {
    ignorePop--;
    return;
  }
  if (stack.length) {
    backDepth = Math.max(0, backDepth - 1);
    closeSheet(stack[stack.length - 1], true);
  }
});

export const sheetOpen = () => stack.length > 0;

/** Abre uma folha. onMount(el, close) recebe o elemento e a função de fechar. */
export function openSheet(html, { onMount, onClose, cls = '', label = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop" data-sheet-close></div><section class="sheet ${cls}" role="dialog" aria-modal="true"${label ? ` aria-label="${esc(label)}"` : ''}><div class="sheet-grip" aria-hidden="true"></div><div class="sheet-body">${html}</div></section>`;
  document.getElementById('sheet-root').appendChild(wrap);
  const entry = { wrap, onClose, el: wrap.querySelector('.sheet-body') };
  stack.push(entry);
  document.body.classList.add('has-sheet');
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  const close = () => closeSheet(entry);
  entry.close = close;
  pushBack();
  if (onMount) onMount(entry.el, close);
  return entry;
}

export function closeSheet(entry = stack[stack.length - 1], fromPop = false) {
  if (!entry) return;
  const i = stack.indexOf(entry);
  if (i < 0) return;
  stack.splice(i, 1);
  entry.wrap.classList.remove('open');
  entry.wrap.classList.add('closing');
  setTimeout(() => entry.wrap.remove(), 260);
  if (!stack.length) document.body.classList.remove('has-sheet');
  if (!fromPop) popBack();
  if (entry.onClose) entry.onClose();
}

export function closeAllSheets() {
  while (stack.length) closeSheet(stack[stack.length - 1]);
}

document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-sheet-close]');
  if (c && stack.length) {
    e.preventDefault();
    const wrap = c.closest('.sheet-wrap');
    const entry = stack.find((s) => s.wrap === wrap) || stack[stack.length - 1];
    closeSheet(entry);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) closeSheet(stack[stack.length - 1]);
});

export function sheetHead(title, sub = '') {
  return `<header class="sheet-head"><div><h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div><button class="icon-btn" data-sheet-close aria-label="Fechar">${IC.close}</button></header>`;
}

/** Diálogo de confirmação dentro da página (alert/confirm não funcionam em todo lugar). */
export function confirmDialog({ title, text = '', ok = 'Confirmar', cancel = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    openSheet(
      `<div class="dialog"><h2>${title}</h2>${text ? `<p>${text}</p>` : ''}<div class="row-btns"><button class="btn ghost" data-x="0">${cancel}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-x="1">${ok}</button></div></div>`,
      {
        cls: 'sheet-dialog',
        onMount: (el, close) =>
          el.addEventListener('click', (e) => {
            const b = e.target.closest('[data-x]');
            if (!b) return;
            done = true;
            resolve(b.dataset.x === '1');
            close();
          }),
        onClose: () => {
          if (!done) resolve(false);
        },
      }
    );
  });
}

// ---------- toast ----------
let toastTimer = null;
export function toast(msgHtml, { action = null, xp = 0, ms = 4200 } = {}) {
  const root = document.getElementById('toast-root');
  root.innerHTML = '';
  clearTimeout(toastTimer);
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="t-msg">${msgHtml}</span>${xp ? `<span class="t-xp">+${xp} XP</span>` : ''}${action ? `<button class="t-act">${esc(action.label)}</button>` : ''}`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const kill = () => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 260);
  };
  toastTimer = setTimeout(kill, ms);
  if (action) {
    el.querySelector('.t-act').addEventListener('click', () => {
      clearTimeout(toastTimer);
      kill();
      action.fn();
    });
  }
}

// ---------- celebração ----------
const queue = [];
let celebrating = false;

export function celebrate(item) {
  queue.push(item);
  if (!celebrating) next();
}
function next() {
  const item = queue.shift();
  if (!item) {
    celebrating = false;
    return;
  }
  celebrating = true;
  confetti();
  vibrate([18, 40, 18]);
  openSheet(
    `<div class="celebrate"><div class="cel-emoji">${item.emoji}</div><p class="eyebrow">${item.kicker}</p><h2>${item.title}</h2><p>${item.text}</p><button class="btn primary wide" data-sheet-close>${item.cta || 'Boa!'}</button></div>`,
    { cls: 'sheet-dialog', onClose: () => setTimeout(next, 280) }
  );
}

export function confetti() {
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch {
    /* segue */
  }
  const root = document.getElementById('fx-root');
  const colors = ['var(--lime)', 'var(--s-in)', 'var(--s-out)', 'var(--s-inv)', '#fab219'];
  for (let i = 0; i < 44; i++) {
    const p = document.createElement('i');
    p.className = 'confetti';
    p.style.left = 50 + (Math.random() - 0.5) * 24 + 'vw';
    p.style.setProperty('--dx', (Math.random() - 0.5) * 110 + 'vw');
    p.style.setProperty('--dy', 55 + Math.random() * 45 + 'vh');
    p.style.setProperty('--r', Math.random() * 900 - 450 + 'deg');
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.18 + 's';
    if (i % 3 === 0) p.style.borderRadius = '50%';
    root.appendChild(p);
    setTimeout(() => p.remove(), 2000);
  }
}
