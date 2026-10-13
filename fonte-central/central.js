// Central da Gestão Sem Caos — portal do administrador (v1).
// Login pelo Supabase Auth; a lista de acessos vem da tabela demo_acessos e a de BIs da central_bis (RLS: só administradores);
// criar, estender e revogar passam pelas edge functions, que conferem o administrador no servidor.
// Só a chave pública do Supabase fica aqui.
(function () {
  "use strict";

  var SUPABASE = "https://kwysrvuvgdovmwhptqaw.supabase.co";
  var CHAVE_PUBLICA = "sb_publishable_xq34BKVIUMI-18n21-Cnmw_QE8vQvuF";
  var CHAVE_SESSAO = "gsc-central:sessao";
  var NO_DOMINIO = /(^|\.)gestaosemcaos\.com\.br$/.test(location.hostname);
  // enquanto o DNS não aponta, a demonstração fica no endereço do GitHub Pages
  var DEMO_URL = NO_DOMINIO ? "https://demo.gestaosemcaos.com.br" : "https://wellington-dotcom.github.io/bi-demo/";

  // BIs: vêm da tabela central_bis (RLS: só administradores leem). Nada da lista fica neste código.
  var TIPOS_BI = { clinica: "Cliente", demo: "Dados fictícios" };

  var VALIDADES = [
    { rotulo: "2 h", horas: 2 }, { rotulo: "1 dia", horas: 24 }, { rotulo: "3 dias", horas: 72 }, { rotulo: "7 dias", horas: 168 },
    { rotulo: "Data e hora", horas: null },
  ];

  var sessao = null, eu = null, acessos = [], aba = "acessos", validadeEscolhida = 24, atualizador = null;

  // ── utilidades ──
  function $(s, raiz) { return (raiz || document).querySelector(s); }
  function el(tag, attrs, filhos) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "texto") e.textContent = attrs[k];
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) e.setAttribute(k, "");
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) { if (f != null) e.appendChild(typeof f === "string" ? document.createTextNode(f) : f); });
    return e;
  }
  function lerSessao() { try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO) || "null"); } catch (e) { return null; } }
  function gravarSessao(d) {
    sessao = d ? { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (Number(d.expires_in) || 3600) } : null;
    try { if (sessao) localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao)); else localStorage.removeItem(CHAVE_SESSAO); } catch (e) { /* segue */ }
  }
  function dataHora(iso) { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", " às"); }
  function duracao(ms) {
    var min = Math.max(1, Math.round(ms / 60000));
    if (min < 60) return min + " min";
    var h = Math.floor(min / 60), m = min % 60;
    if (h < 48) return h + " h" + (m && h < 10 ? " " + m + " min" : "");
    return Math.round(h / 24) + " dias";
  }
  function relativo(iso) {
    if (!iso) return "nunca entrou";
    var ms = Date.now() - new Date(iso).getTime();
    if (ms < 60000) return "agora";
    return "há " + duracao(ms);
  }
  function copiar(texto, botao) {
    var feito = function () { var t = botao.textContent; botao.textContent = "Copiado"; setTimeout(function () { botao.textContent = t; }, 1400); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(texto).then(feito, function () { copiarVelho(texto); feito(); });
    else { copiarVelho(texto); feito(); }
  }
  function copiarVelho(texto) {
    var t = el("textarea", { style: "position:fixed;opacity:0" }); t.value = texto; document.body.appendChild(t); t.select();
    try { document.execCommand("copy"); } catch (e) { /* segue */ } t.remove();
  }

  // ── Supabase (REST puro, sem biblioteca) ──
  function pedir(metodo, caminho, corpo, comToken) {
    var h = { apikey: CHAVE_PUBLICA, "Content-Type": "application/json" };
    var antes = comToken ? tokenFresco().then(function (t) { if (!t) throw new Error("sessao"); h.Authorization = "Bearer " + t; }) : Promise.resolve();
    return antes.then(function () {
      return fetch(SUPABASE + caminho, { method: metodo, headers: h, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    }).then(function (r) {
      return r.text().then(function (t) { var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; } return { status: r.status, dados: d }; });
    });
  }
  function tokenFresco() {
    if (!sessao) return Promise.resolve(null);
    if (sessao.expires_at * 1000 - Date.now() > 60000) return Promise.resolve(sessao.access_token);
    return pedir("POST", "/auth/v1/token?grant_type=refresh_token", { refresh_token: sessao.refresh_token }).then(function (r) {
      if (r.status === 200 && r.dados && r.dados.access_token) { gravarSessao(r.dados); return sessao.access_token; }
      gravarSessao(null); return null;
    });
  }
  function funcao(nome, corpo) {
    return pedir("POST", "/functions/v1/" + nome, corpo, true).then(function (r) {
      if (r.status === 200) return r.dados;
      if (r.status === 401) { sairDaConta("Sua sessão terminou. Entre de novo."); throw new Error("Sua sessão terminou."); }
      throw new Error((r.dados && (r.dados.erro || r.dados.message)) || "Não deu certo agora. Tente de novo.");
    });
  }

  // ── telas de entrada ──
  function tela(conteudo) { var raiz = $("#raiz"); raiz.innerHTML = ""; raiz.appendChild(conteudo); }

  function cartaoEntrada(titulo, sub, filhos) {
    return el("main", { class: "entrada" }, [el("div", { class: "cartao cartao-entrada" }, [
      el("div", { class: "logo" }, [logo()]),
      el("h1", { texto: titulo }), sub ? el("p", { class: "sub", texto: sub }) : null,
    ].concat(filhos))]);
  }
  function logo() { var d = el("div", { class: "logo-svg" }); d.innerHTML = window.__LOGO + '<span>Central</span>'; return d; }

  function telaLogin(aviso, tipoAviso) {
    var erro = el("p", { class: "erro", role: "alert", hidden: true });
    var email = el("input", { type: "email", autocomplete: "username", required: true, inputmode: "email", autocapitalize: "none", spellcheck: "false" });
    var senha = el("input", { type: "password", autocomplete: "current-password", required: true });
    var botao = el("button", { class: "botao", type: "submit", texto: "Entrar" });
    var form = el("form", { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      if (!email.value.trim() || !senha.value) { erro.textContent = "Preencha o e-mail e a senha."; erro.hidden = false; return; }
      botao.disabled = true; botao.textContent = "Entrando…"; erro.hidden = true;
      pedir("POST", "/auth/v1/token?grant_type=password", { email: email.value.trim().toLowerCase(), password: senha.value }).then(function (r) {
        if (r.status !== 200) throw new Error(r.status === 429 ? "Muitas tentativas. Espere um pouco." : r.status >= 500 ? "Não consegui falar com o servidor." : "E-mail ou senha não conferem.");
        gravarSessao(r.dados); return confirmarAdmin();
      }).catch(function (e) { erro.textContent = e.message; erro.hidden = false; botao.disabled = false; botao.textContent = "Entrar"; });
    } }, [
      el("label", { class: "campo" }, [el("span", { texto: "E-mail" }), email]),
      el("label", { class: "campo" }, [el("span", { texto: "Senha" }), senha]),
      erro, botao,
    ]);
    var esqueci = el("button", { class: "link", type: "button", texto: "Primeiro acesso ou esqueci a senha", onclick: function () { telaRecuperar(email.value.trim()); } });
    tela(cartaoEntrada("Entrar na Central", "Acessos de demonstração e BIs da Gestão Sem Caos.", [
      aviso ? el("div", { class: "aviso " + (tipoAviso || ""), role: "status", texto: aviso }) : null, form, el("div", { class: "rodape" }, [esqueci]),
    ]));
    setTimeout(function () { (email.value ? senha : email).focus(); }, 30);
  }

  function telaRecuperar(emailInicial) {
    var erro = el("p", { class: "erro", role: "alert", hidden: true });
    var email = el("input", { type: "email", autocomplete: "username", required: true, value: emailInicial || "" });
    var botao = el("button", { class: "botao", type: "submit", texto: "Enviar link" });
    var form = el("form", { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      if (!/.+@.+\..+/.test(email.value.trim())) { erro.textContent = "Digite o seu e-mail."; erro.hidden = false; return; }
      botao.disabled = true; botao.textContent = "Enviando…";
      var volta = location.origin + location.pathname;
      pedir("POST", "/auth/v1/recover?redirect_to=" + encodeURIComponent(volta), { email: email.value.trim().toLowerCase() }).then(function (r) {
        if (r.status === 429) throw new Error("Um link já foi enviado há pouco. Espere alguns minutos e confira o e-mail (e o spam).");
        if (r.status >= 400) throw new Error("Não consegui enviar agora. Tente de novo.");
        telaLogin("Se este e-mail tiver acesso à Central, chega em instantes um link para definir a senha. Confira também o spam.", "ok");
      }).catch(function (e) { erro.textContent = e.message; erro.hidden = false; botao.disabled = false; botao.textContent = "Enviar link"; });
    } }, [el("label", { class: "campo" }, [el("span", { texto: "E-mail" }), email]), erro, botao]);
    tela(cartaoEntrada("Definir senha", "Mandamos um link para o seu e-mail. Ao abrir, você escolhe a senha aqui mesmo.", [
      form, el("div", { class: "rodape" }, [el("button", { class: "link", type: "button", texto: "Voltar", onclick: function () { telaLogin(); } })]),
    ]));
    setTimeout(function () { email.focus(); }, 30);
  }

  function telaNovaSenha() {
    var erro = el("p", { class: "erro", role: "alert", hidden: true });
    var s1 = el("input", { type: "password", autocomplete: "new-password", required: true, minlength: "8" });
    var s2 = el("input", { type: "password", autocomplete: "new-password", required: true, minlength: "8" });
    var botao = el("button", { class: "botao", type: "submit", texto: "Salvar senha" });
    var form = el("form", { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      if (s1.value.length < 8) { erro.textContent = "Use pelo menos 8 caracteres."; erro.hidden = false; return; }
      if (s1.value !== s2.value) { erro.textContent = "As duas senhas não estão iguais."; erro.hidden = false; return; }
      botao.disabled = true; botao.textContent = "Salvando…";
      pedir("PUT", "/auth/v1/user", { password: s1.value }, true).then(function (r) {
        if (r.status !== 200) throw new Error((r.dados && (r.dados.msg || r.dados.message)) ? "Não aceitou essa senha: " + (r.dados.msg || r.dados.message) : "Não consegui salvar. Peça um link novo.");
        return confirmarAdmin();
      }).catch(function (e) { erro.textContent = e.message; erro.hidden = false; botao.disabled = false; botao.textContent = "Salvar senha"; });
    } }, [
      el("label", { class: "campo" }, [el("span", { texto: "Nova senha" }), s1]),
      el("label", { class: "campo" }, [el("span", { texto: "Repita a senha" }), s2]), erro, botao,
    ]);
    tela(cartaoEntrada("Escolha sua senha", "Pelo menos 8 caracteres. Ela fica só com você.", [form]));
    setTimeout(function () { s1.focus(); }, 30);
  }

  function confirmarAdmin() {
    return pedir("GET", "/auth/v1/user", undefined, true).then(function (r) {
      if (r.status !== 200) throw new Error("Sessão inválida. Entre de novo.");
      eu = r.dados;
      return pedir("GET", "/rest/v1/central_admins?select=user_id", undefined, true);
    }).then(function (r) {
      if (r.status !== 200 || !r.dados || !r.dados.length) { sairDaConta("Esta conta não é administradora da Central."); return; }
      telaPrincipal();
    });
  }

  function sairDaConta(aviso) {
    var t = sessao && sessao.access_token;
    if (t) fetch(SUPABASE + "/auth/v1/logout", { method: "POST", headers: { apikey: CHAVE_PUBLICA, Authorization: "Bearer " + t } }).catch(function () {});
    gravarSessao(null); eu = null; clearInterval(atualizador);
    telaLogin(aviso);
  }

  // ── tela principal ──
  function telaPrincipal() {
    var abas = el("nav", { class: "abas", role: "tablist" }, [
      botaoAba("acessos", "Acessos de demonstração"), botaoAba("bis", "BIs"),
    ]);
    var topo = el("header", { class: "topo" }, [
      logo(),
      el("div", { class: "quem" }, [el("span", { texto: eu && eu.email ? eu.email : "" }),
        el("button", { class: "link", type: "button", texto: "Sair", onclick: function () { sairDaConta(); } })]),
    ]);
    var corpo = el("div", { id: "corpo" });
    tela(el("div", { class: "pagina" }, [topo, abas, corpo]));
    desenharAba();
    clearInterval(atualizador);
    atualizador = setInterval(function () { if (aba === "acessos" && document.visibilityState === "visible") carregarAcessos(); }, 60000);
  }
  function botaoAba(id, rotulo) {
    return el("button", { type: "button", role: "tab", class: "aba", "aria-selected": String(aba === id), texto: rotulo, onclick: function () {
      aba = id; document.querySelectorAll(".aba").forEach(function (b) { b.setAttribute("aria-selected", String(b === this)); }, this); desenharAba();
    } });
  }
  function desenharAba() {
    var corpo = $("#corpo"); corpo.innerHTML = "";
    if (aba === "bis") corpo.appendChild(painelBis());
    else { corpo.appendChild(painelCriar()); corpo.appendChild(el("div", { id: "lista" })); carregarAcessos(); }
  }

  function painelBis() {
    var caixa = el("div", { class: "vazio", role: "status", texto: "Carregando…" });
    var secao = el("section", { class: "cartao" }, [el("h2", { texto: "BIs" }), caixa]);
    carregarBis(secao, caixa);
    return secao;
  }
  // a demo troca o token de uso único por uma sessão própria (função central-entrar-demo; não manda e-mail)
  function entrarNaDemo(url, botao) {
    botao.disabled = true; botao.textContent = "Entrando…";
    funcao("central-entrar-demo", {}).then(function (r) {
      location.href = url.replace(/\/$/, "") + "/#entrar=" + encodeURIComponent(r.token_hash);
    }).catch(function (e) { botao.disabled = false; botao.textContent = "Entrar"; alert(e.message); });
  }
  function carregarBis(secao, caixa) {
    pedir("GET", "/rest/v1/central_bis?select=id,nome,url,tipo&ativo=is.true&order=ordem.asc,nome.asc", undefined, true).then(function (r) {
      if (r.status === 401) { sairDaConta("Sua sessão terminou. Entre de novo."); return; }
      if (r.status !== 200 || !Array.isArray(r.dados)) throw new Error();
      var bis = r.dados;
      if (!bis.length) { caixa.textContent = "Nenhum BI cadastrado ainda."; return; }
      secao.replaceChild(el("ul", { class: "linhas" }, bis.map(function (b) {
        // enquanto o DNS não aponta, a demonstração abre no endereço do GitHub Pages
        var url = b.tipo === "demo" ? DEMO_URL : b.url;
        return el("li", { class: "linha" }, [
          el("div", { class: "linha-txt" }, [el("b", { texto: b.nome }), el("span", { texto: url.replace(/^https:\/\//, "").replace(/\/$/, "") + " · " + (TIPOS_BI[b.tipo] || b.tipo) })]),
          // abre na mesma aba (o BI tem o botão "Central" para voltar); na demo, já entra com a conta de administrador
          b.tipo === "demo"
            ? el("button", { class: "botao-mini", type: "button", texto: "Entrar", onclick: function (ev) { entrarNaDemo(url, ev.currentTarget); } })
            : el("a", { class: "botao-mini", href: url, texto: "Abrir" }),
        ]);
      })), caixa);
    }).catch(function () {
      caixa.textContent = "";
      caixa.appendChild(el("span", { class: "erro", texto: "Não consegui carregar os BIs agora. " }));
      caixa.appendChild(el("button", { class: "link", type: "button", texto: "Tentar de novo", onclick: function () { caixa.textContent = "Carregando…"; carregarBis(secao, caixa); } }));
    });
  }

  // ── criar acesso ──
  function painelCriar() {
    var erro = el("p", { class: "erro", role: "alert", hidden: true });
    var nome = el("input", { type: "text", placeholder: "Nome da pessoa", autocomplete: "off", maxlength: "120" });
    var quando = el("input", { type: "datetime-local", hidden: true });
    var chips = el("div", { class: "chips", role: "radiogroup", "aria-label": "Validade" }, VALIDADES.map(function (v) {
      return el("button", { type: "button", class: "chip", role: "radio", "aria-checked": String(v.horas === validadeEscolhida), texto: v.rotulo, onclick: function () {
        validadeEscolhida = v.horas;
        chips.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-checked", String(c === this)); }, this);
        quando.hidden = v.horas !== null;
        if (v.horas === null) { if (!quando.value) quando.value = paraLocal(new Date(Date.now() + 2 * 86400000)); quando.focus(); }
      } });
    }));
    var botao = el("button", { class: "botao botao-auto", type: "submit", texto: "Criar acesso" });
    var resultado = el("div", { id: "resultado" });
    var form = el("form", { class: "criar", novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      erro.hidden = true;
      var corpo = { nome: nome.value.trim() };
      if (corpo.nome.length < 2) { erro.textContent = "Diga o nome da pessoa."; erro.hidden = false; nome.focus(); return; }
      if (validadeEscolhida === null) {
        if (!quando.value) { erro.textContent = "Escolha a data e a hora."; erro.hidden = false; return; }
        corpo.expira_em = new Date(quando.value).toISOString();
      } else corpo.horas = validadeEscolhida;
      botao.disabled = true; botao.textContent = "Criando…";
      funcao("central-criar-acesso", corpo).then(function (d) {
        nome.value = "";
        mostrarCriado(resultado, d);
        carregarAcessos();
      }).catch(function (e) { erro.textContent = e.message; erro.hidden = false; })
        .then(function () { botao.disabled = false; botao.textContent = "Criar acesso"; });
    } }, [el("div", { class: "criar-linha" }, [nome, botao]), el("div", { class: "criar-validade" }, [el("span", { class: "rotulo", texto: "Validade" }), chips, quando]), erro]);
    return el("section", { class: "cartao" }, [el("h2", { texto: "Novo acesso" }), form, resultado]);
  }
  function paraLocal(d) { var z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 16); }

  function mensagemWhatsApp(nome, login, senha, expira) {
    var primeiro = nome.split(" ")[0];
    return "Olá, " + primeiro + "! Aqui está o seu acesso à demonstração do BI da Gestão Sem Caos:\n\n" +
      "Endereço: " + DEMO_URL + "\nLogin: " + login + "\nSenha: " + senha + "\n\n" +
      "Vale até " + dataHora(expira) + ". Os dados são fictícios, então fique à vontade para mexer: a cada entrada tudo volta ao padrão.";
  }

  function mostrarCriado(caixa, d) {
    var msg = mensagemWhatsApp(d.acesso.nome, d.login, d.senha, d.acesso.expira_em);
    var b1 = el("button", { type: "button", class: "botao-mini", texto: "Copiar", onclick: function () { copiar(d.login, b1); } });
    var b2 = el("button", { type: "button", class: "botao-mini", texto: "Copiar", onclick: function () { copiar(d.senha, b2); } });
    var b3 = el("button", { type: "button", class: "botao botao-auto", texto: "Copiar mensagem", onclick: function () { copiar(msg, b3); } });
    caixa.innerHTML = "";
    caixa.appendChild(el("div", { class: "criado", role: "status" }, [
      el("div", { class: "criado-topo" }, [
        el("b", { texto: "Acesso criado para " + d.acesso.nome }),
        el("button", { type: "button", class: "link", texto: "Fechar", onclick: function () { caixa.innerHTML = ""; } }),
      ]),
      el("p", { class: "nota", texto: "A senha aparece só agora. Copie antes de fechar." }),
      el("div", { class: "credencial" }, [el("span", { texto: "Login" }), el("code", { texto: d.login }), b1]),
      el("div", { class: "credencial" }, [el("span", { texto: "Senha" }), el("code", { texto: d.senha }), b2]),
      el("pre", { class: "mensagem", texto: msg }),
      el("div", { class: "criado-acoes" }, [b3,
        el("a", { class: "botao-mini", href: "https://wa.me/?text=" + encodeURIComponent(msg), target: "_blank", rel: "noopener", texto: "Abrir no WhatsApp" })]),
    ]));
  }

  // ── lista ──
  function status(a) {
    if (a.revogado) return { classe: "revogado", texto: "Revogado", ordem: 2 };
    var falta = new Date(a.expira_em).getTime() - Date.now();
    if (falta <= 0) return { classe: "expirado", texto: "Expirado em " + dataHora(a.expira_em), ordem: 1 };
    return { classe: "ativo", texto: "Ativo · expira em " + duracao(falta), ordem: 0 };
  }

  function carregarAcessos() {
    return pedir("GET", "/rest/v1/demo_acessos?select=id,nome,login,expira_em,criado_em,ultimo_acesso,acessos,revogado&user_id=not.is.null&order=criado_em.desc&limit=200", undefined, true)
      .then(function (r) {
        if (r.status === 401) { sairDaConta("Sua sessão terminou. Entre de novo."); return; }
        if (r.status !== 200) throw new Error();
        acessos = r.dados || [];
        desenharLista();
      }).catch(function () { var l = $("#lista"); if (l && !acessos.length) l.textContent = "Não consegui carregar a lista agora."; });
  }

  function desenharLista() {
    var lista = $("#lista"); if (!lista) return;
    var ativos = acessos.filter(function (a) { return status(a).ordem === 0; })
      .sort(function (a, b) { return new Date(a.expira_em) - new Date(b.expira_em); });
    var outros = acessos.filter(function (a) { return status(a).ordem !== 0; });
    lista.innerHTML = "";
    lista.appendChild(el("section", { class: "cartao" }, [
      el("h2", { texto: "Ativos" + (ativos.length ? " · " + ativos.length : "") }),
      ativos.length ? el("ul", { class: "linhas" }, ativos.map(linhaAcesso)) : el("p", { class: "vazio", texto: "Nenhum acesso ativo agora." }),
    ]));
    if (outros.length) lista.appendChild(el("section", { class: "cartao" }, [
      el("h2", { texto: "Encerrados · " + outros.length }), el("ul", { class: "linhas" }, outros.map(linhaAcesso)),
    ]));
  }

  function linhaAcesso(a) {
    var st = status(a);
    var acoes = el("div", { class: "acoes" });
    if (!a.revogado) {
      var menu = el("div", { class: "menu-estender", hidden: true }, VALIDADES.map(function (v) {
        if (v.horas === null) {
          var campo = el("input", { type: "datetime-local", value: paraLocal(new Date(Math.max(Date.now(), new Date(a.expira_em).getTime()) + 86400000)) });
          return el("div", { class: "menu-data" }, [campo, el("button", { type: "button", class: "botao-mini", texto: "Até essa data", onclick: function () {
            if (campo.value) acao("central-estender", { id: a.id, expira_em: new Date(campo.value).toISOString() }, menu);
          } })]);
        }
        return el("button", { type: "button", class: "chip", texto: "+ " + v.rotulo, onclick: function () { acao("central-estender", { id: a.id, horas: v.horas }, menu); } });
      }));
      acoes.appendChild(el("button", { type: "button", class: "botao-mini", texto: "Estender", onclick: function () {
        document.querySelectorAll(".menu-estender").forEach(function (m) { if (m !== menu) m.hidden = true; });
        menu.hidden = !menu.hidden;
      } }));
      acoes.appendChild(el("button", { type: "button", class: "botao-mini perigo", texto: "Revogar", onclick: function () {
        if (confirm("Revogar o acesso de " + a.nome + "? A pessoa sai da demonstração em poucos minutos e o login não volta a funcionar.")) acao("central-revogar", { id: a.id });
      } }));
      return el("li", { class: "linha linha-acesso" }, [conteudoLinha(a, st), acoes, menu]);
    }
    return el("li", { class: "linha linha-acesso" }, [conteudoLinha(a, st), acoes]);
  }
  function conteudoLinha(a, st) {
    return el("div", { class: "linha-txt" }, [
      el("b", {}, [a.nome, el("code", { texto: a.login })]),
      el("span", {}, [el("i", { class: "status " + st.classe, texto: st.texto }),
        " · " + (a.ultimo_acesso ? "último acesso " + relativo(a.ultimo_acesso) : "ainda não entrou") + " · " + a.acessos + (a.acessos === 1 ? " entrada" : " entradas")]),
    ]);
  }
  function acao(nome, corpo, menu) {
    funcao(nome, corpo).then(function () { if (menu) menu.hidden = true; return carregarAcessos(); })
      .catch(function (e) { alert(e.message); });
  }

  // ── início: link do e-mail (#access_token=…&type=recovery|invite), sessão guardada ou login ──
  function comecar() {
    var h = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (h.get("error") || h.get("error_code")) {
      history.replaceState(null, "", location.pathname);
      var exp = /expired|otp_expired/.test(h.get("error_code") || "") || /expired/i.test(h.get("error_description") || "");
      telaLogin(exp ? "Esse link já venceu. Peça um novo em “Primeiro acesso ou esqueci a senha”." : "Esse link não funcionou. Peça um novo.", "alerta");
      return;
    }
    if (h.get("access_token")) {
      gravarSessao({ access_token: h.get("access_token"), refresh_token: h.get("refresh_token"), expires_at: Number(h.get("expires_at")) || 0, expires_in: Number(h.get("expires_in")) || 3600 });
      if (!sessao.expires_at) gravarSessao({ access_token: h.get("access_token"), refresh_token: h.get("refresh_token"), expires_in: Number(h.get("expires_in")) || 3600 });
      var tipo = h.get("type");
      history.replaceState(null, "", location.pathname);
      if (tipo === "recovery" || tipo === "invite" || tipo === "signup") { telaNovaSenha(); return; }
      confirmarAdmin().catch(function () { sairDaConta("Entre de novo."); });
      return;
    }
    sessao = lerSessao();
    if (sessao) confirmarAdmin().catch(function () { sairDaConta(); });
    else telaLogin();
  }
  window.addEventListener("focus", function () { if (eu && aba === "acessos" && $("#lista")) carregarAcessos(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", comecar); else comecar();
})();
