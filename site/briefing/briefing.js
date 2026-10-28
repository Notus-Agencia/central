// Briefing da implantação pelo link (sem login): uma pergunta por tela. O código vem do endereço (#c=…); cada resposta vai para a função
// central-briefing logo depois de a pessoa parar de digitar e ao passar de tela. Nada fica no navegador além do que está na tela.
(function () {
  "use strict";
  var SUPABASE = "https://kwysrvuvgdovmwhptqaw.supabase.co";
  var CHAVE_PUBLICA = "sb_publishable_xq34BKVIUMI-18n21-Cnmw_QE8vQvuF";
  var PERGUNTAS = window.BRIEFING_PERGUNTAS || [];
  var codigo = (location.hash.match(/[#&]c=([A-Za-z0-9_-]{24,64})/) || [])[1] || "";
  var respostas = {}, pendentes = {}, relogio = null, salvando = false, enviadoEm = null, clinica = "";
  var atual = -1; // -1 = abertura; 0..n-1 = perguntas; n = enviar; n+1 = recebido
  var semMovimento = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  function pedir(corpo) {
    corpo.codigo = codigo;
    return fetch(SUPABASE + "/functions/v1/central-briefing", {
      method: "POST", headers: { apikey: CHAVE_PUBLICA, Authorization: "Bearer " + CHAVE_PUBLICA, "Content-Type": "application/json" }, body: JSON.stringify(corpo),
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d.status = r.status; return d; }); });
  }
  function hora(d) { return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  function dia(iso) { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); }
  var folha = document.getElementById("folha");

  // ── respostas ──
  function temValor(v) { return Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim()); }
  function visivel(c) {
    if (!c.mostrarSe) return true;
    return Object.keys(c.mostrarSe).every(function (k) {
      var v = respostas[k], quer = [].concat(c.mostrarSe[k]);
      return quer.some(function (q) { return Array.isArray(v) ? v.indexOf(q) >= 0 : v === q; });
    });
  }
  function respondida(p) { return p.campos.some(function (c) { return visivel(c) && temValor(respostas[c.id]); }); }
  function feitas() { return PERGUNTAS.filter(respondida).length; }
  var salvoEl = null;
  function marcarSalvo(texto, ok) { if (salvoEl) { salvoEl.textContent = texto; salvoEl.className = "salvo" + (ok ? " ok" : ""); } }
  function mudar(id, valor, depois) {
    respostas[id] = valor; pendentes[id] = valor;
    document.querySelectorAll("[data-mostrar-se]").forEach(function (n) { n.hidden = !visivel(JSON.parse(n.getAttribute("data-mostrar-se"))); });
    atualizarBotao();
    marcarSalvo("Salvando…");
    clearTimeout(relogio); relogio = setTimeout(salvar, depois == null ? 700 : depois);
  }
  function salvar() {
    if (salvando) { clearTimeout(relogio); relogio = setTimeout(salvar, 400); return Promise.resolve(); }
    var lote = pendentes; pendentes = {};
    if (!Object.keys(lote).length) return Promise.resolve();
    salvando = true;
    return pedir({ acao: "salvar", respostas: lote }).then(function (r) {
      salvando = false;
      if (!r.ok) throw new Error(r.erro || "erro");
      marcarSalvo("Salvo às " + hora(new Date()), true);
    }).catch(function () {
      salvando = false;
      Object.keys(lote).forEach(function (k) { if (!(k in pendentes)) pendentes[k] = lote[k]; });
      marcarSalvo("Sem conexão. Tento de novo em instantes.");
      clearTimeout(relogio); relogio = setTimeout(salvar, 5000);
    });
  }
  window.addEventListener("beforeunload", function (ev) { if (Object.keys(pendentes).length) { ev.preventDefault(); ev.returnValue = ""; } });

  // ── máscaras (só formatam o que a pessoa digita) ──
  function digitos(v, max) { return String(v || "").replace(/\D/g, "").slice(0, max); }
  var MASCARA = {
    telefone: function (v) { var d = digitos(v, 11); if (d.length <= 2) return d; if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
      return "(" + d.slice(0, 2) + ") " + (d.length === 11 ? d.slice(2, 7) + "-" + d.slice(7) : d.slice(2, 6) + "-" + d.slice(6)); },
    data: function (v) { var d = digitos(v, 8); return d.length <= 2 ? d : d.length <= 4 ? d.slice(0, 2) + "/" + d.slice(2) : d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4); },
    cep: function (v) { var d = digitos(v, 8); return d.length <= 5 ? d : d.slice(0, 5) + "-" + d.slice(5); },
    documento: function (v) { var d = digitos(v, 14);
      if (d.length <= 11) return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
      return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2"); },
  };
  var TECLADO = { email: "email", telefone: "tel", data: "numeric", cep: "numeric", documento: "numeric" };
  var AUTO = { resp_nome: "name", resp_email: "email", resp_celular: "tel", cli_cep: "postal-code", cli_endereco: "street-address", cli_email_nota: "email" };
  // CEP preenche o endereço e a cidade, se estiverem vazios (ViaCEP recebe só o CEP)
  function buscarCep(cep) {
    var d = digitos(cep, 8); if (d.length !== 8) return;
    fetch("https://viacep.com.br/ws/" + d + "/json/").then(function (r) { return r.json(); }).then(function (e) {
      if (!e || e.erro) return;
      var end = document.getElementById("c-cli_endereco"), cid = document.getElementById("c-cli_cidade");
      if (end && !end.value.trim() && e.logradouro) { end.value = e.logradouro + ", "; mudar("cli_endereco", end.value); }
      if (cid && !cid.value.trim() && e.localidade) { cid.value = [e.bairro, e.localidade + " - " + e.uf].filter(Boolean).join(", "); mudar("cli_cidade", cid.value); }
    }).catch(function () { /* sem o preenchimento, a pessoa digita */ });
  }

  // ── telas ──
  var botaoPrincipal = null;
  function atualizarBotao() {
    if (!botaoPrincipal || atual < 0 || atual >= PERGUNTAS.length) return;
    botaoPrincipal.innerHTML = "";
    botaoPrincipal.appendChild(document.createTextNode(respondida(PERGUNTAS[atual]) ? "Continuar" : "Pular por agora"));
    botaoPrincipal.appendChild(el("span", { class: "seta", "aria-hidden": "true", texto: "→" }));
  }
  // ── microfone: fala e o texto aparece escrito (reconhecimento de voz do próprio navegador; nada de áudio é guardado) ──
  var FALA = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var ouvindo = null;
  function microfone(entrada, c) {
    var area = c.tipo === "texto";
    var dica = area ? el("span", { class: "dica-mic", texto: "Toque no microfone para falar" }) : null;
    var botao = el("button", { type: "button", class: "mic", "aria-label": "Falar em vez de digitar", title: "Falar em vez de digitar" });
    botao.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Zm6-3.5a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.91V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.59a6 6 0 0 0 5-5.91Z"/></svg>';
    function estado(on) {
      botao.classList.toggle("on", on); botao.setAttribute("aria-label", on ? "Parar de ouvir" : "Falar em vez de digitar");
      if (dica) { dica.textContent = on ? "Ouvindo… toque de novo para parar" : "Toque no microfone para falar"; dica.classList.toggle("on", on); }
    }
    botao.addEventListener("click", function () {
      if (ouvindo) { ouvindo.parar(); return; }
      var rec = new FALA(), base = entrada.value, parado = false;
      rec.lang = "pt-BR"; rec.continuous = true; rec.interimResults = true;
      rec.onresult = function (ev) {
        var txt = "";
        for (var i = 0; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
        var junto = (base && txt ? base.replace(/\s*$/, " ") : base) + txt;
        entrada.value = junto.charAt(0).toUpperCase() + junto.slice(1);
        mudar(c.id, entrada.value);
      };
      function fim() { if (parado) return; parado = true; ouvindo = null; estado(false); clearTimeout(relogio); salvar(); }
      rec.onend = fim; rec.onerror = fim;
      ouvindo = { parar: function () { try { rec.stop(); } catch (e) { fim(); } } };
      estado(true);
      try { rec.start(); } catch (e) { fim(); }
    });
    return area ? el("div", { class: "barra-mic" }, [dica, botao]) : botao;
  }
  // ── tabela (equipe): linhas "função|pessoas|cargo novo", com "Adicionar função"; tirar linha pelo × ──
  function tabela(c) {
    var linhas = (Array.isArray(respostas[c.id]) ? respostas[c.id] : []).map(function (l) { return String(l).split("|"); });
    while (linhas.length < (c.linhas || 3)) linhas.push([]);
    var corpo = el("div", { class: "tabela-corpo" });
    function gravar() {
      var v = linhas.map(function (l) { return c.colunas.map(function (_, i) { return (l[i] || "").replace(/\|/g, "/").trim(); }); })
        .filter(function (l) { return l.some(Boolean); }).map(function (l) { return l.join("|"); });
      mudar(c.id, v);
    }
    function desenhar() {
      corpo.innerHTML = "";
      linhas.forEach(function (l, n) {
        corpo.appendChild(el("div", { class: "tabela-linha" }, c.colunas.map(function (col, i) {
          var inp = el("input", { type: "text", class: "entrada", "aria-label": col.rotulo + " (linha " + (n + 1) + ")", placeholder: n === 0 ? col.exemplo || "" : "", inputmode: col.numero ? "numeric" : null, autocomplete: "off" });
          inp.value = l[i] || "";
          inp.addEventListener("input", function () { if (col.numero) inp.value = inp.value.replace(/\D/g, "").slice(0, 4); l[i] = inp.value; gravar(); });
          inp.addEventListener("blur", function () { clearTimeout(relogio); salvar(); });
          return inp;
        }).concat([el("button", { type: "button", class: "tirar", "aria-label": "Tirar esta linha", texto: "×", onclick: function () {
          linhas.splice(n, 1); if (!linhas.length) linhas.push([]); desenhar(); gravar();
        } })])));
      });
    }
    desenhar();
    var cabeca = el("div", { class: "tabela-linha cabeca", "aria-hidden": "true" }, c.colunas.map(function (col) { return el("span", { texto: col.rotulo }); }).concat([el("span", {})]));
    var mais = el("button", { type: "button", class: "btn ghost mais", texto: "+ Adicionar função", onclick: function () {
      if (linhas.length >= 20) return;
      linhas.push([]); desenhar(); var ins = corpo.querySelectorAll(".tabela-linha:last-child input"); if (ins[0]) ins[0].focus();
    } });
    return el("div", { class: "campo tabela", role: "group", "aria-label": c.rotulo }, [cabeca, corpo, mais]);
  }
  function campo(c) {
    var id = "c-" + c.id, caixa;
    if (c.tipo === "uma" || c.tipo === "varias") {
      var valor = respostas[c.id];
      if (c.tipo === "varias" && typeof valor === "string") valor = valor ? [valor] : []; // resposta antiga, de escolha única
      caixa = el("div", { class: "campo", role: c.tipo === "uma" ? "radiogroup" : "group", "aria-label": c.rotulo }, [
        el("div", { class: "opcoes" + (c.opcoes.length >= 4 && c.opcoes.every(function (o) { return o.length <= 30; }) ? " duas-col" : ""), "data-letras": "1" }, c.opcoes.map(function (o, i) {
          var marcado = c.tipo === "uma" ? valor === o : Array.isArray(valor) && valor.indexOf(o) >= 0;
          var inp = el("input", { type: c.tipo === "uma" ? "radio" : "checkbox", name: id, value: o, id: id + "-" + i, checked: marcado, onchange: function () {
            if (c.tipo === "uma") mudar(c.id, o, 0);
            else mudar(c.id, Array.prototype.slice.call(document.querySelectorAll('input[name="' + id + '"]:checked')).map(function (x) { return x.value; }), 0);
          } });
          return el("label", { class: "opcao" + (c.tipo === "varias" ? " varias" : ""), for: id + "-" + i }, [inp, el("kbd", { class: "letra", "aria-hidden": "true", texto: String.fromCharCode(65 + i) }), el("span", { class: "txt", texto: o }), el("span", { class: "marca", "aria-hidden": "true" })]);
        })),
      ]);
      if (c.rotulo && PERGUNTAS[atual].campos.length > 1) caixa.insertBefore(el("span", { class: "rot", texto: c.rotulo }), caixa.firstChild);
    } else if (c.tipo === "tabela") {
      caixa = tabela(c);
    } else {
      var area = c.tipo === "texto";
      var entrada = el(area ? "textarea" : "input", area ? { id: id, class: "entrada", rows: "4" } : {
        id: id, class: "entrada", type: c.tipo === "email" ? "email" : c.tipo === "telefone" ? "tel" : "text",
        inputmode: TECLADO[c.tipo] || null, autocomplete: AUTO[c.id] || "off", placeholder: c.tipo === "data" ? "dd/mm/aaaa" : c.tipo === "cep" ? "00000-000" : null,
        autocapitalize: c.tipo === "email" ? "none" : null, spellcheck: c.tipo === "email" ? "false" : null,
      });
      entrada.value = typeof respostas[c.id] === "string" ? respostas[c.id] : "";
      entrada.addEventListener("input", function () {
        if (MASCARA[c.tipo]) entrada.value = MASCARA[c.tipo](entrada.value);
        mudar(c.id, entrada.value);
        if (c.tipo === "cep") buscarCep(entrada.value);
      });
      entrada.addEventListener("blur", function () { clearTimeout(relogio); salvar(); });
      var podeFalar = FALA && c.tipo === "texto"; // só nas respostas longas; nome, endereço e números a pessoa digita
      caixa = el("div", { class: "campo" }, [el("label", { class: "rot", for: id, texto: c.rotulo }), c.ajuda ? el("span", { class: "ajuda", texto: c.ajuda }) : null,
        podeFalar ? el("div", { class: "com-mic" + (area ? " area" : "") }, [entrada, microfone(entrada, c)]) : entrada]);
    }
    if (c.ajuda && (c.tipo === "uma" || c.tipo === "varias")) caixa.appendChild(el("span", { class: "ajuda", texto: c.ajuda }));
    if (c.mostrarSe) { caixa.setAttribute("data-mostrar-se", JSON.stringify(c)); caixa.hidden = !visivel(c); }
    return caixa;
  }
  function topo(escura) {
    var n = PERGUNTAS.length, passo = atual >= 0 && atual < n ? (atual + 1) + " de " + n : "";
    var pct = atual < 0 ? 0 : atual >= n ? 100 : Math.round((atual / n) * 100);
    var t = el("div", {}, [
      el("div", { class: "topo" }, [el("img", { src: escura ? "./logo-gsc-branco.png" : "./logo-gsc.png", alt: "Gestão Sem Caos" }), null]),
      escura ? null : el("div", { class: "trilho", "aria-hidden": "true" }, [el("i", {})]),
    ]);
    if (!escura) requestAnimationFrame(function () { var i = t.querySelector(".trilho i"); if (i) i.style.width = pct + "%"; });
    return t;
  }
  function montar(escura, conteudo, rodape, tipo) {
    folha.className = "folha" + (escura ? " escura" : "") + (tipo ? " " + tipo : "");
    folha.innerHTML = "";
    var tela = el("section", { class: "tela" + (semMovimento ? "" : " entra"), "aria-live": "polite" }, conteudo);
    folha.appendChild(topo(escura));
    folha.appendChild(tela);
    if (rodape.length) folha.appendChild(el("div", { class: "rodape" }, rodape));
    var foco = tela.querySelector("input.entrada, textarea, input[type=radio], input[type=checkbox], .btn.grande");
    var h = tela.querySelector("h1"); if (h) h.setAttribute("tabindex", "-1");
    setTimeout(function () { if (foco && window.innerWidth > 640 && (foco.classList.contains("entrada") || foco.classList.contains("grande"))) foco.focus(); else if (h) h.focus({ preventScroll: true }); }, semMovimento ? 0 : 60);
    window.scrollTo(0, 0);
  }
  function irPara(i) {
    clearTimeout(relogio); salvar();
    atual = i;
    if (atual < 0) return abertura();
    if (atual >= PERGUNTAS.length + 1) return recebido();
    if (atual === PERGUNTAS.length) return revisar();
    var p = PERGUNTAS[atual];
    salvoEl = el("span", { class: "salvo", "aria-live": "polite" });
    botaoPrincipal = el("button", { type: "button", class: "btn principal", onclick: function () { irPara(atual + 1); } });
    montar(false, [
      el("span", { class: "contador", "aria-label": "Pergunta " + (atual + 1) + " de " + PERGUNTAS.length }, [el("b", { texto: String(atual + 1).padStart(2, "0") }), " / " + String(PERGUNTAS.length).padStart(2, "0")]),
      el("h1", { texto: p.titulo }),
      p.porque ? el("p", { class: "sub", texto: p.porque }) : null,
      el("div", { class: "campos" }, p.campos.map(campo)),
    ], [
      el("button", { type: "button", class: "btn ghost", onclick: function () { irPara(atual - 1); } }, [el("span", { class: "seta volta", "aria-hidden": "true", texto: "←" }), "Voltar"]),
      salvoEl, el("span", { class: "dica" }, ["Enter ", el("kbd", { texto: "↵" }), p.campos.some(function (c) { return c.tipo === "uma" || c.tipo === "varias"; }) ? " · ou a letra da opção" : null]), botaoPrincipal,
    ]);
    atualizarBotao();
  }
  function primeiraSemResposta() { for (var i = 0; i < PERGUNTAS.length; i++) if (!respondida(PERGUNTAS[i])) return i; return PERGUNTAS.length; }
  function abertura() {
    var comeco = feitas() > 0;
    montar(true, [
      el("span", { class: "selo", texto: "Briefing · " + clinica }),
      el("h1", { texto: "Vamos preparar o BI da sua clínica" }),
      el("p", { class: "sub", texto: "Perguntas rápidas, uma de cada vez. O que o sistema da clínica já tem, a gente lê sozinho. Não sabe alguma? Pode pular." }),
      el("div", { class: "meta" }, [
        el("div", {}, [el("b", { texto: String(PERGUNTAS.length) }), el("span", { texto: "perguntas" })]),
        el("div", {}, [el("b", { texto: "10 min" }), el("span", { texto: "mais ou menos" })]),
        el("div", {}, [el("b", { texto: "Salva" }), el("span", { texto: "a cada resposta" })]),
      ]),
      el("button", { type: "button", class: "btn laranja grande", texto: comeco ? "Continuar de onde parei" : "Começar", onclick: function () { irPara(comeco ? Math.min(primeiraSemResposta(), PERGUNTAS.length) : 0); } }),
      enviadoEm ? el("p", { class: "nota-abertura", texto: "Você já enviou em " + dia(enviadoEm) + ". Pode corrigir à vontade: a gente sempre vê a versão mais nova." }) : null,
    ], [], "abertura");
  }
  function revisar() {
    var n = feitas(), total = PERGUNTAS.length, faltam = PERGUNTAS.map(function (p, i) { return respondida(p) ? null : i; }).filter(function (x) { return x !== null; });
    salvoEl = el("span", { class: "salvo" });
    var enviar = el("button", { type: "button", class: "btn laranja principal", texto: enviadoEm ? "Enviar de novo" : "Enviar respostas", onclick: function () {
      enviar.disabled = true; enviar.textContent = "Enviando…";
      salvar().then(function () {
        if (Object.keys(pendentes).length) throw new Error("pendente");
        return pedir({ acao: "enviar" });
      }).then(function (r) {
        if (!r.ok) throw new Error(r.erro || "erro");
        enviadoEm = new Date().toISOString(); irPara(total + 1);
      }).catch(function () { enviar.disabled = false; enviar.textContent = enviadoEm ? "Enviar de novo" : "Enviar respostas"; marcarSalvo("Não deu para enviar agora. Tente de novo."); });
    } });
    montar(false, [
      el("span", { class: "eyebrow", texto: "Tudo certo?" }),
      el("h1", { texto: n === total ? "Você respondeu todas as perguntas." : "Você respondeu " + n + " de " + total + "." }),
      el("p", { class: "sub", texto: n === total ? "Se quiser, volte e confira. Quando estiver bom, é só enviar." : "Pode enviar assim e completar na reunião, ou voltar às que ficaram em branco." }),
      faltam.length ? el("div", { class: "opcoes" }, faltam.slice(0, 6).map(function (i) {
        return el("button", { type: "button", class: "opcao", onclick: function () { irPara(i); } }, [el("span", { class: "marca", "aria-hidden": "true" }), el("span", { texto: PERGUNTAS[i].titulo })]);
      })) : null,
    ], [
      el("button", { type: "button", class: "btn ghost", texto: "Voltar", onclick: function () { irPara(total - 1); } }), salvoEl, enviar,
    ]);
  }
  function recebido() {
    montar(false, [
      el("div", { class: "ok-grande", "aria-hidden": "true" }),
      el("h1", { texto: "Recebemos as suas respostas. Obrigado!" }),
      el("p", { class: "sub", texto: "A Gestão Sem Caos já pode preparar a implantação. Se lembrar de algo, é só abrir este mesmo link e corrigir." }),
    ], [el("button", { type: "button", class: "btn ghost", texto: "Rever as respostas", onclick: function () { irPara(0); } })]);
  }
  function erro(titulo, texto) {
    montar(false, [el("h1", { texto: titulo }), el("p", { class: "sub", texto: texto })], []);
  }
  document.addEventListener("keydown", function (ev) {
    var alvo = ev.target, digitando = alvo && (alvo.tagName === "INPUT" && /text|email|tel/.test(alvo.type) || alvo.tagName === "TEXTAREA");
    if (!digitando && !ev.metaKey && !ev.ctrlKey && !ev.altKey && /^[a-z]$/i.test(ev.key) && atual >= 0 && atual < PERGUNTAS.length) {
      var grupos = Array.prototype.filter.call(document.querySelectorAll(".opcoes[data-letras]"), function (g) { return !g.closest("[hidden]"); });
      if (grupos.length === 1) {
        var op = grupos[0].querySelectorAll("label.opcao")[ev.key.toUpperCase().charCodeAt(0) - 65];
        if (op) { ev.preventDefault(); op.click(); return; }
      }
    }
    if (ev.key !== "Enter" || atual < 0 || atual >= PERGUNTAS.length || !botaoPrincipal) return;
    var t = ev.target;
    if (t && t.tagName === "TEXTAREA" && !(ev.metaKey || ev.ctrlKey)) return;
    if (t && t.tagName === "BUTTON") return;
    ev.preventDefault(); botaoPrincipal.click();
  });

  if (!codigo) { erro("Link incompleto", "Abra o link inteiro que a Gestão Sem Caos mandou."); return; }
  pedir({ acao: "ler" }).then(function (r) {
    if (!r.ok) { erro("Este link não abre", r.erro || "Peça um novo à Gestão Sem Caos."); return; }
    respostas = r.respostas || {}; enviadoEm = r.enviado_em || null; clinica = r.clinica;
    document.title = "Briefing · " + r.clinica;
    abertura();
  }).catch(function () { erro("Sem conexão", "Não consegui abrir o briefing agora. Confira a internet e recarregue a página."); });
})();
