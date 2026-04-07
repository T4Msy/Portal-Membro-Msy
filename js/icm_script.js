/* ════════════════════════════════════════════════════════════════════
   ICM · ÍNDICE DE CAPACIDADE MASAYOSHI · v3.0
   script.js — Advanced Cognitive Engine

   MÓDULOS:
   ─────────────────────────────────────────────────────────────────
   M1.  CONFIG & CONSTANTS
   M2.  QUESTION BANK (Base + Mirror + Adaptive)
   M3.  ESPECTROS (Arquétipos MSY)
   M4.  CROSS-ANALYSIS RULES
   M5.  STATE & PERSISTENCE (localStorage)
   M6.  ADAPTIVE ENGINE (Ramificação + Anti-Manipulação)
   M7.  SCORING ENGINE (Weighted + Consistency + Reliability)
   M8.  RESULT GENERATORS (Classificação, Aptidão, Espectros, Ranking)
   M9.  RENDER ENGINE (UI)
   M10. CUSTOM CURSOR
   M11. INIT
   ════════════════════════════════════════════════════════════════════ */

'use strict';

/* ════════════════════════════════════════════════════════════════════
   M1. CONFIG & CONSTANTS
   ════════════════════════════════════════════════════════════════════ */

const CFG = {
  STORAGE_KEY:        'icm3_v1_state',
  HISTORY_KEY:        'icm3_v1_history',
  VERSION:            '3.0',
  ANALYSIS_DELAY:     5200,
  OPTION_DELAY:       400,
  SCORE_CIRC:         565,     // 2π × 90
  MAX_HISTORY:        8,
  // Penalidade de consistência (por par contraditório detectado)
  INCONSISTENCY_PENALTY: 0.06,
  // Pesos de cada dimensão no ICM final
  DIM_WEIGHTS: { decisao: 1.15, logica: 1.0, sagacidade: 1.1, maturidade: 1.1 },
  // Influência dos índices ocultos no score final
  CONSISTENCY_INFLUENCE:  0.10,  // 10% do ICM
  RELIABILITY_INFLUENCE:  0.08,  // 8%  do ICM
};

// Pesos por tipo de pergunta (multiplicador de pontos)
const PESO_MULT = { normal: 1.0, elevado: 1.5, critico: 2.0 };

// Mensagens de análise
const ANALYSIS_MSGS = [
  'Inicializando engine cognitivo...',
  'Mapeando padrões de decisão...',
  'Verificando consistência comportamental...',
  'Cruzando variáveis dimensionais...',
  'Detectando inconsistências...',
  'Calibrando índice de confiabilidade...',
  'Aplicando análise cruzada...',
  'Calculando Espectros dominantes...',
  'Determinando aptidão Masayoshi...',
  'Gerando diagnóstico psicológico...',
  'Compilando relatório ICM...',
];

/* ════════════════════════════════════════════════════════════════════
   M2. BANCO DE PERGUNTAS

   Campos:
   ─────────────────────────────────────────────────────────────────
   id:         string único
   block:      'decisao'|'logica'|'sagacidade'|'maturidade'
   peso:       'normal'|'elevado'|'critico'
   type:       'base'|'mirror'|'adaptive'
   mirrorOf:   id da pergunta que esta espelha (apenas type:'mirror')
   triggers:   array de tags que ativam esta (apenas type:'adaptive')
   text:       string
   options: [{
     text:   string
     points: { decisao, logica, sagacidade, maturidade }  (1–5)
     tag:    string  (para ramificação)
     // Mirror questions usam campo extra:
     mirror_score: number (0–1) — quanto esta resposta concorda com a pergunta-espelho
   }]
   ════════════════════════════════════════════════════════════════════ */

const QUESTIONS = [

  /* ══════════════════════════════════════════════════════
     BLOCO DECISÃO (6 base + 2 mirror)
     PRINCÍPIO DE PONTUAÇÃO: cada opção especializa 1-2 dimensões.
     Quem decide bem → alto em decisao, mas não necessariamente nas outras.
     Isso garante trade-offs reais e elimina score inflado.
  ══════════════════════════════════════════════════════ */
  {
    id:'d1', block:'decisao', peso:'elevado', type:'base',
    text:'Um projeto sob sua liderança está 72 horas atrasado. Seu superior exige entrega agora, mas entregar hoje significa produto incompleto e com falhas visíveis. Como você age?',
    options:[
      {text:'Entrego o que está funcional com relatório técnico claro sobre o que falta — e o impacto de cada item pendente.',      points:{decisao:4,logica:3,sagacidade:2,maturidade:3}, tag:'decisao_estruturado'},
      {text:'Negoço mais 24h com argumento objetivo: o custo real de entregar incompleto supera qualquer prazo.',                  points:{decisao:5,logica:2,sagacidade:3,maturidade:2}, tag:'decisao_lider'},
      {text:'Entrego como está. Se reclamarem, corrijo depois.',                                                                   points:{decisao:1,logica:1,sagacidade:1,maturidade:1}, tag:'decisao_fraco'},
      {text:'Trabalho as próximas 12h sem parar para entregar tudo — perfeito ou não.',                                           points:{decisao:2,logica:1,sagacidade:1,maturidade:2}, tag:'decisao_impulsivo'},
    ],
  },
  {
    id:'d2', block:'decisao', peso:'critico', type:'base',
    text:'Dois caminhos: A tem 85% de chance de resultado sólido. B tem 22% de chance de resultado extraordinário e 78% de fracasso completo. O que você escolhe — e qual é o critério real da sua decisão?',
    options:[
      {text:'Caminho A. Construção consistente supera qualquer aposta.',                                                           points:{decisao:2,logica:3,sagacidade:1,maturidade:4}, tag:'decisao_conservador'},
      {text:'Caminho B. Resultados medianos não constroem legado.',                                                               points:{decisao:4,logica:1,sagacidade:2,maturidade:1}, tag:'decisao_ousado'},
      {text:'Crio Caminho C — divido recursos para explorar B com proteção mínima via A.',                                        points:{decisao:4,logica:4,sagacidade:3,maturidade:2}, tag:'decisao_inovador'},
      {text:'Depende do custo real do fracasso B. Preciso dessa informação antes de qualquer resposta.',                          points:{decisao:3,logica:5,sagacidade:2,maturidade:2}, tag:'decisao_analitico'},
    ],
  },
  {
    id:'d3', block:'decisao', peso:'normal', type:'base',
    text:'Você descobre que um colega de confiança sabota suas iniciativas por inveja velada. Ainda há uma semana de projeto conjunto. O que você faz?',
    options:[
      {text:'Confronto diretamente em privado, com fatos — sem envolver outros.',                                                  points:{decisao:5,logica:2,sagacidade:2,maturidade:3}, tag:'decisao_direto'},
      {text:'Documento tudo e afasto-o silenciosamente das informações sensíveis até o projeto encerrar.',                        points:{decisao:3,logica:3,sagacidade:5,maturidade:2}, tag:'sagacidade_alta'},
      {text:'Ignoro e termino o projeto — conflito agora prejudica o resultado coletivo.',                                        points:{decisao:1,logica:2,sagacidade:2,maturidade:3}, tag:'decisao_evitativo'},
      {text:'Levo ao superior com evidências documentadas antes de qualquer confronto.',                                          points:{decisao:2,logica:2,sagacidade:1,maturidade:4}, tag:'decisao_institucional'},
    ],
  },
  {
    id:'d4', block:'decisao', peso:'elevado', type:'base',
    text:'Uma oportunidade única surge mas exige abandonar projeto 70% concluído do qual outras pessoas dependem. O que decide?',
    options:[
      {text:'Finalizo o projeto antes de qualquer movimentação. Comprometimento não é negociável.',                                points:{decisao:2,logica:2,sagacidade:1,maturidade:5}, tag:'maturidade_alta'},
      {text:'Aceito e garanto transição adequada — treino ou transfiro responsabilidade formalmente.',                             points:{decisao:5,logica:2,sagacidade:3,maturidade:2}, tag:'decisao_lider'},
      {text:'Recuso. 70% concluído é distância curta demais para abandonar.',                                                     points:{decisao:1,logica:2,sagacidade:1,maturidade:4}, tag:'decisao_conservador'},
      {text:'Negocio prazo com quem oferece a oportunidade — peço tempo para encerrar com qualidade.',                            points:{decisao:4,logica:3,sagacidade:4,maturidade:3}, tag:'decisao_analitico'},
    ],
  },
  {
    id:'d5', block:'decisao', peso:'normal', type:'base',
    text:'Você precisa decidir agora, sem tempo para pesquisa adicional. Qual é sua abordagem real?',
    options:[
      {text:'Confio no padrão que funcionou em situações análogas.',                                                              points:{decisao:4,logica:2,sagacidade:2,maturidade:2}, tag:'decisao_intuitivo'},
      {text:'Escolho o caminho com menor potencial de dano irreversível.',                                                        points:{decisao:3,logica:4,sagacidade:2,maturidade:3}, tag:'decisao_analitico'},
      {text:'Peço 10 minutos — qualidade de decisão vale esse tempo.',                                                            points:{decisao:2,logica:4,sagacidade:1,maturidade:3}, tag:'decisao_estruturado'},
      {text:'Ajo com a opção mais ousada — inação tem custo maior.',                                                              points:{decisao:5,logica:1,sagacidade:2,maturidade:1}, tag:'decisao_ousado'},
    ],
  },
  {
    id:'d6', block:'decisao', peso:'elevado', type:'base',
    text:'Membro da equipe com boa intenção mas desempenho fraco — você escolhe: mais 30 dias de desenvolvimento com metas claras, ou encerramento agora?',
    options:[
      {text:'30 dias com metas objetivas e consequência previamente definida. Estrutura antes de punição.',                       points:{decisao:3,logica:3,sagacidade:2,maturidade:5}, tag:'maturidade_alta'},
      {text:'Encerro. A complacência com um prejudica todo o coletivo que performa.',                                             points:{decisao:5,logica:2,sagacidade:1,maturidade:2}, tag:'decisao_lider'},
      {text:'Reposito para função mais alinhada ao perfil antes de qualquer demissão.',                                          points:{decisao:3,logica:4,sagacidade:4,maturidade:3}, tag:'decisao_inovador'},
      {text:'Consulto a equipe para entender o impacto antes de qualquer decisão.',                                              points:{decisao:2,logica:2,sagacidade:4,maturidade:2}, tag:'sagacidade_alta'},
    ],
  },

  // ── PERGUNTAS ESPELHADAS DE DECISÃO ──────────────────────────
  {
    id:'md1', block:'decisao', peso:'elevado', type:'mirror', mirrorOf:'d5',
    text:'Com que frequência você arrepende-se de decisões que tomou sob pressão de tempo?',
    options:[
      {text:'Raramente — sob pressão meu padrão de julgamento se mantém.',                    points:{decisao:4,logica:2,sagacidade:2,maturidade:3}, mirror_score:0.85, tag:'decisao_consistente'},
      {text:'Às vezes — reconheço que velocidade prejudica qualidade ocasionalmente.',         points:{decisao:3,logica:2,sagacidade:2,maturidade:4}, mirror_score:0.60, tag:'maturidade_media'},
      {text:'Com frequência — prefiro esperar mas nem sempre posso.',                          points:{decisao:1,logica:2,sagacidade:1,maturidade:3}, mirror_score:0.30, tag:'decisao_evitativo'},
      {text:'Nunca. Decisão tomada é decisão correta — arrependimento é fraqueza.',            points:{decisao:3,logica:1,sagacidade:1,maturidade:1}, mirror_score:0.10, tag:'maturidade_baixa'},
    ],
  },
  {
    id:'md2', block:'decisao', peso:'normal', type:'mirror', mirrorOf:'d3',
    text:'Se alguém que prejudicou você profissionalmente pede uma chance de reparação genuína, como você reage?',
    options:[
      {text:'Avalio a reparação pelos méritos — passado é dado, não sentença permanente.',     points:{decisao:3,logica:2,sagacidade:3,maturidade:5}, mirror_score:0.75, tag:'maturidade_alta'},
      {text:'Aceito a reparação mas mantenho distância estratégica.',                          points:{decisao:3,logica:2,sagacidade:4,maturidade:3}, mirror_score:0.70, tag:'sagacidade_alta'},
      {text:'Rejeito. Confiança rompida não se recupera.',                                     points:{decisao:3,logica:1,sagacidade:1,maturidade:2}, mirror_score:0.45, tag:'decisao_conservador'},
      {text:'Finjo aceitar mas não abro mais acesso real.',                                    points:{decisao:3,logica:2,sagacidade:3,maturidade:1}, mirror_score:0.20, tag:'sagacidade_media'},
    ],
  },

  /* ══════════════════════════════════════════════════════
     BLOCO LÓGICA (6 base + 1 mirror)
     Perguntas de lógica têm pontos concentrados em logica.
     Outros dims recebem pontuação mínima — foco total.
  ══════════════════════════════════════════════════════ */
  {
    id:'l1', block:'logica', peso:'normal', type:'base',
    text:'Sequência: 3, 7, 13, 21, 31, __\nQual é o próximo número e o padrão subjacente?',
    options:[
      {text:'43 — diferença entre termos cresce +2 a cada passo: Δ=4,6,8,10,12.',            points:{decisao:1,logica:5,sagacidade:1,maturidade:1}, tag:'logica_alta'},
      {text:'41 — o padrão são números primos.',                                               points:{decisao:1,logica:2,sagacidade:1,maturidade:1}, tag:'logica_baixa'},
      {text:'37 — progressão aritmética de razão 6.',                                         points:{decisao:1,logica:1,sagacidade:1,maturidade:1}, tag:'logica_baixa'},
      {text:'45 — produto do índice com o anterior.',                                         points:{decisao:1,logica:3,sagacidade:1,maturidade:1}, tag:'logica_media'},
    ],
  },
  {
    id:'l2', block:'logica', peso:'elevado', type:'base',
    text:'Se todos os membros da Ordem são estrategistas, e alguns estrategistas são filósofos — qual afirmação é necessariamente verdadeira com base apenas nessas premissas?',
    options:[
      {text:'Todos os membros da Ordem são filósofos.',                                        points:{decisao:1,logica:1,sagacidade:1,maturidade:1}, tag:'logica_baixa'},
      {text:'Alguns membros da Ordem podem ser filósofos.',                                    points:{decisao:1,logica:5,sagacidade:1,maturidade:1}, tag:'logica_alta'},
      {text:'Nenhum filósofo pertence à Ordem.',                                               points:{decisao:1,logica:1,sagacidade:1,maturidade:1}, tag:'logica_baixa'},
      {text:'Todo filósofo é membro da Ordem.',                                                points:{decisao:1,logica:2,sagacidade:1,maturidade:1}, tag:'logica_media'},
    ],
  },
  {
    id:'l3', block:'logica', peso:'critico', type:'base',
    text:'9 bolas visualmente idênticas — uma é mais pesada. Com balança de dois pratos (sem pesos), qual é o número mínimo de pesagens garantido para encontrá-la?',
    options:[
      {text:'2 — divido em grupos de 3; o resultado define qual grupo pesquisar na 2ª pesagem.',points:{decisao:1,logica:5,sagacidade:1,maturidade:1}, tag:'logica_alta'},
      {text:'3 — por eliminação linear.',                                                       points:{decisao:1,logica:3,sagacidade:1,maturidade:1}, tag:'logica_media'},
      {text:'4 — mantenho margem de segurança.',                                                points:{decisao:1,logica:1,sagacidade:1,maturidade:1}, tag:'logica_baixa'},
      {text:'1 — com sorte.',                                                                   points:{decisao:1,logica:2,sagacidade:1,maturidade:1}, tag:'logica_baixa'},
    ],
  },
  {
    id:'l4', block:'logica', peso:'elevado', type:'base',
    text:'Projeto com 5 etapas: C depende de B e D. B depende de A. D é independente. E depende de C. Qual sequência minimiza o tempo total?',
    options:[
      {text:'A e D em paralelo → B (após A) → C (após B e D) → E.',                           points:{decisao:2,logica:5,sagacidade:2,maturidade:1}, tag:'logica_alta'},
      {text:'A → B → D → C → E.',                                                              points:{decisao:1,logica:2,sagacidade:1,maturidade:1}, tag:'logica_baixa'},
      {text:'D → A → B → C → E.',                                                              points:{decisao:1,logica:3,sagacidade:1,maturidade:1}, tag:'logica_media'},
      {text:'A → D → B → C → E.',                                                              points:{decisao:1,logica:2,sagacidade:1,maturidade:1}, tag:'logica_media'},
    ],
  },
  {
    id:'l5', block:'logica', peso:'normal', type:'base',
    text:'Dobrar velocidade reduz tempo pela metade, mas aumenta erros em 40%. O que você faz para manter qualidade e ganhar eficiência real?',
    options:[
      {text:'Automatizo os pontos mais propensos a erro antes de acelerar.',                   points:{decisao:2,logica:5,sagacidade:3,maturidade:2}, tag:'logica_alta'},
      {text:'Aumento velocidade em ~30% — ponto de equilíbrio ótimo.',                        points:{decisao:3,logica:4,sagacidade:2,maturidade:2}, tag:'logica_alta'},
      {text:'Mantenho velocidade original. Qualidade não negocia.',                            points:{decisao:1,logica:2,sagacidade:1,maturidade:4}, tag:'decisao_conservador'},
      {text:'Acelero e adiciono revisão ao final de cada etapa.',                              points:{decisao:2,logica:3,sagacidade:2,maturidade:2}, tag:'logica_media'},
    ],
  },
  {
    id:'l6', block:'logica', peso:'elevado', type:'base',
    text:'Indicador cai 20% por três meses consecutivos. Sua equipe apresenta 5 hipóteses distintas. Qual é sua abordagem?',
    options:[
      {text:'Ranqueio hipóteses por evidência disponível e testo a mais promissora primeiro.',  points:{decisao:3,logica:5,sagacidade:2,maturidade:2}, tag:'logica_alta'},
      {text:'Ajo na hipótese mais popular — velocidade importa mais que certeza.',              points:{decisao:4,logica:1,sagacidade:1,maturidade:1}, tag:'decisao_ousado'},
      {text:'Testo todas em paralelo — não posso descartar nenhuma prematuramente.',            points:{decisao:2,logica:3,sagacidade:2,maturidade:2}, tag:'logica_media'},
      {text:'Busco benchmarks externos antes de testar hipóteses internas.',                   points:{decisao:2,logica:5,sagacidade:3,maturidade:2}, tag:'logica_alta'},
    ],
  },
  {
    id:'ml1', block:'logica', peso:'normal', type:'mirror', mirrorOf:'l1',
    text:'Um projeto dura 6 semanas. A cada semana você completa 15% a mais que a anterior (partindo de 5% na 1ª). Na 5ª semana, que percentual acumulado está concluído?',
    options:[
      {text:'~75% — metade do tempo, metade do projeto.',                                      points:{decisao:1,logica:1,sagacidade:1,maturidade:1}, tag:'logica_baixa'},
      {text:'Cerca de 34% — soma das 5 parcelas em progressão geométrica: 5+5.75+6.6+7.6+8.7 ≈ 33.65%.',points:{decisao:1,logica:5,sagacidade:1,maturidade:1}, tag:'logica_alta'},
      {text:'50% — metade do projeto em metade do tempo.',                                     points:{decisao:1,logica:1,sagacidade:1,maturidade:1}, tag:'logica_baixa'},
      {text:'Impossível calcular sem mais dados.',                                             points:{decisao:1,logica:2,sagacidade:1,maturidade:1}, tag:'logica_baixa'},
    ],
  },

  /* ══════════════════════════════════════════════════════
     BLOCO SAGACIDADE (6 base + 2 mirror)
     Pontos concentrados em sagacidade; trade-off com decisao/logica.
  ══════════════════════════════════════════════════════ */
  {
    id:'s1', block:'sagacidade', peso:'elevado', type:'base',
    text:'Em reunião, colega discorda com confiança visível mas argumentos fracos. Todos aguardam sua resposta. O que você faz?',
    options:[
      {text:'Desmonto o argumento com calma e precisão — sem atacar a pessoa.',                points:{decisao:3,logica:2,sagacidade:5,maturidade:3}, tag:'sagacidade_alta'},
      {text:'Concordo superficialmente e retomo em privado depois.',                           points:{decisao:1,logica:1,sagacidade:3,maturidade:2}, tag:'sagacidade_media'},
      {text:'Peço que apresente dados concretos que sustentem a posição.',                     points:{decisao:2,logica:4,sagacidade:4,maturidade:2}, tag:'logica_alta'},
      {text:'Fico em silêncio — quem está certo não precisa se defender.',                    points:{decisao:1,logica:1,sagacidade:1,maturidade:2}, tag:'decisao_evitativo'},
    ],
  },
  {
    id:'s2', block:'sagacidade', peso:'critico', type:'base',
    text:'Você percebe claramente que alguém te manipula com elogios excessivos antes de um pedido. Como responde estrategicamente?',
    options:[
      {text:'Deixo concluir e avalio o pedido pelos méritos — não pelo ambiente emocional criado.',points:{decisao:2,logica:2,sagacidade:5,maturidade:4}, tag:'sagacidade_alta'},
      {text:'Interrompo antes do pedido e pergunto diretamente o que quer.',                  points:{decisao:5,logica:2,sagacidade:4,maturidade:2}, tag:'decisao_direto'},
      {text:'Finjo não perceber e registro isso como dado permanente sobre o caráter da pessoa.',points:{decisao:1,logica:2,sagacidade:5,maturidade:2}, tag:'sagacidade_alta'},
      {text:'Encerro educadamente a conversa antes do pedido.',                               points:{decisao:1,logica:1,sagacidade:2,maturidade:3}, tag:'decisao_evitativo'},
    ],
  },
  {
    id:'s3', block:'sagacidade', peso:'elevado', type:'base',
    text:'Em negociação importante, percebe que o outro lado tem prazo urgente. O que você faz com essa informação?',
    options:[
      {text:'Reduzo o ritmo estrategicamente — poder de barganha aumenta com a escassez de tempo deles.',points:{decisao:3,logica:2,sagacidade:5,maturidade:2}, tag:'sagacidade_alta'},
      {text:'Apresento proposta melhorada com prazo de resposta de 24h — crio pressão legítima.',points:{decisao:3,logica:3,sagacidade:5,maturidade:3}, tag:'sagacidade_alta'},
      {text:'Aceito as condições deles para fechar logo — eficiência acima de margem.',        points:{decisao:2,logica:1,sagacidade:1,maturidade:1}, tag:'decisao_fraco'},
      {text:'Conduzo normalmente — usar urgência como alavanca não é ético.',                  points:{decisao:1,logica:1,sagacidade:1,maturidade:4}, tag:'maturidade_media'},
    ],
  },
  {
    id:'s4', block:'sagacidade', peso:'elevado', type:'base',
    text:'Pessoa influente mas de caráter questionável oferece parceria com benefícios concretos. Como avalia?',
    options:[
      {text:'Recuso. Associações contaminam reputação — custo invisível mas real.',            points:{decisao:2,logica:1,sagacidade:2,maturidade:5}, tag:'maturidade_alta'},
      {text:'Aceito com estrutura contratual que limita minha exposição ao máximo.',           points:{decisao:3,logica:3,sagacidade:5,maturidade:2}, tag:'sagacidade_alta'},
      {text:'Extraio o que é útil sem me vincular publicamente à pessoa.',                    points:{decisao:3,logica:2,sagacidade:5,maturidade:1}, tag:'sagacidade_alta'},
      {text:'Investigo o histórico profundamente antes de qualquer resposta.',                 points:{decisao:2,logica:4,sagacidade:3,maturidade:3}, tag:'logica_alta'},
    ],
  },
  {
    id:'s5', block:'sagacidade', peso:'normal', type:'base',
    text:'No grupo, a pessoa mais quieta entende a situação melhor que todos que falam. O que você faz?',
    options:[
      {text:'Aproximo-me em particular e ouço antes de qualquer decisão coletiva.',           points:{decisao:2,logica:2,sagacidade:5,maturidade:3}, tag:'sagacidade_alta'},
      {text:'Convido ativamente para que fale no grupo — visão oculta não pode permanecer oculta.',points:{decisao:2,logica:1,sagacidade:3,maturidade:5}, tag:'maturidade_alta'},
      {text:'Observo e aprendo silenciosamente — influência não precisa de holofote.',        points:{decisao:1,logica:2,sagacidade:5,maturidade:2}, tag:'sagacidade_alta'},
      {text:'Foco em quem fala — contribuição exige manifestação.',                           points:{decisao:1,logica:1,sagacidade:1,maturidade:1}, tag:'decisao_fraco'},
    ],
  },
  {
    id:'s6', block:'sagacidade', peso:'critico', type:'base',
    text:'Você detecta que projeto vai fracassar. A equipe está eufórica com o progresso aparente. Qual é sua posição?',
    options:[
      {text:'Apresento análise com dados ao responsável antes de falar ao grupo — hierarquia de informação importa.',points:{decisao:3,logica:3,sagacidade:5,maturidade:4}, tag:'sagacidade_alta'},
      {text:'Falo abertamente no grupo — verdade antecipada supera conforto temporário.',     points:{decisao:5,logica:2,sagacidade:3,maturidade:3}, tag:'decisao_direto'},
      {text:'Fico em silêncio e me posiciono para não ser afetado quando vier o fracasso.',   points:{decisao:1,logica:2,sagacidade:2,maturidade:1}, tag:'decisao_fraco'},
      {text:'Construo alternativas em paralelo enquanto o projeto segue.',                    points:{decisao:2,logica:3,sagacidade:4,maturidade:2}, tag:'sagacidade_media'},
    ],
  },
  {
    id:'ms1', block:'sagacidade', peso:'elevado', type:'mirror', mirrorOf:'s2',
    text:'Quando você quer algo de alguém com quem tem pouca influência direta, qual é sua abordagem?',
    options:[
      {text:'Apresento o pedido de forma direta e objetiva — méritos falam por si.',          points:{decisao:4,logica:2,sagacidade:2,maturidade:4}, mirror_score:0.80, tag:'decisao_direto'},
      {text:'Construo contexto antes do pedido — relacionamento primeiro, pedido depois.',    points:{decisao:2,logica:2,sagacidade:4,maturidade:3}, mirror_score:0.65, tag:'sagacidade_media'},
      {text:'Encontro o que posso oferecer em troca — negociação antes de pedido.',           points:{decisao:2,logica:3,sagacidade:5,maturidade:3}, mirror_score:0.70, tag:'sagacidade_alta'},
      {text:'Crio situações que façam a pessoa sentir que está escolhendo ajudar.',           points:{decisao:2,logica:2,sagacidade:4,maturidade:1}, mirror_score:0.15, tag:'sagacidade_manipuladora'},
    ],
  },
  {
    id:'ms2', block:'sagacidade', peso:'normal', type:'mirror', mirrorOf:'s3',
    text:'Você tem informação que a outra parte na negociação desconhece e que lhe daria vantagem significativa. O que faz?',
    options:[
      {text:'Uso a informação — vantagem de informação é resultado de preparo, não de trapaça.',points:{decisao:3,logica:2,sagacidade:4,maturidade:2}, mirror_score:0.70, tag:'sagacidade_alta'},
      {text:'Uso, mas com moderação — não exponho a vulnerabilidade do outro desnecessariamente.',points:{decisao:3,logica:3,sagacidade:5,maturidade:3}, mirror_score:0.75, tag:'sagacidade_alta'},
      {text:'Compartilho a informação voluntariamente — negociações justas produzem melhores acordos.',points:{decisao:2,logica:2,sagacidade:2,maturidade:5}, mirror_score:0.60, tag:'maturidade_alta'},
      {text:'Omito mas não minto ativamente se perguntado.',                                   points:{decisao:2,logica:2,sagacidade:3,maturidade:3}, mirror_score:0.55, tag:'sagacidade_media'},
    ],
  },

  /* ══════════════════════════════════════════════════════
     BLOCO MATURIDADE (6 base + 2 mirror)
     Pontos concentrados em maturidade.
  ══════════════════════════════════════════════════════ */
  {
    id:'m1', block:'maturidade', peso:'elevado', type:'base',
    text:'Você falhou em meta importante que prometeu a si mesmo. Qual é sua reação interna real — não a que você gostaria de ter?',
    options:[
      {text:'Analiso o que causou o desvio, ajusto o sistema e recomeço sem drama.',          points:{decisao:2,logica:3,sagacidade:2,maturidade:5}, tag:'maturidade_alta'},
      {text:'Sinto raiva de mim mesmo, mas uso isso como combustível.',                       points:{decisao:2,logica:1,sagacidade:1,maturidade:3}, tag:'maturidade_media'},
      {text:'Identifico o aprendizado e documento para evitar o mesmo padrão.',               points:{decisao:2,logica:4,sagacidade:2,maturidade:5}, tag:'maturidade_alta'},
      {text:'Aceito que nem sempre é possível. Sigo em frente.',                              points:{decisao:1,logica:1,sagacidade:1,maturidade:2}, tag:'maturidade_baixa'},
    ],
  },
  {
    id:'m2', block:'maturidade', peso:'critico', type:'base',
    text:'Alguém próximo te critica com dureza — e há verdade parcial no que disse. Qual é sua reação real?',
    options:[
      {text:'Ouço com atenção, separo o válido do emocional e agradeço internamente — mesmo que doa.',points:{decisao:2,logica:2,sagacidade:3,maturidade:5}, tag:'maturidade_alta'},
      {text:'Me defendo no momento — crítica dura sem respeito não merece receptor passivo.',  points:{decisao:4,logica:1,sagacidade:1,maturidade:1}, tag:'decisao_ousado'},
      {text:'Fico quieto externamente, processo internamente e mudo o que precisa mudar.',    points:{decisao:1,logica:2,sagacidade:3,maturidade:4}, tag:'sagacidade_media'},
      {text:'Peço que reformule de forma mais construtiva antes de ouvir.',                   points:{decisao:2,logica:2,sagacidade:2,maturidade:3}, tag:'maturidade_media'},
    ],
  },
  {
    id:'m3', block:'maturidade', peso:'elevado', type:'base',
    text:'Semanas de trabalho intenso sem resultados visíveis. A consistência está custando caro. O que você faz?',
    options:[
      {text:'Mantenho a consistência — resultados são consequência de processo, não urgência.',points:{decisao:2,logica:2,sagacidade:2,maturidade:5}, tag:'maturidade_alta'},
      {text:'Reviso o processo — ausência de resultado por esse tempo indica necessidade de ajuste.',points:{decisao:3,logica:5,sagacidade:2,maturidade:3}, tag:'logica_alta'},
      {text:'Questiono se o caminho ainda faz sentido — persistência cega é burrice.',        points:{decisao:4,logica:3,sagacidade:2,maturidade:2}, tag:'decisao_analitico'},
      {text:'Fico desmotivado mas me forço — disciplina sem prazer é possível.',              points:{decisao:1,logica:1,sagacidade:1,maturidade:2}, tag:'maturidade_baixa'},
    ],
  },
  {
    id:'m4', block:'maturidade', peso:'normal', type:'base',
    text:'Você recebe crédito público por algo parcialmente feito por outra pessoa. Ninguém mais sabe. O que você faz?',
    options:[
      {text:'Compartilho o crédito publicamente e imediatamente. Integridade não é condicional.',points:{decisao:2,logica:1,sagacidade:2,maturidade:5}, tag:'maturidade_alta'},
      {text:'Aceito em público e reconheço a pessoa em privado de forma significativa.',       points:{decisao:2,logica:2,sagacidade:2,maturidade:3}, tag:'maturidade_media'},
      {text:'Não digo nada — o sistema recompensa quem aparece, e eu apareci.',               points:{decisao:1,logica:1,sagacidade:2,maturidade:1}, tag:'maturidade_baixa'},
      {text:'Uso o crédito estrategicamente e compenso a pessoa de outra forma.',             points:{decisao:2,logica:2,sagacidade:4,maturidade:2}, tag:'sagacidade_media'},
    ],
  },
  {
    id:'m5', block:'maturidade', peso:'elevado', type:'base',
    text:'4 meses de alta performance com sacrifícios sociais constantes. Qual é sua postura real com isso?',
    options:[
      {text:'É o custo necessário e consciente. Foco raramente coexiste com dispersão.',      points:{decisao:2,logica:2,sagacidade:2,maturidade:5}, tag:'maturidade_alta'},
      {text:'Estruturo blocos deliberados de conexão social — equilíbrio também é performance sustentável.',points:{decisao:3,logica:3,sagacidade:4,maturidade:3}, tag:'sagacidade_alta'},
      {text:'Diminuo o ritmo eventualmente — nenhuma meta vale isolamento prolongado.',       points:{decisao:2,logica:1,sagacidade:1,maturidade:3}, tag:'maturidade_media'},
      {text:'Priorizo quem compartilha a trajetória — os demais se afastam naturalmente.',    points:{decisao:2,logica:2,sagacidade:3,maturidade:3}, tag:'sagacidade_media'},
    ],
  },
  {
    id:'m6', block:'maturidade', peso:'critico', type:'base',
    text:'Você percebe que está errado no meio de uma discussão onde já investiu tempo e posição. Como age?',
    options:[
      {text:'Admito o erro imediatamente e mudo de posição — clareza supera ego.',            points:{decisao:4,logica:2,sagacidade:2,maturidade:5}, tag:'maturidade_alta'},
      {text:'Paro a discussão, processo com calma e retorno para reconhecer.',                points:{decisao:2,logica:2,sagacidade:2,maturidade:4}, tag:'maturidade_alta'},
      {text:'Mudo de posição mas não verbalizo — ações futuras demonstrarão.',               points:{decisao:1,logica:1,sagacidade:3,maturidade:2}, tag:'sagacidade_media'},
      {text:'Continuo argumentando — conceder rápido demais demonstra instabilidade.',       points:{decisao:3,logica:1,sagacidade:1,maturidade:1}, tag:'maturidade_baixa'},
    ],
  },
  {
    id:'mm1', block:'maturidade', peso:'elevado', type:'mirror', mirrorOf:'m1',
    text:'Você se considera uma pessoa com alta disciplina pessoal?',
    options:[
      {text:'Sim — minha consistência é meu maior ativo.',                                    points:{decisao:2,logica:1,sagacidade:1,maturidade:4}, mirror_score:0.90, tag:'maturidade_autopercep_alta'},
      {text:'Em grande parte — com algumas áreas onde ainda luto com consistência.',          points:{decisao:2,logica:2,sagacidade:2,maturidade:4}, mirror_score:0.70, tag:'maturidade_media'},
      {text:'Parcialmente — sou disciplinado quando motivado, não como regra.',              points:{decisao:1,logica:2,sagacidade:1,maturidade:3}, mirror_score:0.45, tag:'maturidade_baixa'},
      {text:'Honestamente não — reconheço que consistência é meu ponto mais fraco.',         points:{decisao:1,logica:2,sagacidade:3,maturidade:2}, mirror_score:0.15, tag:'maturidade_autopercep_baixa'},
    ],
  },
  {
    id:'mm2', block:'maturidade', peso:'normal', type:'mirror', mirrorOf:'m4',
    text:'Você já atribuiu a si mesmo mérito que pertencia parcialmente a outro — mesmo sem ser questionado?',
    options:[
      {text:'Nunca — integridade é praticada quando ninguém vê, especialmente então.',        points:{decisao:1,logica:1,sagacidade:1,maturidade:5}, mirror_score:0.95, tag:'maturidade_alta'},
      {text:'Raramente e sempre por omissão, não por afirmação ativa.',                      points:{decisao:1,logica:1,sagacidade:2,maturidade:4}, mirror_score:0.70, tag:'maturidade_media'},
      {text:'Às vezes — é difícil corrigir o outro quando o crédito já foi dado.',           points:{decisao:1,logica:1,sagacidade:2,maturidade:2}, mirror_score:0.40, tag:'maturidade_baixa'},
      {text:'Sim, e não considero isso um problema — sistemas meritocráticos são imperfeitos.',points:{decisao:1,logica:1,sagacidade:2,maturidade:1}, mirror_score:0.05, tag:'maturidade_baixa'},
    ],
  },

  /* ══════════════════════════════════════════════════════
     PERGUNTAS ADAPTATIVAS (tipo:'adaptive')
     Mesma lógica especializada por dimensão.
  ══════════════════════════════════════════════════════ */
  {
    id:'ad1', block:'decisao', peso:'critico', type:'adaptive',
    triggers:['decisao_lider','decisao_inovador'],
    text:'Você assumiu liderança não solicitada. A equipe resiste sutilmente. Como você estabelece autoridade sem criar ressentimento?',
    options:[
      {text:'Demonstro competência antes de qualquer postura de liderança — resultados precedem respeito.',points:{decisao:5,logica:2,sagacidade:3,maturidade:3}, tag:'decisao_lider'},
      {text:'Construo aliados internos primeiro — influência lateral antes de autoridade vertical.',points:{decisao:3,logica:2,sagacidade:5,maturidade:2}, tag:'sagacidade_alta'},
      {text:'Imponho limites claros desde o início — ambiguidade cria conflito depois.',       points:{decisao:5,logica:2,sagacidade:2,maturidade:2}, tag:'decisao_direto'},
      {text:'Ouço o time antes de qualquer movimentação — contexto primeiro, ação depois.',   points:{decisao:2,logica:2,sagacidade:3,maturidade:5}, tag:'maturidade_alta'},
    ],
  },
  {
    id:'ad2', block:'logica', peso:'critico', type:'adaptive',
    triggers:['logica_alta'],
    text:'Sistema com 3 falhas correlacionadas mas origens independentes. Recursos para consertar apenas 2 agora. Qual critério define sua escolha?',
    options:[
      {text:'Resolvo as 2 com maior impacto sistêmico — a terceira terá menor efeito com as principais sanadas.',points:{decisao:2,logica:5,sagacidade:2,maturidade:2}, tag:'logica_alta'},
      {text:'Resolvo as 2 mais rápidas — velocidade libera recursos para a terceira.',         points:{decisao:3,logica:2,sagacidade:2,maturidade:2}, tag:'logica_media'},
      {text:'Resolvo as 2 que a equipe executa melhor — qualidade da solução importa mais.',  points:{decisao:2,logica:3,sagacidade:4,maturidade:2}, tag:'sagacidade_alta'},
      {text:'Resolvo 1 completamente e mitigo as outras 2 parcialmente.',                     points:{decisao:3,logica:5,sagacidade:2,maturidade:2}, tag:'logica_alta'},
    ],
  },
  {
    id:'ad3', block:'sagacidade', peso:'critico', type:'adaptive',
    triggers:['sagacidade_alta','sagacidade_manipuladora'],
    text:'Você tem informação obtida de forma antiética mas que daria vantagem enorme em uma disputa. Você usa?',
    options:[
      {text:'Não. Vantagem obtida de forma antiética contamina o que vier depois.',            points:{decisao:2,logica:2,sagacidade:3,maturidade:5}, tag:'maturidade_alta'},
      {text:'Uso como orientação para onde buscar informação legítima — sem citar a fonte.',   points:{decisao:3,logica:3,sagacidade:5,maturidade:2}, tag:'sagacidade_alta'},
      {text:'Uso. Resultados importam mais que a origem dos insumos.',                         points:{decisao:4,logica:1,sagacidade:3,maturidade:1}, tag:'maturidade_baixa'},
      {text:'Descarto e busco equivalente por meios legítimos, mesmo que demore.',             points:{decisao:2,logica:2,sagacidade:2,maturidade:5}, tag:'maturidade_alta'},
    ],
  },
  {
    id:'ad4', block:'maturidade', peso:'elevado', type:'adaptive',
    triggers:['maturidade_alta'],
    text:'Alguém que você treinou e desenvolveu supera você em área-chave. Qual é sua reação interna honesta?',
    options:[
      {text:'Orgulho genuíno — superar o mestre é o objetivo do processo.',                   points:{decisao:2,logica:2,sagacidade:2,maturidade:5}, tag:'maturidade_alta'},
      {text:'Satisfação com ressalva de ego — trabalho para reconquistar vantagem em outra dimensão.',points:{decisao:4,logica:2,sagacidade:2,maturidade:3}, tag:'decisao_analitico'},
      {text:'Rivalidade velada — é difícil ser honesto sobre isso.',                          points:{decisao:1,logica:1,sagacidade:2,maturidade:2}, tag:'maturidade_baixa'},
      {text:'Alívio — significa que meu trabalho de desenvolvimento foi eficaz.',             points:{decisao:2,logica:2,sagacidade:2,maturidade:5}, tag:'maturidade_alta'},
    ],
  },
  {
    id:'ad5', block:'decisao', peso:'elevado', type:'adaptive',
    triggers:['decisao_analitico','decisao_estruturado'],
    text:'Dados completos chegam em 15 dias, mas a janela de oportunidade fecha em 5. O que você faz?',
    options:[
      {text:'Decido com os dados disponíveis — decisão imperfeita no prazo supera decisão perfeita fora dele.',points:{decisao:5,logica:2,sagacidade:2,maturidade:2}, tag:'decisao_lider'},
      {text:'Modelos probabilísticos com dados parciais — projeto cenários e decido dentro deles.',points:{decisao:3,logica:5,sagacidade:2,maturidade:2}, tag:'logica_alta'},
      {text:'Negocio extensão do prazo — 5 dias extras podem mudar tudo.',                   points:{decisao:3,logica:2,sagacidade:5,maturidade:2}, tag:'sagacidade_alta'},
      {text:'Passo. Oportunidade que não permite análise adequada não é boa oportunidade.',   points:{decisao:1,logica:4,sagacidade:1,maturidade:4}, tag:'decisao_conservador'},
    ],
  },
];

/* ════════════════════════════════════════════════════════════════════
   M3. ESPECTROS MSY
   ════════════════════════════════════════════════════════════════════ */

const ESPECTROS = {
  CORVUS:{
    sigil:'◈', name:'CORVUS', archetype:'O Estrategista das Sombras',
    desc:'Corvus processa o ambiente antes de agir. Você enxerga o que outros ignoram e move-se com precisão cirúrgica. A impaciência não é seu padrão — você aguarda o momento exato.',
    strengths:'Leitura de contexto superior. Influência sem visibilidade. Planejamento de longo prazo com precisão cirúrgica.',
    weaknesses:'Paralisia de análise. Pode perder janelas de oportunidade por excesso de cautela.',
    role:'Inteligência estratégica · Arquitetura de decisões · Análise de cenários',
  },
  FENRIR:{
    sigil:'⚡', name:'FENRIR', archetype:'O Ruptor de Paradigmas',
    desc:'Fenrir opera onde há incerteza e ruptura. Sua energia é devastadora quando focada — e pode se tornar caótica quando dispersa. Ambientes de alta pressão são seu ecossistema natural.',
    strengths:'Inovação sob pressão extrema. Pensamento não-convencional. Alta tolerância ao caos produtivo.',
    weaknesses:'Subestima a importância de processo e consistência. Conflito estrutural com sistemas estabelecidos.',
    role:'Inovação · Expansão para novos territórios · Ruptura de status quo',
  },
  AEGIS:{
    sigil:'⬡', name:'AEGIS', archetype:'O Guardião da Estrutura',
    desc:'Aegis é o pilar. Em qualquer estrutura, você é o que garante que o iniciado seja concluído com integridade. Não precisa de aprovação para manter sua posição — a consistência é sua identidade.',
    strengths:'Confiabilidade absoluta. Integridade sob pressão máxima. Execução consistente e ininterrupta.',
    weaknesses:'Resistência a mudanças necessárias. Dificuldade em liderar em ambientes de alta fluidez.',
    role:'Coordenação operacional · Garantia de qualidade · Sustentação de processos',
  },
  VORTEX:{
    sigil:'◉', name:'VORTEX', archetype:'O Núcleo de Influência',
    desc:'Vortex conecta e alinha. Você lê intenções com precisão, adapta sua abordagem por interlocutor e transforma conexões em capital estratégico real. A teia invisível que sustenta organizações.',
    strengths:'Inteligência social sofisticada. Adaptabilidade contextual alta. Construção de redes de alta qualidade.',
    weaknesses:'Pode suavizar conflitos que precisariam ser enfrentados. Tendência a ceder quando firmeza seria mais eficaz.',
    role:'Relações estratégicas · Mediação · Expansão de rede e influência',
  },
  TITAN:{
    sigil:'▲', name:'TITAN', archetype:'O Executor de Força',
    desc:'Titan move montanhas por força de vontade. Você não se distrai com teoria quando há resultados para entregar. Em ambientes de alta demanda, você é o último a parar.',
    strengths:'Volume de execução superior. Resistência em alta pressão. Orientação inequívoca a resultados.',
    weaknesses:'Pode negligenciar análise estratégica em favor de ação imediata. Dificuldade com subtilezas políticas.',
    role:'Execução de alta demanda · Liderança de campo · Entrega em condições adversas',
  },
  CIPHER:{
    sigil:'⊕', name:'CIPHER', archetype:'O Decodificador de Sistemas',
    desc:'Cipher enxerga padrões onde outros veem ruído. Você não age sem compreender o mecanismo subjacente — o que frequentemente te coloca à frente de quem age por intuição.',
    strengths:'Análise sistêmica profunda. Construção de modelos mentais precisos. Aprendizado rápido de sistemas complexos.',
    weaknesses:'Paralisia em dados insuficientes. Dificuldade em contextos de decisão rápida.',
    role:'Estratégia analítica · Arquitetura de processos · Diagnóstico organizacional',
  },
  SPECTER:{
    sigil:'◬', name:'SPECTER', archetype:'O Operador Silencioso',
    desc:'Specter age sem anunciar. Sua eficiência vem da invisibilidade estratégica — você executa enquanto outros disputam visibilidade. Poder sem holofote.',
    strengths:'Eficiência sem fricção social. Execução discreta de alta qualidade. Resistência às dinâmicas de ego.',
    weaknesses:'Pode ser subestimado ou ignorado em ambientes onde visibilidade é moeda. Dificuldade em autodivulgação.',
    role:'Operações especiais · Projetos de alto impacto discretos · Execução autônoma',
  },
};

/* ════════════════════════════════════════════════════════════════════
   M4. REGRAS DE ANÁLISE CRUZADA
   ════════════════════════════════════════════════════════════════════ */

const CROSS_RULES = [
  {
    id:'CR1',
    condition:(n,h)=> n.decisao>=70 && n.maturidade<50,
    type:'negative',
    title:'RISCO OPERACIONAL: Alta Decisão + Baixa Maturidade',
    text:'Sua capacidade decisória é real, mas a baixa maturidade comportamental cria risco sistêmico. Decisões rápidas sem ancoragem emocional são propensas a escaladas desnecessárias e conflitos que consomem o ganho gerado pela velocidade.',
    scoreAdj: -4,
  },
  {
    id:'CR2',
    condition:(n,h)=> n.logica>=70 && n.decisao<50,
    type:'negative',
    title:'INEFICIÊNCIA SISTÊMICA: Alta Lógica + Baixa Decisão',
    text:'Você constrói modelos precisos mas tem dificuldade em convertê-los em ação. Análise sem decisão é paralisia disfarçada de rigor. Em ambientes competitivos, você será superado por quem age com menos dados mas mais velocidade.',
    scoreAdj: -3,
  },
  {
    id:'CR3',
    condition:(n,h)=> n.sagacidade>=72 && n.maturidade<45,
    type:'negative',
    title:'ALERTA: Alta Sagacidade + Baixa Maturidade Ética',
    text:'Alta capacidade de leitura social combinada com baixa âncora ética cria perfil com tendência manipuladora. Este padrão é detectado no teste e reduz o score de confiabilidade. Não é um julgamento moral — é um diagnóstico operacional.',
    scoreAdj: -6,
  },
  {
    id:'CR4',
    condition:(n,h)=> n.decisao>=68 && n.logica>=68,
    type:'positive',
    title:'SINERGIA: Alta Decisão + Alta Lógica',
    text:'A combinação de velocidade decisória com rigor analítico é rara e valiosíssima. Você consegue construir raciocínios sólidos E agir sobre eles em tempo real. Este é o perfil base de líderes estratégicos de alto impacto.',
    scoreAdj: +4,
  },
  {
    id:'CR5',
    condition:(n,h)=> n.maturidade>=70 && n.sagacidade>=68,
    type:'positive',
    title:'PERFIL INTEGRATIVO: Alta Maturidade + Alta Sagacidade',
    text:'Você lê o ambiente com precisão E tem a estabilidade emocional para agir com integridade dentro dele. Esta combinação gera confiança duradoura — o ativo mais escasso em ambientes de alta pressão.',
    scoreAdj: +3,
  },
  {
    id:'CR6',
    condition:(n,h)=> n.decisao>=65 && n.maturidade>=65 && n.sagacidade>=65,
    type:'positive',
    title:'TRÍADE ESTRATÉGICA: Decisão + Maturidade + Sagacidade',
    text:'Perfil multidimensional raro. Você combina capacidade de ação, consciência de impacto e leitura contextual em nível consistente. Este conjunto é a base de líderes que constroem estruturas que sobrevivem a eles.',
    scoreAdj: +5,
  },
  {
    id:'CR7',
    condition:(n,h)=> n.logica<40 && n.decisao<40,
    type:'negative',
    title:'RISCO ESTRUTURAL: Baixa Lógica + Baixa Decisão',
    text:'Suas dimensões de maior impacto operacional estão abaixo do nível funcional. Sem raciocínio estruturado e sem capacidade decisória consistente, o perfil demonstra dependência excessiva de fatores externos para operar.',
    scoreAdj: -8,
  },
  {
    id:'CR8',
    condition:(n,h)=> h.consistency<40,
    type:'warning',
    title:'INCONSISTÊNCIA DETECTADA: Padrão de Resposta Instável',
    text:'Foram detectadas contradições significativas entre respostas sobre o mesmo tema. Isso pode indicar: respostas estratégicas (tentativa de manipular o resultado), instabilidade real de posições, ou alta dependência de contexto para formar julgamentos. O score foi ajustado.',
    scoreAdj: -5,
  },
];

/* ════════════════════════════════════════════════════════════════════
   M5. ESTADO & PERSISTÊNCIA
   ════════════════════════════════════════════════════════════════════ */

function createFreshState() {
  return {
    version:        CFG.VERSION,
    sequence:       [],       // IDs das questões na ordem atual
    answers:        {},       // { qId: optionIndex }
    rawMetrics:     { decisao:0, logica:0, sagacidade:0, maturidade:0 },
    maxMetrics:     { decisao:0, logica:0, sagacidade:0, maturidade:0 },
    tagsActivated:  [],       // tags das respostas dadas
    mirrorAnswers:  {},       // { mirrorQId: { optionIndex, mirror_score } }
    currentIndex:   0,
    completed:      false,
    startedAt:      Date.now(),
  };
}

let STATE = createFreshState();

function saveState() {
  try { localStorage.setItem(CFG.STORAGE_KEY, JSON.stringify(STATE)); flashSave(); }
  catch(e){ console.warn('ICM: save failed', e); }
}

function loadState() {
  try {
    const raw = localStorage.getItem(CFG.STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p.version === CFG.VERSION ? p : null;
  } catch { return null; }
}

function clearState() { localStorage.removeItem(CFG.STORAGE_KEY); }

function loadHistory() {
  try {
    const raw = localStorage.getItem(CFG.HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveToHistory(result) {
  const hist = loadHistory();
  hist.unshift(result);
  if (hist.length > CFG.MAX_HISTORY) hist.pop();
  localStorage.setItem(CFG.HISTORY_KEY, JSON.stringify(hist));
}

/* ════════════════════════════════════════════════════════════════════
   M6. ADAPTIVE ENGINE
   ════════════════════════════════════════════════════════════════════ */

// Lookup map para todas as perguntas
const Q_MAP = {};
QUESTIONS.forEach(q => { Q_MAP[q.id] = q; });

/** Constrói a sequência inicial com perguntas base na ordem por bloco,
 *  intercalando mirror questions estrategicamente (após 4ª e 8ª questões do bloco) */
function buildBaseSequence() {
  const base   = QUESTIONS.filter(q => q.type === 'base');
  const mirrors = QUESTIONS.filter(q => q.type === 'mirror');

  // Ordena base por bloco na ordem definida
  const blockOrder = ['decisao','logica','sagacidade','maturidade'];
  const sorted = blockOrder.flatMap(b => base.filter(q => q.block === b));

  // Insere mirrors: 1 mirror por bloco, após a 3ª pergunta do bloco
  const seq = [];
  const usedMirrors = new Set();

  blockOrder.forEach(block => {
    const bqs = sorted.filter(q => q.block === block);
    bqs.forEach((q, i) => {
      seq.push(q.id);
      // Insere mirror após a 3ª pergunta do bloco
      if (i === 2) {
        const mirror = mirrors.find(m => m.block === block && !usedMirrors.has(m.id));
        if (mirror) { seq.push(mirror.id); usedMirrors.add(mirror.id); }
      }
    });
    // Insere 2º mirror após a última pergunta do bloco (se existir)
    const mirror2 = mirrors.find(m => m.block === block && !usedMirrors.has(m.id));
    if (mirror2) { seq.push(mirror2.id); usedMirrors.add(mirror2.id); }
  });

  return seq;
}

/** Tenta inserir pergunta adaptativa após a posição atual */
function tryInsertAdaptive() {
  const recent3Tags = STATE.tagsActivated.slice(-4);
  const usedAdaptive = STATE.sequence.filter(id => Q_MAP[id]?.type === 'adaptive');

  const candidate = QUESTIONS.find(q =>
    q.type === 'adaptive' &&
    !STATE.sequence.includes(q.id) &&
    !usedAdaptive.includes(q.id) &&
    q.triggers.some(t => recent3Tags.includes(t))
  );

  if (candidate) {
    const insertAt = STATE.currentIndex + 1;
    STATE.sequence.splice(insertAt, 0, candidate.id);
  }
}

/* ════════════════════════════════════════════════════════════════════
   M7. SCORING ENGINE
   ════════════════════════════════════════════════════════════════════ */

/** Recalcula maxMetrics com base nas perguntas da sequência atual */
function recalcMax() {
  const max = { decisao:0, logica:0, sagacidade:0, maturidade:0 };
  STATE.sequence.forEach(id => {
    const q = Q_MAP[id];
    if (!q) return;
    const mult = PESO_MULT[q.peso] || 1;
    const qMax = { decisao:0, logica:0, sagacidade:0, maturidade:0 };
    q.options.forEach(opt => {
      Object.keys(qMax).forEach(k => {
        const v = (opt.points[k]||0) * mult;
        if (v > qMax[k]) qMax[k] = v;
      });
    });
    Object.keys(max).forEach(k => { max[k] += qMax[k]; });
  });
  STATE.maxMetrics = max;
}

/** Normaliza métricas para 0–100 */
function normalizeMetrics() {
  const norm = {};
  Object.keys(STATE.maxMetrics).forEach(k => {
    norm[k] = STATE.maxMetrics[k] > 0
      ? Math.min(100, Math.round((STATE.rawMetrics[k] / STATE.maxMetrics[k]) * 100))
      : 0;
  });
  return norm;
}

/**
 * Calcula Índice de Consistência (0–100) baseado em pares de perguntas espelhadas.
 * Compara o mirror_score da resposta dada com o esperado para a resposta da pergunta original.
 */
function calcConsistency() {
  const mirrors = QUESTIONS.filter(q => q.type === 'mirror' && STATE.answers[q.id] !== undefined);
  if (mirrors.length === 0) return 75; // base sem dados de mirror

  let totalExpected = 0;
  let totalActual   = 0;

  mirrors.forEach(mq => {
    const origId  = mq.mirrorOf;
    const origAns = STATE.answers[origId];
    const mirrAns = STATE.answers[mq.id];
    if (origAns === undefined || mirrAns === undefined) return;

    // O mirror_score esperado é baseado na opção original escolhida
    // (posição na lista original → quanto mais alta a decisão, maior consistência esperada)
    const origOpt     = Q_MAP[origId]?.options[origAns];
    const origDecScore = origOpt?.points?.decisao || 3; // proxy de "força de posição"
    const expectedConsistency = 0.4 + (origDecScore / 5) * 0.5; // 0.4–0.9

    const mirrorOpt = mq.options[mirrAns];
    const actualMirrorScore = mirrorOpt?.mirror_score ?? 0.5;

    totalExpected += expectedConsistency;
    totalActual   += actualMirrorScore;
  });

  if (totalExpected === 0) return 75;
  const ratio = totalActual / totalExpected;
  return Math.round(Math.min(100, Math.max(0, ratio * 100)));
}

/**
 * Calcula Índice de Confiabilidade (0–100).
 * Penaliza por: respostas sempre no extremo, velocidade muito alta (não disponível no frontend puro),
 * e padrões de tag inconsistentes.
 */
function calcReliability(norm, consistency) {
  let score = 80; // base

  // Penaliza se consistência é baixa
  if (consistency < 50) score -= 20;
  else if (consistency < 65) score -= 10;

  // Penaliza se todas as dimensões são altas (perfil "perfeito" suspeito)
  const allHigh = Object.values(norm).every(v => v > 80);
  if (allHigh) score -= 12;

  // Penaliza padrão de tags "manipuladoras"
  const manip = STATE.tagsActivated.filter(t => t === 'sagacidade_manipuladora' || t === 'maturidade_baixa').length;
  score -= manip * 5;

  // Bonus se alta maturidade + alta consistência (padrão de honestidade)
  if (norm.maturidade >= 70 && consistency >= 75) score += 8;

  return Math.round(Math.min(100, Math.max(15, score)));
}

/**
 * Calcula o ICM final com calibração real.
 *
 * PIPELINE:
 * 1. Fator de dificuldade (×0.82): simula que o teste sempre tem ~18% de overhead impossível
 *    → Ninguém acerta tudo. Norma bruta 94% → norma deflacionada 77%
 *    → Teto por dimensão em 92 para evitar casos extremos
 * 2. Penalidade por desequilíbrio: desvio padrão das dimensões
 *    → Perfil muito assimétrico é penalizado (especialista extremo perde cobertura)
 * 3. Média ponderada com pesos por dimensão
 * 4. Ajuste de consistência e confiabilidade
 * 5. Penalidades/bônus de análise cruzada
 * 6. Deflação final via curva de potência (^0.72)
 *    → Raw 90 → ICM 87, Raw 72 → ICM 66, Raw 55 → ICM 52, Raw 35 → ICM 32
 *    → Teto natural: score perfeito resulta em ~78-82, não em 100
 *
 * DISTRIBUIÇÃO ESPERADA:
 *   Elite real (top 2%):       78–85
 *   Agente da Ordem (top 10%): 68–77
 *   Operador (top 30%):        58–67
 *   Em desenvolvimento:        44–57
 *   Instável:                  < 44
 */
function calcICM(norm, consistency, reliability) {
  const DIMS = ['decisao','logica','sagacidade','maturidade'];
  const DW   = CFG.DIM_WEIGHTS;

  // ── 1. Fator de dificuldade nas dimensões ──────────────────────
  const DIFFICULTY = 0.82; // 18% de overhead impossível
  const deflDims   = {};
  DIMS.forEach(k => {
    deflDims[k] = Math.min(92, Math.round(norm[k] * DIFFICULTY));
  });

  // ── 2. Penalidade por desequilíbrio ───────────────────────────
  const vals     = DIMS.map(k => deflDims[k]);
  const mean     = vals.reduce((a,b) => a+b, 0) / vals.length;
  const stddev   = Math.sqrt(vals.reduce((s,v) => s + (v-mean)**2, 0) / vals.length);
  const balPen   = Math.min(10, (stddev / 20) * 10);

  // ── 3. Média ponderada ────────────────────────────────────────
  const totalW   = Object.values(DW).reduce((a,b) => a+b, 0);
  const dimScore = DIMS.reduce((acc,k) => acc + deflDims[k] * DW[k], 0) / totalW;

  // ── 4. Ajuste por índices ocultos ─────────────────────────────
  // Centralizados em 65 (padrão esperado), máximo de ±8pts cada
  const consistAdj  = ((consistency - 65) / 35) * 8;
  const reliableAdj = ((reliability - 65) / 35) * 6;

  // ── 5. Cross-analysis adjustments ────────────────────────────
  let crossAdj = 0;
  CROSS_RULES.forEach(rule => {
    if (rule.condition(norm, { consistency, reliability })) {
      crossAdj += (rule.scoreAdj || 0);
    }
  });

  // ── 6. Score bruto ────────────────────────────────────────────
  const raw = dimScore - balPen + consistAdj + reliableAdj + crossAdj;

  // ── 7. Deflação final via curva de potência ───────────────────
  // f(x) = (x/100)^0.72 × 100
  // Comprime os scores altos progressivamente, mantendo os baixos.
  const deflated = Math.pow(Math.max(0, raw) / 100, 0.72) * 100;

  // ── 8. Arredonda e aplica floor/cap ──────────────────────────
  return Math.round(Math.min(100, Math.max(5, deflated)));
}

/**
 * Retorna as dimensões deflacionadas (para exibição nos cards de métricas).
 * Mostra o valor que realmente entrou no cálculo, não o bruto.
 */
function getDeflatedNorms(rawNorm) {
  const out = {};
  Object.keys(rawNorm).forEach(k => {
    out[k] = Math.min(92, Math.round(rawNorm[k] * 0.82));
  });
  return out;
}

/* ════════════════════════════════════════════════════════════════════
   M8. RESULT GENERATORS
   ════════════════════════════════════════════════════════════════════ */

function getClassification(icm) {
  if (icm<=40) return { cls:'INSTÁVEL',               tier:'NÍVEL 1 · PADRÃO INCIPIENTE',       desc:'Seu perfil demonstra inconsistências significativas nas dimensões avaliadas. Há potencial identificável, mas os fundamentos estruturais precisam ser construídos com deliberação. O ponto de partida está mapeado.' };
  if (icm<=58) return { cls:'EM DESENVOLVIMENTO',      tier:'NÍVEL 2 · PADRÃO EMERGENTE',        desc:'Capacidade real em áreas específicas, mas integração multidimensional ainda incompleta. Com consistência estruturada, a transição para o próximo nível é provável.' };
  if (icm<=72) return { cls:'OPERADOR ESTRATÉGICO',    tier:'NÍVEL 3 · PADRÃO FUNCIONAL',        desc:'Você opera com eficiência real em cenários de alta complexidade. Equilíbrio entre análise e ação presente. Pronto para responsabilidades de maior escala.' };
  if (icm<=85) return { cls:'AGENTE DA ORDEM',         tier:'NÍVEL 4 · PADRÃO AVANÇADO',         desc:'Maturidade cognitiva e estratégica acima da média. Decisões por princípio, leitura de cenários precisa, consistência sob pressão. Ativo de alto valor.' };
  return         { cls:'ELITE DA ORDEM',               tier:'NÍVEL 5 · PADRÃO DE EXCELÊNCIA',    desc:'Índice excepcional. Domínio multidimensional consistente: decisão calibrada, lógica precisa, leitura estratégica aguçada e maturidade sólida. Perfil estatisticamente raro.' };
}

function getAptidao(icm, norm, consistency) {
  const ok = { d: norm.decisao>=55, m: norm.maturidade>=55, gen: icm>=60, cons: consistency>=60 };
  if (icm>=82 && ok.d && ok.m && ok.cons) return { val:'🏆 ELITE', desc:'Perfil consistente e multidimensional. Reúne os atributos que a Ordem valoriza em membros de alto impacto com risco operacional mínimo.' };
  if (ok.gen && ok.d && ok.m)             return { val:'✅ APTO',   desc:'Fundamentos sólidos demonstrados. Desenvolvimento nas dimensões de menor pontuação amplificará o potencial.' };
  if (icm>=48 && (ok.d || ok.m))          return { val:'⚠️ POTENCIAL INSTÁVEL', desc:'Há capacidade identificável, mas inconsistências em dimensões críticas impedem classificação definitiva neste momento.' };
  return                                         { val:'❌ NÃO APTO', desc:'O perfil atual não atende os padrões mínimos. Isso é diagnóstico, não sentença. Retorne após desenvolvimento estruturado.' };
}

function getRanking(icm) {
  // Distribuição simulada baseada em curva de Gauss com μ=58, σ=18
  const z = (icm - 58) / 18;
  const erf = z < 0
    ? -(1 - 1/(1+0.278393*Math.abs(z)+0.230389*z*z+0.000972*Math.abs(z)*z*z+0.078108*z*z*z*z)**4)
    : (1 - 1/(1+0.278393*z+0.230389*z*z+0.000972*z*z*z+0.078108*z*z*z*z)**4);
  const pct = Math.round((1 - (0.5 + 0.5*erf)) * 100);
  return { pct: Math.max(1, Math.min(99, pct)), label:`Top ${Math.max(1,Math.min(99,pct))}%` };
}

/**
 * Calcula o espectro dominante e secundário usando CONTAGEM DE TAGS acumuladas.
 * Cada tag ativada ao longo do teste acumula peso para o espectro correspondente.
 * Isso garante que o espectro reflita o padrão REAL de respostas, não apenas limiares de %.
 *
 * Tags → pesos por espectro:
 *   CORVUS:  sagacidade_alta(3), logica_alta(2), decisao_analitico(2)
 *   FENRIR:  decisao_ousado(3), decisao_inovador(3), decisao_lider(1)
 *   AEGIS:   maturidade_alta(3), maturidade_media(1), decisao_estruturado(2)
 *   VORTEX:  sagacidade_alta(2), sagacidade_media(1), maturidade_alta(1)
 *   TITAN:   decisao_lider(3), decisao_direto(2), decisao_impulsivo(1)
 *   CIPHER:  logica_alta(3), logica_media(1), decisao_analitico(2)
 *   SPECTER: sagacidade_alta(1), maturidade_alta(2), decisao_evitativo(1)
 */
function getEspectros(norm) {
  // Mapa de tags → pesos por espectro
  const TAG_WEIGHTS = {
    // tag: { espectroKey: peso }
    'sagacidade_alta':         { CORVUS:3, VORTEX:2, SPECTER:1 },
    'sagacidade_media':        { VORTEX:1, SPECTER:1 },
    'sagacidade_manipuladora': { FENRIR:1 },
    'logica_alta':             { CORVUS:2, CIPHER:3 },
    'logica_media':            { CIPHER:1 },
    'logica_baixa':            {},
    'decisao_lider':           { TITAN:3, FENRIR:1 },
    'decisao_direto':          { TITAN:2 },
    'decisao_ousado':          { FENRIR:3 },
    'decisao_inovador':        { FENRIR:3 },
    'decisao_analitico':       { CORVUS:2, CIPHER:2 },
    'decisao_estruturado':     { AEGIS:2, CORVUS:1 },
    'decisao_conservador':     { AEGIS:1 },
    'decisao_evitativo':       { SPECTER:1 },
    'decisao_fraco':           {},
    'decisao_institucional':   { AEGIS:2 },
    'decisao_impulsivo':       { FENRIR:1, TITAN:1 },
    'decisao_intuitivo':       { TITAN:1 },
    'decisao_consistente':     { AEGIS:1 },
    'maturidade_alta':         { AEGIS:3, VORTEX:1, SPECTER:2 },
    'maturidade_media':        { AEGIS:1 },
    'maturidade_baixa':        {},
    'maturidade_autopercep_alta':  { AEGIS:2 },
    'maturidade_autopercep_baixa': {},
  };

  // Acumula scores por espectro
  const scores = { CORVUS:0, FENRIR:0, AEGIS:0, VORTEX:0, TITAN:0, CIPHER:0, SPECTER:0 };

  STATE.tagsActivated.forEach(tag => {
    const tw = TAG_WEIGHTS[tag];
    if (!tw) return;
    Object.entries(tw).forEach(([esp, peso]) => {
      scores[esp] = (scores[esp] || 0) + peso;
    });
  });

  // Ordena por score
  const sorted = Object.entries(scores).sort((a,b) => b[1]-a[1]);

  // Dominante = maior score
  const primaryKey   = sorted[0][0];
  const secondaryKey = sorted[1][0];

  // Garante que primário e secundário sejam sempre diferentes
  const primary   = ESPECTROS[primaryKey]   || ESPECTROS.CORVUS;
  const secondary = ESPECTROS[secondaryKey] || ESPECTROS.SPECTER;

  return { primary, secondary };
}

function getEspectroCombo(p, s) {
  const combos = {
    'CORVUS-AEGIS':   'A combinação de estratégia profunda com execução consistente gera o arquétipo do construtor de impérios: planeja no nível de xadrez e garante que cada peça se mova conforme calculado.',
    'CORVUS-VORTEX':  'Estratégia oculta com inteligência social cria o operador político mais sofisticado: você influencia a narrativa antes de qualquer ação visível.',
    'FENRIR-TITAN':   'Ruptura com execução de força: você não apenas quebra paradigmas — constrói o novo antes que o velho termine de cair.',
    'AEGIS-CIPHER':   'Estrutura com análise profunda: você constrói sistemas que duram porque compreende seus fundamentos melhor que qualquer outro.',
    'VORTEX-CORVUS':  'Influência social com estratégia invisível: as pessoas acreditam que a ideia foi delas — e foi você quem a plantou.',
    'TITAN-FENRIR':   'Força de execução com propensão à ruptura: imparável em ambientes de alta demanda, potencialmente destrutivo em ambientes frágeis.',
    'CIPHER-AEGIS':   'Diagnóstico profundo com sustentação estrutural: você identifica o problema com precisão e constrói soluções que não precisam de manutenção constante.',
  };
  const key = `${p.name}-${s.name}`;
  const keyRev = `${s.name}-${p.name}`;
  return combos[key] || combos[keyRev] || `${p.name} e ${s.name} formam uma combinação incomum que potencializa as capacidades de cada espectro individualmente, criando um perfil de difícil categorização — e portanto de difícil antecipação por adversários.`;
}

function getCrossAnalysis(norm, hidden) {
  return CROSS_RULES.filter(r => r.condition(norm, hidden));
}

function getDimTier(v) {
  if (v>=82) return 'EXCEPCIONAL';
  if (v>=68) return 'ELEVADO';
  if (v>=50) return 'FUNCIONAL';
  if (v>=35) return 'EMERGENTE';
  return 'CRÍTICO';
}

function getDimDesc(key, val) {
  const cat = val>=68?'h':val>=45?'m':'l';
  const d = {
    decisao:{
      h:'Decisão firme e calibrada. Você age sob pressão sem perder clareza estratégica — e ajusta no movimento.',
      m:'Capacidade decisória funcional. Algumas vacilações em contextos de risco elevado ou novidade extrema.',
      l:'Tendência à hesitação em cenários de pressão. Decisões são adiadas quando a incerteza é alta.',
    },
    logica:{
      h:'Raciocínio analítico sofisticado. Identifica padrões subjacentes, extrai princípios e otimiza com consistência.',
      m:'Lógica funcional e aplicável. Resolve problemas estruturados com frequência; pode travar em sistemas complexos.',
      l:'Raciocínio predominantemente intuitivo. Estrutura lógica formal precisa ser desenvolvida intencionalmente.',
    },
    sagacidade:{
      h:'Inteligência contextual aguçada. Lê o que não é dito, detecta intenções e age no tempo certo.',
      m:'Consciência situacional crescente. Detecta dinâmicas com frequência, não com a consistência de quem domina isso.',
      l:'Leitura de cenários e intenções ainda em desenvolvimento. Pode ser surpreendido por dinâmicas que outros percebem.',
    },
    maturidade:{
      h:'Maturidade comportamental sólida. Equilíbrio entre princípio e pragmatismo. Reage a crises com compostura.',
      m:'Base de responsabilidade presente. Ainda suscetível a reações não processadas em momentos críticos.',
      l:'Reações impulsivas ou inconsistentes sob pressão. Dificuldade em separar ego do resultado esperado.',
    },
  };
  return d[key][cat];
}

function getConsistencyDesc(v) {
  if (v>=80) return 'Suas respostas demonstram coerência interna elevada. Suas posições são estáveis e provavelmente genuínas.';
  if (v>=60) return 'Consistência funcional. Algumas divergências entre respostas sobre temas similares foram detectadas.';
  if (v>=40) return 'Inconsistências moderadas identificadas. Pode indicar instabilidade de posições ou resposta estratégica ao teste.';
  return 'Inconsistências significativas detectadas. Respostas contraditórias sobre os mesmos temas comprometem a leitura do perfil real.';
}

function getReliabilityDesc(v) {
  if (v>=80) return 'Padrão de resposta consistente com perfil genuíno. Alta confiabilidade nos dados gerados.';
  if (v>=60) return 'Confiabilidade aceitável. Algumas anomalias de padrão, mas sem comprometimento estrutural.';
  if (v>=40) return 'Confiabilidade reduzida. Padrões de resposta sugerem possível calibração estratégica.';
  return 'Baixa confiabilidade. O padrão de respostas apresenta anomalias que reduzem significativamente a precisão do diagnóstico.';
}

function getInterpretation(norm, icm, consistency) {
  const sorted = Object.entries(norm).sort((a,b)=>b[1]-a[1]);
  const topKey = sorted[0][0];
  const lowKey = sorted[sorted.length-1][0];

  const strong = {
    decisao:    'Capacidade de ação rápida em cenários de alta pressão. Você não paralisa diante da incerteza — age e ajusta.',
    logica:     'Raciocínio estruturado de alta qualidade. Enxerga padrões onde outros veem complexidade sem saída.',
    sagacidade: 'Inteligência contextual e leitura de intenções. Você opera com uma camada a mais de informação que a maioria.',
    maturidade: 'Consistência e integridade comportamental sob pressão. Você é previsível da melhor forma: confiável.',
  };
  const risk = {
    decisao:    'Deliberação prolongada pode ser frustrante para sua tendência à ação. Desenvolver paciência estratégica ampliará seu alcance.',
    logica:     'Momentos que exigem intuição pura ou leitura emocional rápida podem ser zonas de vulnerabilidade real.',
    sagacidade: 'Em ambientes diretos e previsíveis, tendência a analisar camadas ocultas pode criar fricção desnecessária.',
    maturidade: 'Situações que pedem risco calculado ou impulsividade controlada podem ser limitadas pela inclinação à cautela.',
  };

  // Análise comportamental profunda — gerada pelo perfil real
  const topVal  = norm[topKey];
  const lowVal  = norm[lowKey];
  const delta   = topVal - lowVal;

  let deep = '';
  if (delta > 35) {
    deep = `Você apresenta um perfil assimétrico significativo: ${topKey.toUpperCase()} (${topVal}%) em contraste com ${lowKey.toUpperCase()} (${lowVal}%). Esta diferença de ${delta} pontos indica especialização em detrimento de equilíbrio. `;
    deep += 'Em ambientes que exigem sua dimensão forte, você supera a maioria. Em contextos que demandam sua dimensão fraca, o gap se torna limitação operacional real.';
  } else if (icm >= 75 && delta < 20) {
    deep = `Seu perfil é notavelmente equilibrado — a diferença entre sua dimensão mais alta e mais baixa é de apenas ${delta} pontos. Isso é raro. Indica que você não tem vulnerabilidades óbvias, mas também não tem um diferencial singular de nível excepcional. `;
    deep += 'Em estruturas que valorizam versatilidade, você é invulnerável. Em competição direta com especialistas, pode ser superado na dimensão específica deles.';
  } else {
    deep = `Seu padrão de resposta ao longo do teste revela ${consistency>=70?'alta coerência interna':'variações de posicionamento'} em situações de pressão. `;
    deep += `As dimensões de ${topKey.toUpperCase()} e ${sorted[1][0].toUpperCase()} formam sua base operacional, enquanto ${lowKey.toUpperCase()} representa a área onde o investimento de desenvolvimento geraria o maior retorno marginal.`;
  }

  const potential =
    icm>=83 ? 'Perfil apto para posições de alta responsabilidade na estrutura da Ordem. Você integra múltiplas dimensões com consistência acima da média — isso é raro e estrategicamente valioso.'
    :icm>=68 ? 'Com desenvolvimento focado nas dimensões de menor pontuação, seu potencial de ascensão dentro da Ordem é considerável. Há mais a ser destravado do que o ICM atual indica.'
    :icm>=50 ? 'Há um núcleo real aqui. Disciplina de longo prazo nas dimensões críticas revelará o que já existe em potencial mas ainda não foi ativado de forma consistente.'
    :'O diagnóstico é ponto de partida, não destino. Toda arquitetura começa com reconhecimento honesto do terreno atual.';

  return { strong: strong[topKey], risk: risk[lowKey], deep, potential };
}

function getFuncao(norm) {
  const top = Object.entries(norm).sort((a,b)=>b[1]-a[1])[0][0];
  const map = {
    decisao:    { sigil:'⚔', title:'LIDERANÇA OPERACIONAL',    desc:'Você pertence à linha de frente onde decisão rápida e firmeza superam consenso. Iniciativas de alto risco são seu ambiente natural.' },
    logica:     { sigil:'◈', title:'ARQUITETURA ESTRATÉGICA',   desc:'Sua mente constrói sistemas. Decisões são engenharia, não intuição. Você pertence ao núcleo analítico onde precisão é o único padrão.' },
    sagacidade: { sigil:'◉', title:'INFLUÊNCIA & ARTICULAÇÃO',  desc:'Você lê pessoas e contextos antes de qualquer outro. Sua posição natural é nas articulações: negociação, influência, alianças de alto nível.' },
    maturidade: { sigil:'▲', title:'COORDENAÇÃO & SUSTENTAÇÃO', desc:'Você é o pilar que mantém consistência no caos. Sua função: garantir que o iniciado seja concluído com integridade e sem desvio de rota.' },
  };
  return map[top];
}

/* ════════════════════════════════════════════════════════════════════
   M9. RENDER ENGINE
   ════════════════════════════════════════════════════════════════════ */

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  if (id === 'screen-result') {
    const scroll = el?.querySelector('.result-scroll');
    if (scroll) setTimeout(() => { scroll.scrollTop = 0; }, 50);
  }
}

function animCount(el, target, dur=1700) {
  let t0 = null;
  const step = ts => {
    if (!t0) t0 = ts;
    const p = Math.min((ts-t0)/dur, 1);
    const e = 1 - Math.pow(1-p, 3);
    el.textContent = Math.round(e * target);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = target;
  };
  requestAnimationFrame(step);
}

function flashSave() {
  const el = document.getElementById('save-pill');
  if (!el) return;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0.4'; }, 1300);
}

/** Renderiza a pergunta no índice atual */
function renderQuestion(idx) {
  const id = STATE.sequence[idx];
  if (!id) return;
  const q = Q_MAP[id];
  if (!q) return;

  const total     = STATE.sequence.length;
  const blockIdx  = ['decisao','logica','sagacidade','maturidade'].indexOf(q.block) + 1;
  const blockLbl  = {decisao:'DECISÃO',logica:'LÓGICA',sagacidade:'SAGACIDADE',maturidade:'MATURIDADE'}[q.block];
  const isMirror  = q.type === 'mirror';
  const isAdapt   = q.type === 'adaptive';

  // Header
  document.getElementById('block-label').textContent = `BLOCO ${blockIdx} · ${blockLbl}`;
  document.getElementById('block-phase').textContent  = isAdapt ? 'ADAPTATIVA' : isMirror ? 'VERIFICAÇÃO' : '';
  document.getElementById('q-counter').textContent   = `${String(idx+1).padStart(2,'0')}/${String(total).padStart(2,'0')}`;

  // Progress
  const pct = (idx / total) * 100;
  document.getElementById('progress-fill').style.width = pct + '%';

  // Block dots
  ['decisao','logica','sagacidade','maturidade'].forEach((b,i) => {
    const dot = document.getElementById('bdot-'+i);
    if (!dot) return;
    dot.className = 'bdot';
    const inSeq = STATE.sequence.map(qid => Q_MAP[qid]).filter(x=>x);
    const firstOfBlock = inSeq.findIndex(x => x.block === b);
    const lastOfBlock  = inSeq.reduce((acc,x,ii) => x.block===b?ii:acc, -1);
    if (firstOfBlock === -1) return;
    if (idx > lastOfBlock)       dot.classList.add('done');
    else if (idx >= firstOfBlock) dot.classList.add('active');
  });

  // Card badge + weight + mirror flag
  document.getElementById('q-badge').textContent  = blockLbl;
  const weightLabels = {normal:'',elevado:'PESO ELEVADO',critico:'PESO CRÍTICO'};
  document.getElementById('q-weight').textContent = weightLabels[q.peso] || '';
  const mirrorFlag = document.getElementById('q-mirror-flag');
  mirrorFlag.hidden = !isMirror;

  // Question text
  document.getElementById('q-text').textContent = q.text;

  // Options
  const LETTERS = ['A','B','C','D'];
  const grid    = document.getElementById('q-options');
  grid.innerHTML = '';

  q.options.forEach((opt,i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.dataset.idx = i;
    btn.setAttribute('role','listitem');
    btn.innerHTML = `
      <span class="opt-letter">${LETTERS[i]}</span>
      <span class="opt-text">${opt.text}</span>
    `;
    if (STATE.answers[id] === i) btn.classList.add('selected');
    btn.addEventListener('click', () => selectAnswer(btn, i, q));
    grid.appendChild(btn);
  });

  // Back button
  document.getElementById('btn-back').disabled = (idx === 0);

  // Animate card in
  const card = document.getElementById('q-card');
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';
}

/** Handler de seleção de resposta */
function selectAnswer(btn, optIdx, q) {
  // Visual
  document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  const opt  = q.options[optIdx];
  const mult = PESO_MULT[q.peso] || 1;

  // Reverte pontos da resposta anterior (para poder mudar resposta ao voltar)
  const prevIdx = STATE.answers[q.id];
  if (prevIdx !== undefined) {
    const prevOpt = q.options[prevIdx];
    Object.keys(prevOpt.points).forEach(k => {
      STATE.rawMetrics[k] -= (prevOpt.points[k]||0) * mult;
    });
  }

  // Adiciona novos pontos
  Object.keys(opt.points).forEach(k => {
    STATE.rawMetrics[k] = (STATE.rawMetrics[k]||0) + (opt.points[k]||0) * mult;
  });

  STATE.answers[q.id] = optIdx;
  if (opt.tag) STATE.tagsActivated.push(opt.tag);

  // Armazena dados de mirror
  if (q.type === 'mirror' && opt.mirror_score !== undefined) {
    STATE.mirrorAnswers[q.id] = { optionIndex: optIdx, mirror_score: opt.mirror_score };
  }

  recalcMax();
  saveState();

  setTimeout(() => {
    STATE.currentIndex++;
    if (STATE.currentIndex < STATE.sequence.length) {
      tryInsertAdaptive();
      renderQuestion(STATE.currentIndex);
    } else {
      STATE.completed = true;
      saveState();
      showAnalysis();
    }
  }, CFG.OPTION_DELAY);
}

function goBack() {
  if (STATE.currentIndex <= 0) return;
  STATE.currentIndex--;
  renderQuestion(STATE.currentIndex);
}

/* ── ANÁLISE ──────────────────────────────────────────────── */

function showAnalysis() {
  showScreen('screen-analysis');

  const msgEl  = document.getElementById('analysis-msg');
  const dataEl = document.getElementById('at-data');
  const pctEl  = document.getElementById('at-pct');
  const CHARS  = '▓▒░█▌▐▄▀■□▪◈◉▲';

  let msgI = 0, pct = 0;
  const FILLS = ['af-d','af-l','af-s','af-m','af-c'];

  const msgT = setInterval(() => {
    if (msgEl) msgEl.textContent = ANALYSIS_MSGS[msgI % ANALYSIS_MSGS.length];
    msgI++;
  }, 440);

  setTimeout(() => {
    FILLS.forEach((id,i) => setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.style.width = (25 + Math.random() * 60) + '%';
    }, i * 240));
  }, 300);

  const codeT = setInterval(() => {
    if (dataEl) dataEl.textContent = Array(18).fill(0).map(() => CHARS[Math.floor(Math.random()*CHARS.length)]).join('');
    pct = Math.min(pct + Math.random()*7, 96);
    if (pctEl) pctEl.textContent = Math.round(pct)+'%';
  }, 80);

  setTimeout(() => {
    clearInterval(msgT);
    clearInterval(codeT);
    if (pctEl) pctEl.textContent = '100%';
    if (msgEl) msgEl.textContent = 'Relatório gerado. Acesso autorizado.';
    setTimeout(showResult, 700);
  }, CFG.ANALYSIS_DELAY);
}

/* ── RESULTADO ────────────────────────────────────────────── */

function showResult() {
  const norm        = normalizeMetrics();
  const deflNorm    = getDeflatedNorms(norm);   // normas deflacionadas para exibição
  const consistency = calcConsistency();
  const reliability = calcReliability(norm, consistency);
  const ICM         = calcICM(norm, consistency, reliability);
  const hidden      = { consistency, reliability };

  // ── RESULTADO ESTRUTURADO (exposto globalmente + Supabase) ─────────────────
  const { primary: espPrimary, secondary: espSecondary } = getEspectros(norm);
  const { cls: icmCls } = getClassification(ICM);

  /** @type {ICMResult} */
  const icmResult = {
    score:          ICM,
    classificacao:  icmCls,
    dominante:      espPrimary.name,
    secundario:     espSecondary.name,
    dimensoes: {
      decisao:      Math.min(92, Math.round(norm.decisao    * 0.82)),
      logica:       Math.min(92, Math.round(norm.logica     * 0.82)),
      sagacidade:   Math.min(92, Math.round(norm.sagacidade * 0.82)),
      maturidade:   Math.min(92, Math.round(norm.maturidade * 0.82)),
    },
    consistencia:   consistency,
    confiabilidade: reliability,
    timestamp:      new Date().toISOString(),
  };

  // Insígnias derivadas do resultado
  icmResult.badges = (function deriveBadges(r) {
    const ALL = ['corvus','fenrir','aegis','vortex','titan','cipher','specter','elite','agente','operador'];
    const earned = [];
    const dom = r.dominante.toLowerCase();
    const sec = r.secundario.toLowerCase();
    if (ALL.includes(dom)) earned.push(dom);
    if (ALL.includes(sec) && sec !== dom) earned.push(sec);
    if (r.score >= 80) earned.push('elite');
    else if (r.score >= 70) earned.push('agente');
    else if (r.score >= 60) earned.push('operador');
    return earned;
  })(icmResult);

  // Expõe globalmente para uso por outros módulos do portal
  window.__ICM_RESULT__ = icmResult;

  // Persiste no Supabase (não bloqueia a UI)
  (async function saveICMToSupabase() {
    try {
      const profile = window.__MSY_PROFILE__;
      const dbInst  = window.__MSY_DB__;
      if (!profile || !dbInst) return; // Fora do portal — silent fail

      const { error } = await dbInst
        .from('profiles')
        .update({ icm: icmResult })
        .eq('id', profile.id);

      showICMSaveToast(error ? 'error' : 'success', error);
    } catch(err) {
      console.warn('[ICM] Falha ao salvar no Supabase:', err);
      showICMSaveToast('error', err);
    }
  })();
  // ── FIM BLOCO SUPABASE ─────────────────────────────────────────────────────

  // Salva no histórico local
  const now = new Date();
  const histEntry = {
    icm: ICM,
    cls: icmCls,
    date: now.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}),
    consistency,
    reliability,
    norm,
  };
  saveToHistory(histEntry);

  // Data e sessão
  document.getElementById('rpt-date').textContent = now.toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}) + ' · ' + now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  document.getElementById('rpt-sid').textContent  = 'ID: MSY-'+Math.random().toString(36).slice(2,9).toUpperCase();

  showScreen('screen-result');

  // ── Score arc ──
  setTimeout(() => {
    const arc = document.getElementById('score-arc');
    if (arc) arc.style.strokeDashoffset = CFG.SCORE_CIRC * (1 - ICM/100);
    animCount(document.getElementById('score-val'), ICM, 1900);
  }, 300);

  // ── Classificação ──
  const { cls, tier, desc } = getClassification(ICM);
  document.getElementById('s-class').textContent = cls;
  document.getElementById('s-tier').textContent  = tier;
  document.getElementById('s-desc').textContent  = desc;

  // ── Aptidão ──
  const { val: aVal, desc: aDesc } = getAptidao(ICM, norm, consistency);
  document.getElementById('aptidao-val').textContent  = aVal;
  document.getElementById('aptidao-desc').textContent = aDesc;

  // ── Ranking ──
  const { pct: rPct, label: rLabel } = getRanking(ICM);
  document.getElementById('ranking-val').textContent = rLabel;
  setTimeout(() => {
    document.getElementById('ranking-bar').style.width = (100 - rPct) + '%';
  }, 600);

  // ── Hidden indices ──
  setTimeout(() => {
    document.getElementById('hv-consistency').textContent = consistency+'%';
    document.getElementById('hb-consistency').style.width = consistency+'%';
    document.getElementById('hd-consistency').textContent = getConsistencyDesc(consistency);

    document.getElementById('hv-reliability').textContent = reliability+'%';
    document.getElementById('hb-reliability').style.width = reliability+'%';
    document.getElementById('hd-reliability').textContent = getReliabilityDesc(reliability);

    // Alert de inconsistência
    if (consistency < 55) {
      const al = document.getElementById('inconsistency-alert');
      al.hidden = false;
      document.getElementById('ia-detail').textContent =
        'Foram detectadas ' + (consistency<40 ? 'múltiplas' : 'algumas') +
        ' contradições entre suas respostas sobre os mesmos temas. Isso reduziu seu score em ' +
        Math.abs(CROSS_RULES.find(r=>r.id==='CR8')?.scoreAdj||0) +
        ' pontos e seu índice de confiabilidade para ' + reliability + '%.';
    }
  }, 400);

  // ── Espectros ──
  const { primary, secondary } = getEspectros(norm);
  document.getElementById('esp-primary-sigil').textContent     = primary.sigil;
  document.getElementById('esp-primary-name').textContent      = primary.name;
  document.getElementById('esp-primary-archetype').textContent = primary.archetype;
  document.getElementById('esp-primary-desc').textContent      = primary.desc;
  document.getElementById('esp-primary-str').textContent       = primary.strengths;
  document.getElementById('esp-primary-lim').textContent       = primary.weaknesses;
  document.getElementById('esp-primary-role').textContent      = primary.role;

  document.getElementById('esp-sec-sigil').textContent         = secondary.sigil;
  document.getElementById('esp-sec-name').textContent          = secondary.name;
  document.getElementById('esp-sec-archetype').textContent     = secondary.archetype;
  document.getElementById('esp-sec-desc').textContent          = secondary.desc;

  document.getElementById('combo-text').textContent = getEspectroCombo(primary, secondary);

  // ── Métricas (exibe normas deflacionadas — mais realistas) ──
  const DIMS = ['decisao','logica','sagacidade','maturidade'];
  DIMS.forEach((k,i) => {
    setTimeout(() => {
      document.getElementById('dv-'+k).textContent  = deflNorm[k]+'%';
      const bar = document.getElementById('db-'+k);
      if (bar) bar.style.width = deflNorm[k]+'%';
      document.getElementById('dt-'+k).textContent  = getDimTier(deflNorm[k]);
      document.getElementById('dd-'+k).textContent  = getDimDesc(k, deflNorm[k]);
    }, 500 + i*180);
  });

  // ── Análise Cruzada (usa normas brutas para detecção precisa) ──
  const crossList = document.getElementById('cross-analysis-list');
  crossList.innerHTML = '';
  const crossed = getCrossAnalysis(norm, hidden);
  if (crossed.length === 0) {
    const el = document.createElement('div');
    el.className = 'cross-item positive';
    el.innerHTML = `<span class="ci-icon">✓</span><div class="ci-body"><strong>NENHUMA ANOMALIA ESTRUTURAL DETECTADA</strong><p>Seu perfil não apresenta combinações de risco identificáveis pelas regras de análise cruzada. Isso é um indicador positivo de consistência multidimensional.</p></div>`;
    crossList.appendChild(el);
  } else {
    crossed.forEach(rule => {
      const el = document.createElement('div');
      el.className = `cross-item ${rule.type}`;
      const icons = { positive:'✓', negative:'⚠', warning:'⚬' };
      el.innerHTML = `<span class="ci-icon">${icons[rule.type]||'·'}</span><div class="ci-body"><strong>${rule.title}</strong><p>${rule.text}</p></div>`;
      crossList.appendChild(el);
    });
  }

  // ── Interpretação (usa normas deflacionadas para texto coerente com ICM) ──
  const { strong, risk, deep, potential } = getInterpretation(deflNorm, ICM, consistency);
  document.getElementById('pc-strong').textContent    = strong;
  document.getElementById('pc-risk').textContent      = risk;
  document.getElementById('pc-deep').textContent      = deep;
  document.getElementById('pc-potential').textContent = potential;

  // ── Função ──
  const func = getFuncao(deflNorm);
  document.getElementById('func-sigil').textContent = func.sigil;
  document.getElementById('func-title').textContent = func.title;
  document.getElementById('func-desc').textContent  = func.desc;

  // ── Histórico ──
  renderHistory();
}

function renderHistory() {
  const hist = loadHistory();
  if (hist.length <= 1) return; // Apenas a sessão atual: não mostra

  const section = document.getElementById('section-history');
  section.hidden = false;
  const list    = document.getElementById('history-list');
  list.innerHTML = '';

  hist.forEach((entry, i) => {
    const prev  = hist[i+1];
    let delta = '', deltaClass = 'same';
    if (prev) {
      const diff = entry.icm - prev.icm;
      if (diff > 0)      { delta = '+'+diff; deltaClass = 'up'; }
      else if (diff < 0) { delta = ''+diff;  deltaClass = 'down'; }
      else               { delta = '—';      deltaClass = 'same'; }
    }
    const row = document.createElement('div');
    row.className = 'hist-row';
    row.innerHTML = `
      <span class="hist-n">#${i+1}</span>
      <span class="hist-icm">${entry.icm}</span>
      <span class="hist-cls">${entry.cls}</span>
      <span class="hist-date">${entry.date}</span>
      ${prev ? `<span class="hist-delta ${deltaClass}">${delta}</span>` : '<span class="hist-delta same">—</span>'}
    `;
    list.appendChild(row);
  });
}

/* ── RESTART ──────────────────────────────────────────────── */

function restart() {
  clearState();
  STATE = createFreshState();

  const arc = document.getElementById('score-arc');
  if (arc) arc.style.strokeDashoffset = CFG.SCORE_CIRC;
  const sv = document.getElementById('score-val');
  if (sv) sv.textContent = '00';
  ['decisao','logica','sagacidade','maturidade'].forEach(k => {
    const b = document.getElementById('db-'+k);
    if (b) b.style.width = '0%';
  });
  document.getElementById('inconsistency-alert').hidden = true;
  document.getElementById('section-history').hidden     = true;

  showScreen('screen-intro');
}

/* ═══ START ════════════════════════════════════════════════ */

function startFresh() {
  clearState();
  STATE = createFreshState();
  STATE.sequence = buildBaseSequence();
  recalcMax();
  saveState();
  showScreen('screen-test');
  renderQuestion(0);
}

function resumeSession() {
  recalcMax();
  showScreen('screen-test');
  renderQuestion(STATE.currentIndex);
}

/* ════════════════════════════════════════════════════════════════════
   M10. CUSTOM CURSOR
   ════════════════════════════════════════════════════════════════════ */

function initCursor() {
  // No portal, o cursor customizado é desativado via CSS (#icm-wrapper)
  const dot  = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!dot || !ring) return;

  let mx=0, my=0, rx=0, ry=0;
  let raf;

  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

  function loop() {
    dot.style.left  = mx+'px';
    dot.style.top   = my+'px';
    rx += (mx-rx) * 0.12;
    ry += (my-ry) * 0.12;
    ring.style.left = rx+'px';
    ring.style.top  = ry+'px';
    raf = requestAnimationFrame(loop);
  }
  loop();

  if (window.matchMedia('(hover:none)').matches) {
    dot.style.display = 'none';
    ring.style.display = 'none';
  }
}

/* ════════════════════════════════════════════════════════════════════
   M10b. TOAST DE SAVE SUPABASE
   ════════════════════════════════════════════════════════════════════ */

function showICMSaveToast(type, err) {
  const toast   = document.getElementById('icm-save-toast');
  const msgEl   = document.getElementById('icm-save-toast-msg');
  const iconEl  = document.getElementById('icm-save-toast-icon');
  if (!toast) return;

  if (type === 'success') {
    toast.classList.remove('error');
    iconEl.textContent = '✓';
    msgEl.textContent  = 'Resultado salvo no perfil MSY.';
  } else {
    toast.classList.add('error');
    iconEl.textContent = '⚠';
    msgEl.textContent  = 'Falha ao salvar. Tente novamente.';
    console.warn('[ICM] Erro Supabase:', err);
  }

  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 4000);
}

/* ════════════════════════════════════════════════════════════════════
   M11. INIT
   ════════════════════════════════════════════════════════════════════ */

/* No portal o script é carregado síncrono após o DOM estar pronto.
   Fora do portal (standalone) o DOMContentLoaded ainda não disparou.
   A função abaixo cobre os dois casos. */
function _icmInit() {

  initCursor();

  // Verifica sessão salva
  const saved = loadState();
  const hasResume = saved && !saved.completed && saved.currentIndex > 0 && saved.sequence?.length > 0;

  if (hasResume) {
    STATE = saved;
    const banner = document.getElementById('resume-banner');
    banner.hidden = false;
    const info = document.getElementById('resume-info');
    const prog = Math.round((STATE.currentIndex / STATE.sequence.length) * 100);
    if (info) info.textContent = `${prog}% concluído · Pergunta ${STATE.currentIndex+1}/${STATE.sequence.length}`;
  }

  // Verifica histórico anterior
  const hist = loadHistory();
  if (hist.length > 0) {
    const prev    = hist[0];
    const histBan = document.getElementById('history-banner');
    histBan.hidden = false;
    document.getElementById('history-prev-icm').textContent  = prev.icm;
    document.getElementById('history-prev-date').textContent = `· ${prev.date}`;

    if (hist.length > 1) {
      const diff = prev.icm - hist[1].icm;
      const trendEl = document.getElementById('history-trend');
      if (diff > 0)      { trendEl.textContent='▲ +'+diff; trendEl.className='history-trend up'; }
      else if (diff < 0) { trendEl.textContent='▼ '+diff;  trendEl.className='history-trend down'; }
      else               { trendEl.textContent='— 0';      trendEl.className='history-trend same'; }
    }
  }

  // Binds
  document.getElementById('btn-start')?.addEventListener('click', startFresh);
  document.getElementById('btn-resume')?.addEventListener('click', () => {
    document.getElementById('resume-banner').hidden = true;
    resumeSession();
  });
  document.getElementById('btn-discard')?.addEventListener('click', () => {
    document.getElementById('resume-banner').hidden = true;
    startFresh();
  });
  document.getElementById('btn-back')?.addEventListener('click', goBack);
  document.getElementById('btn-restart')?.addEventListener('click', restart);

  // Previne scroll em mobile fora do result-scroll
  document.body.addEventListener('touchmove', e => {
    if (!e.target.closest('.result-scroll')) e.preventDefault();
  }, { passive: false });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _icmInit);
} else {
  _icmInit();
}
