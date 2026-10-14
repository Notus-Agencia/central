// Ficha de implantação de uma clínica nova (assistente "Nova clínica" da Central; função central-implantacao).
// Uma instalação por clínica (app + banco próprios, mesmo código). A ficha diz o que precisa ser criado no servidor:
// projeto, banco, app, domínio, variáveis e a configuração inicial. NENHUM segredo entra aqui: senha do banco,
// SYNC_SECRET, CHAVE_INTEGRACOES e a senha do primeiro acesso nascem no servidor na hora de criar (e nunca voltam para a
// Central); as chaves dos sistemas da clínica (GestãoDS, Kommo, Meta…) a própria clínica cola no BI.
// Quando a hospedagem for automática (_hospedagem.ts), é esta ficha que vira os pedidos para o EasyPanel.

/** cópia do catálogo de compartilhado/modulos.ts do BI (chave, nome, grupo, depende, padrão numa instalação nova) */
export const MODULOS: { chave: string; nome: string; grupo: string; depende: string[]; padrao: boolean }[] = [
  { chave: "crm", nome: "CRM (Kommo)", grupo: "Fontes de dados", depende: [], padrao: true },
  { chave: "meta_ads", nome: "Meta Ads", grupo: "Fontes de dados", depende: [], padrao: true },
  { chave: "agenda", nome: "Agenda médica", grupo: "Agenda", depende: [], padrao: true },
  { chave: "agenda_escrita", nome: "Escrever na agenda do GestãoDS", grupo: "Agenda", depende: ["agenda"], padrao: false },
  { chave: "meta_empresa", nome: "Meta da empresa", grupo: "Metas e equipe", depende: [], padrao: true },
  { chave: "equipe", nome: "Equipe e páginas por função", grupo: "Metas e equipe", depende: [], padrao: true },
  { chave: "bonus", nome: "Metas por pessoa e bônus", grupo: "Metas e equipe", depende: ["equipe", "meta_empresa"], padrao: true },
  { chave: "lembretes", nome: "Lembretes", grupo: "Rotina da equipe", depende: ["equipe"], padrao: true },
  { chave: "documentos", nome: "Documentos", grupo: "Rotina da equipe", depende: [], padrao: true },
  { chave: "notas", nome: "Notas", grupo: "Rotina da equipe", depende: [], padrao: false },
  { chave: "financeiro", nome: "Saúde financeira", grupo: "Inteligência", depende: [], padrao: true },
  { chave: "capacidade", nome: "Capacidade e crescimento", grupo: "Inteligência", depende: ["agenda"], padrao: true },
  { chave: "comercial", nome: "Comercial", grupo: "Inteligência", depende: [], padrao: true },
  { chave: "pacientes", nome: "Pacientes", grupo: "Pacientes", depende: [], padrao: true },
  { chave: "contexto_paciente", nome: "Contexto do paciente", grupo: "Pacientes", depende: [], padrao: true },
  { chave: "avaliacoes", nome: "Avaliações Google", grupo: "Pacientes", depende: [], padrao: true },
  { chave: "passaporte", nome: "Passaporte (pontos)", grupo: "Pacientes", depende: ["pacientes"], padrao: false },
  { chave: "termos", nome: "Termos (ZapSign)", grupo: "Pacientes", depende: [], padrao: false },
  { chave: "assistente", nome: "Assistente de IA", grupo: "Integrações", depende: [], padrao: true },
  { chave: "api_mcp", nome: "Webhooks, API e MCP", grupo: "Integrações", depende: [], padrao: true },
  { chave: "editor_livre", nome: "Editor livre e métricas próprias", grupo: "Sob pedido", depende: [], padrao: false },
  { chave: "marcacoes", nome: "Marcações", grupo: "Sob pedido", depende: [], padrao: false },
];
export const NUCLEO = ["Hoje e Leitura", "Painéis prontos", "Pessoas e acessos", "Perfil", "Leitura do GestãoDS", "E-mails da gestão"];
export const PLANOS = ["fundador", "clinica", "completa"] as const;

export type Entrada = {
  nome: string; nome_curto: string; sigla: string; marca: string; dominio: string; medicas: string[];
  modulos: Record<string, boolean>; plano: (typeof PLANOS)[number];
  responsavel: { nome: string; email: string; telefone: string | null };
};

const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** valida e normaliza o que o assistente mandou; string = o que está errado */
export function lerEntrada(c: Record<string, unknown>): Entrada | string {
  const nome = txt(c.nome, 120);
  if (nome.length < 2) return "Diga o nome da clínica.";
  const nome_curto = txt(c.nome_curto, 60) || nome.replace(/^cl[ií]nica\s+/i, "");
  const sigla = (txt(c.sigla, 6) || nome_curto.split(" ").map((p) => p[0] ?? "").join("").slice(0, 4)).toUpperCase();
  const marca = slug(txt(c.marca, 30) || nome_curto.split(" ")[0] || nome).slice(0, 30);
  if (marca.length < 2) return "A marca precisa de pelo menos 2 letras.";
  const dominio = txt(c.dominio, 120).toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dominio)) return "Domínio inválido (ex.: orvalho.gestaosemcaos.com.br).";
  const medicas = (Array.isArray(c.medicas) ? c.medicas : []).map((m) => txt(m, 60)).filter(Boolean).slice(0, 20);
  if (!medicas.length) return "Diga pelo menos uma médica.";
  const plano = PLANOS.includes(c.plano as (typeof PLANOS)[number]) ? (c.plano as (typeof PLANOS)[number]) : "fundador";
  // fundador = todos os módulos ligados; o dono tira o que não fizer sentido
  const pedidos = (c.modulos && typeof c.modulos === "object" ? c.modulos : {}) as Record<string, unknown>;
  const modulos: Record<string, boolean> = {};
  for (const m of MODULOS) modulos[m.chave] = typeof pedidos[m.chave] === "boolean" ? (pedidos[m.chave] as boolean) : plano === "fundador" ? true : m.padrao;
  for (const m of MODULOS) if (modulos[m.chave]) {
    const falta = m.depende.filter((d) => !modulos[d]);
    if (falta.length) return `${m.nome} precisa de ${falta.map((d) => MODULOS.find((x) => x.chave === d)!.nome).join(" e ")} ligado.`;
  }
  const r = (c.responsavel && typeof c.responsavel === "object" ? c.responsavel : {}) as Record<string, unknown>;
  const responsavel = { nome: txt(r.nome, 120), email: txt(r.email, 120).toLowerCase(), telefone: txt(r.telefone, 30) || null };
  if (responsavel.nome.length < 2) return "Diga quem é o responsável na clínica.";
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(responsavel.email)) return "E-mail do responsável inválido.";
  return { nome, nome_curto, sigla, marca, dominio, medicas, modulos, plano, responsavel };
}

const sqlTexto = (v: string) => `'${v.replace(/'/g, "''")}'`;

export type Variavel = { nome: string; valor: string | null; origem: "fixo" | "gerar_no_servidor" | "da_clinica" | "opcional"; nota: string };

/** a ficha: o que criar no servidor, as variáveis (sem segredo) e a configuração inicial */
export function montarFicha(e: Entrada, quemImplanta: { email: string | null }, agora = new Date()) {
  const projeto = `bi-${e.marca}`;
  const url = `https://${e.dominio}`;
  const ano = agora.getUTCFullYear();
  const variaveis: Variavel[] = [
    { nome: "DATABASE_URL", valor: null, origem: "gerar_no_servidor", nota: `Endereço interno do Postgres "${projeto}_db" (o EasyPanel mostra pronto em Credentials).` },
    { nome: "APP_URL", valor: url, origem: "fixo", nota: "O endereço público do BI: é o que se liga sozinho à Central." },
    { nome: "SYNC_SECRET", valor: null, origem: "gerar_no_servidor", nota: "64 caracteres aleatórios, gerados na hora de criar." },
    { nome: "CHAVE_INTEGRACOES", valor: null, origem: "gerar_no_servidor", nota: "Cifra as chaves que a clínica cola na tela. Gerada na hora; nunca trocar depois." },
    { nome: "SYNC_DESDE", valor: `${ano}-01-01`, origem: "fixo", nota: "A primeira leitura das fontes começa aqui." },
    { nome: "SINCRONIZACAO_ATIVA", valor: "1", origem: "fixo", nota: "" },
    { nome: "GESTAODS_ESCRITA", valor: e.modulos.agenda_escrita ? "producao" : "desligada", origem: "fixo", nota: e.modulos.agenda_escrita ? "Escreve na agenda do GestãoDS." : "O BI só lê a agenda." },
    { nome: "ADMIN_EMAIL", valor: quemImplanta.email, origem: "fixo", nota: "Primeiro acesso (papel desenvolvedor) da Gestão Sem Caos." },
    { nome: "ADMIN_NOME", valor: "Gestão Sem Caos", origem: "fixo", nota: "" },
    { nome: "ADMIN_SENHA", valor: null, origem: "gerar_no_servidor", nota: "Gerada na hora e descartada: o primeiro acesso entra por “Esqueci a senha”." },
    { nome: "GESTAODS_API_TOKEN", valor: null, origem: "da_clinica", nota: "A clínica cola em Ajustes › Integrações (pelo tutorial)." },
    ...(e.modulos.crm ? [{ nome: "KOMMO_SUBDOMAIN / KOMMO_LONG_LIVED_TOKEN", valor: null, origem: "da_clinica" as const, nota: "Coladas em Ajustes › Integrações." }] : []),
    ...(e.modulos.meta_ads ? [{ nome: "META_SYSTEM_USER_TOKEN", valor: null, origem: "da_clinica" as const, nota: "Colada em Ajustes › Integrações." }] : []),
    ...(e.modulos.assistente ? [{ nome: "ANTHROPIC_API_KEY", valor: null, origem: "opcional" as const, nota: "Chave de IA (da clínica ou da Gestão Sem Caos com limite)." }] : []),
    { nome: "RESEND_API_KEY", valor: null, origem: "opcional", nota: "E-mails da gestão (resumo, previsão, fechamento)." },
  ];
  const config: Record<string, string> = {
    clinica_nome: e.nome, clinica_nome_curto: e.nome_curto, clinica_sigla: e.sigla, clinica_marca: e.marca,
  };
  const sql = [
    "-- Configuração inicial (rodar uma vez, depois da primeira subida, no banco desta clínica)",
    ...Object.entries(config).map(([k, v]) => `insert into clinica_config (chave, valor) values (${sqlTexto(k)}, ${sqlTexto(v)}) on conflict (chave) do update set valor = excluded.valor;`),
    ...MODULOS.map((m) => `insert into modulos (chave, ligado) values (${sqlTexto(m.chave)}, ${e.modulos[m.chave] ? "true" : "false"}) on conflict (chave) do update set ligado = excluded.ligado;`),
  ].join("\n");
  return {
    versao: 1,
    gerada_em: agora.toISOString(),
    clinica: { nome: e.nome, nome_curto: e.nome_curto, sigla: e.sigla, marca: e.marca, url, medicas: e.medicas, plano: e.plano },
    servidor: {
      projeto, banco: { servico: "db", postgres: 16, database: projeto }, app: { servico: "app", fonte: "theROCCO-data/bi-isabella-eleuterio (ramo main, Dockerfile)", porta: 4200, memoria_mb: 512 },
      dominio: { nome: e.dominio, https: true, dns: `registro A de ${e.dominio} para o IP da VPS` },
      backup: "Pôr o banco no backup diário no mesmo dia (docs/BACKUP.md do BI).",
    },
    variaveis,
    configuracao_inicial: { clinica_config: config, modulos: e.modulos, sql },
    passos: [
      `Criar o projeto "${projeto}" no EasyPanel com o Postgres "db" (16) e o app "app" (Dockerfile, ramo main).`,
      "Preencher as variáveis da lista (as marcadas “gerar no servidor” nascem lá, nunca coladas daqui).",
      `Apontar ${e.dominio} para a VPS e ligar o HTTPS no app (porta 4200).`,
      "Publicar. Na subida o BI aplica as migrações e cria o primeiro acesso.",
      "Rodar a configuração inicial (SQL acima) no banco da clínica.",
      "Pôr o banco no backup diário.",
      "Em até 1 minuto o BI se liga sozinho à Central: aprovar na aba BIs e ligar esta ficha à clínica.",
      `Mandar o tutorial de primeiro acesso para ${e.responsavel.nome}; a clínica cola as chaves dos sistemas em Ajustes › Integrações.`,
      `Depois da 1ª leitura do GestãoDS, conferir as médicas: ${e.medicas.join(", ")}.`,
    ],
  };
}
