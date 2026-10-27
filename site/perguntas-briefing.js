// As perguntas do briefing da implantação (revistas com o dono em 27/10/2026: uma pergunta por tela, sistemas com várias escolhas,
// o cadastro completo para a nota fiscal, nada que o sistema da clínica já entrega pela API — procedimentos, valores, agendas).
// Usadas pela página pública do briefing (briefing/) e pela Central, que mostra as respostas com os mesmos títulos.
// Cada item é uma tela. Campo: { id, tipo, rotulo, opcoes?, ajuda?, mostrarSe? }
//   tipo: "uma" (escolha uma) | "varias" (marque quantas quiser) | "texto" (linhas) | "curto" (uma linha)
//         | "email" | "telefone" | "data" | "cep" | "documento" (CPF ou CNPJ)
//   mostrarSe: { campo: "valor" } aparece só quando o outro campo tem aquele valor (numa escolha de várias, quando está marcado).
// Mudar o id de um campo apaga a resposta já dada nele: acrescente campos novos, não renomeie. Nada de preço, senha ou chave aqui.
window.BRIEFING_PERGUNTAS = [
  {
    id: "voce", titulo: "Primeiro, os seus dados",
    porque: "Para o cadastro e o contrato.",
    campos: [
      { id: "resp_nome", tipo: "curto", rotulo: "Nome completo" },
      { id: "resp_email", tipo: "email", rotulo: "E-mail" },
      { id: "resp_celular", tipo: "telefone", rotulo: "Celular (WhatsApp)" },
      { id: "resp_nascimento", tipo: "data", rotulo: "Data de nascimento" },
    ],
  },
  {
    id: "clinica", titulo: "Os dados da clínica",
    porque: "É o que vai na nota fiscal.",
    campos: [
      { id: "cli_razao", tipo: "curto", rotulo: "Razão social (ou o seu nome, se a nota for como pessoa física)" },
      { id: "cli_documento", tipo: "documento", rotulo: "CNPJ (ou CPF)" },
      { id: "cli_cep", tipo: "cep", rotulo: "CEP" },
      { id: "cli_endereco", tipo: "curto", rotulo: "Endereço com número e complemento" },
      { id: "cli_cidade", tipo: "curto", rotulo: "Bairro, cidade e estado" },
      { id: "cli_email_nota", tipo: "email", rotulo: "E-mail para receber a nota fiscal", ajuda: "Pode ser o mesmo de antes." },
    ],
  },
  {
    id: "sistemas_gestao", titulo: "Onde ficam a agenda, os orçamentos e o financeiro?",
    porque: "O BI lê os números direto desses sistemas. Marque todos que a clínica usa.",
    campos: [
      { id: "s_gestao", tipo: "varias", rotulo: "Sistemas", opcoes: ["GestãoDS", "Planilha", "Papel ou caderno", "Outro"] },
      { id: "s_gestao_outro", tipo: "curto", rotulo: "Qual outro?", mostrarSe: { s_gestao: "Outro" } },
    ],
  },
  {
    id: "sistemas_atendimento", titulo: "Por onde a equipe atende os pacientes?",
    porque: "É daqui que saem os leads, as conversas e o tempo de resposta. Marque todos.",
    campos: [
      { id: "s_crm", tipo: "varias", rotulo: "Ferramentas", opcoes: ["Kommo", "WhatsApp Business no celular", "WhatsApp no computador", "Instagram Direct", "Outro CRM"] },
      { id: "s_crm_outro", tipo: "curto", rotulo: "Qual outro CRM?", mostrarSe: { s_crm: "Outro CRM" } },
      { id: "s_whatsapp_numeros", tipo: "curto", rotulo: "Quantos números de WhatsApp atendem pacientes, e quem usa cada um?", ajuda: "Ex.: 2 números, o da clínica com a SDR e o da recepção." },
    ],
  },
  {
    id: "sistemas_outros", titulo: "Que outras ferramentas fazem parte do dia a dia?",
    porque: "Anúncios e termos também viram números no BI. Marque todas.",
    campos: [
      { id: "s_anuncios", tipo: "varias", rotulo: "Anúncios", opcoes: ["Meta (Instagram e Facebook) todo mês", "Meta de vez em quando", "Google", "Não anunciamos hoje"] },
      { id: "s_termos", tipo: "varias", rotulo: "Termo de consentimento", opcoes: ["ZapSign", "Outro sistema de assinatura", "No papel", "Não usamos"] },
      { id: "s_outros", tipo: "curto", rotulo: "Mais alguma? Qual?", ajuda: "Ex.: um sistema de estoque, de cashback ou de pesquisa de satisfação." },
    ],
  },
  {
    id: "admins", titulo: "Quem tem o login de administrador de cada sistema?",
    porque: "É essa pessoa que gera a chave de acesso para o BI. Só o nome e a função, nunca a senha.",
    campos: [{ id: "s_admin", tipo: "texto", rotulo: "Sistema e quem é o administrador", ajuda: "Ex.: GestãoDS, eu; Kommo, a gerente; Meta, a agência." }],
  },
  {
    id: "registro", titulo: "O que a equipe registra no sistema hoje?",
    porque: "O BI só mostra o que está registrado. Isso diz o que dá para confiar desde o primeiro dia e o que ajustar no treinamento.",
    campos: [
      { id: "reg_orcamento", tipo: "uma", rotulo: "Todo orçamento passado na consulta é lançado no sistema", opcoes: ["Sempre", "Quase sempre", "Às vezes", "Não"] },
      { id: "reg_pagamento", tipo: "uma", rotulo: "Todo pagamento é lançado no financeiro do sistema", opcoes: ["Sempre", "Quase sempre", "Às vezes", "Não"] },
      { id: "reg_origem", tipo: "uma", rotulo: "A equipe anota de onde veio cada paciente novo (anúncio, indicação, Instagram…)", opcoes: ["Sempre", "Às vezes", "Não"] },
      { id: "reg_agendas", tipo: "uma", rotulo: "Todos os profissionais têm agenda própria no sistema", opcoes: ["Sim, todos", "Alguns não", "Não sei"] },
    ],
  },
  {
    id: "equipe", titulo: "Quem faz o quê na equipe?",
    porque: "Cada pessoa ganha acesso ao BI e uma página com o trabalho da função dela. Marque as funções que existem.",
    campos: [
      { id: "eq_funcoes", tipo: "varias", rotulo: "Funções", opcoes: ["SDR (primeiro atendimento do lead)", "Closer ou concierge (fecha o orçamento)", "Recepção", "Auxiliar ou enfermagem", "Marketing", "Gerente ou gestão", "Agência ou gestor de tráfego de fora"] },
      { id: "eq_pessoas", tipo: "texto", rotulo: "Nome e função de cada pessoa que vai usar o BI", ajuda: "Os e-mails podem vir depois." },
    ],
  },
  {
    id: "volume", titulo: "Como é um mês típico da clínica?",
    porque: "Serve de base para conferir os números do BI na primeira semana. Pode ser aproximado.",
    campos: [
      { id: "vol_faturamento", tipo: "curto", rotulo: "Faturamento de um mês normal" },
      { id: "vol_leads", tipo: "curto", rotulo: "Contatos novos (leads) por mês" },
      { id: "vol_novos", tipo: "curto", rotulo: "Pacientes novos por mês" },
    ],
  },
  {
    id: "metas", titulo: "Quais são as metas?",
    porque: "A meta aparece todo dia no BI e é a base das previsões e das sugestões.",
    campos: [
      { id: "meta_faturamento", tipo: "texto", rotulo: "Meta de faturamento por mês", ajuda: "Se ainda não tiver, escreva \"não tenho\": a gente sugere uma pelo histórico." },
      { id: "bonus_tem", tipo: "uma", rotulo: "A equipe tem metas e bônus?", opcoes: ["Sim", "Não", "Queremos começar"] },
      { id: "bonus_regra", tipo: "texto", rotulo: "Como funciona para cada função?", mostrarSe: { bonus_tem: "Sim" } },
    ],
  },
  {
    id: "dores", titulo: "O que mais tira o seu sono na gestão hoje?",
    porque: "É por aí que a gente começa o treinamento e as primeiras telas. Marque quantas quiser.",
    campos: [
      { id: "dores", tipo: "varias", rotulo: "Dificuldades", opcoes: [
        "Só sei o faturamento quando o mês fecha", "Leads ficam sem resposta", "Muitas faltas e cancelamentos", "Orçamentos que não fecham",
        "Não sei se o anúncio dá retorno", "Pacientes que não voltam", "A equipe não tem meta clara", "Horários vazios na agenda", "Outra",
      ] },
      { id: "dores_outra", tipo: "curto", rotulo: "Qual outra?", mostrarSe: { dores: "Outra" } },
    ],
  },
  {
    id: "enxergar", titulo: "O que você quer enxergar todo dia?",
    porque: "Define a primeira tela que você vai abrir de manhã.",
    campos: [{ id: "enxergar", tipo: "texto", rotulo: "O que você gostaria de saber todo dia ao abrir o BI e hoje não sabe?" }],
  },
  {
    id: "sucesso", titulo: "Daqui a 3 meses, o que faria você dizer que valeu a pena?",
    porque: "É o que a gente vai acompanhar com você nos primeiros 30 dias.",
    campos: [{ id: "sucesso", tipo: "texto", rotulo: "Em uma ou duas frases", ajuda: "Ex.: saber todo dia se a meta vai fechar; a SDR respondendo todo lead em 5 minutos." }],
  },
];
