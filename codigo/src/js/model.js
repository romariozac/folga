// Modelo de dados e cálculos do plano (projeção) e do mês (previsto x realizado).
import { addMonths, monthDiff, isoDate, sum } from './util.js';
import { MERCHANTS } from './merchants.js';

export const KIND_LABEL = { despesa: 'Gasto', receita: 'Receita', invest: 'Investimento' };
// 3: "Metas" virou categoria principal de investimento (cada meta é uma subcategoria dela)
export const CORE_VERSION = 3;

// Categorias em dois níveis, como na planilha de orçamento doméstico do Cerbasi: grupos
// (Habitação/Moradia, Transporte, Saúde, Educação, Despesas pessoais, Lazer...) e itens.
// kw = palavras e estabelecimentos (separados por vírgula) usados na busca e na importação.
const C = (id, name, emoji, kind, parent, kw) => {
  const c = { id, name, emoji, kind };
  if (parent) c.parent = parent;
  if (kw) c.kw = kw;
  return c;
};
const D = 'despesa';
const R = 'receita';
const I = 'invest';

export const DEFAULT_CATS = [
  // grupos de gasto
  C('mercado', 'Mercado', '🛒', D, null, 'alimentacao, compras do mes'),
  C('comer', 'Comer fora', '🍔', D, null, 'refeicao'),
  C('transporte', 'Transporte', '🚗', D, null, 'locomocao'),
  C('moradia', 'Moradia', '🏠', D, null, 'casa, habitacao'),
  C('lazer', 'Lazer', '🎬', D, null, 'diversao, entretenimento'),
  C('pessoal', 'Pessoal', '👕', D, null, 'despesas pessoais'),
  C('saude', 'Saúde', '🩺', D, null, ''),
  C('educacao', 'Educação', '📚', D, null, 'estudo, ensino'),
  C('outros', 'Outros', '✨', D, null, 'eventuais, diversos'),
  C('dividas', 'Dívidas e tarifas', '🏦', D, null, 'servicos financeiros'),
  C('filhos', 'Filhos', '🧒', D, null, 'dependentes, criancas'),
  C('pets', 'Pets', '🐾', D, null, 'cachorro, gato'),
  // moradia (habitação)
  C('aluguel', 'Aluguel ou prestação', '🔑', D, 'moradia', 'aluguel, prestacao, financiamento imobiliario, imobiliaria'),
  C('condominio', 'Condomínio', '🏢', D, 'moradia', 'condominio'),
  C('iptu', 'IPTU', '🧾', D, 'moradia', 'iptu'),
  C('luz', 'Luz', '💡', D, 'moradia', 'energia, energia eletrica, enel, light, cemig, copel, coelba, celpe, cosern, energisa, cpfl, equatorial, neoenergia, eletropaulo, celesc, coelce, rge'),
  C('agua', 'Água', '🚿', D, 'moradia', 'agua, saneamento, sabesp, cedae, copasa, sanepar, embasa, compesa, caesb, cagece, casan, corsan, saneago, aguas'),
  C('gas', 'Gás', '🔥', D, 'moradia', 'comgas, naturgy, ultragaz, liquigas, supergasbras, botijao'),
  C('internet', 'Internet e telefone', '📶', D, 'moradia', 'internet, banda larga, fibra, vivo fibra, claro net, net servicos, oi fibra, tim live, brisanet, telefone fixo'),
  C('streaming', 'TV e streaming', '📺', D, 'moradia', 'tv por assinatura, streaming, netflix, spotify, disney, prime video, amazon prime, hbo, max, globoplay, youtube premium, youtube, deezer, apple com bill, paramount, crunchyroll, sky, star plus, telecine'),
  C('diarista', 'Diarista e faxina', '🧹', D, 'moradia', 'diarista, faxina, faxineira, empregada, domestica'),
  C('manut_casa', 'Manutenção da casa', '🔧', D, 'moradia', 'reparo, conserto, encanador, eletricista, reforma, material de construcao'),
  C('casa_itens', 'Casa e decoração', '🛋️', D, 'moradia', 'leroy merlin, telhanorte, tok stok, tok&stok, camicado, mobly, etna, utilidades'),
  // mercado
  C('supermercado', 'Supermercado', '🛍️', D, 'mercado', 'supermercado, supermercados, mercado, mercadinho, atacadista, carrefour, assai, atacadao, pao de acucar, extra hiper, mercado extra, sams club, zaffari, condor, angeloni, savegnago, guanabara, mateus, nordestao, hiper, minimercado, oba hortifruti, st marche, dia supermercado'),
  C('feira', 'Feira e hortifrúti', '🥕', D, 'mercado', 'feira, hortifruti, sacolao, verdurao, quitanda'),
  C('padaria', 'Padaria', '🥖', D, 'mercado', 'padaria, panificadora, panificacao'),
  C('acougue', 'Açougue', '🥩', D, 'mercado', 'acougue, casa de carnes, frigorifico'),
  // comer fora
  C('restaurante', 'Restaurante', '🍽️', D, 'comer', 'restaurante, churrascaria, pizzaria, lanchonete, hamburgueria, outback, madero, coco bambu, mcdonalds, mc donalds, burger king, bk brasil, subway, habibs, spoleto, giraffas, china in box, almoco, jantar'),
  C('delivery', 'Delivery', '🛵', D, 'comer', 'ifood, rappi, aiqfome, ze delivery, uber eats, 99food, james delivery, delivery'),
  C('lanche', 'Lanche e café', '☕', D, 'comer', 'cafe, cafeteria, starbucks, sorveteria, kopenhagen, cacau show, doceria, lanche, confeitaria'),
  C('bar', 'Bar', '🍺', D, 'comer', 'bar, boteco, choperia, pub, cervejaria'),
  // transporte
  C('combustivel', 'Combustível', '⛽', D, 'transporte', 'combustivel, gasolina, etanol, diesel, posto, auto posto, shell, petrobras, br mania, posto ipiranga, postos'),
  C('app_taxi', 'App e táxi', '🚕', D, 'transporte', 'uber, 99app, 99 tecnologia, 99pop, 99 taxi, cabify, indrive, taxi'),
  C('onibus', 'Ônibus e metrô', '🚌', D, 'transporte', 'onibus, metro, trem, bilhete unico, recarga transporte, sptrans, cptm, top transporte'),
  C('estacion', 'Estacionamento e pedágio', '🅿️', D, 'transporte', 'estacionamento, pedagio, estapar, zona azul, sem parar, conectcar, veloe, taggy, move mais'),
  C('manut_carro', 'Manutenção do carro', '🔩', D, 'transporte', 'oficina, mecanica, mecanico, pneu, pneus, auto pecas, autopecas, lava jato, lavagem, revisao'),
  C('seguro_carro', 'Seguro do carro', '🛡️', D, 'transporte', 'seguro auto, porto seguro, azul seguros, tokio marine, hdi seguros, allianz'),
  C('ipva', 'IPVA e licenciamento', '📄', D, 'transporte', 'ipva, detran, licenciamento'),
  C('parcela_carro', 'Parcela do carro', '🚙', D, 'transporte', 'financiamento veiculo, consorcio'),
  // saúde
  C('plano_saude', 'Plano de saúde', '🏥', D, 'saude', 'plano de saude, unimed, amil, bradesco saude, sulamerica, hapvida, notredame, intermedica, prevent senior, porto saude'),
  C('consultas', 'Consultas e exames', '🔬', D, 'saude', 'consulta, clinica, laboratorio, exame, fleury, dasa, lavoisier, delboni, hospital, medico'),
  C('dentista', 'Dentista', '🦷', D, 'saude', 'dentista, odonto, odontologia, ortodontia'),
  C('farmacia', 'Farmácia', '💊', D, 'saude', 'farmacia, drogaria, drogasil, droga raia, drogaraia, raia drogasil, pague menos, panvel, drogaria pacheco, drogarias pacheco, ultrafarma, drogaria araujo, farmacia nissei, sao joao farmacias, remedio'),
  C('terapia', 'Terapia', '🧠', D, 'saude', 'terapia, psicologo, psicologa, psicoterapia, psiquiatra'),
  // educação
  C('escola', 'Escola e faculdade', '🎓', D, 'educacao', 'escola, colegio, faculdade, universidade, mensalidade escolar'),
  C('cursos', 'Cursos e idiomas', '📝', D, 'educacao', 'curso, cursos, idiomas, ingles, udemy, alura, coursera, duolingo, hotmart'),
  C('livros', 'Livros e material', '✏️', D, 'educacao', 'livraria, livros, papelaria, kindle, saraiva'),
  C('matricula', 'Matrícula e material escolar', '🏫', D, 'educacao', 'matricula, material escolar, uniforme escolar'),
  // pessoal
  C('roupas', 'Roupas e calçados', '👟', D, 'pessoal', 'renner, riachuelo, c&a, zara, hering, centauro, netshoes, nike, adidas, arezzo, shein, lojas marisa, calcados, roupas'),
  C('beleza', 'Beleza e cabelo', '💇', D, 'pessoal', 'salao, cabeleireiro, barbearia, manicure, boticario, natura, sephora, estetica'),
  C('academia', 'Academia e esporte', '🏋️', D, 'pessoal', 'academia, smartfit, smart fit, bluefit, selfit, bodytech, gympass, wellhub, totalpass, crossfit'),
  C('celular', 'Celular', '📱', D, 'pessoal', 'celular, vivo, claro, tim, oi, recarga'),
  C('higiene', 'Higiene e cuidados', '🧼', D, 'pessoal', 'perfumaria, cosmeticos, higiene'),
  C('presentes', 'Presentes', '🎁', D, 'pessoal', 'presente, presentes'),
  // lazer
  C('passeios', 'Passeios e cinema', '🎟️', D, 'lazer', 'cinema, cinemark, kinoplex, cinepolis, ingresso com, sympla, eventim, ticketmaster, teatro, show, parque, museu'),
  C('viagens', 'Viagens', '✈️', D, 'lazer', 'viagem, hotel, hoteis, pousada, airbnb, booking, latam, gol linhas, voegol, azul linhas, decolar, 123milhas, passagem aerea, hurb'),
  C('hobbies', 'Hobbies', '🎨', D, 'lazer', 'hobby, artesanato'),
  C('jogos', 'Jogos e apps', '🎮', D, 'lazer', 'steam, playstation, psn, xbox, nintendo, google play, jogos'),
  C('festas', 'Festas', '🎉', D, 'lazer', 'festa, balada'),
  // dívidas e tarifas
  C('cartao', 'Juros e anuidade do cartão', '💳', D, 'dividas', 'anuidade, juros, encargos, iof, rotativo, juros de mora'),
  C('emprestimo', 'Empréstimo e financiamento', '📃', D, 'dividas', 'emprestimo, consignado, credito pessoal, financiamento, parcela emprestimo'),
  C('tarifas', 'Tarifas bancárias', '🏧', D, 'dividas', 'tarifa, tarifas, pacote de servicos, pacote servicos, tar pacote, tar mensal, cesta de servicos, cesta, manutencao de conta'),
  // filhos
  C('escola_filhos', 'Escola dos filhos', '🎒', D, 'filhos', 'creche, bercario, escolinha'),
  C('mesada', 'Mesada', '🐷', D, 'filhos', 'mesada'),
  C('baba', 'Babá e cuidados', '🍼', D, 'filhos', 'baba, fraldas'),
  C('brinquedos', 'Brinquedos', '🧸', D, 'filhos', 'brinquedos, ri happy, pbkids'),
  // pets
  C('racao', 'Ração e petiscos', '🦴', D, 'pets', 'petz, cobasi, petlove, racao'),
  C('veterinario', 'Veterinário', '🐶', D, 'pets', 'veterinario, veterinaria, clinica veterinaria'),
  C('banho_tosa', 'Banho e tosa', '🛁', D, 'pets', 'pet shop, petshop, banho e tosa'),
  // outros (eventuais)
  C('compras_online', 'Compras online', '📦', D, 'outros', 'shopee, mercado livre, mercadolivre, amazon, amazon br, magalu, magazine luiza, americanas, aliexpress, casas bahia, temu, kabum'),
  C('doacoes', 'Doações e dízimo', '🤲', D, 'outros', 'doacao, dizimo, oferta, igreja, vaquinha'),
  C('imprevistos', 'Imprevistos', '🧯', D, 'outros', 'imprevisto, emergencia'),
  C('saque', 'Saque em dinheiro', '💵', D, 'outros', 'saque, saque atm, saque 24h, banco24horas, saque banco 24 horas, saque caixa'),
  C('impostos', 'Impostos e taxas', '🏛️', D, 'outros', 'imposto, darf, gru, taxa'),
  // receitas
  C('salario', 'Salário', '💼', R, null, 'salario, folha, pagamento de salario, pgto salario, credito salario, remuneracao, proventos, vencimentos'),
  C('extra', 'Renda extra', '💸', R, null, 'renda extra'),
  C('outras_rec', 'Outras receitas', '💰', R, null, ''),
  C('freela', 'Freela e bicos', '🛠️', R, 'extra', 'freela, freelance, servico prestado, honorarios'),
  C('vendas', 'Vendas', '🏷️', R, 'extra', 'venda, vendas'),
  C('decimo', '13º salário', '🎄', R, 'outras_rec', 'decimo terceiro, 13o salario, 13 salario'),
  C('ferias_rec', 'Férias', '🏖️', R, 'outras_rec', 'ferias'),
  C('restituicao', 'Restituição do IR', '🧾', R, 'outras_rec', 'restituicao, irpf, imposto de renda'),
  C('rendimentos', 'Rendimentos', '📈', R, 'outras_rec', 'rendimento, rendimentos, rend pago, juros poupanca, dividendos, jcp'),
  C('reembolso', 'Reembolso', '↩️', R, 'outras_rec', 'reembolso, estorno, devolucao'),
  // guardar
  C('reserva', 'Reserva de emergência', '🛟', I, null, 'reserva, reserva de emergencia'),
  C('investir', 'Investimentos', '🌱', I, null, 'aplicacao, aplic, cdb, tesouro, lci, lca, rdb, fundo, poupanca, caixinha, cofrinho, porquinho, investimento'),
  C('previdencia', 'Previdência', '🧓', I, 'investir', 'previdencia, pgbl, vgbl'),
  C('sonhos', 'Metas', '🎯', I, null, 'meta, metas, sonho, sonhos, objetivo'),
];

/** Os 9 atalhos padrão da tela de lançar (o resto fica em “Mais”). */
export const DEFAULT_FAVS = ['mercado', 'comer', 'transporte', 'moradia', 'lazer', 'pessoal', 'saude', 'educacao', 'outros'];
export const MAX_FAVS = 9;

export function defaultCore() {
  return {
    v: CORE_VERSION,
    updatedAt: 0,
    settings: {
      name: '',
      onboarded: false,
      checkinDay: 0, // 0 = domingo (Date.getDay)
      theme: 'auto',
      reserveStart: 0, // quanto já havia na reserva antes do app
      reserveGoalMonths: 6,
      investStart: 0, // quanto já havia em outros investimentos (fora a reserva e as metas)
      lastImport: null, // data da última importação de extrato/fatura (o hábito principal)
      balanceStart: 0, // saldo de antes do primeiro mês (ajustável para bater com o banco)
      createdAt: isoDate(),
      favs: [...DEFAULT_FAVS],
    },
    cats: DEFAULT_CATS.map((c) => ({ ...c })),
    plan: [],
    // metas: { id, name, emoji, target, due:'YYYY-MM', saved0, cat, line, created, done? }
    goals: [],
    rules: {}, // aprendizado da importação: { 'despesa:maria silva': 'diarista' }
    autoSkip: {}, // contas automáticas desmarcadas: { 'linhaId@YYYY-MM': 1 }
    game: {
      xp: 0,
      badges: {},
      weeks: {}, // { 'YYYY-MM-DD'(segunda): { e: lançamentos, c: 1 se fez check-in } }
      xpDays: {},
      bestStreak: 0,
      lastActive: null,
      monthsClosed: {},
      paidMonths: {},
      billsDone: {},
      totalTx: 0,
    },
  };
}

export const emptyState = () => ({ core: defaultCore(), months: {} });

// Itens criados pelo assistente na versão 1 → subcategorias novas.
const TEMPLATE_REMAP = {
  'Aluguel ou prestação': 'aluguel',
  Condomínio: 'condominio',
  Luz: 'luz',
  Água: 'agua',
  'Internet / TV': 'internet',
  Celular: 'celular',
  'Plano de saúde': 'plano_saude',
  'Escola / faculdade': 'escola',
  Academia: 'academia',
  'Streaming e assinaturas': 'streaming',
  'Parcela do carro': 'parcela_carro',
  'Empréstimo / financiamento': 'emprestimo',
  IPVA: 'ipva',
  IPTU: 'iptu',
  'Matrícula e material escolar': 'matricula',
  'Seguro do carro': 'seguro_carro',
  'Presentes de fim de ano': 'presentes',
  'Viagem de férias': 'viagens',
  '13º salário (1ª parcela)': 'decimo',
  '13º salário (2ª parcela)': 'decimo',
  '1/3 de férias': 'ferias_rec',
};

/** Atualiza dados antigos. Devolve true se mudou algo que precisa ser salvo. */
export function migrateCore(core) {
  let changed = false;
  const from = core.v || 1;
  const old = from < CORE_VERSION;
  for (const d of DEFAULT_CATS) {
    const c = core.cats.find((x) => x.id === d.id);
    if (!c) {
      core.cats.push({ ...d });
      changed = true;
    } else if (old && !c.custom) {
      Object.assign(c, { name: d.name, emoji: d.emoji, kind: d.kind, kw: d.kw });
      if (d.parent) c.parent = d.parent;
      else delete c.parent;
    }
  }
  if (old) {
    if (from < 2) {
      const parentOf = Object.fromEntries(DEFAULT_CATS.map((c) => [c.id, c.parent || null]));
      for (const l of core.plan || []) {
        const to = TEMPLATE_REMAP[l.name];
        if (to && parentOf[to] === l.cat) l.cat = to;
      }
    }
    core.v = CORE_VERSION;
    changed = true;
  }
  if (!Array.isArray(core.goals)) {
    core.goals = [];
    changed = true;
  }
  if (!Array.isArray(core.settings.favs)) {
    core.settings.favs = [...DEFAULT_FAVS];
    changed = true;
  }
  if (!core.rules || typeof core.rules !== 'object') core.rules = {};
  if (!core.autoSkip || typeof core.autoSkip !== 'object') core.autoSkip = {};
  return changed;
}

// ---------- categorias ----------
export const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function catById(S, id) {
  return S.core.cats.find((c) => c.id === id) || { id, name: 'Sem categoria', emoji: '•', kind: 'despesa' };
}
export function groupId(S, id) {
  const c = S.core.cats.find((x) => x.id === id);
  return c && c.parent ? c.parent : id;
}
export const groupsOf = (S, kind) => S.core.cats.filter((c) => c.kind === kind && !c.parent && !c.hidden);
export const subsOf = (S, gid) => S.core.cats.filter((c) => c.parent === gid && !c.hidden);
/** Categoria com o mesmo nome (sem acento e sem maiúsculas). parent: undefined = qualquer lugar; null = só grupos. */
export function catByName(S, kind, name, parent) {
  const n = norm(name).replace(/\s+/g, ' ').trim();
  return S.core.cats.find((c) => c.kind === kind && !c.hidden && (parent === undefined || (c.parent || null) === parent) && norm(c.name).replace(/\s+/g, ' ').trim() === n) || null;
}
export function catPath(S, id) {
  const c = catById(S, id);
  return c.parent ? `${catById(S, c.parent).name} › ${c.name}` : c.name;
}
/** Grupos e seus itens, na ordem para listar. */
export function catTree(S, kind) {
  return groupsOf(S, kind).map((g) => ({ g, subs: subsOf(S, g.id) }));
}

/** Atalhos da tela de lançar: tudo, se couber; senão os favoritos + “Mais”. */
export function quickCats(S, kind) {
  const all = catTree(S, kind).flatMap(({ g, subs }) => [g, ...subs]);
  if (all.length <= 10) return { list: all, more: false };
  const favs = (S.core.settings.favs || DEFAULT_FAVS).map((id) => all.find((c) => c.id === id)).filter(Boolean).slice(0, MAX_FAVS);
  return { list: favs, more: true };
}

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'com', 'para', 'por', 'ou', 'a', 'o']);

export function searchCats(S, kind, q) {
  const words = norm(q)
    .split(/[^a-z0-9&]+/)
    .filter((w) => w && !STOP.has(w));
  if (!words.length) return [];
  const res = [];
  for (const c of S.core.cats) {
    if (c.kind !== kind || c.hidden) continue;
    const name = norm(c.name);
    const kws = norm(`${c.kw || ''},${(MERCHANTS[c.id] || '').replace(/[*!]/g, '')}`).split(',').map((k) => k.trim()).filter(Boolean);
    const g = c.parent ? norm(catById(S, c.parent).name) : '';
    let score = 0;
    for (const w of words) {
      if (name.startsWith(w) || name.includes(' ' + w)) score += 4;
      else if (name.includes(w)) score += 3;
      else if (kws.some((k) => k === w || k.startsWith(w) || k.includes(' ' + w))) score += 2;
      else if (g.includes(w)) score += 1;
      else {
        score = -1;
        break;
      }
    }
    if (score > 0) res.push({ c, score: score + (c.parent ? 0.1 : 0) });
  }
  return res
    .sort((a, b) => b.score - a.score)
    .slice(0, 14)
    .map((r) => r.c);
}

/** Índice de frases (nomes + palavras-chave + estabelecimentos conhecidos) para reconhecer descrições. */
export function buildMatcher(S) {
  const list = [];
  const seen = new Set();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const add = (p, c, prefix, boost = 0) => {
    if (p.length < 2 || seen.has(`${c.id}|${p}|${prefix}`)) return;
    seen.add(`${c.id}|${p}|${prefix}`);
    const body = esc(p).replace(/\s+/g, '[^a-z0-9&]+');
    // "termo*" pega o começo de palavra (abreviações de fatura); os outros pegam a palavra inteira (plural com s).
    // Número colado no fim vale ("RAIA123", "RENNER512").
    const re = new RegExp(prefix ? `(^|[^a-z0-9&])${body}` : `(^|[^a-z0-9&])${body}s?($|[^a-z&])`);
    list.push({ re, len: p.length + boost, cat: c.id, kind: c.kind, sub: !!c.parent });
  };
  const visible = new Map();
  for (const c of S.core.cats) {
    if (c.hidden) continue;
    visible.set(c.id, c);
    add(norm(c.name), c, false);
    for (const p of (c.kw || '').split(',')) add(norm(p).trim(), c, false);
  }
  for (const [id, str] of Object.entries(MERCHANTS)) {
    // categoria escondida ou apagada: o estabelecimento vai para o grupo dela
    let c = visible.get(id);
    if (!c) {
      const d = DEFAULT_CATS.find((x) => x.id === id);
      c = d && d.parent ? visible.get(d.parent) : null;
    }
    if (!c) continue;
    for (const raw of str.split(',')) {
      // "termo!" = vale mais que qualquer outra palavra da descrição ("IFD*BURGER" é delivery, não restaurante)
      const t = raw.trim().replace(/!$/, '');
      const boost = raw.trim().endsWith('!') ? 30 : 0;
      if (t.endsWith('*')) add(t.slice(0, -1), c, true, boost);
      else add(t, c, false, boost);
    }
  }
  return list;
}

export function kwMatch(matcher, kind, text) {
  const n = norm(text);
  let best = null;
  for (const m of matcher) {
    if (m.kind !== kind || !m.re.test(n)) continue;
    if (!best || m.len > best.len || (m.len === best.len && m.sub && !best.sub)) best = m;
  }
  return best ? best.cat : null;
}

/** Sugere categoria pela descrição digitada: histórico primeiro, depois palavras-chave. */
export function suggestCat(S, kind, note, matcher) {
  const n = norm(note).trim();
  if (n.length < 3) return null;
  const mks = Object.keys(S.months).sort().slice(-6).reverse();
  for (const mk of mks) {
    const t = S.months[mk].tx
      .slice()
      .reverse()
      .find((x) => x.k === kind && x.n && !x.ap && !x.p && norm(x.n).trim() === n);
    if (t) return t.c;
  }
  return kwMatch(matcher || buildMatcher(S), kind, n);
}

// ---------- plano ----------
// Linha do plano: { id, name, kind, cat, amount(centavos), type:'conta'|'verba',
//   rec:'mensal'|'anual'|'parcelas'|'unico', start:'YYYY-MM', end?, months?:[1..12], count?, day?, auto? }

export function occurs(l, mk) {
  if (!l || !l.amount) return false;
  const start = l.start || '2000-01';
  switch (l.rec) {
    case 'mensal':
      return mk >= start && (!l.end || mk <= l.end);
    case 'anual':
      return mk >= start && (l.months || []).includes(+mk.slice(5, 7));
    case 'parcelas': {
      const d = monthDiff(start, mk);
      return d >= 0 && d < (l.count || 1);
    }
    case 'unico':
      return mk === start;
    default:
      return false;
  }
}

export function parcelaOf(l, mk) {
  if (l.rec !== 'parcelas') return null;
  return { n: monthDiff(l.start, mk) + 1, total: l.count };
}

export const txOf = (S, mk) => (S.months[mk] && S.months[mk].tx) || [];

/** Previsto x realizado de um mês (por grupo em byCat; por item em bySub). */
export function monthCalc(S, mk) {
  const lines = S.core.plan.filter((l) => occurs(l, mk));
  const txs = txOf(S, mk);
  const parent = {};
  for (const c of S.core.cats) parent[c.id] = c.parent || c.id;
  const gid = (id) => parent[id] || id;
  const prev = { receita: 0, despesa: 0, invest: 0 };
  const real = { receita: 0, despesa: 0, invest: 0 };
  const byCat = {};
  const bySub = {};
  const slot = (map, id, kind) => (map[id] ||= { id, kind, prev: 0, real: 0, n: 0 });
  for (const l of lines) {
    prev[l.kind] += l.amount;
    slot(byCat, gid(l.cat), l.kind).prev += l.amount;
    slot(bySub, l.cat, l.kind).prev += l.amount;
  }
  for (const t of txs) {
    real[t.k] += t.v;
    const b = slot(byCat, gid(t.c), t.k);
    b.real += t.v;
    b.n++;
    const s = slot(bySub, t.c, t.k);
    s.real += t.v;
    s.n++;
  }
  const bills = lines
    .filter((l) => l.type !== 'verba')
    .map((l) => ({ line: l, tx: txs.find((t) => t.p === l.id) || null }))
    .sort((a, b) => !!a.tx - !!b.tx || (a.line.day || 99) - (b.line.day || 99) || a.line.name.localeCompare(b.line.name));

  // Projeção do fim do mês: o que já aconteceu ou o que ainda está previsto, o que for maior.
  const exp = { receita: Math.max(real.receita, prev.receita), invest: Math.max(real.invest, prev.invest), despesa: 0 };
  for (const b of Object.values(byCat)) if (b.kind === 'despesa') exp.despesa += Math.max(b.real, b.prev);

  return {
    mk,
    lines,
    txs,
    prev,
    real,
    byCat,
    bySub,
    bills,
    exp,
    saldoPrev: prev.receita - prev.despesa - prev.invest,
    saldoReal: real.receita - real.despesa - real.invest,
    saldoExp: exp.receita - exp.despesa - exp.invest,
  };
}

/** Resultado realizado de um mês: entradas − despesas − o que foi guardado. */
function realOf(S, mk) {
  let s = 0;
  for (const t of txOf(S, mk)) s += t.k === 'receita' ? t.v : -t.v;
  return s;
}

/**
 * Saldo que vem do mês anterior, como no extrato do banco: o saldo inicial (ajustável) mais o resultado de
 * todos os meses antes de mk. Para um mês futuro, o mês atual entra pelo esperado e os seguintes pelo previsto.
 */
export function carryIn(S, mk) {
  const cm = isoDate().slice(0, 7);
  let bal = S.core.settings.balanceStart || 0;
  for (const m of Object.keys(S.months)) if (m < mk && m <= cm) bal += realOf(S, m);
  if (mk > cm) {
    bal += monthCalc(S, cm).saldoExp - realOf(S, cm);
    for (let m = addMonths(cm, 1); m < mk; m = addMonths(m, 1)) bal += monthCalc(S, m).saldoPrev;
  }
  return bal;
}

/** Projeção mês a mês (o coração da planilha do Cerbasi: tudo que vai entrar e sair). */
export function projection(S, fromMk, n = 12) {
  const rows = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const mk = addMonths(fromMk, i);
    const r = { mk, receita: 0, despesa: 0, invest: 0, extras: [] };
    for (const l of S.core.plan) {
      if (!occurs(l, mk)) continue;
      r[l.kind] += l.amount;
      if (l.rec !== 'mensal' && l.kind === 'despesa') r.extras.push(l);
    }
    r.saldo = r.receita - r.despesa - r.invest;
    acc += r.saldo;
    r.acc = acc;
    rows.push(r);
  }
  return rows;
}

/** Quanto separar por mês para os gastos anuais/únicos dos próximos 12 meses. */
export function seasonalProvision(S, fromMk) {
  let total = 0;
  const items = new Set();
  for (let i = 0; i < 12; i++) {
    const mk = addMonths(fromMk, i);
    for (const l of S.core.plan) {
      if (l.kind === 'despesa' && (l.rec === 'anual' || l.rec === 'unico') && occurs(l, mk)) {
        total += l.amount;
        items.add(l.name);
      }
    }
  }
  return { monthly: Math.round(total / 12), total, items: [...items] };
}

/** Custo de vida mensal: média das despesas previstas; sem plano, média do realizado recente. */
export function custoDeVida(S, fromMk) {
  const planned = sum(projection(S, fromMk, 12), (r) => r.despesa) / 12;
  if (planned > 0) return Math.round(planned);
  const mks = Object.keys(S.months).filter((mk) => mk < fromMk).sort().slice(-3);
  if (!mks.length) return 0;
  return Math.round(sum(mks, (mk) => sum(txOf(S, mk).filter((t) => t.k === 'despesa'), (t) => t.v)) / mks.length);
}

export function reserveBalance(S) {
  let total = S.core.settings.reserveStart || 0;
  for (const mk in S.months) for (const t of S.months[mk].tx) if (t.c === 'reserva') total += t.v;
  return total;
}

// ---------- metas e investimentos ----------
/** Ideias para a primeira meta (só atalhos: nome e valor ficam por conta de quem usa). */
export const GOAL_IDEAS = [
  { name: 'Viagem em família', emoji: '✈️' },
  { name: 'Trocar de carro', emoji: '🚗' },
  { name: 'Entrada da casa', emoji: '🏠' },
  { name: 'Casamento', emoji: '💍' },
  { name: 'Estudos', emoji: '🎓' },
  { name: 'Celular novo', emoji: '📱' },
];

/** Arredonda para cima, de R$ 10 em R$ 10 (valores sugeridos por mês). */
export const roundUp10 = (c) => (c > 0 ? Math.ceil(c / 1000) * 1000 : 0);

/** Total guardado por categoria de investimento, somando todos os meses. */
export function investByCat(S) {
  const by = {};
  for (const mk in S.months) for (const t of S.months[mk].tx) if (t.k === 'invest') by[t.c] = (by[t.c] || 0) + t.v;
  return by;
}

export const activeGoals = (S) => (S.core.goals || []).filter((g) => !g.done);
export const goalById = (S, id) => (S.core.goals || []).find((g) => g.id === id) || null;
export const goalByCat = (S, cat) => (S.core.goals || []).find((g) => g.cat === cat) || null;

/**
 * Situação de uma meta no mês mk: guardado, quanto falta, meses até o prazo (contando mk),
 * quanto guardar por mês para chegar no prazo e quando chega no ritmo planejado.
 */
export function goalInfo(S, g, mk, by = investByCat(S)) {
  const saved = (g.saved0 || 0) + (by[g.cat] || 0);
  const target = g.target || 0;
  const left = Math.max(0, target - saved);
  const reached = target > 0 && saved >= target;
  const months = g.due ? Math.max(1, monthDiff(mk, g.due) + 1) : null;
  const line = g.line ? S.core.plan.find((l) => l.id === g.line) || null : null;
  const planned = line ? line.amount : 0;
  const need = months ? roundUp10(left / months) : null;
  const late = !reached && need != null && need > planned + 100;
  const eta = !reached && planned > 0 ? addMonths(mk, Math.ceil(left / planned) - 1) : null;
  return { saved, target, left, reached, months, line, planned, need, late, eta, pct: target ? Math.min(1, Math.max(0, saved / target)) : 0, overdue: !!g.due && mk > g.due && !reached };
}

/** Dinheiro guardado hoje (reserva, metas ativas e outros investimentos) e quanto será em 12 meses pelo plano. */
export function savings(S, mk) {
  const by = investByCat(S);
  const goalCats = new Set((S.core.goals || []).map((g) => g.cat));
  const reserve = reserveBalance(S);
  const metas = sum(activeGoals(S), (g) => (g.saved0 || 0) + (by[g.cat] || 0));
  let other = S.core.settings.investStart || 0;
  for (const [c, v] of Object.entries(by)) if (c !== 'reserva' && !goalCats.has(c)) other += v;
  const total = reserve + metas + other;
  const rows = projection(S, mk, 12);
  const plannedNow = rows[0] ? rows[0].invest : 0;
  const realNow = sum(txOf(S, mk).filter((t) => t.k === 'invest'), (t) => t.v);
  // o que já foi guardado neste mês não conta duas vezes
  const in12 = total + sum(rows, (r) => r.invest) - Math.min(Math.max(0, realNow), plannedNow);
  return { reserve, metas, other, total, in12, plannedNow, realNow };
}

/** Média por mês do plano nos próximos 12 meses: para onde vai a renda. */
export function planSplit(S, fromMk) {
  const t = { renda: 0, fixas: 0, verbas: 0, anuais: 0, guardar: 0 };
  for (let i = 0; i < 12; i++) {
    const mk = addMonths(fromMk, i);
    for (const l of S.core.plan) {
      if (!occurs(l, mk)) continue;
      if (l.kind === 'receita') t.renda += l.amount;
      else if (l.kind === 'invest') t.guardar += l.amount;
      else if (l.type === 'verba') t.verbas += l.amount;
      else if (l.rec === 'mensal') t.fixas += l.amount;
      else t.anuais += l.amount;
    }
  }
  for (const k of Object.keys(t)) t[k] = Math.round(t[k] / 12);
  t.sobra = t.renda - t.fixas - t.verbas - t.anuais - t.guardar;
  return t;
}

export function recentTx(S, n = 6) {
  const all = [];
  for (const mk of Object.keys(S.months).sort().slice(-3)) for (const t of S.months[mk].tx) all.push({ ...t, mk });
  return all.sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, n);
}

/** Texto da recorrência de uma linha do plano. */
export function recText(l) {
  const M = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const day = l.day && l.type !== 'verba' ? `, dia ${l.day}` : '';
  const auto = l.auto && l.type !== 'verba' ? ' · automático' : '';
  switch (l.rec) {
    case 'mensal':
      return (l.type === 'verba' ? 'por mês, aos poucos' : 'todo mês') + day + (l.end ? ` até ${M[+l.end.slice(5) - 1]}/${l.end.slice(2, 4)}` : '') + auto;
    case 'anual':
      return (l.months || []).map((m) => M[m - 1]).join(', ') + ' (todo ano)' + day + auto;
    case 'parcelas':
      return `${l.count}x a partir de ${M[+l.start.slice(5) - 1]}/${l.start.slice(2, 4)}` + day + auto;
    case 'unico':
      return `só em ${M[+l.start.slice(5) - 1]}/${l.start.slice(2, 4)}` + day + auto;
    default:
      return '';
  }
}

// ---------- modelos para montar o plano rápido ----------
export const BILL_TEMPLATES = [
  { name: 'Aluguel ou prestação', cat: 'aluguel', day: 10 },
  { name: 'Condomínio', cat: 'condominio', day: 10 },
  { name: 'Luz', cat: 'luz', day: 15 },
  { name: 'Água', cat: 'agua', day: 15 },
  { name: 'Internet', cat: 'internet', day: 15 },
  { name: 'Celular', cat: 'celular', day: 15 },
  { name: 'Plano de saúde', cat: 'plano_saude', day: 5 },
  { name: 'Escola / faculdade', cat: 'escola', day: 5 },
  { name: 'Academia', cat: 'academia', day: 5 },
  { name: 'Streaming (Netflix, Spotify...)', cat: 'streaming', day: 20 },
  { name: 'Parcela do carro', cat: 'parcela_carro', day: 10 },
  { name: 'Empréstimo / financiamento', cat: 'emprestimo', day: 10 },
];

export const VERBA_TEMPLATES = [
  { name: 'Mercado', cat: 'mercado' },
  { name: 'Comer fora e delivery', cat: 'comer' },
  { name: 'Transporte do dia a dia', cat: 'transporte' },
  { name: 'Lazer', cat: 'lazer' },
  { name: 'Pessoal (roupas, beleza)', cat: 'pessoal' },
  { name: 'Farmácia e saúde', cat: 'saude' },
];

export const SEASONAL_TEMPLATES = [
  { name: 'IPVA', cat: 'ipva', month: 1 },
  { name: 'IPTU', cat: 'iptu', month: 2 },
  { name: 'Matrícula e material escolar', cat: 'matricula', month: 1 },
  { name: 'Seguro do carro', cat: 'seguro_carro', month: 8 },
  { name: 'Presentes de fim de ano', cat: 'presentes', month: 12 },
  { name: 'Viagem de férias', cat: 'viagens', month: 7 },
];

// Ideias do método, parafraseadas, com a origem indicada (ver README para os links).
export const TIPS = [
  { t: 'Orçamento não é só controlar gastos: é o hábito de projetar o que vem pela frente.', s: 'Cerbasi, “orçamento inteligente”' },
  { t: 'Inverta a ordem: decida quanto guardar para os seus sonhos e só então gaste o que sobra. O que sobra define seu padrão de vida.', s: 'Cerbasi, entrevista ao Correio' },
  { t: 'Revise o plano pelo menos uma vez por mês. Ajustar faz parte, não é fracasso.', s: 'Cerbasi, entrevista ao Correio' },
  { t: 'Controle semanal ou quinzenal funciona melhor que o diário, e desanima menos.', s: 'Resumo de “Como Organizar Sua Vida Financeira”' },
  { t: 'Reserva de emergência: comece por 3 meses de custo de vida e mire em 6.', s: 'Cerbasi, entrevistas' },
  { t: 'Renda variável? Planeje pelo menor ganho provável.', s: 'Cerbasi, Forbes' },
  { t: 'IPVA, IPTU, matrícula: o que é anual entra no plano desde já, para janeiro não assustar.', s: 'Planilha de orçamento doméstico' },
  { t: 'Faça um ranking dos seus gastos: ele mostra o que cortar primeiro, se precisar.', s: 'Resumo de “Como Organizar Sua Vida Financeira”' },
  { t: 'O controle olha para o passado; o planejamento olha para o futuro e mostra se você está no ritmo certo.', s: 'Cerbasi, redes sociais' },
];
