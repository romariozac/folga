// Componentes de categoria: navegador com busca, seletor em 2 níveis, criação de subcategoria e a tela
// "Categorias e atalhos". Subcategoria nova fica guardada dentro do grupo: só aparece quando você abre o grupo
// (ou na busca), sem encher a tela de lançar.
import { ctx } from './ctx.js';
import * as U from './util.js';
import * as M from './model.js';
import * as A from './actions.js';
import { $, $$, IC, openSheet, sheetHead, confirmDialog, toast } from './ui.js';

const S = () => ctx.S;
const { esc } = U;
const cleanName = (s) => U.cap(String(s || '').trim().replace(/\s+/g, ' ')).slice(0, 40);

function chip(c, attr, sub = '') {
  return `<button type="button" class="mchip" ${attr}="${c.id}">${c.emoji ? `<span>${c.emoji}</span>` : ''}${esc(c.name)}${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
}

/** Fim da busca: “+ Criar …” quando ainda não existe categoria com esse nome. */
function createHTML(kind, q, found) {
  const name = cleanName(q);
  const can = name.length >= 2 && !M.catByName(S(), kind, name);
  const lead = found ? 'Não é nenhuma dessas?' : `Nada encontrado para “${esc(q.trim())}”.`;
  if (!can) return found ? '' : `<p class="help center">${lead}</p>`;
  return `<div class="mnew"><p class="help">${lead}</p><button type="button" class="mchip new" data-newcat="${esc(name)}">${IC.plus}Criar “${esc(name)}”</button></div>`;
}

/** Todas as categorias de um tipo, agrupadas (ou o resultado da busca, com a opção de criar). */
export function catBrowserHTML(kind, q = '', attr = 'data-pickcat') {
  const st = S();
  if (q.trim()) {
    const res = M.searchCats(st, kind, q);
    return (res.length ? `<div class="mchips">${res.map((c) => chip(c, attr, c.parent ? M.catById(st, c.parent).name : '')).join('')}</div>` : '') + createHTML(kind, q, res.length > 0);
  }
  return M.catTree(st, kind)
    .map(
      ({ g, subs }) =>
        `<section class="mgroup"><h4>${g.emoji} ${esc(g.name)}</h4><div class="mchips">${chip({ id: g.id, name: subs.length ? 'Geral' : g.name, emoji: '' }, attr)}${subs.map((c) => chip(c, attr)).join('')}</div></section>`
    )
    .join('');
}

/** Seletor em dois níveis para formulários: grupo e, opcionalmente, a subcategoria (com “+ Nova”). */
export function catPickerHTML(kind, selected) {
  const st = S();
  const gsel = selected ? M.groupId(st, selected) : null;
  const subs = gsel ? M.subsOf(st, gsel) : [];
  const groups = M.groupsOf(st, kind)
    .map((g) => `<button type="button" class="cchip ${g.id === gsel ? 'on' : ''}" data-pick="${g.id}"><span>${g.emoji}</span>${esc(g.name)}</button>`)
    .join('');
  const add = `<button type="button" class="cchip sm add" data-newsub="${gsel}">${IC.plus}Nova</button>`;
  let detail = '';
  if (subs.length)
    detail = `<div class="sub-pick"><span class="help">Subcategoria (opcional)</span><div class="cat-chips">${[{ id: gsel, name: 'Geral', emoji: '' }, ...subs]
      .map((c) => `<button type="button" class="cchip sm ${c.id === selected ? 'on' : ''}" data-pick="${c.id}">${c.emoji ? `<span>${c.emoji}</span>` : ''}${esc(c.name)}</button>`)
      .join('')}${add}</div></div>`;
  else if (gsel && st.core.cats.some((c) => c.id === gsel)) detail = `<button type="button" class="link sub-new" data-newsub="${gsel}">+ Criar subcategoria em ${esc(M.catById(st, gsel).name)}</button>`;
  return `<div class="cat-chips">${groups}</div>${detail}`;
}

/**
 * Cria uma categoria. Com parent, vira subcategoria dele. Com choose, a pessoa escolhe o grupo (a sugestão pelo
 * nome já vem marcada). Sem nenhum dos dois, cria uma categoria principal. Resolve com a categoria criada (ou a que
 * já existia com o mesmo nome no mesmo lugar), ou null se cancelar.
 */
export function newCategory({ kind, parent = null, name = '', choose = false } = {}) {
  const st = S();
  let sel = parent; // id do grupo; '' = categoria principal; null = ainda não escolheu
  if (choose && !sel) {
    const guess = name ? M.kwMatch(M.buildMatcher(st), kind, name) : null;
    sel = guess ? M.groupId(st, guess) : null;
  }
  const g = parent ? M.catById(st, parent) : null;
  const isGroup = !parent && !choose;
  const title = g ? `Nova subcategoria em ${g.emoji} ${g.name}` : isGroup ? 'Nova categoria principal' : 'Nova subcategoria';
  const text = isGroup
    ? 'Ela aparece em “Mais” e na busca. Para virar atalho na tela de lançar, marque ★.'
    : 'Ela fica guardada dentro da categoria de cima: aparece quando você abre essa categoria e na busca, sem encher a tela de lançar.';
  const where = choose
    ? `<div class="field"><span>Fica dentro de</span><div class="cat-chips">${M.groupsOf(st, kind)
        .map((x) => `<button type="button" class="cchip sm ${x.id === sel ? 'on' : ''}" data-in="${x.id}"><span>${x.emoji}</span>${esc(x.name)}</button>`)
        .join('')}<button type="button" class="cchip sm" data-in="">Nenhuma: categoria principal</button></div></div>`
    : '';
  return new Promise((resolve) => {
    let done = false;
    openSheet(
      `<div class="dialog"><h2>${esc(title)}</h2><p class="help">${text}</p><form class="form">
      <label class="field"><span>Nome</span><input name="name" maxlength="40" required value="${esc(cleanName(name))}" placeholder="Ex.: Pilates, Presentes de aniversário"></label>
      <label class="field"><span>Emoji (opcional)</span><input name="emoji" maxlength="8" placeholder="${g ? g.emoji : sel ? M.catById(st, sel).emoji : '🏷️'}"></label>
      ${where}
      <div class="row-btns"><button type="button" class="btn ghost" data-sheet-close>Cancelar</button><button class="btn primary" type="submit">Criar</button></div></form></div>`,
      {
        cls: 'sheet-dialog',
        label: title,
        onMount: (el, close) => {
          const f = $('form', el);
          el.addEventListener('click', (e) => {
            const b = e.target.closest('[data-in]');
            if (!b) return;
            sel = b.dataset.in;
            $$('[data-in]', el).forEach((x) => x.classList.toggle('on', x === b));
            // sem emoji, a subcategoria usa o da categoria de cima
            f.elements.emoji.placeholder = sel ? M.catById(S(), sel).emoji : '🏷️';
          });
          f.addEventListener('submit', (e) => {
            e.preventDefault();
            const nm = cleanName(f.elements.name.value);
            if (!nm) return f.elements.name.focus();
            if (choose && sel == null) return toast('Escolha onde ela fica.');
            const par = sel || null;
            const same = M.catByName(S(), kind, nm, par);
            done = true;
            if (same) toast(`“${esc(same.name)}” já existe. Usei ela.`);
            resolve(same || A.addCustomCat({ name: nm, emoji: f.elements.emoji.value, kind, parent: par }));
            close();
          });
          if (!name) setTimeout(() => f.elements.name.focus(), 120);
        },
        onClose: () => {
          if (!done) resolve(null);
        },
      }
    );
  });
}

/**
 * Cliques do seletor (catPickerHTML): escolher categoria ou criar subcategoria. Devolve true se o clique era dele.
 * preset: nome sugerido para a subcategoria nova (texto ou função).
 */
export function catPickerClick(e, onPick, preset = '') {
  const p = e.target.closest('[data-pick]');
  if (p) {
    onPick(p.dataset.pick);
    return true;
  }
  const n = e.target.closest('[data-newsub]');
  if (n) {
    const g = M.catById(S(), n.dataset.newsub);
    newCategory({ kind: g.kind, parent: g.id, name: typeof preset === 'function' ? preset() : preset }).then((c) => c && onPick(c.id));
    return true;
  }
  return false;
}

/** Clique em “+ Criar …” no fim da busca: pergunta o grupo e cria. Devolve uma Promise, ou null se o clique não era esse. */
export function createFromSearch(e, kind) {
  const b = e.target.closest('[data-newcat]');
  return b ? newCategory({ kind, name: b.dataset.newcat, choose: true }) : null;
}

/** Abre uma folha para escolher categoria (com busca). Resolve com o id escolhido ou null. */
export function pickCategory(kind, { title = 'Escolher categoria', sub = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    openSheet(
      `${sheetHead(title, sub)}<div class="search"><input type="search" placeholder="Buscar ou criar: pilates, farmácia, uber…" data-q aria-label="Buscar categoria"></div><div class="cat-browser" data-list>${catBrowserHTML(kind)}</div>`,
      {
        cls: 'sheet-tall',
        onMount: (el, close) => {
          const list = $('[data-list]', el);
          const q = $('[data-q]', el);
          const pick = (id) => {
            done = true;
            resolve(id);
            close();
          };
          q.addEventListener('input', () => (list.innerHTML = catBrowserHTML(kind, q.value)));
          el.addEventListener('click', (e) => {
            const nc = createFromSearch(e, kind);
            if (nc) {
              nc.then((c) => c && pick(c.id));
              return;
            }
            const b = e.target.closest('[data-pickcat]');
            if (b) pick(b.dataset.pickcat);
          });
        },
        onClose: () => {
          if (!done) resolve(null);
        },
      }
    );
  });
}

/** Ajustes › Categorias e atalhos. Os grupos ficam fechados; tocar abre as subcategorias. */
export function openCategories() {
  const open = new Set();
  openSheet('<div data-cats-root></div>', {
    cls: 'sheet-tall',
    label: 'Categorias e atalhos',
    onMount: (el) => {
      const root = $('[data-cats-root]', el);
      const draw = () => {
        const st = S();
        const favs = st.core.settings.favs || [];
        const star = (id) => `<button type="button" class="star ${favs.includes(id) ? 'on' : ''}" data-fav="${id}" aria-label="${favs.includes(id) ? 'Tirar dos atalhos' : 'Pôr nos atalhos'}">${favs.includes(id) ? '★' : '☆'}</button>`;
        // categoria de uma meta se apaga pela própria meta (aba Metas), para não deixar a meta sem categoria
        const del = (c) => (c.custom && !c.goal ? `<button type="button" class="x" data-delcat="${c.id}" aria-label="Apagar ${esc(c.name)}">✕</button>` : '');
        const group = (g, subs, stars) => {
          const isOpen = open.has(g.id);
          const starred = stars ? subs.filter((c) => favs.includes(c.id)).length : 0;
          const info = (subs.length ? U.plural(subs.length, 'subcategoria', 'subcategorias') : 'sem subcategorias') + (starred ? ` · ${starred} ★` : '');
          return `<div class="cg${isOpen ? ' open' : ''}"><div class="cg-head">
              <button type="button" class="cg-btn" data-cg="${g.id}" aria-expanded="${isOpen}"><span class="emo">${g.emoji}</span><span class="cg-txt"><b>${esc(g.name)}</b><small>${info}</small></span><span class="chev ${isOpen ? 'up' : ''}">${IC.right}</span></button>
              ${stars ? star(g.id) : ''}${del(g)}</div>
            ${isOpen ? `<div class="cg-subs">${subs.map((c) => `<span class="sub-chip">${c.emoji} ${esc(c.name)}${stars ? star(c.id) : ''}${del(c)}</span>`).join('')}<button type="button" class="add-sub" data-addsub="${g.id}">+ subcategoria</button></div>` : ''}
          </div>`;
        };
        const section = (kind, title, stars) =>
          `<h3 class="group">${title}</h3>${M.catTree(st, kind)
            .map(({ g, subs }) => group(g, subs, stars))
            .join('')}<button type="button" class="btn ghost small" data-addgroup="${kind}">+ Nova categoria principal</button>`;
        const rules = Object.entries(st.core.rules || {});
        root.innerHTML = `${sheetHead('Categorias e atalhos', 'Toque numa categoria para ver e criar subcategorias: elas ficam guardadas dentro dela, sem encher a tela de lançar. ★ = atalho na tela de lançar.')}
          <div class="fav-bar"><span class="help">Atalhos na tela de lançar (${favs.length}/${M.MAX_FAVS})</span><div class="cat-chips">${favs
            .map((id) => {
              const c = M.catById(st, id);
              return `<span class="cchip sm on">${c.emoji} ${esc(c.name)}</span>`;
            })
            .join('')}</div></div>
          ${section('despesa', 'Gastos', true)}
          ${section('receita', 'Receitas', false)}
          ${section('invest', 'Guardar', false)}
          <h3 class="group">Regras aprendidas na importação<span>${rules.length}</span></h3>
          ${
            rules.length
              ? `<ul class="rules">${rules
                  .map(([k, v]) => `<li><span>“${esc(k.split(':').slice(1).join(':'))}” → ${v === '__ignore' ? 'não lançar' : esc(M.catPath(st, v))}</span><button type="button" class="x" data-forget="${esc(k)}" aria-label="Esquecer regra">✕</button></li>`)
                  .join('')}</ul>`
              : '<p class="help">Quando você responder uma pergunta da importação, a resposta fica guardada aqui e vale para as próximas.</p>'
          }`;
      };
      el.addEventListener('click', async (e) => {
        const f = e.target.closest('[data-fav]');
        if (f) {
          if (!A.toggleFav(f.dataset.fav)) toast(`No máximo ${M.MAX_FAVS} atalhos. Tire um antes.`);
          draw();
          return;
        }
        const cg = e.target.closest('[data-cg]');
        if (cg) {
          const id = cg.dataset.cg;
          if (open.has(id)) open.delete(id);
          else open.add(id);
          draw();
          return;
        }
        const as = e.target.closest('[data-addsub]');
        if (as) {
          const g = M.catById(S(), as.dataset.addsub);
          if (await newCategory({ kind: g.kind, parent: g.id })) {
            open.add(g.id);
            draw();
          }
          return;
        }
        const ag = e.target.closest('[data-addgroup]');
        if (ag) {
          const c = await newCategory({ kind: ag.dataset.addgroup });
          if (c) {
            open.add(c.id);
            draw();
          }
          return;
        }
        const dc = e.target.closest('[data-delcat]');
        if (dc) {
          const c = M.catById(S(), dc.dataset.delcat);
          const ok = await confirmDialog({ title: `Apagar “${esc(c.name)}”?`, text: 'Os lançamentos dela passam para a categoria de cima.', ok: 'Apagar', danger: true });
          if (ok) {
            A.removeCustomCat(c.id);
            draw();
          }
          return;
        }
        const fr = e.target.closest('[data-forget]');
        if (fr) {
          A.forgetRule(fr.dataset.forget);
          draw();
        }
      });
      draw();
    },
    onClose: () => ctx.render(),
  });
}
