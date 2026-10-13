// Entrada direta do administrador na demonstração, a partir da Central: gera um link de uso único (não manda e-mail)
// e devolve só o token dele. A demo troca o token por uma sessão própria (/auth/v1/verify), separada da sessão da
// Central — assim renovar uma não derruba a outra. O token vale uma vez e por pouco tempo (o padrão do Supabase).
import { comAdmin, json } from "./_comum.ts";

Deno.serve((req) =>
  comAdmin(req, async (svc, adminId) => {
    const { data: u, error: eu } = await svc.auth.admin.getUserById(adminId);
    if (eu || !u.user?.email) return json(400, { erro: "Conta sem e-mail." });
    const { data, error } = await svc.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
    if (error || !data.properties?.hashed_token) throw error ?? new Error("sem token");
    return json(200, { token_hash: data.properties.hashed_token });
  })
);
