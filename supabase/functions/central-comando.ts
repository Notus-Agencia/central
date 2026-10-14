// Comandos da Central para um BI (aba Clínicas; só administradores). Assina no servidor com a chave privada que o próprio
// BI entregou no registro (central_bis.chave_comandos, nunca vai ao navegador) e chama {url}/api/v1/central/*.
// Corpo: { bi_id, comando, ...parâmetros } — comando = resumo | saude | identidade | modulos | acessos | historico_suporte
// | modulo { chave, ligado } | suporte { minutos, motivo? } | encerrar_suporte. Catálogo em _comandos.ts.
// Todo comando vai para central_comandos (quem, quando, o quê, resultado); as leituras com leitura = true.
// Resposta: { ok: true, dados } ou { ok: false, erro, precisa_atualizar? } (status 200: a tela mostra a mensagem).
import { comAdmin, idValido, json } from "./_comum.ts";
import { assinar, pedidoDoComando, resumoDoResultado } from "./_comandos.ts";

const TEMPO_MAXIMO_MS = 15_000;
const MAX_RESPOSTA = 400_000;

Deno.serve((req) =>
  comAdmin(req, async (svc, adminId, corpo) => {
    if (!idValido(corpo.bi_id)) return json(400, { erro: "Escolha a clínica." });
    const pedido = pedidoDoComando(corpo);
    if (typeof pedido === "string") return json(400, { erro: pedido });
    const { data: bi } = await svc.from("central_bis").select("id, nome, url, tipo, ativo, chave_comandos").eq("id", corpo.bi_id).maybeSingle();
    if (!bi || !bi.ativo) return json(404, { erro: "Clínica não encontrada." });
    if (bi.tipo !== "clinica") return json(400, { erro: "A demonstração não recebe comandos." });
    if (!bi.chave_comandos)
      return json(200, { ok: false, precisa_atualizar: true, erro: "Este BI precisa da próxima atualização do BI para receber comandos da Central. Ele se liga sozinho depois dela." });

    const { data: u } = await svc.auth.admin.getUserById(adminId);
    const email = u?.user?.email ?? null;
    const nomeMeta = (u?.user?.user_metadata as Record<string, unknown> | undefined)?.nome;
    const quem = { nome: (typeof nomeMeta === "string" && nomeMeta.trim()) || (email ? email.split("@")[0] : "Central"), email };

    const texto = pedido.corpo ? JSON.stringify(pedido.corpo) : "";
    const cab = await assinar(String(bi.chave_comandos), { metodo: pedido.metodo, caminho: pedido.caminho, corpo: texto, quem });
    const parar = new AbortController();
    const relogio = setTimeout(() => parar.abort(), TEMPO_MAXIMO_MS);
    let status = 0, dados: Record<string, unknown> | null = null, erro: string | undefined;
    try {
      const r = await fetch(`${String(bi.url).replace(/\/+$/, "")}${pedido.caminho}`, {
        method: pedido.metodo, signal: parar.signal, redirect: "error",
        headers: { ...cab, Accept: "application/json", ...(texto ? { "Content-Type": "application/json" } : {}) },
        body: texto || undefined,
      });
      status = r.status;
      const t = await r.text();
      if (t.length > MAX_RESPOSTA) throw new Error("grande");
      try { dados = t ? JSON.parse(t) : null; } catch { dados = null; }
      if (status === 404 && !(dados && typeof dados.erro === "string")) erro = "Este BI ainda não tem os comandos da Central (precisa da próxima atualização do BI).";
      else if (status === 401 && dados && typeof dados.erro === "string" && /Bearer|OAuth/.test(dados.erro)) erro = "Este BI ainda não tem os comandos da Central (precisa da próxima atualização do BI).";
      else if (status === 401) erro = `O BI recusou a assinatura: ${dados && typeof dados.erro === "string" ? dados.erro : "chave trocada"}. Ele entrega a chave nova sozinho em até um dia.`;
      else if (status >= 400) erro = dados && typeof dados.erro === "string" ? dados.erro : "O BI não aceitou o comando.";
    } catch (e) {
      erro = e instanceof DOMException && e.name === "AbortError" ? "BI fora do ar: não respondeu a tempo." : "BI fora do ar agora. Tente de novo em instantes.";
    } finally {
      clearTimeout(relogio);
    }
    const ok = !erro && status >= 200 && status < 300;
    const detalhe: Record<string, unknown> = {};
    for (const k of ["chave", "ligado", "minutos", "motivo"]) if (corpo[k] !== undefined) detalhe[k] = corpo[k];
    await svc.from("central_comandos").insert({
      bi_id: bi.id, admin_id: adminId, admin_nome: quem.nome, comando: String(corpo.comando), leitura: pedido.leitura,
      detalhe: Object.keys(detalhe).length ? detalhe : null, ok, status: status || null, resultado: resumoDoResultado(corpo, ok, dados, erro),
    });
    if (!ok) return json(200, { ok: false, erro, precisa_atualizar: /próxima atualização/.test(erro ?? "") });
    return json(200, { ok: true, dados });
  })
);
