// Testes da categorização da importação: índice de frases (buildMatcher + kwMatch) e lote (buildBatch).
// Sem dependências (node:test). Rodar em codigo/: npm test
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/js/model.js';
import { buildBatch } from '../src/js/importer.js';
import { MERCHANTS } from '../src/js/merchants.js';

const newState = () => ({ core: M.defaultCore(), months: {} });

/** { descrição: categoria }, para comparar várias descrições de uma vez e ver todas as erradas no diff. */
const catsOf = (matcher, kind, descs) => Object.fromEntries(descs.map((d) => [d, M.kwMatch(matcher, kind, d)]));

describe('kwMatch: descrição → categoria', () => {
  const matcher = M.buildMatcher(newState());
  const cases = [
    // apps de entrega vencem "pizzaria", "restaurante" e "burger king" (o "ifood!" dos estabelecimentos não pode
    // perder o peso extra por "ifood" também estar nas palavras-chave do Delivery)
    ['despesa', 'IFOOD *PIZZARIA', 'delivery'],
    ['despesa', 'RAPPI RESTAURANTE X', 'delivery'],
    ['despesa', 'IFD*BURGER KING', 'delivery'],
    ['despesa', 'UBER EATS PIZZARIA', 'delivery'],
    ['despesa', 'ZE DELIVERY', 'delivery'],
    ['despesa', '99FOOD', 'delivery'],
    ['despesa', 'SUPERMERCADO BOM PRECO', 'supermercado'],
    ['despesa', 'DROGARIA SAO PAULO', 'farmacia'],
    ['despesa', 'POSTO SHELL', 'combustivel'],
    ['despesa', 'NETFLIX.COM', 'streaming'],
    ['despesa', 'UBER TRIP', 'app_taxi'],
    ['despesa', 'PADARIA PAO QUENTE', 'padaria'],
    ['despesa', 'OUTBACK STEAKHOUSE', 'restaurante'],
    ['despesa', 'MC DONALDS', 'restaurante'],
    // número colado no fim do nome
    ['despesa', 'RAIA123', 'farmacia'],
    ['despesa', 'RENNER512', 'roupas'],
    ['receita', 'CREDITO SALARIO', 'salario'],
    ['invest', 'APLICACAO CDB', 'investir'],
  ];
  for (const [kind, desc, cat] of cases) {
    test(`${kind}: "${desc}" → ${cat}`, () => assert.equal(M.kwMatch(matcher, kind, desc), cat));
  }
});

test('Delivery escondida: os apps de entrega vão para o grupo Comer fora', () => {
  const S = newState();
  S.core.cats.find((c) => c.id === 'delivery').hidden = true;
  const descs = ['IFOOD *PIZZARIA', 'IFD*BURGER KING'];
  assert.deepEqual(catsOf(M.buildMatcher(S), 'despesa', descs), Object.fromEntries(descs.map((d) => [d, 'comer'])));
});

describe('"termo!" do Delivery vence as outras palavras da descrição', () => {
  const matcher = M.buildMatcher(newState());
  // frases com "!" (num "termo*!" só o "!" interessa aqui)
  const boosted = MERCHANTS.delivery
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.endsWith('!'))
    .map((s) => s.slice(0, -1).replace(/\*$/, '').toUpperCase());
  // concorrentes longos de outras categorias
  const rivals = ['PIZZARIA', 'RESTAURANTE', 'HAMBURGUERIA', 'SUPERMERCADO', 'DROGARIA SAO PAULO', 'HORTIFRUTI NATURAL DA TERRA'];

  test('o Delivery tem frases com "!"', () => assert.ok(boosted.length > 0));

  test('cada concorrente, sozinho, vai para outra categoria', () => {
    for (const [desc, cat] of Object.entries(catsOf(matcher, 'despesa', rivals))) assert.ok(cat && cat !== 'delivery', `${desc} → ${cat}`);
  });

  for (const phrase of boosted) {
    test(`"${phrase} *…" → delivery`, () => {
      const descs = rivals.map((r) => `${phrase} *${r}`);
      assert.deepEqual(catsOf(matcher, 'despesa', descs), Object.fromEntries(descs.map((d) => [d, 'delivery'])));
    });
  }
});

test('buildBatch: extrato da conta categorizado sozinho', () => {
  // sa em centavos, como vem da leitura do extrato: negativo = saída
  const rows = [
    { desc: 'IFOOD *PIZZARIA', sa: -5890, kind: 'despesa', cat: 'delivery' },
    { desc: 'RAPPI RESTAURANTE X', sa: -4250, kind: 'despesa', cat: 'delivery' },
    { desc: 'SUPERMERCADO BOM PRECO', sa: -31275, kind: 'despesa', cat: 'supermercado' },
    { desc: 'DROGARIA SAO PAULO', sa: -4599, kind: 'despesa', cat: 'farmacia' },
    { desc: 'POSTO SHELL', sa: -20000, kind: 'despesa', cat: 'combustivel' },
    { desc: 'UBER TRIP', sa: -1890, kind: 'despesa', cat: 'app_taxi' },
    { desc: 'OUTBACK STEAKHOUSE', sa: -18900, kind: 'despesa', cat: 'restaurante' },
    { desc: 'CREDITO SALARIO', sa: 450000, kind: 'receita', cat: 'salario' },
    { desc: 'APLICACAO CDB', sa: -50000, kind: 'invest', cat: 'investir' },
  ];
  const statement = { type: 'conta', rows: rows.map(({ desc, sa }) => ({ date: '2026-11-05', desc, sa })) };
  const items = buildBatch(newState(), statement, statement.type);
  assert.deepEqual(
    items.map(({ desc, kind, cat, how }) => ({ desc, kind, cat, how })),
    rows.map(({ desc, kind, cat }) => ({ desc, kind, cat, how: 'auto' }))
  );
});
