# Modelo da plataforma: Agência Agente-RH

Uma página (GitHub Pages) que mostra o meu agente de vagas trabalhando num **escritório em
pixel art isométrico**. O painel mostra só o que existe de verdade no código: **um agente**.

## Os personagens

| Personagem | Quem é |
|---|---|
| **Agente de Vagas** (robô) | O único agente do projeto. Ele vai até a estação da ferramenta que está usando em cada momento, então quem assiste vê o loop do agente acontecendo. |
| **Iuran** (o chefe) | Eu: cabelo castanho, olhos verdes, cavanhaque e camiseta oversize escura. Supervisiona quando o agente trabalha e recebe as vagas por e-mail no fim. |

## Cada mesa é uma ferramenta

| Estação no escritório | O que o agente está fazendo |
|---|---|
| Mesa do agente | pensando: o modelo (Claude) decidindo o próximo passo |
| Mesa de busca | `buscar_vagas_gupy`, `buscar_vagas_remotive` |
| Janela, com o celular | `ler_alertas_linkedin` |
| Mesa de análise | `ver_detalhes_vaga` |
| Quadro de notas | `registrar_avaliacao` |
| Balcão e caixa de correio | o envio do e-mail |

## Telas e interações

1. **A cena (pixel art isométrico, estilo jogo de sala), com duas salas**
   - Vista na diagonal, como em jogos de sala. O chão é uma grade de tiles, os móveis são blocos
     3D e os personagens andam de tile em tile desviando dos móveis (busca em largura na grade).
     O motor fica em `docs/cena.js`.
   - Escritório e sala de descanso separados por uma meia-parede de vidro com porta.
   - **Escritório (fundo):** mesas com computadores, rack de servidores, impressora, arquivo,
     quadro com as notas reais da última execução, janela e relógio com a hora real de Manaus, e
     uma prateleira de colecionáveis geek (herói mascarado, robô gigante, garota mágica de anime,
     capacete espacial, dado de 20 lados).
   - **Sala de descanso (frente, à direita):** cafeteira expresso, geladeira, sofá, TV passando anime,
     fliperama, pufe para cochilar, pizza, máscaras na parede e luzinhas piscando.
   - **Regra:** quem está **trabalhando** fica no escritório; quem está **parado** vai para a
     sala de descanso.
   - Ao vivo: quando há uma execução rodando no GitHub Actions, o agente circula pelas
     estações e o chefe supervisiona.
   - Reprodução: reencena a última execução real, evento por evento. O robô vai até a estação
     de cada ferramenta, com balões ("🔍 Procurando 'power bi' na Gupy → 15 vagas").
   - No fim: o robô leva o envelope até a caixa de correio, e o chefe recebe o e-mail no celular.
   - As referências geek são originais e genéricas, sem personagens de outras obras.

2. **Depoimento para a câmera (ideia futura).** No fim de cada reprodução, o robô ou o chefe
   aparece em close, estilo entrevista de documentário, com uma fala montada a partir dos números
   reais da execução.

3. **Ficha do personagem.** Clicar num personagem abre a ficha. A do robô mostra quantas vezes ele
   usou cada ferramenta na última execução, o que explica a arquitetura do agente para quem não
   programa. A do chefe mostra o que chegou por e-mail.

4. **Delegar uma tarefa ao agente (ideia futura).** Um campo "Nova tarefa" (ex.: *"vagas de
   React remotas"*). Ao enviar, a página copia o pedido e abre o formulário "Run workflow" do
   GitHub. Lá eu colo o texto no campo **Pedido** e confirmo. Na cena, o chefe leva o pedido até
   a mesa do robô.
   - Por que não enviar direto da página? A página é pública. Enviar direto exigiria guardar um
     token do GitHub nela. O GitHub já faz o login com segurança.

5. **Painéis.** Última execução (passos, duração, vagas avaliadas e enviadas), ranking das
   melhores vagas com link, diário de eventos sincronizado com a cena, e o histórico das
   últimas execuções.

## Status

- ✅ Cena isométrica com escritório e sala de descanso
- ✅ O robô vai até a estação de cada ferramenta; o chefe supervisiona e recebe o e-mail
- ✅ Reprodução da última execução, modo ao vivo, painéis e histórico
- ✅ Ficha do personagem (clicando na cena ou na lista)
- ⬜ Depoimentos para a câmera
- ⬜ Delegar tarefa ao agente (campo `pedido` no workflow)

## Como os dados chegam na página

```
GitHub Actions roda o agente
   └─ src/painel.ts anota cada evento (quem fez o quê, quando, quanto tempo)
   └─ grava status/ultima-execucao.json
   └─ o workflow publica esse arquivo na branch "painel-dados" (+ historico.json)

docs/index.html (GitHub Pages)
   ├─ lê painel-dados/ultima-execucao.json e historico.json   → reprodução e painéis
   └─ consulta a API pública do GitHub a cada 90 s            → modo "ao vivo"
```

Nada de chaves, senhas ou e-mail vai para a página. Os dados publicados são os títulos,
empresas, notas e links das vagas, os mesmos que já aparecem nos logs públicos do Actions.

## Mudanças necessárias no agente

- O workflow ganha um campo de entrada `pedido` no `workflow_dispatch`. Se ficar vazio, vale o
  pedido padrão ("Encontre as melhores vagas para o meu perfil").
- O diário registra o pedido da execução, para o chefe mostrar na cena.
