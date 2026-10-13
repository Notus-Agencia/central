// Versão de teste — Metas e bônus: simula no navegador as rotas /api/bonus do servidor, com pessoas e números fictícios.
// O cálculo usa as MESMAS regras do sistema (compartilhado/bonus.ts, exposto pela tela em window.__bonus).
// "Ver como" (no rodapé) troca entre a gestão e a página de cada pessoa. Nada aqui fala com o BI de produção.
(function () {
  "use strict";

  var HOJE = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  var MES = HOJE.slice(0, 7);
  function somarMes(m, n) { var d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); }
  function somarDia(iso, n) { var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function diasNoMes(m) { return new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate(); }
  function ultimoDia(m) { return m + "-" + String(diasNoMes(m)).padStart(2, "0"); }
  function diasDo(m) { var r = []; for (var i = 1; i <= diasNoMes(m); i++) r.push(m + "-" + String(i).padStart(2, "0")); return r; }
  function util(iso) { var d = new Date(iso + "T12:00:00Z").getUTCDay(); return d >= 1 && d <= 5; }
  var ANT = somarMes(MES, -1);
  var AGORA = new Date().toISOString();
  function regras() { return window.__bonus; }
  function h(s) { var x = 2166136261; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return ((x >>> 0) % 10000) / 10000; }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }

  // ── quem está "logado" na versão de teste ──
  var PERSONAS = {
    gestao: { rotulo: "Gestão (admin)", pessoa: null },
    priscila: { rotulo: "Priscila · Marketing", pessoa: 1 },
    yasmin: { rotulo: "Yasmin · Recepção", pessoa: 4 },
    denise: { rotulo: "Denise · Suporte", pessoa: 7 },
  };
  var como = (location.hash.match(/como=([a-z]+)/) || [])[1];
  if (!PERSONAS[como]) como = "gestao";
  var persona = PERSONAS[como];
  var gestao = !persona.pessoa;

  // ── cadastro ──
  var pessoas = [
    { id: 1, nome: "Priscila", funcao: "Marketing", indicador: "leads_novos", ativo: true, usuario_id: 11, email: "priscila@exemplo.com", papel: "colaborador", convite_pendente: false, ultimo_acesso_em: AGORA },
    { id: 2, nome: "Bianca", funcao: "SDR", indicador: "novos_atendidos", ativo: true, usuario_id: null, email: null, papel: null, convite_pendente: null, ultimo_acesso_em: null },
    { id: 3, nome: "Jéssica", funcao: "Closer - Concierge", indicador: "propostas", ativo: true, usuario_id: 13, email: "jessica@exemplo.com", papel: "colaborador", convite_pendente: true, ultimo_acesso_em: null },
    { id: 4, nome: "Yasmin", funcao: "Recepção", indicador: "avaliacoes_5", ativo: true, usuario_id: 14, email: "yasmin@exemplo.com", papel: "colaborador", convite_pendente: false, ultimo_acesso_em: AGORA },
    { id: 5, nome: "Joana", funcao: "Auxiliar", indicador: "procedimentos_validos", ativo: true, usuario_id: null, email: null, papel: null, convite_pendente: null, ultimo_acesso_em: null },
    { id: 6, nome: "Kelly Moraes", funcao: "Auxiliar", indicador: "procedimentos_validos", ativo: true, usuario_id: null, email: null, papel: null, convite_pendente: null, ultimo_acesso_em: null },
    { id: 7, nome: "Denise", funcao: "Suporte e Manutenção", indicador: "nota_cupons", ativo: true, usuario_id: 17, email: "denise@exemplo.com", papel: "colaborador", convite_pendente: false, ultimo_acesso_em: AGORA },
    { id: 8, nome: "Larissa Brito", funcao: "Auxiliar", indicador: "procedimentos_validos", ativo: false, usuario_id: null, email: null, papel: null, convite_pendente: null, ultimo_acesso_em: null },
  ];
  var proximaPessoa = 9;
  function pessoaPorId(id) { return pessoas.find(function (p) { return p.id === id; }); }
  var eu = gestao
    ? { id: 1, nome: "Gestão Teste", funcao: "Marketing", indicador: "leads_novos", email: "gestao@exemplo.com", papel: "desenvolvedor" }
    : { id: 10 + persona.pessoa, nome: pessoaPorId(persona.pessoa).nome, email: pessoaPorId(persona.pessoa).email, papel: "colaborador" };

  // ── meses: o anterior (fechado) e o atual, com as regras da planilha ──
  var SEMANAS_REAIS = {
    "2026-09": [["2026-09-01", "2026-09-05", 0.2], ["2026-09-06", "2026-09-12", 0.2], ["2026-09-13", "2026-09-19", 0.22], ["2026-09-20", "2026-09-26", 0.23], ["2026-09-27", "2026-09-30", 0.15]],
    "2026-10": [["2026-10-01", "2026-10-03", 0.1], ["2026-10-04", "2026-10-10", 0.24], ["2026-10-11", "2026-10-17", 0.19], ["2026-10-18", "2026-10-24", 0.24], ["2026-10-25", "2026-10-31", 0.23]],
  };
  function semanasDe(m) {
    var r = SEMANAS_REAIS[m];
    return r ? r.map(function (s) { return { inicio: s[0], fim: s[1], peso: s[2] }; }) : null;
  }
  function linha(pessoa_id, funcao, indicador, meta, percentual) { return { pessoa_id: pessoa_id, funcao: funcao, indicador: indicador, meta: meta, percentual: percentual }; }
  var metasMensais = [
    { mes: ANT, chave: "fat_total", medico_id: null, valor: 300000, bonus: null },
    { mes: MES, chave: "fat_total", medico_id: null, valor: 450000, bonus: null },
  ];
  var BASE = { parte_semanal: 0.7, parte_extra: 0.3, desconto_falta: 0.3, redutor: 0.225, dias_uteis_semana: 5 };
  var meses = {};
  meses[ANT] = {
    p: Object.assign({}, BASE, { semanas: semanasDe(ANT) }),
    participantes: [linha(1, "Marketing", "leads_novos", 588, 0.002), linha(2, "SDR", "novos_atendidos", 78, 0.004), linha(3, "Closer - Concierge", "propostas", 88, 0.004),
      linha(4, "Recepção", "avaliacoes_5", 40, 0.002), linha(5, "Auxiliar", "procedimentos_validos", 75, 0.003), linha(8, "Auxiliar", "procedimentos_validos", 75, 0.002),
      linha(7, "Suporte e Manutenção", "nota_cupons", 4.8, 0.001)],
    fecharNoInicio: true, fechado: null, fechamento: null,
  };
  meses[MES] = {
    p: Object.assign({}, BASE, { semanas: semanasDe(MES) }),
    participantes: [linha(1, "Marketing", "leads_novos", 700, 0.002), linha(2, "SDR", "novos_atendidos", 80, 0.004), linha(3, "Closer - Concierge", "propostas", 100, 0.004),
      linha(4, "Recepção", "avaliacoes_5", 40, 0.002), linha(5, "Auxiliar", "procedimentos_validos", 80, 0.003), linha(6, "Auxiliar", "procedimentos_validos", 80, 0.002),
      linha(7, "Suporte e Manutenção", "nota_cupons", 4.8, 0.001)],
    fechado: null, fechamento: null,
  };

  // ── lançamentos manuais (fictícios) ──
  var avaliacoes = {}; // dia -> { valor, por, em }
  var cupons = [];
  var proximoCupom = 1;
  var faltas = [{ pessoa_id: 2, dia: somarDia(ANT + "-01", 9) }];
  var QUEM = ["Denise", "Toda a equipe", "Joana", "", "Yasmin", ""];
  var COMENTARIOS = ["Atendimento maravilhoso", "", "Sempre muito atenciosas", "", "", "Equipe de parabéns"];
  [ANT, MES].forEach(function (m) {
    diasDo(m).forEach(function (d) {
      if (d > HOJE || !util(d)) return;
      if (h("av" + d) < 0.5) avaliacoes[d] = { valor: 1 + Math.floor(h("avn" + d) * 3), por: "Yasmin", em: d + "T12:00:00Z", por_id: 14 };
      var n = Math.floor(h("cp" + d) * 3);
      for (var i = 0; i < n; i++) {
        var k = d + i;
        cupons.push({ id: proximoCupom++, dia: d, nota_whatsapp: 5, nota_recepcao: h("nr" + k) < 0.08 ? 4 : 5, nota_procedimento: 5,
          quem_atendeu: QUEM[Math.floor(h("q" + k) * QUEM.length)] || null, comentario: COMENTARIOS[Math.floor(h("c" + k) * COMENTARIOS.length)] || null,
          por: "Denise", por_id: 17, em: d + "T15:00:00Z" });
      }
    });
  });
  if (faltas[0].dia > HOJE) faltas = [];

  // ── séries dos indicadores ──
  function serie(ind, inicio, fim) {
    var r = [];
    for (var d = inicio; d <= fim && d <= HOJE; d = somarDia(d, 1)) {
      var w = util(d), x = h(ind + d), v;
      if (ind === "avaliacoes_5") { if (avaliacoes[d]) r.push({ dia: d, valor: avaliacoes[d].valor }); continue; }
      if (ind === "nota_cupons") {
        var cs = cupons.filter(function (c) { return c.dia === d && c.nota_recepcao != null; });
        if (cs.length) { var s = cs.reduce(function (t, c) { return t + c.nota_recepcao; }, 0); r.push({ dia: d, valor: s / cs.length, qtd: cs.length, soma: s }); }
        continue;
      }
      if (ind === "leads_novos") v = w ? 15 + Math.floor(x * 13) : 4 + Math.floor(x * 6);
      else if (ind === "novos_atendidos") v = w ? Math.floor(x * 5) : 0;
      else if (ind === "propostas") v = w ? 1 + Math.floor(x * 5) : 0;
      else if (ind === "procedimentos_validos") v = w ? 1 + Math.floor(x * 4) : 0;
      else v = 0;
      // celebração da semana batida: a 1ª semana do mês corrente fica acima da meta (Priscila, Marketing)
      if (ind === "leads_novos" && d.slice(0, 7) === MES && meses[MES].p.semanas && d <= meses[MES].p.semanas[0].fim) v = Math.round(v * 1.8);
      if (v) r.push({ dia: d, valor: v });
    }
    return r;
  }

  function faturamentoAlvo(m) {
    var x = metasMensais.find(function (t) { return t.mes === m && t.chave === "fat_total" && t.medico_id == null; });
    return x ? x.valor : 0;
  }
  function parametros(m) {
    var c = meses[m];
    if (!c.p.semanas) c.p.semanas = regras().sugerirSemanas(m, c.p.dias_uteis_semana);
    return Object.assign({}, c.p, { faturamento_alvo: faturamentoAlvo(m) });
  }
  function participantes(m) {
    return meses[m].participantes.map(function (x) { return Object.assign({ nome: pessoaPorId(x.pessoa_id).nome }, x); });
  }
  function calcular(m) {
    var c = meses[m], ini = m + "-01", fim = ultimoDia(m), series = {}, fs = {};
    participantes(m).forEach(function (x) { if (!series[x.indicador]) series[x.indicador] = serie(x.indicador, ini, fim); });
    faltas.forEach(function (f) { if (f.dia >= ini && f.dia <= fim) (fs[f.pessoa_id] = fs[f.pessoa_id] || []).push(f.dia); });
    return regras().calcularMes({ mes: m, hoje: HOJE, parametros: parametros(m), participantes: participantes(m), series: series, faltas: fs });
  }
  function resultado(m) {
    var c = meses[m];
    if (!c) return null;
    if (c.fecharNoInicio && HOJE > ultimoDia(m)) {
      c.fecharNoInicio = false; c.fechamento = calcular(m); c.fechado = { em: MES + "-01T11:00:00Z", por: "Wellington" };
    }
    if (c.fechamento) return Object.assign(copia(c.fechamento), { fechado: c.fechado });
    return Object.assign(calcular(m), { fechado: null });
  }

  function listaAvaliacoes(m) {
    return Object.keys(avaliacoes).filter(function (d) { return d.slice(0, 7) === m; }).sort().reverse()
      .map(function (d) { return { dia: d, valor: avaliacoes[d].valor, por: avaliacoes[d].por, em: avaliacoes[d].em }; });
  }
  function listaCupons(m) {
    return cupons.filter(function (c) { return c.dia.slice(0, 7) === m; })
      .sort(function (a, b) { return a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : b.id - a.id; })
      .map(function (c) { return Object.assign({}, c, { pode_editar: gestao || c.por_id === eu.id }); });
  }

  function pagina(pessoaId, mesPedido) {
    var p = pessoaPorId(pessoaId);
    if (!p) return [404, { erro: "Pessoa não encontrada." }];
    var lista = Object.keys(meses).filter(function (m) { return meses[m].participantes.some(function (x) { return x.pessoa_id === pessoaId; }); }).sort().reverse();
    var m = mesPedido && lista.indexOf(mesPedido) >= 0 ? mesPedido : lista.indexOf(MES) >= 0 ? MES : lista[0] || null;
    var pg = paginasPessoas[pessoaId] || null;
    if (!m) return [200, { pessoa: { id: p.id, nome: p.nome }, mes: null, meses: lista, resultado: null, contexto: null, lancamento: null, layout: pg && pg.layout, layout_em: pg && pg.em }];
    var r = resultado(m);
    var res = r.pessoas.find(function (x) { return x.pessoa_id === pessoaId; }) || null;
    var ind = res && regras().indicadorPorChave(res.indicador);
    return [200, {
      pessoa: { id: p.id, nome: p.nome }, mes: m, meses: lista, resultado: res,
      contexto: { hoje: r.hoje, dia_atual: r.dia_atual, dias_no_mes: r.dias_no_mes, decorrido: r.decorrido, extra_liberado: r.extra_liberado,
        desconto_falta: r.parametros.desconto_falta, parte_semanal: r.parametros.parte_semanal, parte_extra: r.parametros.parte_extra, fechado: r.fechado },
      lancamento: ind && ind.manual ? {
        indicador: ind.chave, pode: !r.fechado,
        avaliacoes: ind.chave === "avaliacoes_5" ? listaAvaliacoes(m) : undefined,
        cupons: ind.chave === "nota_cupons" ? listaCupons(m) : undefined,
      } : null,
      layout: pg && pg.layout, layout_em: pg && pg.em,
      alerta: res && !r.fechado ? alertaDaSemana(res, r.hoje, r.parametros.dias_uteis_semana) : null,
      // meta de hoje (compartilhado/meta-dia.ts, a mesma conta do servidor)
      meta_hoje: res && !r.fechado && regras().metaDeHoje ? regras().metaDeHoje(res, r.hoje, r.parametros.dias_uteis_semana) : null,
    }];
  }

  function erroLancar(indicador, dia) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia || "")) return [422, { erro: "Data inválida." }];
    if (dia > HOJE) return [422, { erro: "Não dá para lançar um dia que ainda não chegou." }];
    var c = meses[dia.slice(0, 7)];
    if (!c) return [404, { erro: "Este mês ainda não foi configurado nas metas." }];
    resultado(dia.slice(0, 7));
    if (c.fechado) return [409, { erro: "Este mês já foi fechado. Para mudar, a gestão precisa reabrir o mês." }];
    if (gestao) return null;
    var ok = c.participantes.some(function (x) { return x.pessoa_id === persona.pessoa && x.indicador === indicador; });
    return ok ? null : [403, { erro: "Esse lançamento não é da sua função neste mês." }];
  }
  function lerCupom(b) {
    function nota(v) { if (v === "" || v == null) return null; var n = Number(v); if (!(Number.isInteger(n) && n >= 0 && n <= 5)) throw new Error("As notas vão de 0 a 5."); return n; }
    var c = { dia: String(b.dia || ""), nota_whatsapp: nota(b.nota_whatsapp), nota_recepcao: nota(b.nota_recepcao), nota_procedimento: nota(b.nota_procedimento),
      quem_atendeu: String(b.quem_atendeu || "").trim() || null, comentario: String(b.comentario || "").trim() || null };
    if (c.nota_whatsapp == null && c.nota_recepcao == null && c.nota_procedimento == null) throw new Error("Marque pelo menos uma nota do cupom.");
    return c;
  }
  var LINK = "https://bi.clinica-orvalho.exemplo.com/definir-senha?token=versao-de-teste";
  var CHAVE_PAGINAS = "bi-teste:paginas-pessoas";
  function lerPaginas() { try { return JSON.parse(sessionStorage.getItem(CHAVE_PAGINAS) || "{}") || {}; } catch (e) { return {}; } }
  function gravarPaginas(v) { try { sessionStorage.setItem(CHAVE_PAGINAS, JSON.stringify(v)); } catch (e) { /* sem armazenamento: vale só até recarregar */ } }
  var paginasPessoas = lerPaginas();
  var TIPOS_PAGINA = ["meta-mes", "meta-bonus", "meta-missao", "meta-lancar", "meta-semanas", "meta-dia", "meta-regras", "titulo", "texto", "divisor", "espaco",
    "numero", "indicadores", "faturamento", "por-medica", "evolucao", "categorias", "funil", "agenda", "agenda-proximos", "tempo-resposta", "destaque",
    "grafico-barras", "grafico-linhas", "grafico-pizza", "grafico-dispersao", "grafico-funil", "grafico-treemap", "grafico-diario", "lista"];

  // alerta de semana em risco (cópia da regra de backend/src/modules/metas/alertas.ts, para a versão de teste)
  function alertaDaSemana(r, hoje, diasUteis) {
    var R = regras(), s = r.semanas.find(function (x) { return x.situacao === "andamento"; });
    if (!s) return null;
    var falta = s.meta - s.feito;
    if (falta <= 0) return null;
    var passados = 0, restantes = 0;
    for (var d = s.inicio; d <= s.fim; d = R.somarDias(d, 1)) { if (!R.diaUtil(d, diasUteis)) continue; if (d < hoje) passados++; else restantes++; }
    var un = (R.indicadorPorChave(r.indicador) || {}).unidade || "";
    var fmt = function (n) { return Number.isInteger(n) ? String(n) : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }); };
    var base = { semana: s.n, meta: s.meta, feito: s.feito, falta: falta, dias_restantes: restantes, valor: s.valor };
    if (restantes === 0) return Object.assign(base, { ritmo_por_dia: null, precisa_por_dia: null, projecao: null, texto: "Semana " + s.n + " em risco: faltam " + fmt(falta) + " " + un + " e não sobra dia útil até " + s.fim.slice(8, 10) + "/" + s.fim.slice(5, 7) + "." });
    if (passados === 0) return null;
    var ritmo = s.feito / passados, proj = s.feito + ritmo * restantes;
    if (proj + 1e-9 >= s.meta) return null;
    var precisa = falta / restantes;
    return Object.assign(base, { ritmo_por_dia: ritmo, precisa_por_dia: precisa, projecao: proj,
      texto: "Semana " + s.n + " em risco: no ritmo desta semana (" + fmt(Math.round(ritmo * 10) / 10) + " por dia) fecha em " + fmt(Math.floor(proj)) + " de " + fmt(s.meta) + " " + un + ". Faltam " + fmt(falta) + " em " + restantes + " dia" + (restantes > 1 ? "s" : "") + " út" + (restantes > 1 ? "eis" : "il") + " — " + fmt(Math.ceil(precisa * 10) / 10) + " por dia." });
  }
  function alertasDe(r) {
    var a = {};
    if (!r || r.fechado || !r.pessoas) return a;
    r.pessoas.forEach(function (p) { var x = alertaDaSemana(p, r.hoje, r.parametros.dias_uteis_semana); if (x) a[p.pessoa_id] = x; });
    return a;
  }

  function rota(metodo, caminho, busca, b) {
    var m;
    b = b || {};
    if (caminho === "/api/auth/eu") return [200, eu];
    if (caminho === "/api/auth/login" || caminho === "/api/auth/logout") return [200, { ok: true }];
    if (caminho === "/api/perfil" && metodo === "GET") return [200, { id: eu.id, nome: eu.nome, email: eu.email, papel: eu.papel, recebe_resumo: false, recebe_alertas: false, ultimo_acesso_em: AGORA }];
    // o tutorial de primeiro acesso fica com o simulador do repositório (estado vazio: o tour abre sozinho)
    if (caminho.indexOf("/api/perfil") === 0 && caminho !== "/api/perfil/tutorial") return [200, { ok: true }];
    var deColaborador = /^\/api\/bonus\/(minha|avaliacoes|cupons)/.test(caminho);
    if (!gestao && caminho.indexOf("/api/bonus/") === 0 && !deColaborador) return [403, { erro: "Seu acesso não permite esta ação." }];
    // números da clínica: a colaboradora lê só o que está na página dela (no servidor de verdade o resumo vem recortado)
    var numeroDaPagina = /^\/api\/painel\/(visao-geral|diario|diario\/catalogo|agenda-proximos|tempo-resposta)$/.test(caminho) || caminho === "/api/metricas";
    if (!gestao && numeroDaPagina && metodo === "GET") return null;
    // o tutorial de primeiro acesso também vale para a colaboradora (fica com o simulador do repositório)
    if (caminho === "/api/perfil/tutorial") return null;
    if (!gestao && caminho.indexOf("/api/bonus/") !== 0) return [403, { erro: "Seu acesso é só à sua página de metas." }];

    // metas da clínica (antiga "Metas do mês")
    if (caminho === "/api/metas" && metodo === "GET") return [200, metasMensais.filter(function (x) { return x.mes.slice(0, 4) === (busca.get("ano") || MES.slice(0, 4)); })];
    if (caminho === "/api/metas" && metodo === "PUT") {
      metasMensais = metasMensais.filter(function (x) { return !(x.mes === b.mes && x.chave === b.chave && (x.medico_id ?? null) === (b.medico_id ?? null)); });
      if (b.valor !== "" && b.valor != null) metasMensais.push({ mes: b.mes, chave: b.chave, medico_id: b.medico_id ?? null, valor: Number(b.valor), bonus: b.bonus ? Number(b.bonus) : null });
      return [200, { ok: true }];
    }

    if (caminho === "/api/bonus/meses" && metodo === "GET") {
      return [200, Object.keys(meses).sort().reverse().map(function (k) { resultado(k); return { mes: k, fechado_em: meses[k].fechado ? meses[k].fechado.em : null, pessoas: meses[k].participantes.length }; })];
    }
    if ((m = caminho.match(/^\/api\/bonus\/meses\/(\d{4}-\d{2})$/))) {
      var mes = m[1], c = meses[mes], lista = pessoas.map(function (p) { return { id: p.id, nome: p.nome, ativo: p.ativo }; });
      if (metodo === "GET") {
        if (c) { var r = resultado(mes); return [200, { mes: mes, existe: true, fechado: r.fechado, parametros: parametros(mes), participantes: participantes(mes), pessoas: lista, base: null }]; }
        var anterior = Object.keys(meses).filter(function (k) { return k < mes; }).sort().pop() || null;
        var pb = anterior ? parametros(anterior) : Object.assign({}, BASE, { faturamento_alvo: 0 });
        return [200, { mes: mes, existe: false, fechado: null,
          parametros: Object.assign({}, pb, { faturamento_alvo: faturamentoAlvo(mes) || pb.faturamento_alvo, semanas: regras().sugerirSemanas(mes, pb.dias_uteis_semana) }),
          participantes: anterior ? participantes(anterior).filter(function (x) { return pessoaPorId(x.pessoa_id).ativo; }) : [], pessoas: lista, base: anterior }];
      }
      if (metodo === "PUT") {
        if (c) { resultado(mes); if (c.fechado) return [409, { erro: "Este mês já foi fechado. Reabra o mês para mudar a configuração." }]; }
        var p = { faturamento_alvo: Number(b.faturamento_alvo), parte_semanal: Number(b.parte_semanal), parte_extra: Number(b.parte_extra), desconto_falta: Number(b.desconto_falta),
          redutor: Number(b.redutor), dias_uteis_semana: Number(b.dias_uteis_semana), semanas: (b.semanas || []).map(function (s) { return { inicio: s.inicio, fim: s.fim, peso: Number(s.peso) }; }) };
        var pts = (b.participantes || []).map(function (x) { return linha(Number(x.pessoa_id), String(x.funcao || "").trim(), x.indicador, Number(x.meta), Number(x.percentual)); });
        var erros = regras().validarMes(mes, p, pts);
        pts.forEach(function (x, i) { if (!x.funcao) erros.push("Linha " + (i + 1) + ": informe a função."); if (!pessoaPorId(x.pessoa_id)) erros.push("Linha " + (i + 1) + ": escolha a pessoa."); });
        if (erros.length) return [422, { erro: erros.join(" ") }];
        meses[mes] = { p: { parte_semanal: p.parte_semanal, parte_extra: p.parte_extra, desconto_falta: p.desconto_falta, redutor: p.redutor, dias_uteis_semana: p.dias_uteis_semana, semanas: p.semanas },
          participantes: pts, fechado: null, fechamento: null };
        metasMensais = metasMensais.filter(function (x) { return !(x.mes === mes && x.chave === "fat_total" && x.medico_id == null); });
        metasMensais.push({ mes: mes, chave: "fat_total", medico_id: null, valor: p.faturamento_alvo, bonus: null });
        return [200, { ok: true }];
      }
    }
    if ((m = caminho.match(/^\/api\/bonus\/meses\/(\d{4}-\d{2})\/(fechar|reabrir)$/))) {
      var cm = meses[m[1]];
      if (!cm) return [404, { erro: "Este mês ainda não foi configurado nas metas." }];
      resultado(m[1]);
      if (m[2] === "reabrir") { cm.fechado = null; cm.fechamento = null; cm.fecharNoInicio = false; return [200, { ok: true }]; }
      if (cm.fechado) return [409, { erro: "Este mês já foi fechado." }];
      if (HOJE <= ultimoDia(m[1])) return [422, { erro: "O mês só pode ser fechado depois do último dia." }];
      cm.fechamento = calcular(m[1]); cm.fechado = { em: new Date().toISOString(), por: eu.nome };
      return [200, { ok: true, a_pagar: cm.fechamento.totais.a_pagar }];
    }
    if ((m = caminho.match(/^\/api\/bonus\/resultado\/(\d{4}-\d{2})$/))) { var rr = resultado(m[1]); return [200, rr ? Object.assign(rr, { alertas: alertasDe(rr) }) : { mes: m[1], vazio: true }]; }

    // Pessoas e acessos é um cadastro só: a lista de acessos inclui o acesso de colaborador de quem está nas metas
    if (caminho === "/api/usuarios" && metodo === "GET" && gestao) {
      var base = (window.__usuariosDemo || []).map(function (u) { return Object.assign({}, u); });
      pessoas.forEach(function (p) {
        if (p.usuario_id && !base.some(function (u) { return u.id === p.usuario_id; })) {
          base.push({ id: p.usuario_id, nome: p.nome, email: p.email, papel: p.papel || "colaborador", ativo: p.ativo, criado_em: AGORA, ultimo_acesso_em: p.ultimo_acesso_em, convite_pendente: !!p.convite_pendente, ve_pacientes: false });
        }
      });
      return [200, { email_ativo: false, usuarios: base }];
    }
    if (caminho === "/api/bonus/pessoas" && metodo === "GET") {
      return [200, pessoas.map(function (p) {
        var ms = Object.keys(meses).filter(function (k) { return meses[k].participantes.some(function (x) { return x.pessoa_id === p.id; }); }).sort();
        return Object.assign({}, p, { ultimo_mes: ms.pop() || null });
      }).sort(function (a, b) { return (b.ativo - a.ativo) || a.nome.localeCompare(b.nome); })];
    }
    if (caminho === "/api/bonus/pessoas" && metodo === "POST") {
      var nome = String(b.nome || "").trim();
      if (!nome) return [422, { erro: "Informe o nome." }];
      var email = String(b.email || "").trim().toLowerCase();
      var nova = { id: proximaPessoa++, nome: nome, ativo: true, usuario_id: email ? 100 + proximaPessoa : null, email: email || null, papel: email ? "colaborador" : null, convite_pendente: email ? true : null, ultimo_acesso_em: null };
      pessoas.push(nova);
      return [201, { id: nova.id, acesso: email ? { link: LINK, enviado: false, novo: true } : null }];
    }
    if ((m = caminho.match(/^\/api\/bonus\/pessoas\/(\d+)$/)) && metodo === "PUT") {
      var pe = pessoaPorId(+m[1]);
      if (!pe) return [404, { erro: "Pessoa não encontrada." }];
      if (b.nome != null) pe.nome = String(b.nome).trim() || pe.nome;
      if (b.ativo != null) pe.ativo = !!b.ativo;
      return [200, { ok: true }];
    }
    if ((m = caminho.match(/^\/api\/bonus\/pessoas\/(\d+)\/acesso$/))) {
      var pa = pessoaPorId(+m[1]);
      if (!pa) return [404, { erro: "Pessoa não encontrada." }];
      if (!pa.usuario_id) {
        var em = String(b.email || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return [422, { erro: "Informe um e-mail válido." }];
        pa.usuario_id = 100 + pa.id; pa.email = em; pa.papel = "colaborador"; pa.convite_pendente = true;
      }
      return [200, { link: LINK, enviado: false, novo: true }];
    }

    if ((m = caminho.match(/^\/api\/bonus\/pessoas\/(\d+)\/pagina$/))) {
      var dono = pessoaPorId(+m[1]);
      if (!dono) return [404, { erro: "Pessoa não encontrada." }];
      if (metodo === "GET") { var sv = paginasPessoas[dono.id]; return [200, { pessoa: { id: dono.id, nome: dono.nome }, layout: sv ? sv.layout : null, atualizado_em: sv ? sv.em : null }]; }
      if (metodo === "DELETE") { delete paginasPessoas[dono.id]; gravarPaginas(paginasPessoas); return [200, { ok: true }]; }
      if (metodo === "PUT") {
        var lay = b.layout;
        if (!lay || lay.versao !== 3 || !Array.isArray(lay.raiz)) return [422, { erro: "Página inválida (esperado versao 3 com a lista de cards)." }];
        if (lay.raiz.some(function (c) { return TIPOS_PAGINA.indexOf(c && c.tipo) < 0; })) return [422, { erro: "Card desconhecido na página." }];
        paginasPessoas[dono.id] = { layout: lay, em: new Date().toISOString() }; gravarPaginas(paginasPessoas);
        return [200, { ok: true, atualizado_em: paginasPessoas[dono.id].em }];
      }
    }
    if (caminho === "/api/bonus/minha") {
      var pm = pagina(persona.pessoa, busca.get("mes")), dm = pm[1];
      // celebração: as semanas batidas do mês de hoje que ela ainda não viu (o "já vi" fica no simulador do repositório,
      // bi:celebracao-teste; ?celebrar=1 no endereço esquece o que já viu)
      if (/celebrar=1/.test(location.search + location.hash)) { try { localStorage.removeItem("bi:celebracao-teste"); } catch (e) {} }
      var vistas = [];
      try { vistas = (JSON.parse(localStorage.getItem("bi:celebracao-teste") || "{}") || {})[String(persona.pessoa)] || []; } catch (e) { vistas = []; }
      var bat = dm && dm.resultado && dm.mes === MES && !(dm.contexto && dm.contexto.fechado) && regras().semanasBatidas
        ? regras().semanasBatidas(dm.resultado).filter(function (s) { return vistas.indexOf(s.inicio) < 0; }) : [];
      if (dm && pm[0] === 200) dm.celebracao = bat.length ? { indicador: dm.resultado.indicador, tipo: dm.resultado.tipo,
        semanas: bat.map(function (s) { return { n: s.n, inicio: s.inicio, fim: s.fim, meta: s.meta, feito: s.feito, valor: s.valor, paga: s.situacao === "paga" }; }) } : null;
      return pm;
    }
    if ((m = caminho.match(/^\/api\/bonus\/pessoa\/(\d+)$/))) return pagina(+m[1], busca.get("mes"));

    if (caminho === "/api/bonus/avaliacoes" && metodo === "PUT") {
      var e1 = erroLancar("avaliacoes_5", b.dia);
      if (e1) return e1;
      if (b.valor === "" || b.valor == null) { delete avaliacoes[b.dia]; return [200, { ok: true }]; }
      var v = Number(b.valor);
      if (!(Number.isInteger(v) && v >= 0 && v <= 500)) return [422, { erro: "Informe um número inteiro de avaliações." }];
      avaliacoes[b.dia] = { valor: v, por: eu.nome, por_id: eu.id, em: new Date().toISOString() };
      return [200, { ok: true }];
    }
    if (caminho === "/api/bonus/cupons" && metodo === "POST") {
      var cn;
      try { cn = lerCupom(b); } catch (x) { return [422, { erro: x.message }]; }
      var e2 = erroLancar("nota_cupons", cn.dia);
      if (e2) return e2;
      cupons.push(Object.assign({ id: proximoCupom++, por: eu.nome, por_id: eu.id, em: new Date().toISOString() }, cn));
      return [201, { id: proximoCupom - 1 }];
    }
    if ((m = caminho.match(/^\/api\/bonus\/cupons\/(\d+)$/))) {
      var cp = cupons.find(function (x) { return x.id === +m[1]; });
      if (!cp) return [404, { erro: "Cupom não encontrado." }];
      var e3 = erroLancar("nota_cupons", cp.dia);
      if (e3) return e3;
      if (!gestao && cp.por_id !== eu.id) return [403, { erro: "Só quem lançou (ou a gestão) pode mudar este cupom." }];
      if (metodo === "DELETE") { cupons = cupons.filter(function (x) { return x !== cp; }); return [200, { ok: true }]; }
      var cc;
      try { cc = lerCupom(b); } catch (x) { return [422, { erro: x.message }]; }
      var e4 = erroLancar("nota_cupons", cc.dia);
      if (e4) return e4;
      Object.assign(cp, cc);
      return [200, { ok: true }];
    }
    if ((m = caminho.match(/^\/api\/bonus\/lancamentos\/(\d{4}-\d{2})$/))) {
      var ml = m[1], cl = meses[ml];
      if (cl) resultado(ml);
      return [200, { mes: ml, existe: !!cl, fechado: !!(cl && cl.fechado),
        participantes: cl ? participantes(ml).map(function (x) { return { pessoa_id: x.pessoa_id, nome: x.nome, funcao: x.funcao, indicador: x.indicador }; }) : [],
        faltas: faltas.filter(function (f) { return f.dia.slice(0, 7) === ml; }).sort(function (a, b2) { return a.dia < b2.dia ? -1 : 1; }),
        avaliacoes: listaAvaliacoes(ml), cupons: listaCupons(ml) }];
    }
    if (caminho === "/api/bonus/faltas" && metodo === "PUT") {
      var mf = String(b.dia || "").slice(0, 7), cf = meses[mf];
      if (!cf) return [404, { erro: "Este mês ainda não foi configurado nas metas." }];
      resultado(mf);
      if (cf.fechado) return [409, { erro: "Este mês já foi fechado. Para mudar, a gestão precisa reabrir o mês." }];
      faltas = faltas.filter(function (f) { return !(f.dia === b.dia && f.pessoa_id === Number(b.pessoa_id)); });
      if (b.falta) faltas.push({ dia: b.dia, pessoa_id: Number(b.pessoa_id) });
      return [200, { ok: true }];
    }
    if (caminho === "/api/bonus/indicadores") return [200, regras().INDICADORES];
    return null; // segue para o simulador das outras telas
  }

  var fetchAnterior = window.fetch;
  window.fetch = function (entrada, opcoes) {
    var url = typeof entrada === "string" ? entrada : "";
    var u;
    try { u = new URL(url, location.href); } catch (e) { return fetchAnterior(entrada, opcoes); }
    if (!(url.indexOf("/api/") === 0)) return fetchAnterior(entrada, opcoes);
    var metodo = ((opcoes && opcoes.method) || "GET").toUpperCase();
    var corpo = null;
    try { corpo = opcoes && opcoes.body ? JSON.parse(opcoes.body) : null; } catch (e) { corpo = null; }
    var r = rota(metodo, u.pathname, u.searchParams, corpo);
    if (!r) return fetchAnterior(entrada, opcoes);
    return new Promise(function (ok) {
      setTimeout(function () { ok(new Response(JSON.stringify(r[1]), { status: r[0], headers: { "Content-Type": "application/json" } })); }, 140);
    });
  };

  window.__inicioDemo = gestao ? "/inicio" : "/minha-meta";
  window.__pessoaDemo = persona.pessoa;

  // ── "Ver como": troca de pessoa (recarrega a versão de teste) ──
  function montarTroca() {
    var aviso = document.querySelector(".aviso-teste");
    if (!aviso) return;
    var botao = document.createElement("button");
    botao.type = "button";
    botao.className = "troca-teste";
    botao.textContent = "Ver como: " + persona.rotulo.split(" · ")[0];
    var menu = document.createElement("div");
    menu.className = "menu-teste";
    menu.hidden = true;
    Object.keys(PERSONAS).forEach(function (k) {
      var item = document.createElement("button");
      item.type = "button";
      item.textContent = PERSONAS[k].rotulo + (k === como ? "  ✓" : "");
      item.onclick = function () { location.hash = "como=" + k; location.reload(); };
      menu.appendChild(item);
    });
    botao.onclick = function () { menu.hidden = !menu.hidden; };
    aviso.appendChild(botao);
    document.body.appendChild(menu);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montarTroca);
  else montarTroca();
})();
