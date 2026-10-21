require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const nodemailer = require("nodemailer");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const CONFIG_PATH = path.join(__dirname, "config.json");
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "urna.sqlite");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
app.use(express.json({ limit: "30kb" }));
app.use(express.static(path.join(__dirname, "public")));

function lerConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS participacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome_normalizado TEXT NOT NULL UNIQUE,
    nome_exibicao TEXT NOT NULL,
    registrado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS votos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_chapa TEXT NOT NULL,
    registrado_em TEXT NOT NULL
  );
`);

function normalizarNome(nome) {
  return String(nome || "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function estadoEleicao(config) {
  const abertura = new Date(config.eleicao.abertura);
  const encerramento = new Date(config.eleicao.encerramento);
  if (!config.eleicao.abertura || !config.eleicao.encerramento ||
      Number.isNaN(abertura.getTime()) || Number.isNaN(encerramento.getTime()) ||
      abertura >= encerramento || !Array.isArray(config.chapas) || config.chapas.length === 0) {
    return "nao_configurada";
  }
  const agora = new Date();
  if (agora < abertura) return "aguardando";
  if (agora >= encerramento) return "encerrada";
  return "aberta";
}

function validarConfig(config) {
  if (!config || !config.eleicao || !Array.isArray(config.chapas)) {
    return "O arquivo config.json está incompleto.";
  }
  const numeros = config.chapas.map(c => String(c.numero || ""));
  if (config.chapas.some(c => !/^\d{3}$/.test(String(c.numero || "")))) {
    return "Cada chapa precisa ter um número oficial de exatamente três dígitos.";
  }
  if (new Set(numeros).size !== numeros.length) {
    return "Há números de chapa repetidos no config.json.";
  }
  if (config.chapas.some(c => !String(c.nome || "").trim())) {
    return "Toda chapa cadastrada precisa ter nome.";
  }
  return null;
}

app.get("/api/status", (req, res) => {
  const config = lerConfig();
  const estado = estadoEleicao(config);
  res.json({
    nomeEleicao: config.eleicao.nome || "Eleição do Grêmio Estudantil",
    estado,
    abertura: config.eleicao.abertura || null,
    encerramento: config.eleicao.encerramento || null,
    chapasConfiguradas: config.chapas.length
  });
});

app.get("/api/chapas", (req, res) => {
  const config = lerConfig();
  const erro = validarConfig(config);
  if (erro) return res.status(503).json({ erro });
  // Não expõe resultados durante a votação.
  res.json(config.chapas.map(c => ({
    numero: String(c.numero),
    nome: String(c.nome),
    integrantes: String(c.integrantes || ""),
    foto: String(c.foto || "")
  })));
});

app.post("/api/votar", (req, res) => {
  const config = lerConfig();
  const estado = estadoEleicao(config);
  if (estado !== "aberta") {
    return res.status(403).json({ erro: "A votação não está aberta." });
  }

  const nome = String(req.body.nome || "").trim().replace(/\s+/g, " ");
  const numero = String(req.body.numero || "").trim();

  if (nome.length < 3 || nome.length > 120) {
    return res.status(400).json({ erro: "Informe o nome completo (entre 3 e 120 caracteres)." });
  }
  if (!/^\d{3}$/.test(numero)) {
    return res.status(400).json({ erro: "O número da chapa deve ter exatamente três dígitos." });
  }

  const erroConfig = validarConfig(config);
  if (erroConfig) return res.status(503).json({ erro: erroConfig });

  const chapa = config.chapas.find(c => String(c.numero) === numero);
  if (!chapa) {
    return res.status(400).json({ erro: "Esse número não corresponde a uma chapa cadastrada. Nenhum voto foi registrado." });
  }

  const nomeNormalizado = normalizarNome(nome);
  const agora = new Date().toISOString();

  // Uma transação impede que a participação seja marcada sem o registro do voto,
  // ou que o voto seja registrado sem marcar a participação. Os dados ficam em
  // tabelas separadas; não há eleitor_id ou nome na tabela de votos.
  const registrar = db.transaction(() => {
    const existente = db.prepare(
      "SELECT id FROM participacoes WHERE nome_normalizado = ?"
    ).get(nomeNormalizado);

    if (existente) {
      const erro = new Error("Este nome já consta como participante. Se isso for um engano, procure a equipe responsável.");
      erro.status = 409;
      throw erro;
    }

    db.prepare(
      "INSERT INTO participacoes (nome_normalizado, nome_exibicao, registrado_em) VALUES (?, ?, ?)"
    ).run(nomeNormalizado, nome, agora);

    db.prepare(
      "INSERT INTO votos (numero_chapa, registrado_em) VALUES (?, ?)"
    ).run(numero, agora);
  });

  try {
    registrar();
    return res.json({ sucesso: true, mensagem: "Voto registrado. Obrigado por participar da eleição." });
  } catch (err) {
    if (err.status === 409 || String(err.code || "").includes("SQLITE_CONSTRAINT_UNIQUE")) {
      return res.status(409).json({ erro: "Este nome já consta como participante. Se isso for um engano, procure a equipe responsável." });
    }
    console.error("Erro ao registrar voto:", err.message);
    return res.status(500).json({ erro: "Não foi possível registrar o voto. Procure a equipe responsável." });
  }
});

function obterRelatorio(config) {
  const participacoes = db.prepare(
    "SELECT nome_exibicao, registrado_em FROM participacoes ORDER BY nome_exibicao COLLATE NOCASE"
  ).all();
  const contagens = db.prepare(
    "SELECT numero_chapa, COUNT(*) AS total FROM votos GROUP BY numero_chapa"
  ).all();
  const mapa = new Map(contagens.map(item => [item.numero_chapa, item.total]));
  const resultados = config.chapas.map(chapa => ({
    numero: String(chapa.numero),
    nome: String(chapa.nome),
    votos: mapa.get(String(chapa.numero)) || 0
  }));
  const totalVotos = db.prepare("SELECT COUNT(*) AS total FROM votos").get().total;
  return {
    eleicao: config.eleicao.nome || "Eleição do Grêmio Estudantil",
    geradoEm: new Date().toLocaleString("pt-BR"),
    participacoes,
    resultados,
    totalParticipacoes: participacoes.length,
    totalVotos
  };
}

app.get("/api/resultado", (req, res) => {
  const config = lerConfig();
  if (estadoEleicao(config) !== "encerrada") {
    return res.status(403).json({ erro: "A apuração só é liberada após o encerramento da votação." });
  }
  const relatorio = obterRelatorio(config);
  res.json({
    eleicao: relatorio.eleicao,
    geradoEm: relatorio.geradoEm,
    totalParticipacoes: relatorio.totalParticipacoes,
    totalVotos: relatorio.totalVotos,
    resultados: relatorio.resultados
  });
});

app.post("/api/relatorio/enviar", async (req, res) => {
  const config = lerConfig();
  if (estadoEleicao(config) !== "encerrada") {
    return res.status(403).json({ erro: "O relatório só pode ser enviado após o encerramento." });
  }

  const emailDestino = String(config.eleicao.emailEscola || "").trim();
  if (!emailDestino) {
    return res.status(503).json({ erro: "Configure o e-mail institucional em config.json antes de enviar o relatório." });
  }

  const obrigatorias = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_REMETENTE"];
  if (obrigatorias.some(chave => !process.env[chave])) {
    return res.status(503).json({ erro: "Configure as credenciais SMTP no arquivo .env do servidor." });
  }

  try {
    const relatorio = obterRelatorio(config);
    const linhasResultado = relatorio.resultados
      .map(r => `${r.numero} — ${r.nome}: ${r.votos} voto(s)`)
      .join("\n");
    const listaParticipacao = relatorio.participacoes
      .map((p, i) => `${i + 1}. ${p.nome_exibicao}`)
      .join("\n");

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_REMETENTE,
      to: emailDestino,
      subject: `Relatório final — ${relatorio.eleicao}`,
      text:
`${relatorio.eleicao}
Relatório gerado em: ${relatorio.geradoEm}

APURAÇÃO (votos anônimos)
${linhasResultado}

Total de votos: ${relatorio.totalVotos}
Total de participações registradas: ${relatorio.totalParticipacoes}

LISTA DE PARTICIPAÇÃO
A lista abaixo registra quem informou ter votado. Ela é mantida separada da apuração e NÃO está associada às chapas escolhidas.
${listaParticipacao || "(Nenhuma participação registrada)"}

Nota: este relatório separa os registros de participação dos registros de voto. Como o sistema usa nome informado pelo próprio aluno, não comprova a identidade de quem digitou o nome.`
    });

    res.json({ sucesso: true, mensagem: "Relatório enviado ao e-mail institucional configurado." });
  } catch (err) {
    console.error("Falha no envio do relatório:", err.message);
    res.status(500).json({ erro: "Falha no envio. Verifique a configuração SMTP do servidor." });
  }
});

app.get("/api/saude", (req, res) => res.json({ online: true }));

app.listen(PORT, () => {
  console.log(`Urna Escolar disponível em http://localhost:${PORT}`);
});
