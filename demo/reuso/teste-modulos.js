// Versão de teste — Módulos (Ajustes › Módulos) e Regras da clínica (Ajustes › Regras da clínica).
// Fica por fora dos outros simuladores (é o último a embrulhar o fetch): liga e desliga os módulos na hora, guardando no
// navegador ("bi:modulos-teste", o mesmo que o simulador do repositório lê), e faz as rotas de Metas e bônus da versão
// de teste (teste-metas.js) respeitarem "Equipe" e "Metas por pessoa e bônus" como o servidor de verdade: sem o bônus,
// a página da colaboradora vem sem os blocos do bônus. Também responde a tela de Regras da clínica com dados fictícios
// da Clínica Orvalho. Nada aqui fala com o BI de produção.
(function () {
  "use strict";

  var CHAVE = "bi:modulos-teste";
  var CHAVE_MUDANCAS = "bi:modulos-teste-quando";
  var CHAVE_FUNCOES = "bi-teste:funcoes";
  var como = (location.hash.match(/como=([a-z]+)/) || [])[1];
  var gestao = !como || como === "gestao";

  function M() { return window.__modulos; }
  function ler(chave, padrao) { try { var v = JSON.parse(localStorage.getItem(chave) || "null"); return v && typeof v === "object" ? v : padrao; } catch (e) { return padrao; } }
  function gravar(chave, v) { try { localStorage.setItem(chave, JSON.stringify(v)); } catch (e) { /* vale até recarregar */ } }
  function estado() {
    var e = {}, g = ler(CHAVE, {});
    (M() ? M().CHAVES_MODULO : []).forEach(function (k) { e[k] = typeof g[k] === "boolean" ? g[k] : true; });
    return e;
  }
  function desligado(chave) {
    var d = M() && M().defModulo(chave);
    return [404, { erro: "O módulo “" + (d ? d.nome : chave) + "” está desligado nesta clínica.", modulo: chave, desligado: true }];
  }
  function resposta(r) {
    return new Promise(function (ok) {
      setTimeout(function () { ok(new Response(r[0] === 204 ? null : JSON.stringify(r[1]), { status: r[0], headers: { "Content-Type": "application/json" } })); }, 120);
    });
  }

  // ── Regras da clínica (fictícias: Dras. Helena, Marina e Sofia) ──
  var PADRAO_REGRAS = {
    meta: { contas: [{ bm: "Helena", profissional_id: "MED001" }], modelo_campanha: "[{slug}]" },
    renovacao: { toxina: { dias: 120 }, "mmp-capilar": { dias: 365 }, "mmp-facial": { dias: 180 }, "fio-pdo": { dias: 180 }, laser: { dias: 365, ate: 425 },
      skinbooster: { dias: 180 }, preenchimento: { dias: 365 }, bioestimulador: { dias: 365 }, ultrassom: { dias: 365 }, peeling: { dias: 60 } },
    procedimento: { corte: 999, so_primeira_sessao: true },
    bonus: {
      indicadores: {
        novos_atendidos: ["Cada novo paciente atendido conta 1, na data do atendimento.", "Entram as agendas da Dra. Helena, da Dra. Marina e da Dra. Sofia.",
          "Novo = 1º atendimento realizado do paciente com aquela médica."],
        procedimentos_validos: ["Agenda da Dra. Helena, da Dra. Marina ou da Dra. Sofia, tipo Procedimento e status Finalizado.",
          "Só procedimento com termo: a 1ª sessão de cada pacote ou o procedimento avulso.", "Valor do pagamento acima de R$ 999.", "Conta 1 por atendimento, na data do atendimento."],
      },
      conferencia: {
        "novos_atendidos.entram": "1º atendimento realizado do paciente com aquela médica, nas agendas da Dra. Helena, Dra. Marina e Dra. Sofia, na data do atendimento.",
        "procedimentos_validos.entram": "Agendamentos de tipo Procedimento das três médicas, finalizados, com valor do pagamento acima de {corte_procedimento} e que sejam a 1ª sessão do pacote.",
        "procedimentos_validos.fora": "Procedimentos das três médicas que já aconteceram e não entraram, com o filtro que tirou cada um: não finalizado, valor até {corte_procedimento} ou sessão seguinte de um pacote.",
      },
    },
    ia: { aviso_medicas: "Por médica, antes de 2026 parte das consultas da Dra. Sofia foi lançada na Dra. Helena: para comparar a dermatologia, some as duas ou veja a clínica toda.",
      passagem: "novos da Dra. Sofia que chegaram a orçamento da Dra. Helena em 90 dias", extras: [] },
  };
  var FAMILIAS = [["toxina", "Toxina botulínica", "clínica", "inicio"], ["mmp-capilar", "MMP capilar", "clínica", "fim"], ["mmp-facial", "MMP facial", "clínica", "fim"],
    ["fio-pdo", "Fio PDO", "clínica", "fim"], ["laser", "Laser", "clínica", "fim"], ["skinbooster", "Skinbooster", "referência", "fim"],
    ["preenchimento", "Preenchimento e rinomodelação", "clínica", "fim"], ["bioestimulador", "Bioestimulador", "referência", "fim"],
    ["ultrassom", "Ultrassom microfocado", "referência", "fim"], ["peeling", "Peeling e microagulhamento", "referência", "fim"]]
    .map(function (f) { return { id: f[0], nome: f[1], fonte: f[2], base: f[3] }; });
  var regras = ler("bi-teste:regras", null) || JSON.parse(JSON.stringify(PADRAO_REGRAS));
  function estadoRegras() {
    var configurado = {};
    Object.keys(PADRAO_REGRAS).forEach(function (s) { configurado[s] = true; });
    return {
      regras: regras, padrao: PADRAO_REGRAS, configurado: configurado, familias: FAMILIAS,
      indicadores: [{ chave: "novos_atendidos", rotulo: "Novos pacientes atendidos", padrao: PADRAO_REGRAS.bonus.indicadores.novos_atendidos },
        { chave: "procedimentos_validos", rotulo: "Procedimentos válidos", padrao: PADRAO_REGRAS.bonus.indicadores.procedimentos_validos }],
      conferencia: [["novos_atendidos.entram", "Novos pacientes atendidos · quem entra"], ["procedimentos_validos.entram", "Procedimentos válidos · quem entra"],
        ["procedimentos_validos.fora", "Procedimentos válidos · ficaram de fora"]].map(function (c) { return { chave: c[0], rotulo: c[1], padrao: PADRAO_REGRAS.bonus.conferencia[c[0]] }; }),
      profissionais: [{ id: "MED001", nome: "Helena", meta_slug: "DR_HELENA" }, { id: "MED002", nome: "Marina", meta_slug: "DR_MARINA" }, { id: "MED003", nome: "Sofia", meta_slug: "DR_SOFIA" }],
    };
  }
  function rotaRegras(metodo, caminho, corpo) {
    if (!gestao) return [403, { erro: "Seu acesso não permite esta ação." }];
    if (caminho === "/api/regras-clinica" && metodo === "GET") return [200, estadoRegras()];
    var m = caminho.match(/^\/api\/regras-clinica\/([a-z]+)$/);
    if (!m || !(m[1] in PADRAO_REGRAS)) return [404, { erro: "Seção desconhecida." }];
    if (metodo === "PUT") {
      var v = corpo && corpo.valor;
      if (!v || typeof v !== "object") return [422, { erro: "Faltam os campos." }];
      if (m[1] === "meta" && (typeof v.modelo_campanha !== "string" || v.modelo_campanha.split("{slug}").length !== 2)) return [422, { erro: "Regra do Meta: o modelo da campanha precisa ter {slug} uma vez (ex.: [{slug}])." }];
      if (m[1] === "procedimento" && !(typeof v.corte === "number" && v.corte >= 0 && v.corte <= 100000)) return [422, { erro: "Procedimento válido: o corte precisa ser um valor de R$ 0 a R$ 100.000." }];
      regras[m[1]] = v;
    } else if (metodo === "DELETE") {
      regras[m[1]] = JSON.parse(JSON.stringify(PADRAO_REGRAS[m[1]]));
    }
    gravar("bi-teste:regras", regras);
    return [200, estadoRegras()];
  }

  // ── /api/modulos ──
  function rotaModulos(metodo, caminho, corpo) {
    var L = M();
    if (!L) return null;
    var e = estado(), quando = ler(CHAVE_MUDANCAS, {});
    if (caminho === "/api/modulos" && metodo === "GET") {
      if (!gestao) return [200, { ligados: e }];
      return [200, { ligados: e, nucleo: L.NUCLEO, modulos: L.MODULOS.map(function (d) {
        return Object.assign({}, d, { ligado: e[d.chave], gravado: true, atualizado_em: quando[d.chave] || null, atualizado_por: quando[d.chave] ? "Gestão Teste" : null });
      }) }];
    }
    var m = caminho.match(/^\/api\/modulos\/([a-z_]+)$/);
    if (m && metodo === "PUT") {
      if (!gestao) return [403, { erro: "Seu acesso não permite esta ação." }];
      if (!L.ehModulo(m[1])) return [404, { erro: "Módulo desconhecido." }];
      var lig = corpo && corpo.ligado;
      if (typeof lig !== "boolean") return [422, { erro: "Diga se o módulo fica ligado (sim ou não)." }];
      if (e[m[1]] !== lig) { var ok = L.mudancaPermitida(m[1], lig, e); if (ok.erro) return [409, { erro: ok.erro }]; }
      e[m[1]] = lig; quando[m[1]] = new Date().toISOString();
      gravar(CHAVE, e); gravar(CHAVE_MUDANCAS, quando);
      return [200, { ok: true, chave: m[1], ligado: lig, ligados: e }];
    }
    return null;
  }

  // ── Metas e bônus (teste-metas.js) respeitando "Equipe" e "Metas por pessoa e bônus" ──
  var SO_DO_BONUS = /^\/api\/bonus\/(meses|resultado|cupons|lancamentos|faltas|indicador|indicadores|avaliacoes|minha\/registros|minha\/celebracao)/;
  function funcoes() { return ler(CHAVE_FUNCOES, {}); }
  /** a página da pessoa sem o bônus: o mesmo que o servidor manda (metas/rotas.ts › paginaDaPessoa) */
  function semBonus(d) {
    if (!d || !d.pessoa) return d;
    var f = funcoes()[d.pessoa.id];
    var funcao = f != null ? f : d.resultado ? d.resultado.funcao : null;
    var perfis = window.__perfisDe ? window.__perfisDe(funcao, f != null ? null : d.resultado ? d.resultado.indicador : null) : undefined;
    return Object.assign({}, d, { mes: null, meses: [], resultado: null, contexto: null, lancamento: null, alerta: null, meta_hoje: null, celebracao: null, bonus: false, perfis: perfis });
  }

  var fetchAnterior = window.fetch;
  window.fetch = function (entrada, opcoes) {
    var url = typeof entrada === "string" ? entrada : "";
    if (url.indexOf("/api/") !== 0) return fetchAnterior(entrada, opcoes);
    var u = new URL(url, location.href), caminho = u.pathname;
    var metodo = ((opcoes && opcoes.method) || "GET").toUpperCase();
    var corpo = null;
    try { corpo = opcoes && opcoes.body ? JSON.parse(opcoes.body) : null; } catch (e) { corpo = null; }

    if (caminho.indexOf("/api/modulos") === 0) { var rm = rotaModulos(metodo, caminho, corpo); if (rm) return resposta(rm); }
    if (caminho.indexOf("/api/regras-clinica") === 0) return resposta(rotaRegras(metodo, caminho, corpo));

    if (caminho.indexOf("/api/bonus") === 0) {
      var e = estado();
      if (!e.equipe) return resposta(desligado("equipe"));
      if (!e.bonus && SO_DO_BONUS.test(caminho)) return resposta(desligado("bonus"));
      // a página da pessoa: sem o bônus, sem os blocos dele
      if (!e.bonus && (caminho === "/api/bonus/minha" || /^\/api\/bonus\/pessoa\/\d+$/.test(caminho)) && metodo === "GET") {
        return fetchAnterior(entrada, opcoes).then(function (r) {
          return r.ok ? r.json().then(function (d) { return new Response(JSON.stringify(semBonus(d)), { status: 200, headers: { "Content-Type": "application/json" } }); }) : r;
        });
      }
      // o cadastro da equipe com a função (Ajustes › Pessoas e acessos)
      if (caminho === "/api/bonus/pessoas" && metodo === "GET") {
        return fetchAnterior(entrada, opcoes).then(function (r) {
          if (!r.ok) return r;
          return r.json().then(function (lista) {
            var fs = funcoes();
            var out = lista.map(function (p) {
              var cad = fs[p.id] != null ? fs[p.id] : p.funcao;
              return Object.assign({}, p, { funcao_cadastro: cad, funcao: e.bonus && p.ultimo_mes ? p.funcao : cad, ultimo_mes: e.bonus ? p.ultimo_mes : null });
            });
            return new Response(JSON.stringify(out), { status: 200, headers: { "Content-Type": "application/json" } });
          });
        });
      }
      var mp = caminho.match(/^\/api\/bonus\/pessoas\/(\d+)$/);
      if (mp && metodo === "PUT" && corpo && "funcao" in corpo) {
        var fs = funcoes(); fs[mp[1]] = String(corpo.funcao || "").trim().slice(0, 60) || null; gravar(CHAVE_FUNCOES, fs);
      }
      if (caminho === "/api/bonus/pessoas" && metodo === "POST" && corpo && corpo.funcao) {
        var f = String(corpo.funcao).trim().slice(0, 60);
        return fetchAnterior(entrada, opcoes).then(function (r) {
          return r.clone().json().then(function (d) { if (d && d.id) { var fs2 = funcoes(); fs2[d.id] = f; gravar(CHAVE_FUNCOES, fs2); } return r; }, function () { return r; });
        });
      }
    }
    return fetchAnterior(entrada, opcoes);
  };
})();
