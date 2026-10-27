// As perguntas do briefing da implantação (roteiro "Jornada de implantação do BI", revisto em 27/10/2026). Usadas pela página
// pública do briefing (briefing/) e pela Central, que mostra as respostas com os mesmos títulos. Nada de preço, senha ou chave aqui.
// Campo: { id, tipo: "uma" (escolha uma) | "varias" (marque quantas quiser) | "texto" (linhas) | "curto" (uma linha), rotulo, opcoes?, ajuda? }
// Mudar o id de um campo apaga a resposta já dada nele: acrescente campos novos, não renomeie.
window.BRIEFING_PERGUNTAS = [
  {
    id: "sistemas", titulo: "Quais sistemas a clínica usa hoje?",
    porque: "É a pergunta que mais importa: o BI lê os números direto desses sistemas.",
    campos: [
      { id: "s_gestao", tipo: "uma", rotulo: "Agenda, orçamentos e financeiro", opcoes: ["GestãoDS", "Outro sistema", "Planilha ou papel"] },
      { id: "s_gestao_outro", tipo: "curto", rotulo: "Se for outro, qual?", mostrarSe: { s_gestao: "Outro sistema" } },
      { id: "s_crm", tipo: "uma", rotulo: "Atendimento dos leads (CRM)", opcoes: ["Kommo", "Outro CRM", "Só pelo WhatsApp, sem CRM"] },
      { id: "s_crm_outro", tipo: "curto", rotulo: "Se for outro, qual?", mostrarSe: { s_crm: "Outro CRM" } },
      { id: "s_anuncios", tipo: "varias", rotulo: "Anúncios", opcoes: ["Meta (Instagram e Facebook) todo mês", "Meta às vezes", "Google", "Não anunciamos hoje"] },
      { id: "s_termos", tipo: "uma", rotulo: "Termo de consentimento", opcoes: ["ZapSign", "Outro sistema de assinatura", "No papel", "Não usamos"] },
      { id: "s_admin", tipo: "texto", rotulo: "Quem tem o login de administrador de cada sistema?", ajuda: "Ex.: GestãoDS, o médico; Kommo, a gestora. Só o nome e a função, nada de senha." },
    ],
  },
  {
    id: "profissionais", titulo: "Quem atende na clínica?",
    porque: "Define os filtros por profissional e as metas de cada um.",
    campos: [{ id: "profissionais", tipo: "texto", rotulo: "Nome e especialidade de cada profissional que deve aparecer no BI", ajuda: "Inclua enfermagem ou salas, se tiverem agenda própria." }],
  },
  {
    id: "procedimentos", titulo: "Quais são os procedimentos carros-chefe?",
    porque: "Monta as listas de renovação: quem está na hora de voltar.",
    campos: [{ id: "procedimentos", tipo: "texto", rotulo: "O nome de cada um como está no sistema, o valor médio e de quanto em quanto tempo o paciente costuma refazer", ajuda: "Ex.: Toxina botulínica, R$ 1.500, a cada 4 meses." }],
  },
  {
    id: "metas", titulo: "Quais são as metas da clínica?",
    porque: "A meta aparece todo dia no BI e é a base das previsões.",
    campos: [
      { id: "meta_faturamento", tipo: "texto", rotulo: "Meta de faturamento por mês (deste mês e dos próximos 3)", ajuda: "Se ainda não tiver, escreva \"não tenho\": a gente sugere uma pelo histórico." },
      { id: "meta_outras", tipo: "texto", rotulo: "Tem meta de pacientes novos ou de leads? Qual?" },
    ],
  },
  {
    id: "equipe", titulo: "Quem faz o quê na equipe?",
    porque: "Cada pessoa ganha acesso e uma página com o trabalho da função dela.",
    campos: [{ id: "equipe", tipo: "texto", rotulo: "Nome e função de cada pessoa que vai usar o BI", ajuda: "Ex.: Ana, SDR (atende os leads); Bruna, Recepção. Os e-mails podem vir depois." }],
  },
  {
    id: "bonus", titulo: "A equipe tem metas e bônus?",
    porque: "Se tiver, o BI calcula o andamento de cada pessoa no mês.",
    campos: [
      { id: "bonus_tem", tipo: "uma", rotulo: "Programa de metas e bônus", opcoes: ["Sim", "Não", "Queremos começar"] },
      { id: "bonus_regra", tipo: "texto", rotulo: "Como funciona para cada função?", mostrarSe: { bonus_tem: "Sim" } },
    ],
  },
  {
    id: "trafego", titulo: "Como são os anúncios?",
    porque: "Liga o acompanhamento do tráfego pago e de qual anúncio veio cada paciente.",
    campos: [
      { id: "trafego_quem", tipo: "curto", rotulo: "Quem cuida dos anúncios?", ajuda: "Alguém da equipe, uma agência ou ninguém por enquanto." },
      { id: "trafego_valor", tipo: "curto", rotulo: "Quanto investe por mês, em média?" },
    ],
  },
  {
    id: "whatsapp", titulo: "Quais números de WhatsApp atendem pacientes?",
    porque: "Configura as conversas no BI e quem vê cada número.",
    campos: [{ id: "whatsapp", tipo: "texto", rotulo: "Quantos números e quem usa cada um", ajuda: "Ex.: o número da clínica, com a SDR; o da recepção." }],
  },
  {
    id: "rotina", titulo: "Quem deve receber os resumos por e-mail?",
    porque: "O BI manda de manhã o resumo do dia e, no fim de semana, o fechamento da semana.",
    campos: [{ id: "rotina", tipo: "texto", rotulo: "Nome e função de quem recebe, e se prefere outro horário" }],
  },
  {
    id: "cidade", titulo: "Em que cidade fica a clínica?",
    porque: "Os feriados da cidade deixam de contar como dia útil nas metas.",
    campos: [{ id: "cidade", tipo: "curto", rotulo: "Cidade e estado" }],
  },
  {
    id: "endereco", titulo: "Como a clínica deve aparecer no BI?",
    porque: "O nome vai no topo do BI e nos e-mails; o endereço é onde a equipe entra.",
    campos: [
      { id: "nome_clinica", tipo: "curto", rotulo: "Nome da clínica, do jeito que deve aparecer" },
      { id: "subdominio", tipo: "curto", rotulo: "Endereço preferido", ajuda: "Ex.: suaclinica.gestaosemcaos.com.br. Se não souber, deixe em branco." },
    ],
  },
  {
    id: "enxergar", titulo: "O que você quer enxergar todo dia?",
    porque: "Define as primeiras telas e o que a gente destaca no treinamento.",
    campos: [{ id: "enxergar", tipo: "texto", rotulo: "O que você gostaria de saber todo dia ao abrir o BI e hoje não sabe?" }],
  },
];
