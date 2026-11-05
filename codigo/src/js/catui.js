// Componentes de categoria: navegador com busca, seletor em 2 níveis e a tela "Categorias e atalhos".
import { ctx } from './ctx.js';
import * as U from './util.js';
import * as M from './model.js';
import * as A from './actions.js';
import { $, openSheet, sheetHead, confirmDialog, toast } from './ui.js';

const S = () => ctx.S;
const { esc } = U;

function chip(c, attr, sub = '') {
  return `<button type="button" class="mchip" ${attr}="${c.id}">${c.emoji ? `<span>${c.emoji}</span>` : ''}${esc(c.name)}${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
}

/** Todas as categorias de um tipo, agrupadas (ou o resultado da busca). */
export function catBrowserHTML(kind, q = '', attr = 'data-pickcat') {
  const st = S();
  if (q.trim()) {
    const res = M.searchCats(st, kind, q);
    return res.length
      ? `<div class="mchips">${res.map((c) => chip(c, attr, c.parent ? M.catById(st, c.parent).name : '')).join('')}</div>`
      : `<p class="help center">Nada encontrado para “${esc(q)}”. Dá para criar em Ajustes › Categorias.</p>`;
  }
  return M.catTree(st, kind)
    .map(
      ({ g, subs }) =>
        `<section class="mgroup"><h4>${g.emoji} ${esc(g.name)}</h4><div class="mchips">${chip({ id: g.id, name: subs.length ? 'Geral' : g.name, emoji: '' }, attr)}${subs.map((c) => chip(c, attr)).join('')}</div></section>`
    )
    .join('');
}

/** Seletor em dois níveis para formulários: grupo e, opcionalmente, o detalhe. */
export function catPickerHTML(kind, selected) {
  const st = S();
  const gsel = M.groupId(st, selected);
  const subs = M.subsOf(st, gsel);
  const groups = M.groupsOf(st, kind)
    .map((g) => `<button type="button" class="cchip ${g.id === gsel ? 'on' : ''}" data-pick="${g.id}"><span>${g.emoji}</span>${esc(g.name)}</button>`)
    .join('');
  const detail = subs.length
    ? `<div class="sub-pick"><span class="help">Detalhe (opcional)</span><div class="cat-chips">${[{ id: gsel, name: 'Geral', emoji: '' }, ...subs]
        .map((c) => `<button type="button" class="cchip sm ${c.id === selected ? 'on' : ''}" data-pick="${c.id}">${c.emoji ? `<span>${c.emoji}</span>` : ''}${esc(c.name)}</button>`)
        .join('')}</div></div>`
    : '';
  return `<div class="cat-chips">${groups}</div>${detail}`;
}

/** Abre uma folha para escolher categoria (com busca). Resolve com o id escolhido ou null. */
export function pickCategory(kind, { title = 'Escolher categoria', sub = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    openSheet(
      `${sheetHead(title, sub)}<div class="search"><input type="search" placeholder="Buscar: streaming, farmácia, uber…" data-q aria-label="Buscar categoria"></div><div class="cat-browser" data-list>${catBrowserHTML(kind)}</div>`,
      {
        cls: 'sheet-tall',
        onMount: (el, close) => {
          const list = $('[data-list]', el);
          const q = $('[data-q]', el);
          q.addEventListener('input', () => (list.innerHTML = catBrowserHTML(kind, q.value)));
          el.addEventListener('click', (e) => {
            const b = e.target.closest('[data-pickcat]');
            if (!b) return;
            done = true;
            resolve(b.dataset.pickcat);
            close();
          });
        },
        onClose: () => {
          if (!done) resolve(null);
        },
      }
    );
  });
}

function askNewCat(title) {
  return new Promise((resolve) => {
    let done = false;
    openSheet(
      `<div class="dialog"><h2>${esc(title)}</h2><form class="form"><label class="field"><span>Nome</span><input name="name" maxlength="40" required placeholder="Ex.: Pilates, Feira orgânica, Uber"></label>
      <label class="field"><span>Emoji (opcional)</span><input name="emoji" maxlength="8" placeholder="🙂"></label>
      <div class="row-btns"><button type="button" class="btn ghost" data-sheet-close>Cancelar</button><button class="btn primary" type="submit">Criar</button></div></form></div>`,
      {
        cls: 'sheet-dialog',
        onMount: (el, close) => {
          const f = $('form', el);
          f.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = f.elements.name.value.trim();
            if (!name) return;
            done = true;
            resolve({ name, emoji: f.elements.emoji.value.trim() });
            close();
          });
        },
        onClose: () => {
          if (!done) resolve(null);
        },
      }
    );
  });
}

/** Ajustes › Categorias e atalhos. */
export function openCategories() {
  openSheet('<div data-cats-root></div>', {
    cls: 'sheet-tall',
    label: 'Categorias e atalhos',
    onMount: (el) => {
      const root = $('[data-cats-root]', el);
      const draw = () => {
        const st = S();
        const favs = st.core.settings.favs || [];
        const star = (id) => `<button type="button" class="star ${favs.includes(id) ? 'on' : ''}" data-fav="${id}" aria-label="${favs.includes(id) ? 'Tirar dos atalhos' : 'Pôr nos atalhos'}">${favs.includes(id) ? '★' : '☆'}</button>`;
        const del = (c) => (c.custom ? `<button type="button" class="x" data-delcat="${c.id}" aria-label="Apagar ${esc(c.name)}">✕</button>` : '');
        const section = (kind, title, stars) =>
          `<h3 class="group">${title}</h3>${M.catTree(st, kind)
            .map(
              ({ g, subs }) => `<div class="cg"><div class="cg-head"><span class="emo">${g.emoji}</span><b>${esc(g.name)}</b>${stars ? star(g.id) : ''}${del(g)}</div>
              <div class="cg-subs">${subs.map((c) => `<span class="sub-chip">${c.emoji} ${esc(c.name)}${stars ? star(c.id) : ''}${del(c)}</span>`).join('')}<button type="button" class="add-sub" data-addsub="${g.id}">+ item</button></div></div>`
            )
            .join('')}<button type="button" class="btn ghost small" data-addgroup="${kind}">+ Nova categoria</button>`;
        const rules = Object.entries(st.core.rules || {});
        root.innerHTML = `${sheetHead('Categorias e atalhos', 'Os itens com ★ aparecem na tela de lançar. O resto fica em “Mais”, com busca.')}
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
        const as = e.target.closest('[data-addsub]');
        if (as) {
          const g = M.catById(S(), as.dataset.addsub);
          const r = await askNewCat(`Novo item em ${g.name}`);
          if (r) {
            A.addCustomCat({ ...r, kind: g.kind, parent: g.id });
            draw();
          }
          return;
        }
        const ag = e.target.closest('[data-addgroup]');
        if (ag) {
          const r = await askNewCat('Nova categoria');
          if (r) {
            A.addCustomCat({ ...r, kind: ag.dataset.addgroup });
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
