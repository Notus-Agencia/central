// Assistente "Nova clínica" (aba Clínicas da Central; só administradores). Coleta nome, marca, domínio, médicas, módulos
// do plano (fundador = todos, o dono tira) e responsável, e guarda a FICHA de implantação (_implantacao.ts) com status
// "aguardando hospedagem". Não cria nada no servidor: isso é a central-hospedagem (EasyPanel, ainda não conectado).
// Corpo: { acao: "catalogo" } → módulos, núcleo e planos
//        { acao: "previa", ...dados } → { ficha } sem gravar
//        { acao: "criar", ...dados } → { implantacao }
//        { acao: "status", id, status, bi_id? } → muda a situação (aguardando_hospedagem | hospedando | no_ar | cancelada)
import { comAdmin, idValido, json } from "./_comum.ts";
import { lerEntrada, montarFicha, MODULOS, NUCLEO, PLANOS } from "./_implantacao.ts";

const STATUS = ["aguardando_hospedagem", "hospedando", "no_ar", "cancelada"];

Deno.serve((req) =>
  comAdmin(req, async (svc, adminId, corpo) => {
    if (corpo.acao === "catalogo") return json(200, { modulos: MODULOS, nucleo: NUCLEO, planos: PLANOS });

    if (corpo.acao === "previa" || corpo.acao === "criar") {
      const e = lerEntrada(corpo);
      if (typeof e === "string") return json(400, { erro: e });
      const { data: u } = await svc.auth.admin.getUserById(adminId);
      const ficha = montarFicha(e, { email: u?.user?.email ?? null });
      if (corpo.acao === "previa") return json(200, { ficha });
      const { data: igual } = await svc.from("central_implantacoes").select("id").eq("dominio", e.dominio).neq("status", "cancelada").maybeSingle();
      if (igual) return json(409, { erro: "Já existe uma implantação com este domínio." });
      const { data: bi } = await svc.from("central_bis").select("id").eq("url", `https://${e.dominio}`).maybeSingle();
      if (bi) return json(409, { erro: "Este domínio já é de um BI cadastrado." });
      const { data, error } = await svc.from("central_implantacoes").insert({
        nome: e.nome, nome_curto: e.nome_curto, sigla: e.sigla, marca: e.marca, dominio: e.dominio, medicas: e.medicas, modulos: e.modulos,
        plano: e.plano, responsavel: e.responsavel, ficha, criado_por: adminId,
      }).select().single();
      if (error) throw error;
      return json(200, { implantacao: data });
    }

    if (corpo.acao === "status") {
      if (!idValido(corpo.id)) return json(400, { erro: "Implantação inválida." });
      if (!STATUS.includes(String(corpo.status))) return json(400, { erro: "Situação inválida." });
      const mudar: Record<string, unknown> = { status: corpo.status, atualizado_em: new Date().toISOString() };
      if (corpo.bi_id !== undefined) {
        if (corpo.bi_id !== null && !idValido(corpo.bi_id)) return json(400, { erro: "BI inválido." });
        mudar.bi_id = corpo.bi_id;
      }
      const { data, error } = await svc.from("central_implantacoes").update(mudar).eq("id", corpo.id).select().maybeSingle();
      if (error) throw error;
      if (!data) return json(404, { erro: "Implantação não encontrada." });
      return json(200, { implantacao: data });
    }
    return json(400, { erro: "Ação desconhecida." });
  })
);
