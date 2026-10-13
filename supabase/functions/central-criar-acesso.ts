// Cria um acesso de demonstração: reserva o login em demo_acessos, cria o usuário no Auth e liga os dois.
// Devolve login e senha uma única vez (a senha não fica guardada em lugar nenhum além do hash do Auth).
import { comAdmin, DOMINIO_DEMO, json, novaSenha, novoLogin, validade } from "./_comum.ts";

Deno.serve((req) =>
  comAdmin(req, async (svc, adminId, corpo) => {
    const nome = String(corpo.nome ?? "").trim().replace(/\s+/g, " ");
    if (nome.length < 2 || nome.length > 120) return json(400, { erro: "Diga o nome da pessoa." });
    const fim = validade(corpo);
    if (typeof fim === "string") return json(400, { erro: fim });

    const senha = novaSenha();
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const login = novoLogin(nome);
      // 1) reserva o login (o gatilho do Auth só aceita cadastro de login reservado)
      const { data: reserva, error: er } = await svc.from("demo_acessos")
        .insert({ nome, login, expira_em: fim.toISOString(), criado_por: adminId })
        .select().single();
      if (er) {
        if (er.code === "23505") continue; // login já existe: sorteia outro
        console.error(er);
        return json(500, { erro: "Não consegui criar o acesso agora." });
      }
      // 2) cria o usuário no Auth
      const { data: u, error: eu } = await svc.auth.admin.createUser({
        email: `${login}@${DOMINIO_DEMO}`,
        password: senha,
        email_confirm: true,
        app_metadata: { gsc: "demo" },
        user_metadata: { nome },
      });
      if (eu || !u.user) {
        await svc.from("demo_acessos").delete().eq("id", reserva.id);
        if (/already|registered|exists/i.test(eu?.message ?? "")) continue;
        console.error(eu);
        return json(500, { erro: "Não consegui criar o acesso agora." });
      }
      // 3) liga a linha ao usuário
      const { data: linha, error: el } = await svc.from("demo_acessos")
        .update({ user_id: u.user.id }).eq("id", reserva.id).select().single();
      if (el) {
        await svc.auth.admin.deleteUser(u.user.id);
        await svc.from("demo_acessos").delete().eq("id", reserva.id);
        console.error(el);
        return json(500, { erro: "Não consegui criar o acesso agora." });
      }
      return json(200, { acesso: linha, login, senha });
    }
    return json(500, { erro: "Não consegui gerar um login livre. Tente de novo." });
  })
);
