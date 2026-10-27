// Briefing da implantação por link (pedido do dono, 27/10/2026: "o briefing pode ser enviado como link para o cliente responder").
// A clínica abre central.gestaosemcaos.com.br/briefing/#c=<código>, sem login, e responde as perguntas; cada resposta é salva na hora
// e dá para parar e continuar. O código (32 caracteres aleatórios) é a única chave do link: quem tem o link vê e responde só aquele
// briefing. Nada de segredo nas perguntas (as chaves dos sistemas a clínica cola depois no BI dela).
// Pública (verify_jwt = false): ler, salvar, enviar. Criar e arquivar exigem a sessão de um administrador da Central.
// Ao enviar, avisa os administradores por e-mail (Resend), se o segredo RESEND_API_KEY existir nas funções; sem ele, só fica na Central.
import { servico } from "./_comum.ts";

const ORIGENS = new Set([
  "https://central.gestaosemcaos.com.br",
  "http://localhost:8795", // a Central montada no computador, para testar antes de publicar
  ...(Deno.env.get("CENTRAL_CHAVE_ORIGENS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
]);
const MAX_CHAVES = 80, MAX_TEXTO = 4000, MAX_TOTAL = 40_000;

/** as respostas que a página manda: só chaves simples, texto ou lista curta de textos */
export function lerRespostas(r: unknown): Record<string, string | string[]> | string {
  if (!r || typeof r !== "object" || Array.isArray(r)) return "Respostas inválidas.";
  const saida: Record<string, string | string[]> = {};
  const chaves = Object.keys(r as Record<string, unknown>);
  if (chaves.length > MAX_CHAVES) return "Respostas demais.";
  for (const k of chaves) {
    if (!/^[a-z0-9_]{1,40}$/.test(k)) return "Respostas inválidas.";
    const v = (r as Record<string, unknown>)[k];
    if (typeof v === "string") saida[k] = v.slice(0, MAX_TEXTO);
    else if (Array.isArray(v) && v.length <= 20 && v.every((x) => typeof x === "string")) saida[k] = v.map((x) => (x as string).slice(0, 120));
    else if (v === null) saida[k] = "";
    else return "Respostas inválidas.";
  }
  if (JSON.stringify(saida).length > MAX_TOTAL) return "Respostas grandes demais.";
  return saida;
}
const codigoValido = (c: unknown): c is string => typeof c === "string" && /^[A-Za-z0-9_-]{24,64}$/.test(c);
function novoCodigo() {
  const b = new Uint8Array(24); crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  const origem = req.headers.get("origin") ?? "";
  const H = {
    "Access-Control-Allow-Origin": ORIGENS.has(origem) ? origem : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
  const resp = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...H, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  if (req.method !== "POST") return resp({ ok: false, erro: "Use POST." }, 405);
  if (!ORIGENS.has(origem)) return resp({ ok: false, erro: "origem" }, 403);
  let b: Record<string, any> = {};
  try { b = await req.json(); } catch { return resp({ ok: false, erro: "Pedido inválido." }, 400); }
  const svc = servico();

  async function adminQuePede() {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const { data, error } = await svc.auth.getUser(token);
    if (error || !data.user) return null;
    const { data: a } = await svc.from("central_admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
    return a ? data.user : null;
  }
  async function doCodigo(codigo: unknown) {
    if (!codigoValido(codigo)) return null;
    const { data } = await svc.from("central_briefings").select("id,clinica,respostas,aberto_em,enviado_em,arquivado_em").eq("codigo", codigo).maybeSingle();
    return data && !data.arquivado_em ? data : null;
  }
  async function avisarAdmins(clinica: string) {
    const chave = Deno.env.get("RESEND_API_KEY");
    if (!chave) return;
    const { data: admins } = await svc.from("central_admins").select("user_id");
    const emails: string[] = [];
    for (const a of admins ?? []) {
      const { data: u } = await svc.auth.admin.getUserById(a.user_id);
      if (u?.user?.email) emails.push(u.user.email);
    }
    if (!emails.length) return;
    const html = `<div style="font-family:Arial,sans-serif;color:#13283F;font-size:15px;line-height:1.5">
      <p><b>${esc(clinica)}</b> terminou o briefing da implantação.</p>
      <p><a href="https://central.gestaosemcaos.com.br/" style="color:#C43803;font-weight:bold">Ver as respostas na Central</a> (aba Clínicas › Briefings).</p>
      <p style="color:#5b6878;font-size:13px">Central · Gestão Sem Caos</p></div>`;
    await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: "Bearer " + chave, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Central · Gestão Sem Caos <central@gestaosemcaos.com.br>", to: emails, subject: "Briefing respondido · " + clinica, html }),
    }).catch((e) => console.error("[central-briefing] e-mail", e instanceof Error ? e.message : e));
  }

  try {
    switch (b.acao) {
      // ── a clínica, pelo link ──
      case "ler": {
        const br = await doCodigo(b.codigo);
        if (!br) return resp({ ok: false, erro: "Este link não vale mais. Peça um novo à Gestão Sem Caos." }, 404);
        if (!br.aberto_em) await svc.from("central_briefings").update({ aberto_em: new Date().toISOString() }).eq("id", br.id);
        return resp({ ok: true, clinica: br.clinica, respostas: br.respostas ?? {}, enviado_em: br.enviado_em });
      }
      case "salvar": {
        const br = await doCodigo(b.codigo);
        if (!br) return resp({ ok: false, erro: "Este link não vale mais. Peça um novo à Gestão Sem Caos." }, 404);
        const novas = lerRespostas(b.respostas);
        if (typeof novas === "string") return resp({ ok: false, erro: novas }, 422);
        const juntas = lerRespostas({ ...(br.respostas ?? {}), ...novas });
        if (typeof juntas === "string") return resp({ ok: false, erro: juntas }, 422);
        const { error } = await svc.from("central_briefings").update({ respostas: juntas, atualizado_em: new Date().toISOString() }).eq("id", br.id);
        if (error) throw error;
        return resp({ ok: true });
      }
      case "enviar": {
        const br = await doCodigo(b.codigo);
        if (!br) return resp({ ok: false, erro: "Este link não vale mais. Peça um novo à Gestão Sem Caos." }, 404);
        const primeira = !br.enviado_em;
        await svc.from("central_briefings").update({ enviado_em: new Date().toISOString() }).eq("id", br.id);
        if (primeira) await avisarAdmins(br.clinica);
        return resp({ ok: true });
      }
      // ── a Central ──
      case "criar": {
        const eu = await adminQuePede();
        if (!eu) return resp({ ok: false, erro: "Só administradores da Central." }, 403);
        const clinica = String(b.clinica ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
        if (clinica.length < 2) return resp({ ok: false, erro: "Diga o nome da clínica." }, 400);
        const { data, error } = await svc.from("central_briefings").insert({ clinica, codigo: novoCodigo(), criado_por: eu.id }).select("id,clinica,codigo,criado_em").single();
        if (error) throw error;
        return resp({ ok: true, briefing: data });
      }
      case "arquivar": {
        const eu = await adminQuePede();
        if (!eu) return resp({ ok: false, erro: "Só administradores da Central." }, 403);
        const { error } = await svc.from("central_briefings").update({ arquivado_em: b.desfazer ? null : new Date().toISOString() }).eq("id", String(b.id ?? ""));
        if (error) throw error;
        return resp({ ok: true });
      }
    }
    return resp({ ok: false, erro: "Ação desconhecida." }, 400);
  } catch (e) {
    console.error("[central-briefing]", e instanceof Error ? e.message : e);
    return resp({ ok: false, erro: "Não deu certo agora. Tente de novo." }, 500);
  }
});
