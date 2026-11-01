# Modelo da plataforma: Agência Agente-RH

Uma página (GitHub Pages) que mostra o agente de vagas como uma **agência de recrutamento
fictícia em pixel art**, trabalhando só para mim. Cada funcionário da agência é uma parte real
do código. O tom é de comédia de escritório "mockumentário": os personagens dão depoimentos
para a câmera sobre o que aconteceu em cada execução.

Os personagens são **originais**: arquétipos de escritório, não personagens de séries.

## A equipe

| Personagem | Cargo e personalidade | Parte do código | Acessório |
|---|---|---|---|
| **Sr. Valdir** | Gerente. Se acha o melhor chefe do mundo, delega tudo e adora uma frase de efeito. | o modelo (Claude): cada passo do loop, decide o que fazer | caneca "Melhor Chefe", gravata |
| **Otávio** | Recrutador de RH. Calmo, metódico, leva o `perfil.md` a sério. O Gerente vive ignorando o que ele diz. | `ver_detalhes_vaga`, `registrar_avaliacao` | óculos, prancheta |
| **Bia** | Estagiária caçadora de vagas. Animada demais, abre 30 abas por minuto. | `buscar_vagas_gupy`, `buscar_vagas_remotive` | lupa |
| **Kléber** | Networker. Vive no LinkedIn e escreve "gratidão" em tudo. | `ler_alertas_linkedin` | boné azul, celular |
| **Sônia** | Recepcionista. Sabe de tudo e lembra de todas as vagas já enviadas. | envio do e-mail + memória (`vagas-vistas.json`) | fone, envelopes |

## Telas e interações

1. **A cena (2D, pixel art), com duas salas**
   - **Escritório (esquerda):** mesas com computadores, rack de servidores, impressora, arquivo,
     quadro com as notas reais da última execução, janela e relógio com a hora real de Manaus, e
     uma prateleira de colecionáveis geek (herói mascarado, robô gigante, garota mágica de anime,
     capacete espacial, dado de 20 lados).
   - **Sala de descanso (direita):** cafeteira expresso, geladeira, sofá, TV passando anime,
     fliperama, pufe para cochilar, pizza, máscaras na parede e luzinhas piscando.
   - **Regra:** agente **ativo** fica no escritório fazendo a rotina dele (mesa → estação de
     trabalho → mesa); agente **inativo** vai para a sala de descanso.
   - Ao vivo: quando há uma execução rodando no GitHub Actions, todos vão trabalhar.
   - Reprodução: reencena a última execução real; cada personagem sai da sala de descanso
     quando a parte dele do código entra em ação, com balões ("Procurando 'power bi' na Gupy →
     15 vagas").
   - No fim: Sônia leva o envelope até a caixa de correio, se houve e-mail.
   - As referências geek são originais e genéricas, sem personagens de outras obras.

2. **Depoimento para a câmera.** Ao fim de cada reprodução, um personagem aparece em close
   (estilo entrevista de documentário) com uma fala montada a partir dos dados reais.
   Por exemplo, Sônia: *"Mandei 2 vagas hoje. As outras 5 ele já tinha recebido. Eu lembro de
   tudo, querido."* As falas vêm de modelos de frase preenchidos com os números da execução,
   então não custam chamadas extras à API.

3. **Ficha do personagem.** Clicar num personagem abre a ficha: cargo, personalidade, quais
   ferramentas do código ele usa e o que fez na última execução. Isso explica a arquitetura do
   agente para quem não programa.

4. **Delegar uma tarefa ao Gerente.** Um campo "Nova tarefa para o Sr. Valdir" (ex.: *"vagas de
   React remotas"*). Ao enviar, a página copia o pedido e abre o formulário "Run workflow" do
   GitHub. Lá eu colo o texto no campo **Pedido** e confirmo. Na cena, o Gerente recebe o papel e
   distribui o trabalho para a equipe.
   - Por que não enviar direto da página? A página é pública. Enviar direto exigiria guardar um
     token do GitHub nela. O GitHub já faz o login com segurança.

5. **Painéis.** Última execução (passos, duração, vagas avaliadas e enviadas), ranking das
   melhores vagas com link, diário de eventos sincronizado com a cena, e o histórico das
   últimas execuções.

## Status

- ✅ Cena com escritório e sala de descanso, rotinas de trabalho e de descanso
- ✅ Reprodução da última execução, modo ao vivo, painéis e histórico
- ✅ Ficha do personagem (clicando na cena ou na lista da equipe)
- ⬜ Depoimentos para a câmera
- ⬜ Delegar tarefa ao Gerente (campo `pedido` no workflow)

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
- O diário registra o pedido da execução, para o Gerente mostrar na cena.
