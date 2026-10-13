// Estende a validade de um acesso de demonstração: { id, horas } soma a partir do fim atual (ou de agora, se já
// expirou); { id, expira_em } marca a data exata. Acesso revogado não volta.
import { comAdmin, idValido, json, validade } from "./_comum.ts";

Deno.serve((req) =>
  comAdmin(req, async (svc, _adminId, corpo) => {
    if (!idValido(corpo.id)) return json(400, { erro: "Acesso inválido." });
    const { data: a } = await svc.from("demo_acessos").select("*").eq("id", corpo.id).maybeSingle();
    if (!a) return json(404, { erro: "Acesso não encontrado." });
    if (a.revogado) return json(409, { erro: "Esse acesso foi revogado. Crie um novo." });
    const fim = validade(corpo, new Date(a.expira_em));
    if (typeof fim === "string") return json(400, { erro: fim });
    const { data, error } = await svc.from("demo_acessos").update({ expira_em: fim.toISOString() }).eq("id", a.id).select().single();
    if (error) throw error;
    return json(200, { acesso: data });
  })
);
