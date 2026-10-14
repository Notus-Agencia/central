// Relatório "quem usou o BI e como" (aba Uso da Central): lê a chave de leitura do BI aqui no servidor (a automática,
// que o próprio BI entrega pela central-registrar-bi, ou a colada à mão na aba BIs) e chama
// GET {url}/api/v1/uso-pessoas com Authorization: Bearer <chave>. A chave nunca vai para o navegador.
// Corpo: { bi_id: id | id[], dias?: 1..400 | desde?: "inicio" | de?: AAAA-MM-DD, ate?: AAAA-MM-DD }.
// bi_id aceita uma lista (até 10) para, no futuro, juntar várias clínicas no mesmo relatório: hoje cada BI volta
// separado em `resultados` (sem mescla) e a tela escolhe um só.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { comAdmin, idValido, json } from "./_comum.ts";

const TEMPO_MAXIMO_MS = 15_000;
const MAX_BIS = 10;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

type Resultado = { bi_id: string; nome: string | null; ok: boolean; erro?: string; dados?: unknown };

/** o período do corpo vira a busca da API do BI; string = erro */
function periodo(corpo: Record<string, unknown>): URLSearchParams | string {
  const q = new URLSearchParams();
  if (corpo.de !== undefined || corpo.ate !== undefined) {
    if (typeof corpo.de !== "string" || !DATA.test(corpo.de)) return "Escolha o primeiro dia.";
    q.set("de", corpo.de);
    if (corpo.ate !== undefined) {
      if (typeof corpo.ate !== "string" || !DATA.test(corpo.ate)) return "Escolha o último dia.";
      if (corpo.ate < corpo.de) return "O primeiro dia precisa vir antes do último.";
      q.set("ate", corpo.ate);
    }
  } else if (corpo.desde !== undefined) {
    if (corpo.desde !== "inicio") return "Período inválido.";
    q.set("desde", "inicio");
  } else {
    const n = Number(corpo.dias ?? 7);
    if (!Number.isInteger(n) || n < 1 || n > 400) return "O período vai de 1 a 400 dias.";
    q.set("dias", String(n));
  }
  return q;
}

async function lerUm(svc: SupabaseClient, id: string, q: URLSearchParams): Promise<Resultado> {
  const { data: bi } = await svc.from("central_bis").select("id, nome, url, tipo, ativo, chave_leitura").eq("id", id).maybeSingle();
  if (!bi || !bi.ativo) return { bi_id: id, nome: null, ok: false, erro: "BI não encontrado." };
  const base = { bi_id: id, nome: bi.nome as string };
  if (bi.tipo === "demo") return { ...base, ok: false, erro: "A demonstração não mede uso: os dados são fictícios e voltam ao padrão a cada entrada." };
  if (!bi.chave_leitura) return { ...base, ok: false, erro: "Este BI ainda não se ligou à Central. Ele se liga sozinho depois da próxima atualização." };
  const url = `${String(bi.url).replace(/\/+$/, "")}/api/v1/uso-pessoas?${q}`;
  const parar = new AbortController();
  const relogio = setTimeout(() => parar.abort(), TEMPO_MAXIMO_MS);
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${bi.chave_leitura}`, Accept: "application/json" }, signal: parar.signal, redirect: "error" });
    const texto = await r.text();
    let d: Record<string, unknown> | null = null;
    try { d = JSON.parse(texto); } catch { d = null; }
    if (r.status === 401) return { ...base, ok: false, erro: "A chave deste BI foi trocada. Ele entrega outra sozinho em até um dia." };
    if (r.status === 403) return { ...base, ok: false, erro: "Chave recusada: ela não lê o uso deste BI. Ele entrega outra sozinho em até um dia." };
    if (r.status === 400) return { ...base, ok: false, erro: (d && typeof d.erro === "string" ? d.erro : "Período inválido.") };
    if (r.status === 404 || (r.ok && !d)) return { ...base, ok: false, erro: "Este BI ainda não tem a leitura do uso (a versão nova não foi publicada) ou a API está desligada." };
    if (!r.ok || !d) return { ...base, ok: false, erro: "BI fora do ar agora. Tente de novo em instantes." };
    return { ...base, ok: true, dados: d };
  } catch (e) {
    const tempo = e instanceof DOMException && e.name === "AbortError";
    return { ...base, ok: false, erro: tempo ? "BI fora do ar: não respondeu a tempo." : "BI fora do ar agora. Tente de novo em instantes." };
  } finally {
    clearTimeout(relogio);
  }
}

Deno.serve((req) =>
  comAdmin(req, async (svc, _adminId, corpo) => {
    const ids = Array.isArray(corpo.bi_id) ? corpo.bi_id : [corpo.bi_id];
    if (!ids.length || ids.length > MAX_BIS || !ids.every(idValido)) return json(400, { erro: "Escolha o BI." });
    const q = periodo(corpo);
    if (typeof q === "string") return json(400, { erro: q });
    const resultados = await Promise.all([...new Set(ids as string[])].map((id) => lerUm(svc, id, q)));
    return json(200, { resultados });
  })
);
