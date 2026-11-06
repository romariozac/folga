// Contexto compartilhado entre os módulos.
import { isoDate, mkOf } from './util.js';

export const ctx = {
  S: null, // estado (core + months)
  ui: {
    tab: 'inicio',
    mk: mkOf(isoDate()), // mês aberto na aba "Mês"
    animate: true,
    billsExpanded: false,
    openCats: new Set(), // grupos abertos no detalhe da aba Mês
    txFilter: null, // aba Mês: lançamentos só de uma categoria { id, sub } (sub: só aquele item, sem o resto do grupo)
    planOpen: new Set(), // grupos abertos em "Itens do plano"
    planSel: null, // mês escolhido no gráfico da aba Plano
    showDoneGoals: false,
  },
  render: () => {},
};

export const today = () => isoDate();
export const curMk = () => mkOf(isoDate());
