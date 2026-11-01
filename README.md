# 🎯 Agente de Vagas

Um agente de IA, feito em TypeScript com a API do Claude, que procura vagas de emprego para o
**meu perfil**, dá uma nota de compatibilidade para cada uma e me manda por **e-mail** só as
vagas novas.

Construí o agente do zero, etapa por etapa, para aprender como agentes funcionam por dentro:
o loop, as ferramentas, o contexto, a saída estruturada e a memória. Não usei nenhum framework
de agentes.

## O que ele faz

```
npm run agente
  → busca vagas na Gupy (e na Remotive, se precisar)
  → lê os alertas de vaga que o LinkedIn mandou para o meu Gmail
  → lê a descrição completa das vagas mais promissoras
  → compara cada vaga com o perfil.md e dá notas por critério
  → descarta o que já foi enviado antes (memória em vagas-vistas.json)
  → 📧 manda um e-mail com o ranking das vagas novas
```

Exemplo de saída no terminal:

```
🏆 RANKING: 1 vaga(s)

1. ANALISTA DADOS JR | Stefanini Group  ⭐ 8.6/10
   📍 remote · não informado · publicada em 2026-09-23
   📊 área 10 · nível 9 · tecnologias 8 · requisitos 8 · condições 6
   ✔ Vaga júnior na área preferida, pede SQL, dashboards e Power BI...
   ⚠ Salário não informado: confirmar se chega a R$ 3.000.
   🔗 https://stefanini.gupy.io/job/...

📧 E-mail enviado
🧠 1 vaga(s) gravada(s) na memória
```

## Como funciona

| Arquivo | Papel |
|---|---|
| `src/agente.ts` | O **loop do agente**: pensar → pedir ferramenta → executar → observar, até o modelo terminar. Também monta o system prompt com o perfil e, no final, filtra, envia o e-mail e grava a memória. |
| `src/ferramentas.ts` | As **ferramentas** que o modelo pode pedir: `buscar_vagas_gupy`, `buscar_vagas_remotive`, `ler_alertas_linkedin`, `ver_detalhes_vaga` e `registrar_avaliacao`. |
| `src/linkedin.ts` | Lê os alertas de vaga do LinkedIn na caixa do Gmail (IMAP). |
| `src/memoria.ts` | A memória de longo prazo: o `vagas-vistas.json`, que lembra o que já foi enviado. |
| `src/email.ts` | Monta o e-mail em HTML e envia pelo Gmail. |
| `src/painel.ts` | O diário de eventos: quem fez o quê e quando, para o painel em pixel art. |
| `docs/` | O painel (GitHub Pages) e o modelo da plataforma. |
| `scripts/` | Agendamento diário no Windows (`agendar.ps1`, `desagendar.ps1`) e o script que roda o agente gravando log (`rodar-agente.ps1`). |
| `perfil.md` | Quem eu sou e o que procuro. O agente lê este arquivo a cada execução. |

### Decisões de design

- **O modelo julga, o código executa.** O Claude dá as notas por critério e escreve os motivos.
  O código calcula a nota final (com pesos fixos), ordena, filtra vagas repetidas e preenche
  título, empresa e link pelo id. O que dá para fazer com um `if` não fica com o modelo.
- **Divulgação progressiva.** As buscas devolvem só um resumo de cada vaga. A descrição
  completa fica guardada e só vai para o modelo quando ele pede `ver_detalhes_vaga`. Isso deixa
  o histórico cerca de 10 vezes menor.
- **Saída estruturada.** A avaliação é uma ferramenta com `strict: true`, como um formulário que
  o modelo preenche. A faixa das notas (0 a 10) é validada no código, porque o modo estrito não
  aceita `minimum`/`maximum`.
- **Erros explicativos.** Quando uma ferramenta falha, a mensagem diz ao modelo o que fazer em
  seguida (por exemplo, "use um id que veio de uma busca"), e ele se corrige sozinho.
- **LinkedIn sem raspagem.** O LinkedIn não tem API pública e proíbe robôs. Por isso o agente lê
  os alertas que o próprio LinkedIn envia para o meu e-mail.
- **A memória só grava depois do envio.** Se o e-mail falhar, as vagas continuam "novas" e vão no
  próximo envio.

## Como rodar

```bash
npm install
cp .env.example .env
```

Preencha o `.env`:

| Variável | O que é |
|---|---|
| `ANTHROPIC_API_KEY` | Chave da API, criada em [console.anthropic.com](https://console.anthropic.com) |
| `GMAIL_USUARIO` | Seu endereço do Gmail |
| `GMAIL_SENHA_APP` | Uma [senha de app](https://myaccount.google.com/apppasswords) do Google (exige verificação em 2 etapas). Não use a senha normal. |
| `EMAIL_DESTINO` | Opcional. Para onde mandar o e-mail. O padrão é o próprio Gmail. |

Edite o `perfil.md` com o seu perfil e rode:

```bash
npm run agente
```

Para fazer um pedido específico:

```bash
npm run agente -- "vagas de estágio em desenvolvimento react"
```

Sem o Gmail configurado, o agente não envia nada. Ele salva uma prévia em
`relatorios/previa-email.html`.

## Painel: Agência Agente-RH

`docs/index.html` é um painel em pixel art publicado no GitHub Pages. Cada parte do agente é um
funcionário de uma agência de recrutamento fictícia: quem está trabalhando fica no escritório,
quem está livre vai para a sala de descanso. A página reencena a última execução real, evento por
evento, e mostra ao vivo quando o agente está rodando na nuvem. O modelo completo está em
[`docs/MODELO.md`](docs/MODELO.md).

Os dados vêm do diário que o agente grava (`src/painel.ts`), que o workflow publica na branch
`painel-dados`.

## Rodar na nuvem com GitHub Actions (recomendado)

O workflow `.github/workflows/agente.yml` roda o agente nos servidores do GitHub, sem precisar
de um PC ligado:

- **Sozinho:** todo dia às 9h30 de Manaus (13h30 UTC).
- **Na mão, inclusive pelo celular:** no app GitHub Mobile ou no site, abra **Actions → Agente de
  Vagas → Run workflow**.

Para configurar, cadastre em **Settings → Secrets and variables → Actions → New repository secret**:
`ANTHROPIC_API_KEY`, `GMAIL_USUARIO` e `GMAIL_SENHA_APP` (e, se quiser, `EMAIL_DESTINO`).

Cada execução na nuvem começa do zero, então a memória (`vagas-vistas.json`) é guardada no
**cache do GitHub Actions** entre uma execução e outra, e não fica visível no repositório.

## Rodar sozinho todo dia (Windows)

```bash
npm run agendar
```

Isso cria a tarefa **"Agente de Vagas"** no Agendador de Tarefas do Windows, para rodar todo dia
às 08:00. Para outro horário, use `npm run agendar -- -Hora 07:30`. Se o PC estiver desligado no
horário, a tarefa roda assim que ele ligar. A saída de cada execução vai para
`logs/agente-AAAA-MM-DD.log`.

**Para rodar na hora:** dê dois cliques em `Buscar vagas agora.cmd`, na pasta do projeto. Ele roda
o agente, mostra o ranking na tela e manda o e-mail. Não há risco de repetir vagas: a memória
garante que só as vagas novas vão para o e-mail, mesmo que a tarefa diária também tenha rodado.

Para parar de rodar sozinho:

```bash
npm run desagendar
```

## Ajustes rápidos

- **Pesos da nota final:** `PESOS` em `src/ferramentas.ts`
- **Nota mínima para ir no e-mail:** `NOTA_MINIMA` em `src/agente.ts`
- **Esquecer uma vaga para ela poder voltar:** apague a entrada dela no `vagas-vistas.json`

## Etapas de construção

1. Loop mínimo com uma ferramenta (Remotive)
2. Gupy como fonte principal + `ver_detalhes_vaga` (encadear ferramentas)
3. Perfil do candidato no contexto + filtro de cidade
4. Nota de compatibilidade estruturada (`strict: true`)
5. Memória entre execuções + envio de e-mail
6. Alertas do LinkedIn lidos do Gmail
7. Execução diária automática pelo Agendador de Tarefas do Windows, com log
8. Execução na nuvem com GitHub Actions (agendada ou pelo celular), com a memória no cache
9. Diário de eventos + painel em pixel art no GitHub Pages

---

Feito por **Iuran Freire** · [Portfólio](https://portifolio-iuran-freire.iuranhumberto99.workers.dev/pt) · [GitHub](https://github.com/Iuran-Freire) · [LinkedIn](https://www.linkedin.com/in/iuran-freire-a23092204)
