// Comum às funções da Central da Gestão Sem Caos. A service role só existe aqui, no servidor.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const DOMINIO_DEMO = "demo.gestaosemcaos.com.br";
const HORAS_PERMITIDAS = [2, 24, 72, 168];
const MAX_DIAS = 90;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

export function servico(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Atende o preflight e confere se quem chama é administrador da Central. */
export async function comAdmin(
  req: Request,
  fazer: (svc: SupabaseClient, adminId: string, corpo: Record<string, unknown>) => Promise<Response>,
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { erro: "Use POST." });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { erro: "Entre na Central primeiro." });
  const svc = servico();
  const { data, error } = await svc.auth.getUser(token);
  if (error || !data.user) return json(401, { erro: "Sessão inválida. Entre de novo." });
  const { data: adm } = await svc.from("central_admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (!adm) return json(403, { erro: "Só administradores da Central podem fazer isso." });
  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* corpo vazio */ }
  try {
    return await fazer(svc, data.user.id, corpo);
  } catch (e) {
    console.error(e);
    return json(500, { erro: "Não deu certo agora. Tente de novo." });
  }
}

/** Validade pedida: { horas: 2 | 24 | 72 | 168 } ou { expira_em: ISO }. `base` = de quando conta (padrão: agora). */
export function validade(corpo: Record<string, unknown>, base = new Date()): Date | string {
  const agora = new Date();
  let fim: Date;
  if (corpo.horas !== undefined) {
    const h = Number(corpo.horas);
    if (!HORAS_PERMITIDAS.includes(h)) return "Validade inválida.";
    fim = new Date(Math.max(base.getTime(), agora.getTime()) + h * 3600_000);
  } else if (typeof corpo.expira_em === "string") {
    fim = new Date(corpo.expira_em);
    if (isNaN(fim.getTime())) return "Data inválida.";
    if (fim.getTime() <= agora.getTime() + 5 * 60_000) return "A data precisa ser no futuro.";
  } else return "Escolha a validade.";
  if (fim.getTime() > agora.getTime() + MAX_DIAS * 86400_000) return `A validade vai até ${MAX_DIAS} dias.`;
  return fim;
}

function sorteio(alfabeto: string, n: number): string {
  const b = new Uint32Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => alfabeto[x % alfabeto.length]).join("");
}

/** login legível: primeiro nome sem acento + "." + 4 caracteres (ex.: ana.k7m2) */
export function novoLogin(nome: string): string {
  const base = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/\s+/)[0]
    .replace(/[^a-z0-9]/g, "").slice(0, 12);
  return `${base.length >= 2 ? base : "demo"}.${sorteio("abcdefghjkmnpqrstuvwxyz23456789", 4)}`;
}

/** senha legível de 10 caracteres: sílabas + 4 números, sem letras que confundem (ex.: Bamitu4729) */
export function novaSenha(): string {
  const c = "bcdfghjkmnprstvz", v = "aeiu";
  let s = "";
  for (let i = 0; i < 3; i++) s += sorteio(c, 1) + sorteio(v, 1);
  return s[0].toUpperCase() + s.slice(1) + sorteio("23456789", 4);
}

export function idValido(id: unknown): id is string {
  return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);
}
