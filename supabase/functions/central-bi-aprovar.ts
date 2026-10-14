// Aprova (ou recusa) um BI que se registrou sozinho pela função central-registrar-bi e está aguardando aprovação
// (aba BIs da Central; só administradores). Aprovar: ativo = true, entra no fim da lista e aparece na aba Uso.
// Recusar: apaga o cadastro pendente (se o BI tentar de novo, volta a aguardar). Corpo: { bi_id, recusar?: true }.
import { comAdmin, idValido, json } from "./_comum.ts";

Deno.serve((req) =>
  comAdmin(req, async (svc, _adminId, corpo) => {
    if (!idValido(corpo.bi_id)) return json(400, { erro: "BI inválido." });
    const { data: bi } = await svc.from("central_bis").select("id, aguardando_aprovacao").eq("id", corpo.bi_id).maybeSingle();
    if (!bi) return json(404, { erro: "BI não encontrado." });
    if (!bi.aguardando_aprovacao) return json(400, { erro: "Este BI não está aguardando aprovação." });
    if (corpo.recusar === true) {
      const { error } = await svc.from("central_bis").delete().eq("id", bi.id).eq("aguardando_aprovacao", true);
      if (error) throw error;
      return json(200, { ok: true, recusado: true });
    }
    const { data: ultimo } = await svc.from("central_bis").select("ordem").eq("ativo", true).order("ordem", { ascending: false }).limit(1).maybeSingle();
    const { error } = await svc.from("central_bis")
      .update({ ativo: true, aguardando_aprovacao: false, ordem: ((ultimo?.ordem as number | undefined) ?? 0) + 1 }).eq("id", bi.id);
    if (error) throw error;
    return json(200, { ok: true });
  })
);
