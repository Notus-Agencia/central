// Demonstração do BI · Gestão Sem Caos — portão de entrada.
// Login próprio (Supabase Auth), validade conferida no servidor (rpc demo_sessao_valida) a cada entrada, a cada poucos
// minutos e ao voltar para a aba. A cada login novo o navegador volta às configurações padrão (apaga o estado salvo do
// simulador) antes de o BI carregar. Só a chave pública do Supabase fica aqui.
(function () {
  "use strict";

  var SUPABASE = "https://kwysrvuvgdovmwhptqaw.supabase.co";
  var CHAVE_PUBLICA = "sb_publishable_xq34BKVIUMI-18n21-Cnmw_QE8vQvuF";
  var DOMINIO = "demo.gestaosemcaos.com.br";
  var CHAVE_SESSAO = "gsc-demo:sessao"; // sessionStorage: fechar a aba encerra a sessão
  var CHAVE_AVISO = "gsc-demo:aviso";
  var REVALIDAR_MS = 3 * 60 * 1000;
  var WHATSAPP = "https://wa.me/5562994029664?text=" + encodeURIComponent("Olá! Quero falar sobre a demonstração do BI da Gestão Sem Caos.");
  var APP = window.__DEMO_APP; // { css, modulo, scripts } — escrito na montagem

  var MENSAGENS = {
    expirado: "Seu acesso de demonstração expirou. Fale com a Gestão Sem Caos.",
    revogado: "Seu acesso de demonstração foi encerrado. Fale com a Gestão Sem Caos.",
    sem_acesso: "Este login não tem acesso à demonstração. Fale com a Gestão Sem Caos.",
    sem_sessao: "Sua sessão terminou. Entre de novo.",
  };

  var sessao = lerSessao();
  var dados = null; // { nome, login, expira_em }
  var appCarregado = false;
  var ultimaValidacao = 0;
  var relogio = null;

  function $(id) { return document.getElementById(id); }
  function lerSessao() { try { return JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || "null"); } catch (e) { return null; } }
  function gravarSessao(s) { sessao = s; try { sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(s)); } catch (e) { /* vale até recarregar */ } }

  // volta às configurações padrão: apaga tudo que o simulador e o BI guardaram neste navegador
  function limparTudo() {
    try { localStorage.clear(); } catch (e) { /* sem armazenamento */ }
    try { sessionStorage.clear(); } catch (e) { /* sem armazenamento */ }
  }

  function pedir(caminho, corpo, token) {
    var h = { apikey: CHAVE_PUBLICA, "Content-Type": "application/json" };
    if (token) h.Authorization = "Bearer " + token;
    return fetch(SUPABASE + caminho, { method: "POST", headers: h, body: JSON.stringify(corpo || {}) }).then(function (r) {
      return r.text().then(function (t) { var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; } return { status: r.status, dados: d }; });
    });
  }

  function guardarTokens(d) {
    gravarSessao({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600) });
  }

  // token válido (renova um minuto antes de vencer); null se não deu para renovar
  function tokenFresco() {
    if (!sessao) return Promise.resolve({ token: null, motivo: "sem_sessao" });
    if (sessao.expires_at * 1000 - Date.now() > 60000) return Promise.resolve({ token: sessao.access_token });
    return pedir("/auth/v1/token?grant_type=refresh_token", { refresh_token: sessao.refresh_token }).then(function (r) {
      if (r.status === 200 && r.dados && r.dados.access_token) { guardarTokens(r.dados); return { token: sessao.access_token }; }
      var codigo = r.dados && (r.dados.error_code || r.dados.code);
      if (r.status >= 500) throw new Error("rede");
      return { token: null, motivo: codigo === "user_banned" ? "revogado" : "sem_sessao" };
    });
  }

  function validar(novoLogin) {
    return tokenFresco().then(function (t) {
      if (!t.token) return { valido: false, motivo: t.motivo };
      return pedir("/rest/v1/rpc/demo_sessao_valida", { p_novo_login: !!novoLogin }, t.token).then(function (r) {
        if (r.status === 200 && r.dados) { ultimaValidacao = Date.now(); return r.dados; }
        if (r.status === 401 || r.status === 403) return { valido: false, motivo: "sem_sessao" };
        throw new Error("rede");
      });
    });
  }

  function sair(motivo) {
    var token = sessao && sessao.access_token;
    if (token) { try { pedir("/auth/v1/logout", {}, token).catch(function () {}); } catch (e) { /* segue */ } }
    limparTudo();
    if (motivo && MENSAGENS[motivo]) { try { sessionStorage.setItem(CHAVE_AVISO, motivo); } catch (e) { /* segue */ } }
    location.replace(location.pathname);
  }

  // ── tela de login ──
  function mostrarLogin(aviso) {
    $("gsc-carregando").hidden = true;
    $("gsc-portao").hidden = false;
    var caixa = $("gsc-aviso");
    if (aviso) {
      caixa.hidden = false;
      $("gsc-aviso-texto").textContent = MENSAGENS[aviso] || aviso;
      $("gsc-aviso-zap").hidden = !(aviso === "expirado" || aviso === "revogado" || aviso === "sem_acesso");
    } else caixa.hidden = true;
    setTimeout(function () { $("gsc-login").focus(); }, 30);
  }

  function erroNoForm(msg) { var e = $("gsc-erro"); e.textContent = msg; e.hidden = !msg; }

  function aoEntrar(ev) {
    ev.preventDefault();
    var login = $("gsc-login").value.trim().toLowerCase();
    var senha = $("gsc-senha").value;
    if (!login || !senha) { erroNoForm("Preencha o login e a senha."); return; }
    var email = login.indexOf("@") >= 0 ? login : login + "@" + DOMINIO;
    var botao = $("gsc-entrar");
    botao.disabled = true; botao.textContent = "Entrando…"; erroNoForm("");
    pedir("/auth/v1/token?grant_type=password", { email: email, password: senha }).then(function (r) {
      if (r.status !== 200 || !r.dados || !r.dados.access_token) {
        var codigo = r.dados && (r.dados.error_code || r.dados.code);
        if (codigo === "user_banned") { mostrarLogin("revogado"); return null; }
        if (r.status === 429) throw new Error("Muitas tentativas. Espere um pouco e tente de novo.");
        if (r.status >= 500) throw new Error("Não consegui falar com o servidor. Tente de novo.");
        throw new Error("Login ou senha não conferem.");
      }
      // login novo: começa do zero (configurações padrão) e só então guarda a sessão
      limparTudo();
      guardarTokens(r.dados);
      return validar(true).then(function (v) {
        if (!v.valido) { sair(v.motivo); return; }
        iniciar(v);
      });
    }).catch(function (e) {
      erroNoForm(e && e.message && e.message !== "rede" ? e.message : "Não consegui falar com o servidor. Tente de novo.");
    }).then(function () { botao.disabled = false; botao.textContent = "Entrar"; });
  }

  // ── o BI ──
  function carregarScript(src) {
    return new Promise(function (ok, falhou) {
      var s = document.createElement("script");
      s.src = src; s.charset = "utf-8"; s.onload = ok; s.onerror = falhou;
      document.head.appendChild(s);
    });
  }

  function resposta(status, corpo) {
    return Promise.resolve(new Response(JSON.stringify(corpo), { status: status, headers: { "Content-Type": "application/json" } }));
  }

  // por fora de todos os simuladores: quem está logado é a pessoa da demonstração, com a visão da gestão
  function instalarIdentidade() {
    var anterior = window.fetch.bind(window);
    var email = dados.login + "@" + DOMINIO;
    window.fetch = function (entrada, opcoes) {
      var url = typeof entrada === "string" ? entrada : "";
      if (url.indexOf("/api/") === 0) {
        var metodo = ((opcoes && opcoes.method) || "GET").toUpperCase();
        var caminho = url.split("?")[0];
        if (caminho === "/api/auth/eu") return resposta(200, { id: 1, nome: dados.nome, email: email, papel: "admin", ve_pacientes: true });
        if (caminho === "/api/auth/logout") { setTimeout(function () { sair(); }, 30); return resposta(200, { ok: true }); }
        if (caminho === "/api/perfil" && metodo === "GET") {
          return anterior(entrada, opcoes).then(function (r) { return r.json(); }).then(function (p) {
            p = p || {}; p.nome = dados.nome; p.email = email; p.papel = "admin";
            return resposta(200, p);
          });
        }
      }
      return anterior(entrada, opcoes);
    };
  }

  function iniciar(v) {
    dados = v;
    $("gsc-portao").hidden = true;
    $("gsc-carregando").hidden = false;
    if (appCarregado) return;
    appCarregado = true;
    // a demonstração sempre abre na visão da gestão
    if (location.hash || location.search) history.replaceState(null, "", location.pathname);
    var css = document.createElement("link");
    css.rel = "stylesheet"; css.href = APP.css; css.crossOrigin = "";
    document.head.appendChild(css);
    APP.scripts.reduce(function (p, src) { return p.then(function () { return carregarScript(src); }); }, Promise.resolve())
      .then(function () {
        instalarIdentidade();
        var m = document.createElement("script");
        m.type = "module"; m.crossOrigin = ""; m.src = APP.modulo;
        document.head.appendChild(m);
        $("gsc-carregando").hidden = true;
        $("gsc-faixa").hidden = false;
        $("gsc-faixa").title = "Acesso válido até " + new Date(dados.expira_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
        vigiar();
      })
      .catch(function () { $("gsc-carregando").textContent = "Não consegui carregar a demonstração. Recarregue a página."; });
  }

  // ── revalidação: a cada poucos minutos, ao voltar para a aba e na hora exata do vencimento ──
  function revalidar() {
    if (!appCarregado) return;
    validar(false).then(function (v) {
      if (!v.valido) sair(v.motivo);
      else { dados.expira_em = v.expira_em; agendarVencimento(); }
    }).catch(function () { /* sem rede: tenta de novo na próxima */ });
  }
  function agendarVencimento() {
    clearTimeout(relogio);
    var falta = new Date(dados.expira_em).getTime() - Date.now() + 1500;
    if (falta > 0 && falta < 2147483000) relogio = setTimeout(revalidar, falta);
  }
  function vigiar() {
    setInterval(revalidar, REVALIDAR_MS);
    agendarVencimento();
    function aoVoltar() { if (document.visibilityState === "visible" && Date.now() - ultimaValidacao > 15000) revalidar(); }
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
  }

  // ── início ──
  function comecar() {
    $("gsc-form").addEventListener("submit", aoEntrar);
    $("gsc-sair").addEventListener("click", function () { sair(); });
    $("gsc-aviso-zap").href = WHATSAPP;
    var aviso = null;
    try { aviso = sessionStorage.getItem(CHAVE_AVISO); sessionStorage.removeItem(CHAVE_AVISO); } catch (e) { /* segue */ }
    if (!sessao) { mostrarLogin(aviso); return; }
    // recarregou a página com a sessão aberta: confere no servidor e segue (sem apagar o que a pessoa mexeu)
    validar(false).then(function (v) { if (v.valido) iniciar(v); else sair(v.motivo); })
      .catch(function () { mostrarLogin("Não consegui falar com o servidor. Tente de novo."); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", comecar);
  else comecar();
})();
