// Grava ou apaga a chave de leitura do uso de um BI (aba BIs da Central). Só escreve: a chave nunca volta, a resposta diz
// só se o BI tem chave. A chave é a "bi_..." criada no BI em Ajustes › Chave de API e MCP por quem tem papel
// desenvolvedor; a função central-uso é quem a usa, no servidor.
import { comAdmin, idValido, json } from "./_comum.ts";

const CHAVE = /^bi_[A-Za-z0-9_-]{8,200}$/;

Deno.serve((req) =>
  comAdmin(req, async (svc, _adminId, corpo) => {
    if (!idValido(corpo.bi_id)) return json(400, { erro: "BI inválido." });
    const { data: bi } = await svc.from("central_bis").select("id, tipo").eq("id", corpo.bi_id).maybeSingle();
    if (!bi) return json(404, { erro: "BI não encontrado." });
    if (bi.tipo !== "clinica") return json(400, { erro: "A demonstração não mede uso: não precisa de chave." });
    let chave: string | null = null;
    if (corpo.apagar !== true) {
      chave = typeof corpo.chave === "string" ? corpo.chave.trim() : "";
      if (!CHAVE.test(chave)) return json(400, { erro: "Isso não parece uma chave do BI (começa com bi_)." });
      if (chave.startsWith("bi_oa_")) return json(400, { erro: "Use a chave de API criada em Ajustes › Chave de API e MCP." });
    }
    const { error } = await svc.from("central_bis").update({ chave_leitura: chave }).eq("id", bi.id);
    if (error) throw error;
    return json(200, { tem_chave: chave !== null });
  })
);
