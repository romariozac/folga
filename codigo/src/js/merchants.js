// Estabelecimentos e palavras comuns em extratos e faturas brasileiras → categoria do app.
// Fica fora das categorias salvas (não pesa no seu backup) e é usado só para reconhecer descrições.
// Formato: frases separadas por vírgula, já sem acento e em minúsculas. "termo*" = qualquer palavra que
// comece assim (pega abreviações de fatura: "SUPERM BOM PRECO", "PANIF ESTRELA", "DROGAR SAO JOAO").
// "termo!" = vence as outras palavras da descrição (apps de entrega: "IFD*PIZZARIA X" é delivery).
export const MERCHANTS = {
  // mercado
  supermercado:
    'superm*, supermkt*, hipermerc*, atacad*, atacarejo, mercearia*, minimerc*, mercadinho*, minimercado, emporio, carrefour, assai, atacadao, pao de acucar, minuto pao de acucar, extra hiper, extra mercado, mercado extra, dia brasil, supermercado dia, big bompreco, bompreco, sams club, makro, tenda atacado, roldao, spani, sonda, st marche, mambo, dalben, covabra, enxuto, savegnago, condor, muffato, super muffato, angeloni, giassi, zaffari, bistek, comper, fort atacadista, super nosso, verdemar, mart minas, epa supermercados, villefort, supermercados bh, bh supermercados, supermercados guanabara, mundial supermercados, prezunic, grupo mateus, mateus supermercados, mix mateus, nordestao, gbarbosa, hiperideal, redemix, atakarejo, max atacadista, maxxi atacado, sendas, andorinha, ricoy, dovale, festval, coop cooperativa, cooperativa de consumo, oxxo, carrefour express, hortifruti natural da terra, supermarket, pague pouco, rede economia, bergamini, joanin, tauste, superbom, todo dia, cometa supermercados',
  feira: 'hortifr*, horti fruti, sacolao*, verdurao, quitanda, frutaria, feira livre, feira, ceasa, natural da terra, oba hortifruti',
  padaria: 'padar*, panif*, boulangerie, casa do pao, pao quente',
  acougue: 'acougu*, casa de carne*, boutique de carne*, frigorific*, carnes',
  // comer fora
  restaurante:
    'restaur*, churrasc*, pizz*, lanchon*, hamburg*, burguer*, burger*, sushi*, temak*, esfih*, pastelaria, galeto*, cantina*, trattoria, steakhouse, grill, self service, buffet, marmit*, quentinha, prato feito, comida caseira, cozinha caseira, espetinho, petiscaria, tapiocaria, creperia, outback, madero, coco bambu, mcdonalds, mc donalds, mcdonald s, arcos dourados, burger king, bk brasil, zamp, subway, spoleto, giraffas, china in box, bobs, popeyes, kfc, jeronimo, ragazzo, pizza hut, dominos, domino s, patroni, viena, fogo de chao, paris 6, applebees, abbraccio, vivenda do camarao, divino fogao, griletto, montana grill, gendai, koni, habibs, almoco, jantar, refeicao',
  delivery: 'ifood!, ifd!, rappi!, aiqfome!, ze delivery!, uber eats!, ubereats!, 99food!, james delivery!, delivery, anota ai',
  lanche:
    'cafeter*, sorvet*, confeit*, docer*, chocolat*, gelat*, brigade*, bombon*, salgad*, lanche*, acai*, cafe, coffee, starbucks, kopenhagen, cacau show, havanna, dunkin, casa bauducco, bacio di latte, chiquinho sorvetes, rei do mate, the coffee, pao de queijo, casa do pao de queijo, empada*, coxinha*, cafezinho, padoca',
  bar: 'bar, botec*, chop*, cervej*, adega*, tabacar*, distribuidora de bebidas, bebidas, pub, boteco, botequim, barzinho, lounge, karaoke, choperia',
  // transporte
  combustivel: 'combust*, posto*, abastec*, auto posto, gasolina, etanol, diesel, gnv, shell, shell box, petrobras, br distribuidora, vibra energia, raizen, ale combustiveis, texaco, posto ipiranga, abastece ai, rede graal, sim rede de postos',
  app_taxi: 'uber, uber trip, uber do brasil, 99app, 99 app, 99 tecnologia, 99pop, 99 ride, 99 taxi, cabify, indrive, indriver, taxi*, wappa, garupa',
  onibus: 'onibus, metro, metro sp, metrorio, trem, cptm, sptrans, bilhete unico, recarga transporte, recarga bilhete, top transporte, viamobilidade, via quatro, viaquatro, supervia, riocard, jae, bhtrans, urbs, buser, clickbus, rodoviaria, passagem de onibus, viacao*',
  estacion: 'estacion*, pedag*, parking, valet, estapar, zona azul, sem parar, semparar, conectcar, veloe, taggy, move mais, multipark, allpark, autopass, ecovias, ecopistas, arteris, autoban, nova dutra, rodoanel, ccr via',
  manut_carro: 'mecanic*, borrach*, funilar*, autopec*, auto pec*, pneu*, retific*, lava jato, lava rapido, lava car, car wash, autocenter, auto center, auto eletrica, autoeletrica, oficina, troca de oleo, pit stop, dpaschoal, pneustore, martelinho',
  seguro_carro: 'seguro auto, porto seguro auto, azul seguros, tokio marine, hdi seguros, allianz, mapfre, liberty seguros, yelum, suhai, youse',
  ipva: 'ipva, detran*, licenciamento, dpvat, vistoria veicular',
  parcela_carro: 'financiamento veiculo, financ veic*, consorcio*, aymore, bv financeira, banco toyota, banco honda, gm financial, banco rci, volkswagen financial',
  // saúde
  plano_saude: 'plano de saude, unimed, amil, bradesco saude, sulamerica saude, sul america saude, hapvida, notredame, notre dame, intermedica, prevent senior, porto saude, golden cross, cassi, geap, careplus, omint, qsaude',
  consultas: 'clinic*, laborat*, diagnost*, hospit*, medic*, oftalm*, dermat*, ortoped*, cardiol*, ginecol*, pediatr*, radiolog*, nutricion*, otica*, oticas carol, consulta*, exame*, fleury, dasa, lavoisier, delboni, hermes pardini, sabin, dr consulta, drconsulta, amor saude, amorsaude, pronto socorro, ultrassom',
  dentista: 'odontolog*, odonto*, ortodont*, dentist*, dental, sorridents, oral sin, odontoprev',
  farmacia: 'farmac*, drogar*, drogas, medicament*, manipulac*, drogasil, raia, droga raia, drogaraia, raia drogasil, pague menos, panvel, drogaria pacheco, drogarias pacheco, drogaria sao paulo, dpsp, drogaria venancio, drogaria araujo, farmacia nissei, extrafarma, ultrafarma, drogaria onofre, drogal, drogao, farmais, farmacia popular',
  terapia: 'psicolog*, psiquiatr*, psicanal*, terapi*, fisioter*, fonoaud*, acupunt*, psicoterapia',
  // educação
  escola: 'faculdad*, universid*, colegio*, escola*, mensalidade escolar, uninove, unip, estacio, anhanguera, kroton, cogna, unopar, pitagoras, unicesumar, cruzeiro do sul, mackenzie, pucrs, puc minas, fmu, senac, senai, fgv, insper, ibmec, uninter, objetivo, anglo, etapa, poliedro',
  cursos: 'curso*, idioma*, escola de idiomas, autoescola, auto escola, udemy, alura, coursera, duolingo, hotmart, kiwify, eduzz, wizard, ccaa, fisk, cna idiomas, open english, cultura inglesa, kumon, rocketseat, descomplica, estrategia concursos, gran cursos, qconcursos, domestika, skillshare, babbel, cambly, preply, italki, berlitz, yazigi',
  livros: 'livrar*, papelar*, livro*, saraiva, livraria cultura, leitura, kindle, estante virtual, kalunga, banca de jornal',
  matricula: 'matricula*, material escolar, uniforme escolar, uniforme',
  // pessoal
  roupas:
    'calcad*, confecc*, vestuar*, sapat*, camisar*, modas, moda, boutique, brecho, lingerie, jeans, outlet, renner, lojas renner, youcom, riachuelo, c&a, cea, zara, hering, centauro, netshoes, nike, adidas, puma, mizuno, olympikus, vans, converse, arezzo, schutz, anacapri, melissa, shein, marisa, lojas marisa, pernambucanas, torra, lojas torra, besni, dafiti, zattini, track&field, track field, lupo, decathlon, levis, colcci, aramis, richards, osklen, polo wear, malwee, dudalina, piccadilly, usaflex, democrata',
  beleza: 'cabelei*, barbear*, barber*, esmalter*, manicur*, estetic*, depil*, salao*, beleza, beauty, hair, unhas, sobrancelha*, lash, boticario, o boticario, natura, avon, eudora, sephora, the beauty box, quem disse berenice, jequiti, mary kay, sallve, principia, spa',
  academia: 'academ*, smartfit, smart fit, bluefit, selfit, bodytech, gympass, wellhub, totalpass, crossfit, pilates, fitness, natacao, yoga, ioga, muay thai, jiu jitsu, beach tennis, personal trainer',
  celular: 'celular, recarga celular, vivo, claro, tim, oi, telefonica, telefonica brasil, claro sa, tim celular, oi movel, algar, surf telecom, vivo easy, claro flex',
  higiene: 'perfumar*, perfum*, cosmet*, higiene, fralda geriatrica',
  presentes: 'presente*, floricultura, giuliana flores, cesta de cafe, lembranc*',
  // lazer
  passeios: 'cinem*, ingresso*, teatro*, museu*, parque de diversoes, parque aquatico, zoologico, aquario, cinemark, kinoplex, cinepolis, uci, cineflix, cinesystem, moviecom, sympla, eventim, ticketmaster, ticket360, blueticket, bilheteria, beto carrero, hopi hari, beach park, boliche, escape room, show',
  viagens: 'hotel*, hoteis, pousad*, hostel*, resort*, turismo, viage*, passage*, linhas aereas, aereo*, aerea*, milhas, airbnb, booking, decolar, 123milhas, maxmilhas, hurb, cvc, expedia, trivago, latam, gol linhas, voegol, azul linhas, voeazul, localiza, movida, unidas, hertz, rent a car, aluguel de carro, accor, ibis, mercure, novotel, aeroporto*, seguro viagem, assist card',
  hobbies: 'hobby, artesanato, armarinho, aviamentos, tecidos, instrumentos musicais, fotografia, pesca, bicicleta*, bike',
  jogos: 'game*, jogo*, steam, steamgames, steampowered, playstation, psn, xbox, nintendo, google play, epic games, riot games, blizzard, battle net, garena, roblox, ubisoft, nuuvem, xsolla, codashop, level up, twitch, supercell',
  festas: 'festa*, balada, buffet infantil, casa de festas, open bar',
  // dívidas e tarifas
  cartao: 'anuid*, encargo*, juros*, rotativo, iof*, multa atraso, multa por atraso, seguro cartao, cartao protegido, protecao perda',
  emprestimo: 'emprest*, consignad*, financiam*, credito pessoal, cred pessoal, creditas, simplic, geru, crefisa, bmg, parcela credito',
  tarifas: 'tarifa*, tar pacote, tar mensal, tar pix, cesta de servicos, cesta servicos, pacote de servicos, manutencao de conta, taxa de manutencao, custodia',
  // filhos e pets
  escola_filhos: 'creche*, bercario, escolinha, educacao infantil, maternal, colonia de ferias, ballet, bale',
  baba: 'baba, fralda*, pampers, huggies, puericultura',
  brinquedos: 'brinqued*, toys, ri happy, pbkids, lego',
  racao: 'racao, racoes, petz, cobasi, petlove, pet center, agropet, casa de racao, zee dog, petiscos, pet food',
  veterinario: 'veterin*, hospital veterinario, clinica veterinaria, petvet',
  banho_tosa: 'pet shop, petshop, banho e tosa, tosa, dog wash',
  // eventuais
  compras_online:
    'amzn*, mktplace*, marketplace*, shopee, mercado livre, mercadolivre, mlivre, amazon, amazon br, amazon marketplace, amazonmktplc, magalu, magazine luiza, americanas, lojas americanas, submarino, shoptime, aliexpress, casas bahia, ponto frio, pontofrio, fast shop, temu, kabum, wish, olx, enjoei, elo7, polishop, apple store, samsung, xiaomi, multilaser',
  doacoes: 'doac*, dizim*, igreja*, paroquia*, oferta, vaquinha, vakinha, unicef, medicos sem fronteiras, graacc, aacd, teleton',
  saque: 'saque*, banco24horas, banco 24 horas, tecban',
  impostos: 'impost*, tribut*, prefeitura, cartorio*, sefaz, darf, gru, das mei, das simples, simples nacional, gps inss, inss, fgts, icms, itbi, multa, receita federal',
  // moradia
  aluguel: 'imobiliar*, alugue*, quintoandar, quinto andar, housi, prestacao habitacional, financiamento imobiliario, cohab',
  condominio: 'condomin*, taxa condominial, lello, hubert',
  iptu: 'iptu',
  luz: 'energia*, conta de luz, eletropaulo, light sesa, light servicos, edp, elektro, ceee, amazonas energia, celg',
  agua: 'saneament*, aguas de, conta de agua, brk ambiental, sanasa, saae, daae, semasa, cagepa, caern, deso, casal, agespisa, caema, cosanpa',
  gas: 'gas natural, botijao*, gas de cozinha, copergas, bahiagas, compagas, scgas, sulgas, gasmig, ceg, nacional gas, consigaz, copagaz',
  internet: 'telecom*, provedor*, fibra*, internet*, vivo fibra, claro net, net servicos, oi fibra, tim live, alares, desktop fibra, unifique, ligga, starlink, hughesnet, vero internet, brisanet',
  streaming:
    'streaming*, netflix, spotify, disney, disneyplus, disney plus, star plus, hbo, hbo max, hbomax, globoplay, paramount, apple com bill, apple tv, apple music, itunes, youtube, youtube premium, youtubepremium, deezer, amazon prime, prime video, primevideo, amazon music, audible, crunchyroll, mubi, telecine, premiere, sky, claro tv, vivo play, dazn, tidal',
  diarista: 'diarist*, faxin*, lavander*, limpeza, passadeira, parafuzo',
  manut_casa: 'ferrage*, vidrac*, marcenar*, serralher*, chaveir*, dedetiz*, desentup*, eletric*, hidraul*, madeireir*, tintas, mat construcao, materiais de constru*, material de constru*, materiais para constru*, home center, c&c, obramax, dicico, joli, sodimac, ferreira costa, quero quero, balaroti, cassol, tumelero, encanador, pintor, jardineiro, piscineiro',
  casa_itens: 'movei*, moveis, decorac*, colcho*, eletrodom*, utilidade*, enxova*, cama mesa, leroy merlin, telhanorte, tok stok, tokstok, camicado, mobly, etna, madeiramadeira, madeira madeira, westwing, zara home, imaginarium, casa e video, lojas cem, le biscuit, lebiscuit, havan, ortobom, castor, electrolux, brastemp, tramontina',
  // receitas
  salario: 'salar*, remunerac*, proventos, folha de pagamento, folha pagamento, pro labore, prolabore, adiantamento salarial, credito salario, cred salario, pgto salario',
  freela: 'honorari*, servicos prestados, freela*',
  vendas: 'venda*, liberacao de dinheiro, repasse de vendas',
  decimo: 'decimo terceiro, 13o salario, 13 salario',
  ferias_rec: 'ferias',
  restituicao: 'restituic*, irpf, imposto de renda, receita federal',
  rendimentos: 'rendiment*, rend pago, dividend*, jcp, juros sobre capital',
  reembolso: 'reembols*, estorn*, devoluc*, ressarc*, chargeback',
  outras_rec: 'cashback, bonus, premio*, sorteio',
  // guardar
  investir: 'aplicac*, invest*, corretora*, cdb, tesouro, lci, lca, rdb, caixinha, cofrinho, porquinho, nu invest, nuinvest, xp investimentos, rico, btg, toro, warren, avenue, binance, mercado bitcoin, foxbit, bitcoin, cripto*',
  previdencia: 'previd*, pgbl, vgbl, brasilprev, icatu',
  reserva: 'reserva de emergencia',
};
