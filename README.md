# Urna Eletrônica Escolar — versão funcional inicial

## O que esta versão faz

- Interface de urna com teclado numérico de três dígitos.
- O próprio aluno informa o nome.
- O servidor confere se o nome já foi registrado como participante.
- A chapa é localizada pelo número exato e o voto só é enviado após confirmação explícita.
- O nome de participação fica em uma tabela; o voto fica em outra, sem campo que relacione voto a eleitor.
- A votação é aberta/encerrada conforme o horário definido no servidor.
- O resultado não é exposto antes do encerramento.
- Depois do encerramento, o sistema pode enviar um relatório para o e-mail institucional, quando SMTP e destinatário estiverem configurados.

## Limitação importante: nome digitado não comprova identidade

Como solicitado, não há validação pela comissão nem lista de eleitores. Portanto, qualquer pessoa pode digitar o nome de outra pessoa. O sistema impede que o mesmo nome normalizado seja registrado duas vezes, mas não impede que alguém tente usar o nome de um colega. A escola precisa decidir se aceita esse risco.

## Requisito de configuração antes de votar

Os nomes e números oficiais das chapas não foram inventados. O arquivo `config.json` começa sem chapas e sem horários; até que esses dados oficiais sejam inseridos, a votação permanece bloqueada.

Edite `config.json` antes da eleição, usando dados aprovados:
- `abertura`: data/hora ISO local, por exemplo `2026-11-10T08:00:00`
- `encerramento`: data/hora ISO local, por exemplo `2026-11-10T16:00:00`
- `emailEscola`: endereço institucional autorizado
- `chapas`: cada chapa deve ter `numero` com exatamente três dígitos, `nome`, `integrantes` e `foto` (caminho relativo, como `imagens/chapa-123.jpg`)

Coloque fotos na pasta `public/imagens/` e use caminhos relativos em `foto`.

## Instalação no Windows

1. Instale Node.js LTS.
2. Extraia o ZIP em uma pasta.
3. Abra o Prompt de Comando/PowerShell dentro da pasta.
4. Execute `npm install`.
5. Copie `.env.example` para `.env`.
6. Preencha as configurações SMTP no `.env` para permitir envio de e-mail.
7. Edite `config.json` com os dados oficiais, horários e e-mail de destino.
8. Execute `npm start`.
9. Abra `http://localhost:3000` no navegador.

Para testar em outro dispositivo na mesma rede, inicie o servidor no computador principal e acesse `http://IP-DO-COMPUTADOR:3000` no outro dispositivo. É necessário permitir a conexão na rede local/firewall. O sistema compartilha um banco de dados central no computador servidor.

## E-mail automático

O relatório só pode ser enviado após o encerramento. Para o envio, o `.env` precisa conter:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_REMETENTE`

O destinatário vem de `config.json` (`eleicao.emailEscola`). Nunca publique nem envie o arquivo `.env` em repositórios.

O relatório contém duas seções separadas: lista de nomes que registraram participação e totais por chapa. Não há associação explícita entre uma pessoa e uma chapa. Ainda assim, em uma eleição com poucos participantes, horários ou observação externa podem permitir inferências; o sistema não oferece anonimato criptográfico nem auditoria eleitoral formal.

## Segurança e uso real

Este é um sistema escolar inicial, não uma urna certificada. Antes de uso oficial:
- teste abertura/encerramento, votos duplicados, números inexistentes, quedas e envio de e-mail;
- faça backup do banco e restrinja o acesso ao computador servidor;
- evite publicar o servidor diretamente na internet;
- defina quem pode acessar o relatório;
- avalie LGPD e o risco de permitir identificação apenas por nome.

O nome é dado pessoal. Guarde o banco com acesso restrito e elimine-o conforme o prazo definido pela escola.
