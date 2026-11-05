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
  },
  render: () => {},
};

export const today = () => isoDate();
export const curMk = () => mkOf(isoDate());
