// Central da Gestão Sem Caos — portal do administrador (Onda 7: Clínicas, Acessos de demonstração, BIs e Uso).
// Login pelo Supabase Auth; a lista de acessos vem da tabela demo_acessos e a de BIs da central_bis (RLS: só administradores);
// criar, estender e revogar passam pelas edge functions, que conferem o administrador no servidor.
// Só a chave pública do Supabase fica aqui.
(function () {
  "use strict";

  var SUPABASE = "https://kwysrvuvgdovmwhptqaw.supabase.co";
  var CHAVE_PUBLICA = "sb_publishable_xq34BKVIUMI-18n21-Cnmw_QE8vQvuF";
  var CHAVE_SESSAO = "gsc-central:sessao";
  var DEMO_URL = "https://demo.gestaosemcaos.com.br";

  // BIs: vêm da tabela central_bis (RLS: só administradores leem). Nada da lista fica neste código.
  var TIPOS_BI = { clinica: "Cliente", demo: "Dados fictícios" };

  var VALIDADES = [
    { rotulo: "2 h", horas: 2 }, { rotulo: "1 dia", horas: 24 }, { rotulo: "3 dias", horas: 72 }, { rotulo: "7 dias", horas: 168 },
    { rotulo: "Data e hora", horas: null },
  ];

  var sessao = null, eu = null, acessos = [], aba = "clinicas", validadeEscolhida = 24, atualizador = null;

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
    // "username webauthn": o campo de e-mail oferece a chave de acesso guardada no aparelho (ofertarChave)
    var email = el("input", { type: "email", autocomplete: "username webauthn", required: true, inputmode: "email", autocapitalize: "none", spellcheck: "false" });
    var senha = el("input", { type: "password", autocomplete: "current-password", required: true });
    var botao = el("button", { class: "botao", type: "submit", texto: "Entrar" });
    var form = el("form", { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      if (!email.value.trim() || !senha.value) { erro.textContent = "Preencha o e-mail e a senha."; erro.hidden = false; return; }
      botao.disabled = true; botao.textContent = "Entrando…"; erro.hidden = true;
      cancelarChave();
      pedir("POST", "/auth/v1/token?grant_type=password", { email: email.value.trim().toLowerCase(), password: senha.value }).then(function (r) {
        if (r.status !== 200) throw new Error(r.status === 429 ? "Muitas tentativas. Espere um pouco." : r.status >= 500 ? "Não consegui falar com o servidor." : "E-mail ou senha não conferem.");
        gravarSessao(r.dados); return confirmarAdmin().then(guardarChaveSozinho);
      }).catch(function (e) { erro.textContent = e.message; erro.hidden = false; botao.disabled = false; botao.textContent = "Entrar"; ofertarChave(erro); });
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
    ofertarChave(erro);
  }

  // ── chave de acesso (passkey; função central-chave-acesso; SimpleWebAuthn em webauthn-13.3.0.min.js) ──
  // Sem botão na tela de entrar (pedido do dono): o navegador oferece a chave no campo de e-mail e, depois da senha, guarda uma sozinho.
  var W = window.SimpleWebAuthnBrowser;
  function chave(corpo, comToken) { return pedir("POST", "/functions/v1/central-chave-acesso", corpo, comToken).then(function (r) { return r.dados || {}; }); }
  function cancelarChave() { try { if (W && W.WebAuthnAbortService) W.WebAuthnAbortService.cancelCeremony(); } catch (e) { /* segue */ } }
  function ofertarChave(erro) {
    if (!W || !W.browserSupportsWebAuthnAutofill) return;
    W.browserSupportsWebAuthnAutofill().then(function (pode) {
      if (!pode) return;
      return chave({ acao: "entrar-opcoes" }).then(function (o) {
        if (!o || !o.challenge) return;
        return W.startAuthentication({ optionsJSON: o, useBrowserAutofill: true }).then(function (resposta) {
          return chave({ acao: "entrar", resposta: resposta });
        }).then(function (r) {
          if (!r.ok || !r.token_hash) throw new Error("chave");
          return pedir("POST", "/auth/v1/verify", { type: "magiclink", token_hash: r.token_hash });
        }).then(function (r) {
          if (r.status !== 200 || !r.dados || !r.dados.access_token) throw new Error("chave");
          gravarSessao(r.dados); return confirmarAdmin();
        });
      });
    }).catch(function (e) {
      if (e && (e.name === "AbortError" || e.name === "NotAllowedError")) return;
      if (erro) { erro.textContent = "Não deu para entrar com a chave de acesso. Entre com a senha."; erro.hidden = false; }
    });
  }
  function guardarChaveSozinho() {
    if (!eu || !W || !W.browserSupportsWebAuthn || !W.browserSupportsWebAuthn()) return;
    chave({ acao: "criar-opcoes" }, true).then(function (o) {
      if (!o || !o.challenge) return;
      return W.startRegistration({ optionsJSON: o, useAutoRegister: true }).then(function (resposta) { return chave({ acao: "criar", resposta: resposta }, true); });
    }).catch(function () { /* o navegador decide; sem chave, segue a senha */ });
  }

  // ── Segurança (pedido do dono: em todo site, trocar a senha e a chave de acesso no mesmo lugar) ──
  function painelSeguranca() {
    var caixa = el("div", { class: "clinicas" });
    var erroSenha = el("p", { class: "erro", role: "alert", hidden: true });
    var okSenha = el("p", { class: "nota", role: "status", hidden: true });
    var s1 = el("input", { type: "password", autocomplete: "new-password", minlength: "8" });
    var s2 = el("input", { type: "password", autocomplete: "new-password", minlength: "8" });
    var salvar = el("button", { class: "botao botao-auto", type: "submit", texto: "Trocar a senha" });
    caixa.appendChild(el("section", { class: "cartao" }, [
      el("h2", { texto: "Senha" }),
      el("form", { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault(); erroSenha.hidden = true; okSenha.hidden = true;
        if (s1.value.length < 8) { erroSenha.textContent = "Use pelo menos 8 caracteres."; erroSenha.hidden = false; return; }
        if (s1.value !== s2.value) { erroSenha.textContent = "As duas senhas não estão iguais."; erroSenha.hidden = false; return; }
        salvar.disabled = true;
        pedir("PUT", "/auth/v1/user", { password: s1.value }, true).then(function (r) {
          if (r.status !== 200) throw new Error((r.dados && (r.dados.msg || r.dados.message)) ? "Não aceitou essa senha: " + (r.dados.msg || r.dados.message) : "Não consegui trocar agora.");
          s1.value = ""; s2.value = ""; okSenha.textContent = "Senha trocada."; okSenha.hidden = false;
        }).catch(function (e) { erroSenha.textContent = e.message; erroSenha.hidden = false; }).then(function () { salvar.disabled = false; });
      } }, [
        el("label", { class: "campo" }, [el("span", { texto: "Nova senha" }), s1]),
        el("label", { class: "campo" }, [el("span", { texto: "Repita a senha" }), s2]), erroSenha, okSenha, salvar,
      ]),
    ]));
    var lista = el("ul", { class: "linhas" });
    var msg = el("p", { class: "nota", role: "status" });
    var criar = el("button", { type: "button", class: "botao-mini forte", texto: "Criar chave de acesso neste aparelho", hidden: true, onclick: function () {
      criar.disabled = true; msg.textContent = "";
      chave({ acao: "criar-opcoes" }, true).then(function (o) {
        if (o && o.erro === "limite") throw new Error("limite");
        if (!o || !o.challenge) throw new Error("rede");
        return W.startRegistration({ optionsJSON: o });
      }).then(function (resposta) { return chave({ acao: "criar", resposta: resposta }, true); }).then(function (r) {
        if (!r.ok) throw new Error("criar");
        mostrar(r.aparelhos); msg.textContent = "Chave de acesso criada. Na próxima vez, toque no campo de e-mail e escolha a chave.";
      }).catch(function (x) {
        var n = x && x.name, m = x && x.message;
        if (n === "NotAllowedError" || n === "AbortError") return;
        msg.textContent = n === "InvalidStateError" ? "Este aparelho já tem uma chave de acesso." : m === "limite" ? "Já são 10 aparelhos. Tire um antes de criar outro." : "Não deu para criar a chave de acesso. Tente de novo.";
      }).then(function () { criar.disabled = false; });
    } });
    function mostrar(aparelhos) {
      lista.innerHTML = "";
      if (!aparelhos || !aparelhos.length) { lista.appendChild(el("li", { class: "linha" }, [el("span", { class: "vazio", texto: "Nenhuma chave de acesso ainda." })])); return; }
      aparelhos.forEach(function (a) {
        var tirar = el("button", { type: "button", class: "botao-mini", texto: "Tirar", onclick: function () {
          tirar.disabled = true;
          chave({ acao: "tirar", id: a.id }, true).then(function (r) { if (!r.ok) throw new Error(); mostrar(r.aparelhos); msg.textContent = "Chave de acesso tirada."; })
            .catch(function () { tirar.disabled = false; msg.textContent = "Não deu para tirar agora. Tente de novo."; });
        } });
        lista.appendChild(el("li", { class: "linha" }, [
          el("div", { class: "linha-txt" }, [el("b", { texto: a.apelido }), el("span", { texto: "Criada em " + dataHora(a.criado_em) + (a.usado_em ? " · último uso " + dataHora(a.usado_em) : "") })]),
          tirar,
        ]));
      });
    }
    caixa.appendChild(el("section", { class: "cartao" }, [
      el("div", { class: "detalhe-topo" }, [el("h2", { texto: "Chave de acesso" }), criar]),
      el("p", { class: "nota", texto: "Entre com a digital ou o rosto, sem digitar a senha. Na tela de entrar, toque no campo de e-mail e escolha a chave. A senha continua valendo." }),
      lista, msg,
    ]));
    chave({ acao: "listar" }, true).then(function (r) { if (r.ok) mostrar(r.aparelhos); }).catch(function () { msg.textContent = "Não consegui carregar as chaves agora."; });
    if (W && W.platformAuthenticatorIsAvailable) W.platformAuthenticatorIsAvailable().then(function (tem) { criar.hidden = !tem; }).catch(function () {});
    return caixa;
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
      botaoAba("clinicas", "Clínicas"), botaoAba("acessos", "Acessos de demonstração"), botaoAba("bis", "BIs"), botaoAba("uso", "Uso"),
    ]);
    var topo = el("header", { class: "topo" }, [
      logo(),
      el("div", { class: "quem" }, [el("span", { texto: eu && eu.email ? eu.email : "" }),
        el("button", { class: "link", type: "button", texto: "Segurança", onclick: function () {
          aba = "seguranca"; document.querySelectorAll(".aba").forEach(function (b) { b.setAttribute("aria-selected", "false"); }); desenharAba();
        } }),
        el("button", { class: "link", type: "button", texto: "Sair", onclick: function () { sairDaConta(); } })]),
    ]);
    var corpo = el("div", { id: "corpo" });
    tela(el("div", { class: "pagina" }, [topo, abas, corpo]));
    desenharAba();
    clearInterval(atualizador);
    atualizador = setInterval(function () { if (aba === "acessos" && document.visibilityState === "visible") carregarAcessos(); }, 60000);
  }
  function botaoAba(id, rotulo) {
    return el("button", { type: "button", role: "tab", class: "aba", "data-aba": id, "aria-selected": String(aba === id), texto: rotulo, onclick: function () {
      aba = id; document.querySelectorAll(".aba").forEach(function (b) { b.setAttribute("aria-selected", String(b === this)); }, this); desenharAba();
    } });
  }
  function desenharAba() {
    var corpo = $("#corpo"); corpo.innerHTML = "";
    if (aba === "clinicas") corpo.appendChild(painelClinicas());
    else if (aba === "bis") corpo.appendChild(painelBis());
    else if (aba === "uso") corpo.appendChild(painelUso());
    else if (aba === "seguranca") corpo.appendChild(painelSeguranca());
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
    listaBis().then(function (bis) {
      if (!bis) return;
      if (!bis.length) { caixa.textContent = "Nenhum BI cadastrado ainda."; return; }
      secao.replaceChild(el("ul", { class: "linhas" }, bis.map(function (b) {
        // enquanto o DNS não aponta, a demonstração abre no endereço do GitHub Pages
        var url = b.tipo === "demo" ? DEMO_URL : b.url;
        return el("li", { class: "linha" }, [
          el("div", { class: "linha-txt" }, [
            el("b", {}, [b.nome, b.aguardando_aprovacao ? el("span", { class: "selo-espera", texto: "Aguardando aprovação" }) : null]),
            el("span", { texto: url.replace(/^https:\/\//, "").replace(/\/$/, "") + " · " + (TIPOS_BI[b.tipo] || b.tipo) }),
            b.tipo === "clinica" ? el("span", { class: "ligacao" + (b.ligado_auto_em ? " ok" : ""), texto: textoLigacao(b) }) : null,
          ]),
          b.aguardando_aprovacao ? botoesAprovacao(b, secao, caixa) : null,
          // abre na mesma aba (o BI tem o botão "Central" para voltar); na demo, já entra com a conta de administrador
          b.tipo === "demo"
            ? el("button", { class: "botao-mini", type: "button", texto: "Entrar", onclick: function (ev) { entrarNaDemo(url, ev.currentTarget); } })
            : el("a", { class: "botao-mini", href: url, texto: "Abrir" }),
          b.tipo === "clinica" && !b.aguardando_aprovacao ? planoB(b) : null,
        ]);
      })), caixa);
    }).catch(function () {
      caixa.textContent = "";
      caixa.appendChild(el("span", { class: "erro", texto: "Não consegui carregar os BIs agora. " }));
      caixa.appendChild(el("button", { class: "link", type: "button", texto: "Tentar de novo", onclick: function () { caixa.textContent = "Carregando…"; carregarBis(secao, caixa); } }));
    });
  }

  // ── ligação automática (cada BI se registra sozinho pela função central-registrar-bi) ──
  function textoLigacao(b) {
    if (b.ligado_auto_em) return "Ligado automaticamente em " + dataHora(b.ligado_auto_em) + (b.versao ? " · versão " + b.versao : "");
    return b.tem_chave ? "Chave colada à mão · o BI se liga sozinho depois da próxima atualização" : "Ainda não se ligou · o BI se liga sozinho depois da próxima atualização";
  }
  // BI novo que se registrou sozinho: entra na lista só depois de aprovado (função central-bi-aprovar)
  function botoesAprovacao(b, secao, caixa) {
    var erro = el("p", { class: "erro", role: "alert", hidden: true });
    function decidir(recusar, botao, rotulo) {
      if (recusar && !confirm("Recusar " + b.nome + "? O cadastro some; se o BI tentar de novo, volta a aguardar.")) return;
      erro.hidden = true; botao.disabled = true; botao.textContent = "…";
      funcao("central-bi-aprovar", recusar ? { bi_id: b.id, recusar: true } : { bi_id: b.id })
        .then(function () { carregarBis(secao, secao.querySelector(".linhas") || caixa); })
        .catch(function (e) { erro.textContent = e.message; erro.hidden = false; botao.disabled = false; botao.textContent = rotulo; });
    }
    var aprovar = el("button", { type: "button", class: "botao-mini forte", texto: "Aprovar", onclick: function () { decidir(false, aprovar, "Aprovar"); } });
    var recusar = el("button", { type: "button", class: "botao-mini perigo", texto: "Recusar", onclick: function () { decidir(true, recusar, "Recusar"); } });
    return el("div", { class: "aprovacao" }, [aprovar, recusar, erro]);
  }
  // a chave colada à mão fica como plano B, recolhida
  function planoB(b) {
    return el("details", { class: "plano-b" }, [el("summary", { texto: "Chave manual (plano B)" }), campoChave(b)]);
  }

  // lista de BIs: os ativos e os que se registraram sozinhos e aguardam aprovação (tem_chave diz se há chave de
  // leitura do uso; a chave em si nunca chega ao navegador)
  function listaBis() {
    return pedir("GET", "/rest/v1/central_bis?select=id,nome,url,tipo,ativo,tem_chave,tem_comandos,aguardando_aprovacao,ligado_auto_em,versao&or=(ativo.is.true,aguardando_aprovacao.is.true)&order=aguardando_aprovacao.desc,ordem.asc,nome.asc", undefined, true).then(function (r) {
      if (r.status === 401) { sairDaConta("Sua sessão terminou. Entre de novo."); return null; }
      if (r.status !== 200 || !Array.isArray(r.dados)) throw new Error();
      return r.dados;
    });
  }

  // ── chave de leitura do uso (aba BIs; só grava ou apaga, pela função central-bi-chave) ──
  function campoChave(b) {
    var idCampo = "chave-" + b.id;
    var estado = el("span", { class: "chave-estado" });
    var erro = el("p", { class: "erro", role: "alert", hidden: true });
    var campo = el("input", { id: idCampo, type: "password", autocomplete: "off", spellcheck: "false", autocapitalize: "none", "data-lpignore": "true" });
    var salvar = el("button", { type: "submit", class: "botao-mini", texto: "Salvar" });
    var apagar = el("button", { type: "button", class: "botao-mini perigo", texto: "Apagar", onclick: function () {
      if (!confirm("Apagar a chave de leitura do uso de " + b.nome + "? A aba Uso deixa de mostrar este BI até colar outra.")) return;
      enviar({ bi_id: b.id, apagar: true }, apagar, "Apagar");
    } });
    function pintar() {
      estado.textContent = b.tem_chave ? "Chave guardada" : "Sem chave";
      estado.className = "chave-estado" + (b.tem_chave ? " ok" : "");
      campo.placeholder = b.tem_chave ? "Cole outra para trocar" : "bi_…";
      apagar.hidden = !b.tem_chave;
    }
    function enviar(corpo, botao, rotulo) {
      erro.hidden = true; botao.disabled = true; botao.textContent = "…";
      funcao("central-bi-chave", corpo).then(function (r) { b.tem_chave = !!r.tem_chave; campo.value = ""; pintar(); })
        .catch(function (e) { erro.textContent = e.message; erro.hidden = false; })
        .then(function () { botao.disabled = false; botao.textContent = rotulo; });
    }
    var form = el("form", { class: "chave-linha", novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      var v = campo.value.trim();
      if (!/^bi_[A-Za-z0-9_-]{8,}$/.test(v)) { erro.textContent = "Cole a chave do BI (começa com bi_)."; erro.hidden = false; campo.focus(); return; }
      enviar({ bi_id: b.id, chave: v }, salvar, "Salvar");
    } }, [campo, salvar, apagar]);
    pintar();
    return el("div", { class: "chave-uso" }, [
      el("div", { class: "chave-topo" }, [el("label", { for: idCampo, class: "rotulo", texto: "Chave de leitura do uso" }), estado]),
      form, erro,
      el("p", { class: "nota", texto: "Só se a ligação automática falhar: crie no BI em Ajustes › Chave de API e MCP, entrando como desenvolvedor. Na próxima ligação automática, a chave do BI substitui esta." }),
    ]);
  }

  // ── aba Uso: quem usou o BI e como (função central-uso, que chama o BI com a chave guardada no servidor) ──
  // O período vai como { dias } | { desde: "inicio" } | { de, ate }. A função aceita bi_id em lista (para juntar
  // clínicas no futuro); por enquanto a tela escolhe um BI só e lê resultados[0].
  var PERIODOS_USO = [
    { rotulo: "7 dias", p: { dias: 7 } }, { rotulo: "14 dias", p: { dias: 14 } }, { rotulo: "30 dias", p: { dias: 30 } },
    { rotulo: "Desde o lançamento", p: { desde: "inicio" } }, { rotulo: "Escolher datas", p: null },
  ];
  var usoEstado = { bi: null, periodo: { dias: 7 }, pedido: 0 };
  var SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

  function hojeSP() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); }
  function somarDia(iso, n) { var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function diaMes(iso) { return iso.slice(8, 10) + "/" + iso.slice(5, 7); }
  function dataBr(iso) { return diaMes(iso) + "/" + iso.slice(0, 4); }
  function semana(iso) { return SEM[new Date(iso + "T12:00:00Z").getUTCDay()]; }
  function vezes(n) { return n + (n === 1 ? " vez" : " vezes"); }
  function nomes(l) { return l.length <= 1 ? l.join("") : l.slice(0, -1).join(", ") + " e " + l[l.length - 1]; }

  function painelUso() {
    var controles = el("section", { class: "cartao uso-controles" }, [el("p", { class: "vazio", role: "status", texto: "Carregando os BIs…" })]);
    var relatorio = el("div", { class: "uso-relatorio", "aria-live": "polite" });
    listaBis().then(function (bis) {
      if (!bis) return;
      var clinicas = bis.filter(function (b) { return b.tipo === "clinica" && b.ativo; });
      controles.innerHTML = "";
      if (!clinicas.length) { controles.appendChild(el("p", { class: "vazio", texto: "Nenhum BI de clínica cadastrado. A demonstração não mede uso." })); return; }
      if (!usoEstado.bi || !clinicas.some(function (b) { return b.id === usoEstado.bi; })) usoEstado.bi = clinicas[0].id;
      montarControles(controles, relatorio, clinicas);
      carregarUso(relatorio, clinicas);
    }).catch(function () { controles.innerHTML = ""; controles.appendChild(el("p", { class: "erro", texto: "Não consegui carregar os BIs agora." })); });
    return el("div", { class: "uso" }, [controles, relatorio]);
  }

  function montarControles(caixa, relatorio, clinicas) {
    var seletor = el("select", { id: "uso-bi", onchange: function () { usoEstado.bi = seletor.value; carregarUso(relatorio, clinicas); } },
      clinicas.map(function (b) { return el("option", { value: b.id, selected: b.id === usoEstado.bi, texto: b.nome }); }));
    var hoje = hojeSP();
    var ini = el("input", { type: "date", "aria-label": "Primeiro dia", max: hoje, value: usoEstado.periodo.de || somarDia(hoje, -29) });
    var fim = el("input", { type: "date", "aria-label": "Último dia", max: hoje, value: usoEstado.periodo.ate || hoje });
    var datas = el("form", { class: "uso-datas", hidden: !usoEstado.periodo.de, novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      if (!ini.value || !fim.value) return;
      var de = ini.value <= fim.value ? ini.value : fim.value, ate = ini.value <= fim.value ? fim.value : ini.value;
      usoEstado.periodo = { de: de, ate: ate }; carregarUso(relatorio, clinicas);
    } }, [ini, el("span", { class: "rotulo", texto: "até" }), fim, el("button", { type: "submit", class: "botao-mini", texto: "Ver" })]);
    var atual = function (p) {
      var e = usoEstado.periodo;
      if (!p) return !!e.de;
      return (p.dias && p.dias === e.dias) || (p.desde && e.desde === p.desde);
    };
    var chips = el("div", { class: "chips", role: "radiogroup", "aria-label": "Período" }, PERIODOS_USO.map(function (o) {
      return el("button", { type: "button", class: "chip", role: "radio", "aria-checked": String(atual(o.p)), texto: o.rotulo, onclick: function () {
        chips.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-checked", String(c === this)); }, this);
        datas.hidden = !!o.p;
        if (o.p) { usoEstado.periodo = o.p; carregarUso(relatorio, clinicas); } else ini.focus();
      } });
    }));
    caixa.appendChild(el("div", { class: "uso-linha" }, [
      el("label", { class: "uso-bi", for: "uso-bi" }, [el("span", { class: "rotulo", texto: "BI" }), seletor]), chips,
    ]));
    caixa.appendChild(datas);
  }

  function carregarUso(alvo, clinicas) {
    var bi = clinicas.filter(function (b) { return b.id === usoEstado.bi; })[0];
    var n = ++usoEstado.pedido;
    alvo.innerHTML = "";
    if (!bi.tem_chave) {
      alvo.appendChild(el("section", { class: "cartao" }, [el("div", { class: "aviso", role: "status" }, [
        "Este BI ainda não se ligou à Central. O BI se liga sozinho depois da próxima atualização.",
      ])]));
      return;
    }
    alvo.appendChild(el("section", { class: "cartao" }, [el("p", { class: "vazio", role: "status", texto: "Lendo o uso de " + bi.nome + "…" })]));
    var corpo = { bi_id: bi.id };
    Object.keys(usoEstado.periodo).forEach(function (k) { corpo[k] = usoEstado.periodo[k]; });
    funcao("central-uso", corpo).then(function (r) {
      if (n !== usoEstado.pedido) return;
      var res = r && r.resultados && r.resultados[0];
      alvo.innerHTML = "";
      if (!res || !res.ok) throw new Error(res && res.erro ? res.erro : "Não deu certo agora. Tente de novo.");
      desenharRelatorio(alvo, res.dados);
    }).catch(function (e) {
      if (n !== usoEstado.pedido) return;
      alvo.innerHTML = "";
      alvo.appendChild(el("section", { class: "cartao" }, [el("p", { class: "erro", role: "alert", texto: e.message }),
        el("button", { type: "button", class: "link", texto: "Tentar de novo", onclick: function () { carregarUso(alvo, clinicas); } })]));
    });
  }
  function irPara(id) {
    aba = id;
    document.querySelectorAll(".aba").forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-aba") === id)); });
    desenharAba();
  }

  // achados por regras simples: nunca entrou, sem entrar há N+ dias, a mesma tela muitas vezes num dia,
  // só abre e não lança (equipe que lança: colaboradora e editor), quem mais usou o assistente, quem usou todo dia
  function achadosDoUso(d) {
    var A = [], ps = d.pessoas, reg = d.regras || { dias_sem_entrar: 3, repeticao_suspeita: 8 };
    var nunca = ps.filter(function (p) { return p.dias_sem_uso === null; });
    if (nunca.length) A.push(["laranja", "Nunca entr" + (nunca.length === 1 ? "ou" : "aram") + ": ", nomes(nunca.map(function (p) { return p.nome; })) + "."]);
    ps.filter(function (p) { return p.dias_sem_uso !== null && p.dias_sem_uso >= reg.dias_sem_entrar; })
      .sort(function (a, b) { return b.dias_sem_uso - a.dias_sem_uso; })
      .forEach(function (p) { A.push(["claro", p.nome + " não entra há " + p.dias_sem_uso + " dias", " (último uso em " + diaMes(p.ultimo_uso) + ")."]); });
    ps.forEach(function (p) {
      (p.repeticoes || []).slice(0, 2).forEach(function (r) {
        A.push(["laranja", p.nome + " abriu " + r.nome + " " + vezes(r.vezes) + " em " + diaMes(r.dia), ": pode estar com dificuldade nessa tela."]);
      });
    });
    var soAbre = ps.filter(function (p) { return (p.papel === "colaborador" || p.papel === "editor") && p.dias_com_uso >= 2 && p.paginas_total > 0 && p.acoes_total === 0; });
    if (soAbre.length) A.push(["claro", "Só abre" + (soAbre.length === 1 ? "" : "m") + " e não lança: ", nomes(soAbre.map(function (p) { return p.nome; })) + " (entra" + (soAbre.length === 1 ? "" : "m") + " e olha, mas não fez nenhuma ação no período)."]);
    var ass = ps.filter(function (p) { return p.assistente > 0; }).sort(function (a, b) { return b.assistente - a.assistente; });
    if (ass.length) A.push(["azul", "Quem mais usou o assistente: " + ass[0].nome, " (" + ass[0].assistente + (ass[0].assistente === 1 ? " pergunta" : " perguntas") + (ass.length > 1 ? "; depois " + ass[1].nome + ", " + ass[1].assistente : "") + ")."]);
    var todoDia = ps.filter(function (p) {
      var possiveis = Math.min(d.periodo.dias, Math.max(1, Math.round((new Date(d.periodo.ate + "T12:00:00Z") - new Date((p.criado_em > d.periodo.de ? p.criado_em : d.periodo.de) + "T12:00:00Z")) / 864e5) + 1));
      return d.periodo.dias > 1 && p.dias_com_uso >= possiveis;
    });
    if (todoDia.length) A.push(["azul", "Usou todos os dias do período: ", nomes(todoDia.map(function (p) { return p.nome; })) + "."]);
    return A;
  }

  function nivelUso(n, max) { if (!n) return 0; var r = n / max; return r <= 0.15 ? 1 : r <= 0.4 ? 2 : r <= 0.7 ? 3 : 4; }

  function colunasDoPeriodo(p) {
    var dias = []; for (var i = 0; i < p.dias; i++) dias.push(somarDia(p.de, i));
    if (dias.length <= 31) return dias.map(function (x) { return { cima: semana(x), baixo: diaMes(x), dias: [x], titulo: semana(x) + " " + diaMes(x) }; });
    var cols = [];
    for (var j = 0; j < dias.length; j += 7) {
      var g = dias.slice(j, j + 7);
      cols.push({ cima: "sem.", baixo: diaMes(g[0]), dias: g, titulo: "de " + diaMes(g[0]) + " a " + diaMes(g[g.length - 1]) });
    }
    return cols;
  }

  function desenharRelatorio(alvo, d) {
    var p = d.periodo, hoje = hojeSP();
    var ultimo = d.por_dia && d.por_dia.length ? d.por_dia[d.por_dia.length - 1] : { pessoas: 0 };
    var titulo = p.modo === "inicio" ? "Desde o lançamento, " + dataBr(p.de) + ", até " + dataBr(p.ate)
      : "De " + dataBr(p.de) + " a " + dataBr(p.ate);
    alvo.appendChild(el("header", { class: "uso-cabeca" }, [
      el("h1", { texto: "Quem usou o BI e como" }),
      el("p", { class: "sub", texto: (d.clinica && d.clinica.nome ? d.clinica.nome + " · " : "") + titulo + " (" + p.dias + (p.dias === 1 ? " dia" : " dias") + "). Gerado em " + dataHora(d.gerado_em) + "." }),
    ]));
    var K = [
      [d.entraram + " de " + d.total, "pessoas da clínica entraram no período"],
      [ultimo.pessoas, "entraram " + (p.ate === hoje ? "hoje" : "em " + diaMes(p.ate))],
      [d.paginas, "páginas abertas"], [d.acoes, "ações feitas (lançar, marcar, salvar…)"], [d.assistente, "perguntas ao assistente"],
    ];
    alvo.appendChild(el("section", { class: "uso-kpis" }, K.map(function (k) { return el("div", { class: "uso-kpi" }, [el("b", { texto: String(k[0]) }), el("span", { texto: k[1] })]); })));

    var A = achadosDoUso(d);
    alvo.appendChild(el("section", { class: "cartao" }, [el("h2", { texto: "O que chama atenção" }),
      A.length ? el("ul", { class: "uso-achados" }, A.map(function (a) {
        return el("li", {}, [el("span", { class: "ponto ponto-" + a[0], "aria-hidden": "true" }), el("span", {}, [el("b", { texto: a[1] }), a[2]])]);
      })) : el("p", { class: "vazio", texto: "Nada fora do normal no período." })]));

    // mapa pessoa × dia (acima de 31 dias, por semana)
    var cols = colunasDoPeriodo(p), max = 1;
    var valor = function (pe, c) { return c.dias.reduce(function (s, x) { var v = pe.dias[x]; return s + (v ? v.paginas + v.acoes : 0); }, 0); };
    d.pessoas.forEach(function (pe) { cols.forEach(function (c) { max = Math.max(max, valor(pe, c)); }); });
    var cab = el("tr", {}, [el("th", { class: "nome", texto: "Pessoa" })].concat(cols.map(function (c) { return el("th", {}, [c.cima, el("br"), c.baixo]); })).concat([el("th", { texto: "Dias" })]));
    var linhas = d.pessoas.map(function (pe) {
      return el("tr", {}, [el("td", { class: "nome" }, [pe.nome, el("small", { texto: pe.papel_rotulo })])].concat(cols.map(function (c) {
        var v = valor(pe, c), q = nivelUso(v, max);
        return el("td", { class: "q q" + q, title: pe.nome + " · " + c.titulo + ": " + (v ? v + " (páginas + ações)" : "não entrou"), texto: v ? String(v) : "" });
      })).concat([el("td", { class: "q total", texto: String(pe.dias_com_uso) })]));
    });
    var tabela = el("div", { class: "uso-tabela" }, [el("table", {}, [cab].concat(linhas))]);
    // no celular a tabela rola de lado: começa mostrando os dias mais recentes
    setTimeout(function () { tabela.scrollLeft = tabela.scrollWidth; }, 0);
    alvo.appendChild(el("section", { class: "cartao" }, [
      el("h2", { texto: "Dia a dia" }),
      el("p", { class: "nota", texto: (cols.length < p.dias ? "Cada quadrado é uma semana" : "Cada quadrado é um dia") + ": quanto mais laranja, mais a pessoa usou (páginas abertas + ações)." }),
      d.pessoas.length ? tabela : el("p", { class: "vazio", texto: "Ninguém da clínica cadastrado no período." }),
      el("div", { class: "uso-legenda", "aria-hidden": "true" }, ["Menos", el("i", { class: "q0" }), el("i", { class: "q1" }), el("i", { class: "q2" }), el("i", { class: "q3" }), el("i", { class: "q4" }), "Mais"]),
    ]));

    alvo.appendChild(el("h2", { class: "uso-secao", texto: "Cada pessoa da clínica" }));
    alvo.appendChild(el("section", { class: "uso-pessoas" }, d.pessoas.map(function (pe) { return cartaoPessoa(pe, d); })));
    if (d.gestao_sem_caos && d.gestao_sem_caos.length) {
      alvo.appendChild(el("section", { class: "cartao" }, [el("details", {}, [
        el("summary", { texto: "Equipe Gestão Sem Caos (fora das contas acima)" }),
        el("div", { class: "uso-pessoas", style: "margin-top:14px" }, d.gestao_sem_caos.map(function (pe) { return cartaoPessoa(pe, d); })),
      ])]));
    }
    alvo.appendChild(el("p", { class: "nota uso-rodape", texto: "Fonte: registro de atividades do BI (páginas abertas e ações), sem nenhum dado de paciente. Horários de Brasília." }));
  }

  function cartaoPessoa(pe, d) {
    var reg = d.regras || { dias_sem_entrar: 3 };
    var selo = pe.dias_sem_uso === null ? ["Nunca entrou", "nunca"] : pe.dias_sem_uso >= reg.dias_sem_entrar ? ["Sem entrar há " + pe.dias_sem_uso + " dias", "parada"] : ["Ativa", "ativa"];
    var lista = function (itens, vazio) {
      return el("ul", { class: "uso-lista" }, itens.length ? itens.map(function (x) { return el("li", {}, [el("span", { texto: x.nome }), el("span", { texto: x.vezes + "×" })]); })
        : [el("li", {}, [el("span", { texto: vazio }), el("span")])]);
    };
    var acoes = (pe.acoes || []).filter(function (a) { return a.nome !== "Entrou" && a.nome !== "Saiu"; }).slice(0, 5);
    var maxH = Math.max.apply(null, [1].concat(pe.horas || []));
    return el("article", { class: "cartao uso-pessoa" }, [
      el("div", { class: "uso-topo" }, [
        el("div", {}, [el("h3", { texto: pe.nome }), el("div", { class: "nota", texto: (pe.gestao_sem_caos ? "Gestão Sem Caos" : pe.papel_rotulo) + " · cadastro em " + dataBr(pe.criado_em) })]),
        el("span", { class: "selo selo-" + selo[1], texto: selo[0] }),
      ]),
      el("div", { class: "uso-numeros" }, [
        el("span", {}, [el("b", { texto: String(pe.dias_com_uso) }), " dias com uso"]), el("span", {}, [el("b", { texto: String(pe.paginas_total) }), " páginas"]),
        el("span", {}, [el("b", { texto: String(pe.acoes_total) }), " ações"]),
        el("span", {}, ["último uso ", el("b", { texto: pe.ultimo_uso ? semana(pe.ultimo_uso) + " " + diaMes(pe.ultimo_uso) : "—" })]),
      ]),
      el("div", {}, [el("div", { class: "rot", texto: "Mais abriu" }), lista((pe.paginas || []).slice(0, 5), "—")]),
      el("div", {}, [el("div", { class: "rot", texto: "O que fez" }), lista(acoes, "Só abriu páginas")]),
      el("div", {}, [el("div", { class: "rot", texto: "Horário de uso" }),
        el("div", { class: "uso-horas", role: "img", "aria-label": "Uso por hora do dia" }, (pe.horas || []).map(function (h, i) {
          return el("i", { style: "height:" + Math.round(h / maxH * 100) + "%", title: i + "h: " + h });
        })),
        el("div", { class: "uso-eixo", "aria-hidden": "true" }, ["0h", "6h", "12h", "18h", "23h"].map(function (t) { return el("span", { texto: t }); })),
      ]),
    ]);
  }

  // ── aba Clínicas (Onda 7): por clínica, saúde, versão, módulos, acessos, suporte e histórico, pelos comandos assinados
  // (função central-comando, que assina no servidor com a chave que o próprio BI entregou); e o assistente Nova clínica
  // (central-implantacao), que guarda a ficha de implantação até a hospedagem ser conectada (central-hospedagem). ──
  var NOMES_STATUS_IMPL = { aguardando_hospedagem: "Aguardando hospedagem", hospedando: "Hospedando", no_ar: "No ar", cancelada: "Cancelada" };
  var MINUTOS_SUPORTE = [15, 30, 60, 120];
  var clinicaAberta = null, suporteMinutos = 30;

  function comando(bi, corpo) {
    var c = { bi_id: bi.id }; Object.keys(corpo).forEach(function (k) { c[k] = corpo[k]; });
    return funcao("central-comando", c);
  }
  function aviso(texto, tipo) { return el("div", { class: "aviso" + (tipo ? " " + tipo : ""), role: "status", texto: texto }); }
  function ponto(cor) { return el("span", { class: "ponto ponto-" + cor, "aria-hidden": "true" }); }

  function painelClinicas() {
    var lista = el("section", { class: "cartao" }, [el("h2", { texto: "Clínicas" }), el("p", { class: "vazio", role: "status", texto: "Carregando…" })]);
    var implantacoes = el("section", { class: "cartao" }, [el("p", { class: "vazio", texto: "Carregando as implantações…" })]);
    var briefings = el("section", { class: "cartao" }, [el("p", { class: "vazio", texto: "Carregando os briefings…" })]);
    var caixa = el("div", { class: "clinicas" }, [lista, implantacoes, briefings]);
    desenharBriefings(briefings);
    listaBis().then(function (bis) {
      if (!bis) return;
      var clinicas = bis.filter(function (b) { return b.tipo === "clinica" && b.ativo; });
      lista.innerHTML = "";
      lista.appendChild(el("h2", { texto: "Clínicas" + (clinicas.length ? " · " + clinicas.length : "") }));
      if (!clinicas.length) { lista.appendChild(el("p", { class: "vazio", texto: "Nenhuma clínica aprovada ainda. Os BIs aparecem aqui depois de aprovados na aba BIs." })); }
      else lista.appendChild(el("ul", { class: "linhas" }, clinicas.map(function (b) { return linhaClinica(b, caixa); })));
      desenharImplantacoes(implantacoes, clinicas);
      if (clinicaAberta) { var b = clinicas.filter(function (x) { return x.id === clinicaAberta; })[0]; if (b) abrirClinica(b, caixa); }
    }).catch(function () { lista.innerHTML = ""; lista.appendChild(el("p", { class: "erro", texto: "Não consegui carregar as clínicas agora." })); });
    return caixa;
  }

  function linhaClinica(b, caixa) {
    return el("li", { class: "linha" }, [
      el("div", { class: "linha-txt" }, [
        el("b", { texto: b.nome }),
        el("span", { texto: b.url.replace(/^https:\/\//, "") + (b.versao ? " · versão " + b.versao : "") }),
        b.tem_comandos ? el("span", { class: "ligacao ok", texto: "Recebe comandos da Central" })
          : el("span", { class: "ligacao", texto: "Precisa da próxima atualização do BI para receber comandos" }),
      ]),
      el("button", { class: "botao-mini" + (clinicaAberta === b.id ? " forte" : ""), type: "button", texto: "Ver clínica", onclick: function () { clinicaAberta = b.id; abrirClinica(b, caixa); } }),
    ]);
  }

  function abrirClinica(b, caixa) {
    var velho = caixa.querySelector(".clinica-detalhe"); if (velho) velho.remove();
    var det = el("section", { class: "clinica-detalhe" }, [
      el("header", { class: "uso-cabeca" }, [
        el("div", { class: "detalhe-topo" }, [el("h1", { texto: b.nome }),
          el("button", { type: "button", class: "link", texto: "Fechar", onclick: function () { clinicaAberta = null; det.remove(); } })]),
        el("p", { class: "sub", texto: b.url.replace(/^https:\/\//, "") + (b.versao ? " · versão " + b.versao : "") }),
      ]),
      el("div", { class: "cartao" }, [el("p", { class: "vazio", role: "status", texto: "Falando com o BI…" })]),
    ]);
    caixa.insertBefore(det, caixa.children[1] || null);
    det.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!b.tem_comandos) {
      det.replaceChild(el("div", { class: "cartao" }, [aviso("Este BI ainda não recebe comandos: precisa da próxima atualização do BI. Depois dela ele se liga sozinho à Central e esta tela mostra saúde, módulos, acessos e o suporte.")]), det.lastChild);
      det.appendChild(cartaoHistorico(b));
      return;
    }
    comando(b, { comando: "resumo" }).then(function (r) {
      det.removeChild(det.lastChild);
      if (!r.ok) { det.appendChild(el("div", { class: "cartao" }, [aviso(r.erro, r.precisa_atualizar ? "" : "alerta")])); det.appendChild(cartaoHistorico(b)); return; }
      var d = r.dados;
      det.appendChild(cartaoSaude(d));
      det.appendChild(cartaoSuporte(b, d.suporte || [], caixa));
      det.appendChild(cartaoModulos(b, d.modulos));
      det.appendChild(cartaoAcessos(d.acessos || []));
      var nomes = {}; ((d.modulos && d.modulos.modulos) || []).forEach(function (x) { nomes[x.chave] = x.nome; });
      det.appendChild(cartaoHistorico(b, nomes));
    }).catch(function (e) { det.removeChild(det.lastChild); det.appendChild(el("div", { class: "cartao" }, [el("p", { class: "erro", texto: e.message })])); });
  }

  function cartaoSaude(d) {
    var s = d.saude || {}, id = d.identidade || {};
    var fontes = (s.fontes || []).map(function (f) {
      var cor = f.nunca ? "claro" : f.parada ? "laranja" : "azul";
      var txt = f.nunca ? "ainda não leu" : f.parada ? "parada desde " + (f.ultimo_sucesso ? dataHora(f.ultimo_sucesso) : "—") : "em dia" + (f.ultimo_sucesso ? " · " + relativo(f.ultimo_sucesso) : "");
      return el("li", {}, [ponto(cor), el("span", {}, [el("b", { texto: f.nome }), " " + txt])]);
    });
    return el("section", { class: "cartao" }, [
      el("h2", { texto: "Saúde" }),
      el("div", { class: "uso-kpis" }, [
        kpi(s.dados_em_dia ? "Em dia" : "Atenção", "dados das fontes"),
        kpi(s.versao || "—", "versão" + (s.commit ? " · " + String(s.commit).slice(0, 7) : "")),
        kpi(String(s.pessoas_ativas != null ? s.pessoas_ativas : "—"), "pessoas com acesso"),
        kpi(String(s.entraram_7d != null ? s.entraram_7d : "—"), "entraram nos últimos 7 dias"),
      ]),
      fontes.length ? el("ul", { class: "uso-achados fontes" }, fontes) : null,
      el("p", { class: "nota", texto: "Identidade: " + [id.nome, id.marca ? "marca " + id.marca : null, id.sigla ? "sigla " + id.sigla : null].filter(Boolean).join(" · ") +
        (id.medicas && id.medicas.length ? " · médicas: " + id.medicas.join(", ") : "") }),
    ]);
  }
  function kpi(v, rotulo) { return el("div", { class: "uso-kpi" }, [el("b", { texto: v }), el("span", { texto: rotulo })]); }

  function cartaoSuporte(b, historico, caixa) {
    var erro = el("p", { class: "erro", role: "alert", hidden: true });
    var motivo = el("input", { type: "text", placeholder: "Motivo (opcional): ex. conferir o faturamento", maxlength: "200", autocomplete: "off" });
    var chips = el("div", { class: "chips", role: "radiogroup", "aria-label": "Tempo do acesso" }, MINUTOS_SUPORTE.map(function (m) {
      return el("button", { type: "button", class: "chip", role: "radio", "aria-checked": String(m === suporteMinutos), texto: m < 60 ? m + " min" : (m / 60) + " h", onclick: function () {
        suporteMinutos = m; chips.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-checked", String(c === this)); }, this);
      } });
    }));
    var entrar = el("button", { type: "button", class: "botao botao-auto", texto: "Entrar como suporte", onclick: function () {
      if (!confirm("Entrar no BI de " + b.nome + " como suporte por " + suporteMinutos + " minutos? A entrada fica registrada no log que a clínica vê.")) return;
      erro.hidden = true; entrar.disabled = true; entrar.textContent = "Gerando o acesso…";
      var janela = window.open("about:blank", "_blank");
      comando(b, { comando: "suporte", minutos: suporteMinutos, motivo: motivo.value.trim() }).then(function (r) {
        if (!r.ok) throw new Error(r.erro);
        var url = r.dados.entrar;
        if (janela) { try { janela.opener = null; } catch (e) { /* segue */ } janela.location.href = url; }
        else erro.parentNode.insertBefore(el("p", { class: "nota" }, ["O navegador bloqueou a janela. ", el("a", { href: url, target: "_blank", rel: "noopener", texto: "Abrir o BI como suporte" }), " (vale 5 minutos)."]), erro);
        motivo.value = "";
        abrirClinica(b, caixa);
      }).catch(function (e) { if (janela) janela.close(); erro.textContent = e.message; erro.hidden = false; })
        .then(function () { entrar.disabled = false; entrar.textContent = "Entrar como suporte"; });
    } });
    var abertos = historico.filter(function (h) { return h.aberto; });
    var encerrar = abertos.length ? el("button", { type: "button", class: "botao-mini perigo", texto: "Encerrar suporte agora", onclick: function () {
      if (!confirm("Encerrar agora todo acesso de suporte aberto em " + b.nome + "? Quem estiver dentro sai na hora.")) return;
      encerrar.disabled = true;
      comando(b, { comando: "encerrar_suporte" }).then(function (r) { if (!r.ok) throw new Error(r.erro); abrirClinica(b, caixa); })
        .catch(function (e) { erro.textContent = e.message; erro.hidden = false; encerrar.disabled = false; });
    } }) : null;
    return el("section", { class: "cartao" }, [
      el("h2", { texto: "Suporte" }),
      el("p", { class: "nota", texto: "Abre o BI da clínica com um acesso temporário da Gestão Sem Caos. O link vale 5 minutos e uma vez só; a clínica vê no log quem entrou e de que horas a que horas." }),
      el("div", { class: "suporte-linha" }, [chips, motivo]),
      el("div", { class: "criado-acoes" }, [entrar, encerrar]), erro,
      historico.length ? el("ul", { class: "linhas historico" }, historico.slice(0, 6).map(function (h) {
        return el("li", { class: "linha" }, [el("div", { class: "linha-txt" }, [
          el("b", {}, [h.quem_nome, h.aberto ? el("span", { class: "selo-espera", texto: "Aberto" }) : null]),
          el("span", { texto: dataHora(h.inicio) + " até " + new Date(h.fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) +
            (h.entrou_em ? " · entrou " + new Date(h.entrou_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : " · não chegou a entrar") +
            (h.encerrado_em ? " · encerrado" : "") + (h.motivo ? " · " + h.motivo : "") }),
        ])]);
      })) : null,
    ]);
  }

  function cartaoModulos(b, m) {
    var mods = (m && m.modulos) || [];
    var ligados = {}; mods.forEach(function (x) { ligados[x.chave] = x.ligado; });
    var grupos = [];
    mods.forEach(function (x) { if (grupos.indexOf(x.grupo) < 0) grupos.push(x.grupo); });
    var erro = el("p", { class: "erro", role: "alert", hidden: true });
    function chave(x) {
      var botao = el("button", { type: "button", class: "interruptor", role: "switch", "aria-checked": String(!!ligados[x.chave]), "aria-label": x.nome, onclick: function () {
        var novo = !ligados[x.chave];
        if (!confirm((novo ? "Ligar " : "Desligar ") + "“" + x.nome + "” em " + b.nome + "?" + (novo ? "" : " A clínica deixa de ver essa parte na hora."))) return;
        erro.hidden = true; botao.disabled = true;
        comando(b, { comando: "modulo", chave: x.chave, ligado: novo }).then(function (r) {
          if (!r.ok) throw new Error(r.erro);
          Object.keys(r.dados.ligados || {}).forEach(function (k) { ligados[k] = r.dados.ligados[k]; });
          secao.querySelectorAll(".interruptor").forEach(function (i) { i.setAttribute("aria-checked", String(!!ligados[i.getAttribute("data-chave")])); });
        }).catch(function (e) { erro.textContent = e.message; erro.hidden = false; }).then(function () { botao.disabled = false; });
      } });
      botao.setAttribute("data-chave", x.chave);
      return el("li", { class: "modulo" }, [el("div", {}, [el("b", { texto: x.nome }), el("span", { class: "nota", texto: x.descricao })]), botao]);
    }
    var secao = el("section", { class: "cartao" }, [
      el("h2", { texto: "Módulos" }),
      el("p", { class: "nota", texto: "Sempre ligados (núcleo): " + ((m && m.nucleo) || []).join(", ") + "." }), erro,
    ].concat(grupos.map(function (g) {
      return el("div", { class: "grupo-modulos" }, [el("div", { class: "rot", texto: g }), el("ul", { class: "modulos" }, mods.filter(function (x) { return x.grupo === g; }).map(chave))]);
    })));
    return secao;
  }

  function cartaoAcessos(acessos) {
    var ativos = acessos.filter(function (a) { return a.ativo; });
    return el("section", { class: "cartao" }, [
      el("h2", { texto: "Acessos · " + ativos.length + " ativos" }),
      el("p", { class: "nota", texto: "Quem cria e tira acessos da equipe é a própria clínica, em Pessoas e acessos." }),
      el("ul", { class: "linhas" }, acessos.map(function (a) {
        return el("li", { class: "linha" }, [el("div", { class: "linha-txt" }, [
          el("b", {}, [a.nome, a.ativo ? null : el("span", { class: "selo-espera", texto: "Desativado" })]),
          el("span", { texto: a.papel_rotulo + (a.suporte ? "" : " · " + a.email) + " · " + (a.ultimo_acesso_em ? "último acesso " + relativo(a.ultimo_acesso_em) : "nunca entrou") }),
        ])]);
      })),
    ]);
  }

  function cartaoHistorico(b, nomesModulos) {
    var corpo = el("p", { class: "vazio", texto: "Carregando…" });
    pedir("GET", "/rest/v1/central_comandos?select=em,admin_nome,comando,leitura,ok,resultado&bi_id=eq." + b.id + "&order=em.desc&limit=25", undefined, true).then(function (r) {
      if (r.status !== 200 || !Array.isArray(r.dados)) throw new Error();
      var mudancas = r.dados.filter(function (c) { return !c.leitura || !c.ok; });
      corpo.replaceWith(mudancas.length ? el("ul", { class: "linhas historico" }, mudancas.map(function (c) {
        return el("li", { class: "linha" }, [el("div", { class: "linha-txt" }, [
          el("b", {}, [ponto(c.ok ? "azul" : "laranja"), NOMES_COMANDO[c.comando] || c.comando]),
          el("span", { texto: dataHora(c.em) + " · " + (c.admin_nome || "—") + (c.resultado ? " · " + legivel(c, nomesModulos || {}) : "") }),
        ])]);
      })) : el("p", { class: "vazio", texto: "Nenhuma mudança feita pela Central nesta clínica ainda." }));
    }).catch(function () { corpo.textContent = "Não consegui carregar o histórico."; });
    return el("section", { class: "cartao" }, [el("h2", { texto: "Histórico da Central" }), corpo]);
  }
  // "notas desligado" → "Notas desligado" (o nome do módulo, quando a clínica respondeu o catálogo)
  function legivel(c, nomes) {
    if (c.comando !== "modulo" || !c.ok) return c.resultado;
    var k = c.resultado.split(" ")[0];
    return nomes[k] ? nomes[k] + c.resultado.slice(k.length) : c.resultado;
  }
  var NOMES_COMANDO = { modulo: "Ligou ou desligou módulo", suporte: "Entrou como suporte", encerrar_suporte: "Encerrou o suporte", resumo: "Leitura", saude: "Leitura", modulos: "Leitura", acessos: "Leitura", identidade: "Leitura", historico_suporte: "Leitura" };

  // ── implantações (assistente Nova clínica) ──
  function desenharImplantacoes(secao, clinicas) {
    pedir("GET", "/rest/v1/central_implantacoes?select=id,nome,dominio,plano,status,ficha,bi_id,criado_em,responsavel&order=criado_em.desc&limit=50", undefined, true).then(function (r) {
      if (r.status !== 200 || !Array.isArray(r.dados)) throw new Error();
      secao.innerHTML = "";
      secao.appendChild(el("div", { class: "detalhe-topo" }, [el("h2", { texto: "Implantações" }),
        el("button", { type: "button", class: "botao-mini forte", texto: "Nova clínica", onclick: function () { assistente(secao, clinicas); } })]));
      if (!r.dados.length) { secao.appendChild(el("p", { class: "vazio", texto: "Nenhuma clínica nova em implantação." })); return; }
      secao.appendChild(el("ul", { class: "linhas" }, r.dados.map(function (imp) { return linhaImplantacao(imp, secao, clinicas); })));
    }).catch(function () { secao.innerHTML = ""; secao.appendChild(el("p", { class: "erro", texto: "Não consegui carregar as implantações agora." })); });
  }

  // ── Briefings por link (função central-briefing; perguntas em perguntas-briefing.js) ──
  var PERGUNTAS_BRIEFING = window.BRIEFING_PERGUNTAS || [];
  var briefingAberto = null;
  function linkBriefing(b) { return location.origin + "/briefing/#c=" + b.codigo; }
  function temValor(v) { return Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim()); }
  function campoVisivel(c, r) { return !c.mostrarSe || Object.keys(c.mostrarSe).every(function (k) { return r[k] === c.mostrarSe[k]; }); }
  function respondidas(r) {
    return PERGUNTAS_BRIEFING.filter(function (p) { return p.campos.some(function (c) { return campoVisivel(c, r) && temValor(r[c.id]); }); }).length;
  }
  function situacaoBriefing(b) {
    var n = respondidas(b.respostas || {}), total = PERGUNTAS_BRIEFING.length;
    if (b.enviado_em) return { texto: "Enviado em " + dataHora(b.enviado_em) + " · " + n + " de " + total, ok: true };
    if (b.atualizado_em) return { texto: "Respondendo · " + n + " de " + total + " · última resposta " + relativo(b.atualizado_em) };
    if (b.aberto_em) return { texto: "Abriu o link " + relativo(b.aberto_em) + ", sem resposta ainda" };
    return { texto: "Link ainda não aberto" };
  }
  function desenharBriefings(secao) {
    pedir("GET", "/rest/v1/central_briefings?select=id,clinica,codigo,respostas,criado_em,aberto_em,atualizado_em,enviado_em&arquivado_em=is.null&order=criado_em.desc&limit=50", undefined, true).then(function (r) {
      if (r.status !== 200 || !Array.isArray(r.dados)) throw new Error();
      secao.innerHTML = "";
      var form = formNovoBriefing(secao);
      secao.appendChild(el("div", { class: "detalhe-topo" }, [el("h2", { texto: "Briefings" + (r.dados.length ? " · " + r.dados.length : "") }),
        el("button", { type: "button", class: "botao-mini forte", texto: "Novo briefing", onclick: function () { form.hidden = !form.hidden; if (!form.hidden) form.querySelector("input").focus(); } })]));
      secao.appendChild(el("p", { class: "nota", texto: "A clínica responde por um link, sem login. As respostas aparecem aqui e chega um e-mail quando ela envia." }));
      secao.appendChild(form);
      if (!r.dados.length) { secao.appendChild(el("p", { class: "vazio", texto: "Nenhum briefing ainda." })); return; }
      secao.appendChild(el("ul", { class: "linhas" }, r.dados.map(function (b) { return linhaBriefing(b, secao); })));
    }).catch(function () { secao.innerHTML = ""; secao.appendChild(el("p", { class: "erro", texto: "Não consegui carregar os briefings agora." })); });
  }
  function formNovoBriefing(secao) {
    var erro = el("p", { class: "erro", role: "alert", hidden: true });
    var nome = el("input", { type: "text", maxlength: "120", autocomplete: "off", placeholder: "Ex.: Clínica Dr. Fulano" });
    var botao = el("button", { class: "botao botao-auto", type: "submit", texto: "Criar link" });
    return el("form", { class: "form-linha", hidden: true, novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      if (nome.value.trim().length < 2) { erro.textContent = "Diga o nome da clínica."; erro.hidden = false; return; }
      botao.disabled = true; erro.hidden = true;
      funcao("central-briefing", { acao: "criar", clinica: nome.value.trim() }).then(function (r) {
        briefingAberto = r.briefing.id; desenharBriefings(secao);
      }).catch(function (e) { erro.textContent = e.message; erro.hidden = false; botao.disabled = false; });
    } }, [el("label", { class: "campo" }, [el("span", { texto: "Nome da clínica" }), nome]), botao, erro]);
  }
  function linhaBriefing(b, secao) {
    var s = situacaoBriefing(b);
    var respostas = el("div", { class: "ficha", hidden: briefingAberto !== b.id });
    if (briefingAberto === b.id) desenharRespostas(respostas, b.respostas || {});
    var copiarLink = el("button", { type: "button", class: "botao-mini", texto: "Copiar link", onclick: function () { copiar(linkBriefing(b), copiarLink); } });
    var arquivar = el("button", { type: "button", class: "botao-mini", texto: "Arquivar", onclick: function () {
      arquivar.disabled = true;
      funcao("central-briefing", { acao: "arquivar", id: b.id }).then(function () {
        linha.replaceChildren(el("div", { class: "linha-txt" }, [el("span", { texto: b.clinica + " · arquivado" })]),
          el("button", { type: "button", class: "link", texto: "Desfazer", onclick: function () {
            funcao("central-briefing", { acao: "arquivar", id: b.id, desfazer: true }).then(function () { desenharBriefings(secao); }).catch(function (e) { alert(e.message); });
          } }));
      }).catch(function (e) { arquivar.disabled = false; alert(e.message); });
    } });
    var linha = el("li", { class: "linha linha-impl" }, [
      el("div", { class: "linha-txt" }, [
        el("b", {}, [b.clinica, s.ok ? el("span", { class: "selo-espera ok", texto: "Enviado" }) : null]),
        el("span", { texto: s.texto + " · criado em " + dataHora(b.criado_em) }),
      ]),
      el("div", { class: "aprovacao" }, [
        el("button", { type: "button", class: "botao-mini", texto: "Ver respostas", "aria-expanded": String(briefingAberto === b.id), onclick: function () {
          respostas.hidden = !respostas.hidden; this.setAttribute("aria-expanded", String(!respostas.hidden));
          briefingAberto = respostas.hidden ? null : b.id;
          if (!respostas.hidden) desenharRespostas(respostas, b.respostas || {});
        } }),
        copiarLink, arquivar,
      ]),
      respostas,
    ]);
    return linha;
  }
  function desenharRespostas(alvo, r) {
    alvo.innerHTML = "";
    PERGUNTAS_BRIEFING.forEach(function (p, i) {
      var campos = p.campos.filter(function (c) { return campoVisivel(c, r); });
      alvo.appendChild(el("div", { class: "rot", texto: (i + 1) + ". " + p.titulo }));
      alvo.appendChild(el("dl", { class: "respostas" }, campos.reduce(function (lista, c) {
        var v = r[c.id], texto = Array.isArray(v) ? v.join(", ") : (v || "").trim();
        return lista.concat([el("dt", { texto: c.rotulo }), el("dd", { class: texto ? "" : "sem", texto: texto || "sem resposta" })]);
      }, [])));
    });
  }

  function linhaImplantacao(imp, secao, clinicas) {
    var ficha = el("div", { class: "ficha", hidden: true });
    var msg = el("p", { class: "nota", hidden: true });
    var status = el("select", { "aria-label": "Situação", onchange: function () {
      funcao("central-implantacao", { acao: "status", id: imp.id, status: status.value }).then(function () { desenharImplantacoes(secao, clinicas); })
        .catch(function (e) { alert(e.message); status.value = imp.status; });
    } }, Object.keys(NOMES_STATUS_IMPL).map(function (k) { return el("option", { value: k, selected: k === imp.status, texto: NOMES_STATUS_IMPL[k] }); }));
    var ligar = el("select", { "aria-label": "Clínica no ar", onchange: function () {
      funcao("central-implantacao", { acao: "status", id: imp.id, status: ligar.value ? "no_ar" : imp.status, bi_id: ligar.value || null })
        .then(function () { desenharImplantacoes(secao, clinicas); }).catch(function (e) { alert(e.message); });
    } }, [el("option", { value: "", texto: "Ligar a um BI…" })].concat(clinicas.map(function (b) { return el("option", { value: b.id, selected: b.id === imp.bi_id, texto: b.nome }); })));
    var criar = imp.status === "aguardando_hospedagem" ? el("button", { type: "button", class: "botao-mini", texto: "Criar no servidor", onclick: function () {
      criar.disabled = true;
      funcao("central-hospedagem", { implantacao_id: imp.id }).then(function (r) { msg.textContent = r.mensagem; msg.hidden = false; })
        .catch(function (e) { msg.textContent = e.message; msg.hidden = false; }).then(function () { criar.disabled = false; });
    } }) : null;
    return el("li", { class: "linha linha-impl" }, [
      el("div", { class: "linha-txt" }, [
        el("b", {}, [imp.nome, el("span", { class: "selo-espera" + (imp.status === "no_ar" ? " ok" : ""), texto: NOMES_STATUS_IMPL[imp.status] || imp.status })]),
        el("span", { texto: imp.dominio + " · plano " + imp.plano + " · " + (imp.responsavel && imp.responsavel.nome ? imp.responsavel.nome + " · " : "") + "criada em " + dataHora(imp.criado_em) }),
      ]),
      el("div", { class: "aprovacao" }, [
        el("button", { type: "button", class: "botao-mini", texto: "Ficha", onclick: function () { ficha.hidden = !ficha.hidden; if (!ficha.firstChild) desenharFicha(ficha, imp.ficha); } }),
        criar, status, ligar,
      ]),
      msg, ficha,
    ]);
  }

  var ORIGEM = { fixo: "valor fixo", gerar_no_servidor: "gerar no servidor", da_clinica: "a clínica cola no BI", opcional: "opcional" };
  function desenharFicha(alvo, f) {
    var sql = f.configuracao_inicial && f.configuracao_inicial.sql || "";
    var copiarSql = el("button", { type: "button", class: "botao-mini", texto: "Copiar SQL", onclick: function () { copiar(sql, copiarSql); } });
    alvo.appendChild(el("div", { class: "rot", texto: "Servidor" }));
    alvo.appendChild(el("p", { class: "nota", texto: "Projeto " + f.servidor.projeto + " · banco Postgres " + f.servidor.banco.postgres + " · app pela porta " + f.servidor.app.porta +
      " · domínio " + f.servidor.dominio.nome + " com HTTPS · " + f.servidor.backup }));
    alvo.appendChild(el("div", { class: "rot", texto: "Variáveis (nenhum segredo fica aqui)" }));
    alvo.appendChild(el("ul", { class: "uso-lista" }, f.variaveis.map(function (v) {
      return el("li", {}, [el("span", {}, [el("code", { texto: v.nome }), v.nota ? " " + v.nota : ""]), el("span", { texto: v.valor || ORIGEM[v.origem] || v.origem })]);
    })));
    alvo.appendChild(el("div", { class: "rot", texto: "Passos" }));
    alvo.appendChild(el("ol", { class: "passos" }, f.passos.map(function (p) { return el("li", { texto: p }); })));
    alvo.appendChild(el("div", { class: "detalhe-topo" }, [el("div", { class: "rot", texto: "Configuração inicial" }), copiarSql]));
    alvo.appendChild(el("pre", { class: "mensagem sql", texto: sql }));
  }

  function assistente(secao, clinicas) {
    var catalogo = null, passo = 0, dados = { plano: "fundador", modulos: {}, medicas: [""], responsavel: {} };
    var corpo = el("div", { class: "assistente" });
    var modal = el("div", { class: "fundo", role: "dialog", "aria-modal": "true", "aria-label": "Nova clínica", onclick: function (ev) { if (ev.target === modal) fechar(); } }, [
      el("div", { class: "cartao janela" }, [
        el("div", { class: "detalhe-topo" }, [el("h1", { texto: "Nova clínica" }), el("button", { type: "button", class: "link", texto: "Fechar", onclick: fechar })]),
        el("p", { class: "sub", texto: "Gera a ficha de implantação. Nada é criado no servidor agora." }),
        corpo,
      ]),
    ]);
    function fechar() { modal.remove(); document.removeEventListener("keydown", esc); }
    function esc(ev) { if (ev.key === "Escape") fechar(); }
    document.addEventListener("keydown", esc);
    document.body.appendChild(modal);
    corpo.appendChild(el("p", { class: "vazio", texto: "Carregando os módulos…" }));
    funcao("central-implantacao", { acao: "catalogo" }).then(function (c) { catalogo = c; c.modulos.forEach(function (m) { dados.modulos[m.chave] = true; }); desenhar(); })
      .catch(function (e) { corpo.innerHTML = ""; corpo.appendChild(el("p", { class: "erro", texto: e.message })); });

    var PASSOS = ["Clínica", "Médicas", "Módulos", "Responsável", "Revisar"];
    function campo(rotulo, chaveObj, chave, attrs) {
      var i = el("input", Object.assign({ type: "text", autocomplete: "off", value: chaveObj[chave] || "" }, attrs || {}));
      i.addEventListener("input", function () { chaveObj[chave] = i.value; });
      return el("label", { class: "campo" }, [el("span", { texto: rotulo }), i]);
    }
    function desenhar(erroTexto) {
      corpo.innerHTML = "";
      corpo.appendChild(el("ol", { class: "etapas" }, PASSOS.map(function (p, i) { return el("li", { class: i === passo ? "atual" : i < passo ? "feito" : "", texto: p }); })));
      var erro = el("p", { class: "erro", role: "alert", hidden: !erroTexto, texto: erroTexto || "" });
      var conteudo;
      if (passo === 0) conteudo = el("div", {}, [
        campo("Nome da clínica", dados, "nome", { placeholder: "Clínica Orvalho", maxlength: "120" }),
        campo("Nome curto (e-mails e remetente)", dados, "nome_curto", { placeholder: "Orvalho", maxlength: "60" }),
        el("div", { class: "dois" }, [campo("Sigla", dados, "sigla", { placeholder: "CO", maxlength: "6" }), campo("Marca (menu: marca · bi)", dados, "marca", { placeholder: "orvalho", maxlength: "30" })]),
        campo("Domínio do BI", dados, "dominio", { placeholder: "orvalho.gestaosemcaos.com.br", inputmode: "url", autocapitalize: "none", spellcheck: "false" }),
      ]);
      else if (passo === 1) {
        var lista = el("div", { class: "medicas" });
        var pintar = function () {
          lista.innerHTML = "";
          dados.medicas.forEach(function (m, i) {
            var inp = el("input", { type: "text", value: m, placeholder: "Dra. Nome", maxlength: "60", "aria-label": "Médica " + (i + 1) });
            inp.addEventListener("input", function () { dados.medicas[i] = inp.value; });
            lista.appendChild(el("div", { class: "chave-linha" }, [inp, dados.medicas.length > 1 ? el("button", { type: "button", class: "botao-mini perigo", texto: "Tirar", onclick: function () { dados.medicas.splice(i, 1); pintar(); } }) : null]));
          });
        };
        pintar();
        conteudo = el("div", {}, [el("p", { class: "nota", texto: "Os nomes que aparecem no BI. O código de cada médica no sistema de gestão é ligado depois da primeira leitura." }), lista,
          el("button", { type: "button", class: "link", texto: "+ outra médica", onclick: function () { dados.medicas.push(""); pintar(); lista.lastChild.querySelector("input").focus(); } })]);
      } else if (passo === 2) {
        var planos = el("div", { class: "chips", role: "radiogroup", "aria-label": "Plano" }, catalogo.planos.map(function (p) {
          return el("button", { type: "button", class: "chip", role: "radio", "aria-checked": String(dados.plano === p), texto: p === "fundador" ? "Fundador" : p === "clinica" ? "Clínica" : "Completa", onclick: function () {
            dados.plano = p;
            catalogo.modulos.forEach(function (m) { dados.modulos[m.chave] = p === "fundador" ? true : m.padrao; });
            desenhar();
          } });
        }));
        var grupos = []; catalogo.modulos.forEach(function (m) { if (grupos.indexOf(m.grupo) < 0) grupos.push(m.grupo); });
        conteudo = el("div", {}, [el("div", { class: "rot", texto: "Plano" }), planos,
          el("p", { class: "nota", texto: dados.plano === "fundador" ? "Fundador: todos os módulos. Tire o que não fizer sentido para a clínica." : "Comece pelo padrão e ajuste." }),
          el("p", { class: "nota", texto: "Sempre ligados: " + catalogo.nucleo.join(", ") + "." }),
        ].concat(grupos.map(function (g) {
          return el("div", { class: "grupo-modulos" }, [el("div", { class: "rot", texto: g }), el("ul", { class: "modulos" }, catalogo.modulos.filter(function (m) { return m.grupo === g; }).map(function (m) {
            var b = el("button", { type: "button", class: "interruptor", role: "switch", "aria-checked": String(!!dados.modulos[m.chave]), "aria-label": m.nome, onclick: function () {
              dados.modulos[m.chave] = !dados.modulos[m.chave]; b.setAttribute("aria-checked", String(dados.modulos[m.chave]));
            } });
            return el("li", { class: "modulo" }, [el("div", {}, [el("b", { texto: m.nome }), m.depende.length ? el("span", { class: "nota", texto: "precisa de " + m.depende.map(function (d) { return catalogo.modulos.filter(function (x) { return x.chave === d; })[0].nome; }).join(" e ") }) : null]), b]);
          }))]);
        })));
      } else if (passo === 3) conteudo = el("div", {}, [
        el("p", { class: "nota", texto: "Quem cuida do BI na clínica: recebe o primeiro acesso e o tutorial." }),
        campo("Nome", dados.responsavel, "nome", { maxlength: "120" }),
        campo("E-mail", dados.responsavel, "email", { type: "email", inputmode: "email", autocapitalize: "none", maxlength: "120" }),
        campo("Telefone (opcional)", dados.responsavel, "telefone", { type: "tel", maxlength: "30" }),
      ]);
      else conteudo = el("div", { class: "previa" }, [el("p", { class: "vazio", texto: "Montando a ficha…" })]);

      var voltar = passo > 0 ? el("button", { type: "button", class: "botao-mini", texto: "Voltar", onclick: function () { passo--; desenhar(); } }) : null;
      var seguir = el("button", { type: "button", class: "botao botao-auto", texto: passo === 4 ? "Guardar ficha" : "Continuar", onclick: function () {
        seguir.disabled = true;
        if (passo === 4) {
          funcao("central-implantacao", corpoDoAssistente("criar")).then(function () { fechar(); desenharImplantacoes(secao, clinicas); })
            .catch(function (e) { erro.textContent = e.message; erro.hidden = false; seguir.disabled = false; });
          return;
        }
        // confere no servidor (as mesmas regras da ficha) antes de passar de etapa
        funcao("central-implantacao", corpoDoAssistente("previa")).then(function () { passo++; desenhar(); }).catch(function (e) {
          var m = e.message, daEtapa = [/nome da clínica|marca|domínio/i, /médica/i, /precisa de/i, /responsável/i][passo];
          if (daEtapa && !daEtapa.test(m)) { passo++; desenhar(); } else { erro.textContent = m; erro.hidden = false; seguir.disabled = false; }
        });
      } });
      corpo.appendChild(conteudo); corpo.appendChild(erro);
      corpo.appendChild(el("div", { class: "criado-acoes rodape-assistente" }, [voltar, seguir]));
      if (passo === 4) funcao("central-implantacao", corpoDoAssistente("previa")).then(function (r) { conteudo.innerHTML = ""; desenharFicha(conteudo, r.ficha); })
        .catch(function (e) { conteudo.innerHTML = ""; erro.textContent = e.message; erro.hidden = false; });
      var primeiro = conteudo.querySelector("input"); if (primeiro) setTimeout(function () { primeiro.focus(); }, 30);
    }
    function corpoDoAssistente(acao) {
      return { acao: acao, nome: dados.nome, nome_curto: dados.nome_curto, sigla: dados.sigla, marca: dados.marca, dominio: dados.dominio,
        medicas: dados.medicas.filter(function (m) { return m && m.trim(); }), plano: dados.plano, modulos: dados.modulos, responsavel: dados.responsavel };
    }
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
