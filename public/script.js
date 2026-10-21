"use strict";

let chapas = [];
let estadoEleicao = "nao_configurada";
let numeroDigitado = "";
let chapaSelecionada = null;
let votoEnviado = false;

const campoNome = document.querySelector("#nome-eleitor");
const visorNumero = document.querySelector("#numero");
const mensagem = document.querySelector("#mensagem");
const statusEleicao = document.querySelector("#status-eleicao");
const cartaoChapa = document.querySelector("#cartao-chapa");
const nomeChapa = document.querySelector("#nome-chapa");
const integrantesChapa = document.querySelector("#integrantes-chapa");
const fotoArea = document.querySelector("#foto-area");
const botoesTeclado = [...document.querySelectorAll("[data-digito]")];
const botaoCorrigir = document.querySelector("#corrigir");
const botaoConfirmar = document.querySelector("#confirmar");
const resultadoArea = document.querySelector("#resultado-area");
const resultadoResumo = document.querySelector("#resultado-resumo");
const resultadoLista = document.querySelector("#resultado-lista");
const botaoEnviarRelatorio = document.querySelector("#enviar-relatorio");
const mensagemRelatorio = document.querySelector("#mensagem-relatorio");

async function requisicao(url, opcoes = {}) {
  const resposta = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opcoes
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || "Ocorreu um erro na solicitação.");
  return dados;
}

function exibirMensagem(texto, tipo = "") {
  mensagem.textContent = texto;
  mensagem.className = "mensagem";
  if (tipo) mensagem.classList.add(tipo);
}

function atualizarNumero() {
  visorNumero.textContent = numeroDigitado ? numeroDigitado.padEnd(3, "_").split("").join(" ") : "_ _ _";
}

function limparChapaExibida() {
  cartaoChapa.hidden = true;
  nomeChapa.textContent = "";
  integrantesChapa.textContent = "";
  chapaSelecionada = null;
  const imagemAtual = document.querySelector("#foto-equipe");
  if (imagemAtual) imagemAtual.remove();
  fotoArea.hidden = false;
  fotoArea.textContent = "FOTO DA EQUIPE";
  fotoArea.className = "foto-area";
}

function votacaoPodeContinuar() {
  return estadoEleicao === "aberta" && !votoEnviado && campoNome.value.trim().length >= 3;
}

function atualizarBotoes() {
  const ativo = votacaoPodeContinuar();
  botoesTeclado.forEach(botao => botao.disabled = !ativo);
  botaoCorrigir.disabled = !ativo;
  botaoConfirmar.disabled = !ativo || !chapaSelecionada;
}

function atualizarEstadoVisual() {
  if (estadoEleicao === "nao_configurada") {
    statusEleicao.textContent = "Eleição ainda não configurada";
    exibirMensagem("A urna está aguardando a configuração oficial das chapas e dos horários.");
  } else if (estadoEleicao === "aguardando") {
    statusEleicao.textContent = "Votação ainda não começou";
    exibirMensagem("A votação ainda não começou.");
  } else if (estadoEleicao === "encerrada") {
    statusEleicao.textContent = "Votação encerrada";
    exibirMensagem("A votação foi encerrada. A apuração está disponível.");
    carregarResultado();
  } else {
    statusEleicao.textContent = "Votação aberta";
    exibirMensagem("Digite seu nome completo e, em seguida, o número de três dígitos da chapa.");
  }
  atualizarBotoes();
}

function exibirChapa(chapa) {
  chapaSelecionada = chapa;
  cartaoChapa.hidden = false;
  nomeChapa.textContent = chapa.nome;
  integrantesChapa.textContent = chapa.integrantes || "Integrantes não informados";

  const imagemAtual = document.querySelector("#foto-equipe");
  if (imagemAtual) imagemAtual.remove();
  fotoArea.hidden = false;
  fotoArea.textContent = "FOTO DA EQUIPE";
  fotoArea.className = "foto-area";

  if (chapa.foto) {
    const imagem = document.createElement("img");
    imagem.id = "foto-equipe";
    imagem.className = "foto-equipe";
    imagem.src = chapa.foto;
    imagem.alt = "Fotografia da equipe da chapa " + chapa.nome;
    imagem.onerror = () => {
      imagem.remove();
      fotoArea.hidden = false;
      fotoArea.textContent = "FOTO INDISPONÍVEL";
    };
    fotoArea.hidden = true;
    fotoArea.insertAdjacentElement("afterend", imagem);
  }
  exibirMensagem("Confira os dados da chapa. O voto só será enviado ao pressionar CONFIRMA VOTO.", "sucesso");
  atualizarBotoes();
}

function digitarDigito(digito) {
  if (!votacaoPodeContinuar()) return;
  if (numeroDigitado.length >= 3) {
    exibirMensagem("O número tem três dígitos. Pressione CORRIGE para reiniciar.", "erro");
    return;
  }

  numeroDigitado += digito;
  atualizarNumero();
  limparChapaExibida();

  if (numeroDigitado.length < 3) {
    exibirMensagem("Digite os três dígitos do número da chapa.");
    atualizarBotoes();
    return;
  }

  const chapa = chapas.find(item => item.numero === numeroDigitado);
  if (!chapa) {
    exibirMensagem("Número não cadastrado. Nenhum voto foi registrado.", "erro");
    atualizarBotoes();
    return;
  }
  exibirChapa(chapa);
}

function corrigirSelecao() {
  if (votoEnviado) return;
  numeroDigitado = "";
  limparChapaExibida();
  atualizarNumero();
  exibirMensagem("Seleção corrigida. Digite novamente o número da chapa.");
  atualizarBotoes();
}

async function confirmarVoto() {
  if (!votacaoPodeContinuar()) return;
  if (!chapaSelecionada || numeroDigitado !== chapaSelecionada.numero) {
    exibirMensagem("A chapa selecionada não corresponde ao número digitado.", "erro");
    return;
  }

  const confirmar = window.confirm(
    `Confirma seu voto na chapa ${chapaSelecionada.numero} — ${chapaSelecionada.nome}?\n\nConfira os dados antes de continuar.`
  );
  if (!confirmar) return;

  botaoConfirmar.disabled = true;
  try {
    const resposta = await requisicao("/api/votar", {
      method: "POST",
      body: JSON.stringify({
        nome: campoNome.value.trim(),
        numero: chapaSelecionada.numero
      })
    });
    votoEnviado = true;
    exibirMensagem(resposta.mensagem, "sucesso");
    campoNome.disabled = true;
    numeroDigitado = "";
    atualizarNumero();
    limparChapaExibida();
    atualizarBotoes();
    botoesTeclado.forEach(botao => botao.disabled = true);
    botaoCorrigir.disabled = true;
  } catch (erro) {
    exibirMensagem(erro.message, "erro");
    atualizarBotoes();
  }
}

async function carregarResultado() {
  try {
    const resultado = await requisicao("/api/resultado");
    resultadoArea.hidden = false;
    resultadoResumo.textContent =
      `Total de participações: ${resultado.totalParticipacoes}. Total de votos: ${resultado.totalVotos}.`;
    resultadoLista.replaceChildren();

    resultado.resultados.forEach(item => {
      const linha = document.createElement("div");
      linha.className = "resultado-item";
      const nome = document.createElement("span");
      nome.textContent = `${item.numero} — ${item.nome}`;
      const total = document.createElement("strong");
      total.textContent = `${item.votos} voto(s)`;
      linha.append(nome, total);
      resultadoLista.append(linha);
    });
  } catch (erro) {
    resultadoArea.hidden = true;
  }
}

botaoEnviarRelatorio.addEventListener("click", async () => {
  botaoEnviarRelatorio.disabled = true;
  mensagemRelatorio.textContent = "Enviando relatório...";
  try {
    const resposta = await requisicao("/api/relatorio/enviar", { method: "POST", body: "{}" });
    mensagemRelatorio.textContent = resposta.mensagem;
  } catch (erro) {
    mensagemRelatorio.textContent = erro.message;
  } finally {
    botaoEnviarRelatorio.disabled = false;
  }
});

botoesTeclado.forEach(botao => botao.addEventListener("click", () => digitarDigito(botao.dataset.digito)));
botaoCorrigir.addEventListener("click", corrigirSelecao);
botaoConfirmar.addEventListener("click", confirmarVoto);

campoNome.addEventListener("input", () => {
  numeroDigitado = "";
  limparChapaExibida();
  atualizarNumero();
  if (estadoEleicao === "aberta" && !votoEnviado) {
    exibirMensagem("Confira o nome informado e digite os três dígitos da chapa.");
  }
  atualizarBotoes();
});

async function iniciar() {
  try {
    const status = await requisicao("/api/status");
    estadoEleicao = status.estado;
    if (estadoEleicao !== "nao_configurada") {
      chapas = await requisicao("/api/chapas");
    }
    atualizarEstadoVisual();
  } catch (erro) {
    statusEleicao.textContent = "Servidor indisponível";
    exibirMensagem("Não foi possível conectar ao servidor da urna. Inicie o backend e atualize a página.", "erro");
  }
}

iniciar();
