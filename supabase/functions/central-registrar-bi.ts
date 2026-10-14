// Registro automático de um BI na Central (fase dos fundadores; pública: verify_jwt = false). Quem chama é o servidor do
// próprio BI (modules/central/ligacao.ts no repositório do BI), na subida e uma vez por dia até dar certo, com
// { url, nome, versao, chave, chave_comandos? }. A chave nasce no BI e só abre /api/v1/uso-pessoas e /api/v1/central/ping de lá.
// chave_comandos (Onda 7): a chave PRIVADA Ed25519 dos comandos assinados, gerada pelo BI no mesmo registro (ele guarda só
// a pública). Vem junto da chave de leitura, que a conferência abaixo prova ser do BI: ninguém troca a chave dos comandos
// sem ser o próprio BI. Guardada em central_bis.chave_comandos (a tela não lê a coluna) e usada só pela central-comando.
// BI ligado antes da Onda 7: registra de novo sozinho (a ligação dele não conta como confirmada sem a chave pública) e
// a chave_comandos entra no mesmo cadastro.
// Antes de gravar, confirma que a chave é verdadeira: chama GET {url}/api/v1/central/ping com ela (tempo curto, sem
// redirecionar) e exige 200 com o mesmo endereço. Ninguém consegue trocar a chave de um BI sem ser o próprio BI.
//   - BI já cadastrado com a mesma URL: troca chave_leitura e atualiza versão, último contato e ligado_auto_em
//     (o nome do cadastro não muda: é o que o admin escolheu);
//   - BI novo: entra com ativo = false e aguardando_aprovacao = true (o admin aprova na aba BIs).
// Limite contra abuso (tabela central_registros): por endereço e no total, por hora; BIs novos esperando, no máximo 20.
// Resposta: só { ok: true, comandos: true|false } ou { erro }. As chaves nunca voltam. comandos = a chave dos comandos
// ficou guardada (o BI só grava a pública dele quando vê true).
import { json, servico } from "./_comum.ts";

const MAX_CORPO = 4096;
const TEMPO_PING_MS = 8_000;
const POR_URL_HORA = 6;
const TOTAL_HORA = 60;
const MAX_AGUARDANDO = 20;
const CHAVE = /^bi_c_[A-Za-z0-9_-]{43}$/;
const CHAVE_COMANDOS = /^bi_k_[A-Za-z0-9_-]{64}$/;
const VERSAO = /^v\d{1,4}\.\d{1,4}\.\d{1,5}$/;

/** o endereço público do BI (https, nome de domínio, sem porta, usuário nem caminho) normalizado; null = recusado */
export function urlDoBi(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 200) return null;
  let u: URL;
  try { u = new URL(v.trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.search || u.hash) return null;
  if (u.pathname !== "/" && u.pathname !== "") return null;
  const h = u.hostname.toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) return null; // só nome de domínio (nada de IP v6 nem caractere estranho)
  if (/^[\d.]+$/.test(h) || /\.(localhost|local|test|internal|lan|home|arpa)$/.test(h) || h.endsWith(".supabase.co")) return null;
  return `https://${h}`;
}
const normal = (u: string) => u.trim().toLowerCase().replace(/\/+$/, "");

/** a chave abre o ping do BI e o BI diz que é ele mesmo? */
async function confere(url: string, chave: string): Promise<{ nome: string | null; versao: string | null } | null> {
  const parar = new AbortController();
  const relogio = setTimeout(() => parar.abort(), TEMPO_PING_MS);
  try {
    const r = await fetch(`${url}/api/v1/central/ping`, {
      headers: { Authorization: `Bearer ${chave}`, Accept: "application/json" }, signal: parar.signal, redirect: "error",
    });
    if (r.status !== 200) return null;
    const texto = await r.text();
    if (texto.length > MAX_CORPO) return null;
    const d = JSON.parse(texto) as Record<string, unknown>;
    if (d.ok !== true || typeof d.url !== "string" || normal(d.url) !== url) return null;
    const nome = typeof d.nome === "string" ? d.nome.trim().slice(0, 120) : "";
    const versao = typeof d.versao === "string" && VERSAO.test(d.versao) ? d.versao : null;
    return { nome: nome || null, versao };
  } catch {
    return null;
  } finally {
    clearTimeout(relogio);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { erro: "Use POST." });
  try {
    const texto = await req.text();
    if (texto.length > MAX_CORPO) return json(413, { erro: "Pedido grande demais." });
    let corpo: Record<string, unknown>;
    try { corpo = JSON.parse(texto); } catch { return json(400, { erro: "Pedido inválido." }); }
    if (!corpo || typeof corpo !== "object") return json(400, { erro: "Pedido inválido." });
    const url = urlDoBi(corpo.url);
    if (!url) return json(400, { erro: "Endereço do BI inválido (precisa ser https, só o domínio)." });
    if (typeof corpo.chave !== "string" || !CHAVE.test(corpo.chave)) return json(400, { erro: "Chave em formato inesperado." });
    if (corpo.nome !== undefined && (typeof corpo.nome !== "string" || corpo.nome.length > 120)) return json(400, { erro: "Nome inválido." });
    if (corpo.versao != null && (typeof corpo.versao !== "string" || corpo.versao.length > 20)) return json(400, { erro: "Versão inválida." });
    const chave = corpo.chave;
    if (corpo.chave_comandos !== undefined && (typeof corpo.chave_comandos !== "string" || !CHAVE_COMANDOS.test(corpo.chave_comandos)))
      return json(400, { erro: "Chave dos comandos em formato inesperado." });
    const chaveComandos = typeof corpo.chave_comandos === "string" ? corpo.chave_comandos : null;

    const svc = servico();
    // limite: por endereço e no total, na última hora (conta a tentativa antes de chamar o BI)
    const umaHora = new Date(Date.now() - 3600_000).toISOString();
    const [porUrl, total] = await Promise.all([
      svc.from("central_registros").select("id", { count: "exact", head: true }).eq("url", url).gte("em", umaHora),
      svc.from("central_registros").select("id", { count: "exact", head: true }).gte("em", umaHora),
    ]);
    if ((porUrl.count ?? 0) >= POR_URL_HORA || (total.count ?? 0) >= TOTAL_HORA) return json(429, { erro: "Muitas tentativas. Tente de novo mais tarde." });
    const { data: tentativa, error: eT } = await svc.from("central_registros").insert({ url }).select("id").single();
    if (eT) throw eT;
    // limpeza: tentativas com mais de 7 dias
    await svc.from("central_registros").delete().lt("em", new Date(Date.now() - 7 * 86400_000).toISOString());

    const ping = await confere(url, chave);
    if (!ping) return json(400, { erro: "O BI não confirmou a chave (a conferência em /api/v1/central/ping falhou)." });

    const { data: bis, error: eB } = await svc.from("central_bis").select("id, url, tipo");
    if (eB) throw eB;
    const agora = new Date().toISOString();
    const existente = (bis ?? []).find((b) => normal(String(b.url)) === url);
    if (existente) {
      if (existente.tipo !== "clinica") return json(400, { erro: "Este endereço não é de um BI de clínica." });
      const { error } = await svc.from("central_bis").update({
        chave_leitura: chave, versao: ping.versao, ultimo_contato_em: agora, ligado_auto_em: agora,
        ...(chaveComandos ? { chave_comandos: chaveComandos } : {}),
      }).eq("id", existente.id);
      if (error) throw error;
    } else {
      const { count } = await svc.from("central_bis").select("id", { count: "exact", head: true }).eq("aguardando_aprovacao", true);
      if ((count ?? 0) >= MAX_AGUARDANDO) return json(429, { erro: "Muitos BIs aguardando aprovação. Tente de novo mais tarde." });
      const nome = ping.nome || (typeof corpo.nome === "string" && corpo.nome.trim()) || url.replace(/^https:\/\//, "");
      const { error } = await svc.from("central_bis").insert({
        nome: nome.slice(0, 120), url, tipo: "clinica", ativo: false, aguardando_aprovacao: true, ordem: 999,
        chave_leitura: chave, versao: ping.versao, ultimo_contato_em: agora, ligado_auto_em: agora, chave_comandos: chaveComandos,
      });
      if (error) throw error;
    }
    await svc.from("central_registros").update({ ok: true }).eq("id", tentativa.id);
    return json(200, { ok: true, comandos: !!chaveComandos });
  } catch (e) {
    // só a mensagem: o detalhe de um erro do banco pode trazer a linha inteira (com a chave)
    console.error("[central-registrar-bi]", String((e as { message?: unknown })?.message ?? "erro"));
    return json(500, { erro: "Não deu certo agora. Tente de novo amanhã." });
  }
});
