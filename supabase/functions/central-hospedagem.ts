// Criar a instalação de uma clínica no servidor a partir da ficha (aba Clínicas › Nova clínica › "Criar no servidor").
// Hoje NÃO chama nada de fora: _hospedagem.ts devolve "não conectado" e a tela mostra a ficha para criar à mão.
// O passo a passo para ligar o EasyPanel está no cabeçalho de _hospedagem.ts e no README. Corpo: { implantacao_id }.
import { comAdmin, idValido, json } from "./_comum.ts";
import { criarInstalacao } from "./_hospedagem.ts";

Deno.serve((req) =>
  comAdmin(req, async (svc, _adminId, corpo) => {
    if (!idValido(corpo.implantacao_id)) return json(400, { erro: "Implantação inválida." });
    const { data: imp } = await svc.from("central_implantacoes").select("id, status, ficha").eq("id", corpo.implantacao_id).maybeSingle();
    if (!imp) return json(404, { erro: "Implantação não encontrada." });
    if (imp.status !== "aguardando_hospedagem") return json(400, { erro: "Esta implantação não está aguardando hospedagem." });
    const r = await criarInstalacao(imp.ficha as Record<string, unknown>);
    if (r.conectado && r.ok)
      await svc.from("central_implantacoes").update({ status: "hospedando", atualizado_em: new Date().toISOString() }).eq("id", imp.id);
    return json(200, r);
  })
);
