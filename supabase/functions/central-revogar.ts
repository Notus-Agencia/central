// Revoga um acesso de demonstração: marca revogado e bloqueia o usuário no Auth (não renova mais a sessão).
import { comAdmin, idValido, json } from "./_comum.ts";

Deno.serve((req) =>
  comAdmin(req, async (svc, _adminId, corpo) => {
    if (!idValido(corpo.id)) return json(400, { erro: "Acesso inválido." });
    const { data: a } = await svc.from("demo_acessos").select("*").eq("id", corpo.id).maybeSingle();
    if (!a) return json(404, { erro: "Acesso não encontrado." });
    const { data, error } = await svc.from("demo_acessos")
      .update({ revogado: true, revogado_em: a.revogado_em ?? new Date().toISOString() })
      .eq("id", a.id).select().single();
    if (error) throw error;
    if (a.user_id) {
      const { error: eb } = await svc.auth.admin.updateUserById(a.user_id, { ban_duration: "876000h" });
      if (eb) console.error(eb);
    }
    return json(200, { acesso: data });
  })
);
