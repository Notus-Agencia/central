// Chave de acesso (passkey/WebAuthn) do login da Central (pedido do dono, 27/10/2026: o modelo de segurança de todo site da Gestão
// Sem Caos). A mesma peça dos portais, com a sessão do Supabase Auth: depois de conferir a chave, a função gera um link de uso único
// (generateLink, não manda e-mail) e devolve só o token; a tela troca o token por uma sessão em /auth/v1/verify — o mesmo caminho da
// entrada na demo. Só administradores da Central criam e usam chave. Guarda só a chave pública; a conferência é da SimpleWebAuthn.
// Pública (verify_jwt = false): entrar-opcoes e entrar. Criar, listar e tirar exigem a sessão (Authorization) de um administrador.
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
} from "npm:@simplewebauthn/server@13.3.3";
import { servico } from "./_comum.ts";

// o domínio da chave (rpId) sai da origem do pedido, mas só destas
const ORIGENS = new Set([
  "https://central.gestaosemcaos.com.br",
  "http://localhost:8795", // a Central montada no computador, para testar antes de publicar
  ...(Deno.env.get("CENTRAL_CHAVE_ORIGENS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
]);
const MINUTOS = 5, MAX_APARELHOS = 10;

const hex = (b: Uint8Array) => "\\x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const deHex = (s: string) => new Uint8Array((s.replace(/^\\x/, "").match(/../g) ?? []).map((h) => parseInt(h, 16)));

function apelido(agente: string) {
  if (/iPhone/i.test(agente)) return "iPhone";
  if (/iPad/i.test(agente)) return "iPad";
  if (/Android/i.test(agente)) return "Celular Android";
  if (/Macintosh|Mac OS X/i.test(agente)) return "Mac";
  if (/Windows/i.test(agente)) return "Computador Windows";
  return "Este aparelho";
}

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
  if (req.method !== "POST") return resp({ ok: false, erro: "metodo" }, 405);
  if (!ORIGENS.has(origem)) return resp({ ok: false, erro: "origem" }, 403);
  const rpID = new URL(origem).hostname;
  let b: Record<string, any> = {};
  try { b = await req.json(); } catch { return resp({ ok: false, erro: "pedido" }, 400); }
  const svc = servico();

  const ehAdmin = async (userId: string) =>
    !!(await svc.from("central_admins").select("user_id").eq("user_id", userId).maybeSingle()).data;
  /** a sessão de quem pede (criar, listar, tirar): conta válida e administradora */
  async function quemPede() {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const { data, error } = await svc.auth.getUser(token);
    if (error || !data.user || !(await ehAdmin(data.user.id))) return null;
    return data.user;
  }
  async function guardarDesafio(desafio: string, tipo: string, userId: string | null) {
    await svc.from("central_chave_desafios").delete().lt("expira_em", new Date().toISOString());
    const { error } = await svc.from("central_chave_desafios").insert({ desafio, tipo, user_id: userId, expira_em: new Date(Date.now() + MINUTOS * 60_000).toISOString() });
    if (error) throw error;
  }
  async function gastarDesafio(desafio: string, tipo: string, userId: string | null) {
    let q = svc.from("central_chave_desafios").delete().eq("desafio", desafio).eq("tipo", tipo).gt("expira_em", new Date().toISOString());
    q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
    const { data } = await q.select("desafio");
    return Array.isArray(data) && data.length > 0;
  }
  const listar = async (userId: string) =>
    (await svc.from("central_chaves").select("id,apelido,criado_em,usado_em").eq("user_id", userId).order("criado_em")).data ?? [];

  try {
    switch (b.acao) {
      // ── entrar (tela de entrar, sem sessão) ──
      case "entrar-opcoes": {
        const o = await generateAuthenticationOptions({ rpID, userVerification: "required" });
        await guardarDesafio(o.challenge, "entrar", null);
        return resp(o);
      }
      case "entrar": {
        const r = b.resposta;
        if (!r?.id || !r?.response?.clientDataJSON) return resp({ ok: false, erro: "pedido" }, 400);
        const { data: p } = await svc.from("central_chaves").select("*").eq("credencial_id", String(r.id)).maybeSingle();
        if (!p || !(await ehAdmin(p.user_id))) return resp({ ok: false, erro: "chave" }, 401);
        let v;
        try {
          v = await verifyAuthenticationResponse({
            response: r, expectedChallenge: (d: string) => gastarDesafio(d, "entrar", null), expectedOrigin: origem, expectedRPID: rpID,
            credential: { id: p.credencial_id, publicKey: deHex(p.chave_publica), counter: Number(p.contador), transports: p.transportes },
            requireUserVerification: true,
          });
        } catch { v = null; }
        if (!v?.verified) return resp({ ok: false, erro: "chave" }, 401);
        await svc.from("central_chaves").update({ contador: v.authenticationInfo.newCounter, usado_em: new Date().toISOString() }).eq("id", p.id);
        const { data: u } = await svc.auth.admin.getUserById(p.user_id);
        if (!u?.user?.email) return resp({ ok: false, erro: "chave" }, 401);
        const { data: link, error } = await svc.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
        if (error || !link.properties?.hashed_token) throw error ?? new Error("sem token");
        return resp({ ok: true, token_hash: link.properties.hashed_token });
      }
      // ── Segurança (dentro da Central, com a sessão) ──
      case "criar-opcoes": {
        const eu = await quemPede();
        if (!eu) return resp({ ok: false, erro: "sessao" }, 401);
        const { data: ja } = await svc.from("central_chaves").select("credencial_id,transportes").eq("user_id", eu.id);
        if ((ja ?? []).length >= MAX_APARELHOS) return resp({ ok: false, erro: "limite" }, 422);
        const o = await generateRegistrationOptions({
          rpName: "Gestão Sem Caos", rpID, userName: eu.email ?? eu.id, userDisplayName: eu.email ?? "Central",
          userID: new TextEncoder().encode("central:" + eu.id), attestationType: "none",
          excludeCredentials: (ja ?? []).map((x: any) => ({ id: x.credencial_id, transports: x.transportes })),
          authenticatorSelection: { residentKey: "required", userVerification: "required" },
        });
        await guardarDesafio(o.challenge, "criar", eu.id);
        return resp(o);
      }
      case "criar": {
        const eu = await quemPede();
        if (!eu) return resp({ ok: false, erro: "sessao" }, 401);
        let v;
        try {
          v = await verifyRegistrationResponse({
            response: b.resposta, expectedChallenge: (d: string) => gastarDesafio(d, "criar", eu.id),
            expectedOrigin: origem, expectedRPID: rpID, requireUserVerification: true,
          });
        } catch { v = null; }
        if (!v?.verified || !v.registrationInfo) return resp({ ok: false, erro: "criar" }, 422);
        const c = v.registrationInfo.credential;
        const { error } = await svc.from("central_chaves").insert({
          user_id: eu.id, credencial_id: c.id, chave_publica: hex(c.publicKey), contador: c.counter,
          transportes: c.transports ?? [], apelido: apelido(req.headers.get("user-agent") ?? ""),
        });
        if (error) throw error;
        return resp({ ok: true, aparelhos: await listar(eu.id) });
      }
      case "listar": {
        const eu = await quemPede();
        if (!eu) return resp({ ok: false, erro: "sessao" }, 401);
        return resp({ ok: true, aparelhos: await listar(eu.id) });
      }
      case "tirar": {
        const eu = await quemPede();
        if (!eu) return resp({ ok: false, erro: "sessao" }, 401);
        await svc.from("central_chaves").delete().eq("id", Number(b.id)).eq("user_id", eu.id);
        return resp({ ok: true, aparelhos: await listar(eu.id) });
      }
    }
    return resp({ ok: false, erro: "acao" }, 400);
  } catch (e) {
    console.error("[central-chave-acesso]", e instanceof Error ? e.message : e);
    return resp({ ok: false, erro: "servidor" }, 500);
  }
});
