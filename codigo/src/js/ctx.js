// Contexto compartilhado entre os módulos.
import { isoDate, mkOf } from './util.js';

export const ctx = {
  S: null, // estado (core + months)
  ui: {
    tab: 'inicio',
    mk: mkOf(isoDate()), // mês aberto na aba "Mês"
    animate: true,
    openBills: new Set(), // Início, contas do mês: partes abertas ('receita', 'despesa', 'invest'); começam fechadas
    openCats: new Set(), // grupos abertos no detalhe da aba Mês
    openFlows: new Set(), // aba Mês, lançamentos: partes abertas ('receita', 'despesa', 'invest'); começam fechadas
    txFilter: null, // aba Mês: lançamentos só de uma categoria { id, sub } (sub: só aquele item, sem o resto do grupo)
    planOpen: new Set(), // grupos abertos em "Itens do plano"
    planCheck: false, // "Conferir o plano" aberto
    planSel: null, // mês escolhido no gráfico da aba Plano
    showDoneGoals: false,
  },
  render: () => {},
};

export const today = () => isoDate();
export const curMk = () => mkOf(isoDate());
