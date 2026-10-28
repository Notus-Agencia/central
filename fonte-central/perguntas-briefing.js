// As perguntas do briefing da implantação (revistas com o dono em 27/10/2026: uma pergunta por tela, sistemas com várias escolhas,
// o cadastro completo para a nota fiscal, nada que o sistema da clínica já entrega pela API — procedimentos, valores, agendas).
// Usadas pela página pública do briefing (briefing/) e pela Central, que mostra as respostas com os mesmos títulos.
// Cada item é uma tela. Campo: { id, tipo, rotulo, opcoes?, ajuda?, mostrarSe? }
//   tipo: "uma" (escolha uma) | "varias" (marque quantas quiser) | "texto" (linhas) | "curto" (uma linha)
//         | "tabela" (linhas com as colunas de `colunas`; a resposta é uma lista "a|b|c", até 20 linhas)
//         | "email" | "telefone" | "data" | "cep" | "documento" (CPF ou CNPJ) | "reais" (R$ inteiro) | "numero" (inteiro)
//   mostrarSe: { campo: "valor" | ["valor", …] } aparece só quando o outro campo tem um desses valores (numa escolha de várias, marcado).
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
    id: "anuncios", titulo: "A clínica faz anúncios?",
    porque: "O BI mostra quanto cada anúncio traz de paciente e de faturamento.",
    campos: [
      { id: "anu_faz", tipo: "uma", rotulo: "Anúncios", opcoes: ["Sim, todo mês", "De vez em quando", "Não anunciamos hoje"] },
      { id: "anu_onde", tipo: "varias", rotulo: "Onde", opcoes: ["Instagram e Facebook (Meta)", "Google", "Outro"], mostrarSe: { anu_faz: ["Sim, todo mês", "De vez em quando"] } },
      { id: "anu_onde_outro", tipo: "curto", rotulo: "Onde mais?", mostrarSe: { anu_onde: "Outro" } },
      { id: "anu_valor", tipo: "reais", rotulo: "Quanto investe por mês, em média?", mostrarSe: { anu_faz: ["Sim, todo mês", "De vez em quando"] } },
      { id: "anu_criativos", tipo: "numero", rotulo: "Quantos criativos (artes ou vídeos) publica por mês?", mostrarSe: { anu_faz: ["Sim, todo mês", "De vez em quando"] } },
    ],
  },
  {
    id: "ferramentas", titulo: "Que outras ferramentas a clínica usa?",
    porque: "Assim a gente sabe o que mais pode virar número no BI.",
    campos: [{ id: "s_outros", tipo: "texto", rotulo: "Ferramentas e para que servem", ajuda: "Ex.: um sistema de estoque, de cashback, de pesquisa de satisfação ou de assinatura de documentos." }],
  },
  {
    id: "admins", titulo: "Quem tem o login de administrador de cada sistema?",
    porque: "É essa pessoa que gera a chave de acesso para o BI. Só o nome e a função, nunca a senha.",
    campos: [{ id: "s_admin", tipo: "texto", rotulo: "Sistema e quem é o administrador", ajuda: "Ex.: GestãoDS, eu; Kommo, a gerente; Meta, a agência." }],
  },
  {
    id: "registro", titulo: "Tudo o que acontece na clínica é lançado no sistema?",
    porque: "O BI só mostra o que está no sistema. Isso diz em que dá para confiar desde o primeiro dia e o que ajustar no treinamento.",
    campos: [
      { id: "reg_tudo", tipo: "uma", rotulo: "Lançamentos", opcoes: ["Sim, tudo", "Quase tudo", "Só uma parte", "Pouca coisa"] },
      { id: "reg_fora", tipo: "varias", rotulo: "O que costuma ficar de fora?", opcoes: ["Orçamentos", "Pagamentos", "Agendamentos e remarcações", "Faltas e cancelamentos", "Outro"], mostrarSe: { reg_tudo: ["Quase tudo", "Só uma parte", "Pouca coisa"] } },
      { id: "reg_fora_outro", tipo: "curto", rotulo: "O que mais fica de fora?", mostrarSe: { reg_fora: "Outro" } },
    ],
  },
  {
    id: "equipe", titulo: "Como é a equipe hoje?",
    porque: "Cada pessoa vai entrar no BI por um link de cadastro. Aqui basta dizer as funções e quantas pessoas há em cada uma.",
    campos: [{ id: "eq_tabela", tipo: "tabela", rotulo: "Equipe", linhas: 3,
      colunas: [{ rotulo: "Função", exemplo: "Ex.: SDR" }, { rotulo: "Pessoas", exemplo: "2", numero: true }, { rotulo: "Tempo da função", exemplo: "Ex.: 1 ano" }] }],
  },
  {
    id: "volume", titulo: "De cabeça, como é um mês normal da clínica?",
    porque: "Na primeira semana a gente compara com o que o BI mostrar. Ajuda a ver se o número que você tem de cabeça bate com o sistema. Pode ser aproximado.",
    campos: [
      { id: "vol_faturamento", tipo: "reais", rotulo: "Faturamento por mês" },
      { id: "vol_leads", tipo: "numero", rotulo: "Contatos novos (leads) por mês" },
      { id: "vol_novos", tipo: "numero", rotulo: "Pacientes novos por mês" },
    ],
  },
  {
    id: "metas", titulo: "Você define metas para o mês?",
    porque: "A meta aparece todo dia no BI e é a base das previsões.",
    campos: [
      { id: "meta_faz", tipo: "uma", rotulo: "Metas mensais", opcoes: ["Sim, todo mês", "Às vezes", "Não"] },
      { id: "meta_como", tipo: "texto", rotulo: "Como você define a meta do mês?", ajuda: "Ex.: pelo mesmo mês do ano passado mais 10%.", mostrarSe: { meta_faz: ["Sim, todo mês", "Às vezes"] } },
      { id: "meta_faturamento", tipo: "reais", rotulo: "Qual a meta de faturamento deste mês?", mostrarSe: { meta_faz: ["Sim, todo mês", "Às vezes"] } },
    ],
  },
  {
    id: "remuneracao", titulo: "A equipe tem remuneração variável ou bônus?",
    porque: "Se tiver, o BI acompanha o andamento de cada pessoa no mês.",
    campos: [
      { id: "bonus_tem", tipo: "uma", rotulo: "Remuneração variável / bônus", opcoes: ["Sim", "Não"] },
      { id: "bonus_regra", tipo: "texto", rotulo: "Como funciona o modelo?", ajuda: "Quem recebe, por qual resultado e quanto.", mostrarSe: { bonus_tem: "Sim" } },
    ],
  },
  {
    id: "dores", titulo: "O que mais tira o seu sono na gestão hoje?",
    porque: "É por aí que a gente começa o treinamento e as primeiras telas. Marque quantas quiser.",
    campos: [
      { id: "dores", tipo: "varias", rotulo: "Dificuldades", opcoes: [
        "Só sei o faturamento quando o mês fecha", "Leads ficam sem resposta", "Muitas faltas e cancelamentos", "Orçamentos que não fecham",
        "Não sei se o anúncio dá retorno", "Pacientes que não voltam", "A equipe não tem meta clara", "Horários vazios na agenda",
      ] },
    ],
  },
  {
    id: "enxergar", titulo: "O que é difícil de enxergar hoje?",
    porque: "Define a primeira tela que você vai abrir de manhã.",
    campos: [
      { id: "dificil", tipo: "texto", rotulo: "Qual é a informação mais difícil de ver hoje na clínica?" },
      { id: "enxergar", tipo: "texto", rotulo: "O que você gostaria de ver com facilidade, todo dia ou toda semana?" },
    ],
  },
  {
    id: "sucesso", titulo: "Daqui a 3 meses, o que faria você dizer que valeu a pena?",
    porque: "É o que a gente vai acompanhar com você nos primeiros 30 dias.",
    campos: [{ id: "sucesso", tipo: "texto", rotulo: "Em uma ou duas frases", ajuda: "Ex.: saber todo dia se a meta vai fechar; a SDR respondendo todo lead em 5 minutos." }],
  },
];
