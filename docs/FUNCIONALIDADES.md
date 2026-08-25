# Catálogo de Funcionalidades

Referência do que já existe. Números exatos extraídos diretamente do código
em vigor — se um valor aqui parecer desatualizado no futuro, o código é
sempre a fonte da verdade, não este documento.

## Torneios e Bracket

- Formatos: single elimination com Play-in opcional (Bo1) → Semifinal/Final
  (Bo3), dependendo do número de jogadores.
- Tiers disponíveis: `OU`, `UU`, `RU`, `NU`, `PU`, `ZU`, `National Dex`,
  `National Dex AG`, `National Dex LC`, `National Dex UU`, `National Dex
  RU`. Cada um tem a sua própria pool de Pokémon/sets em `TIER_DATA`
  (dentro do gestor). Nem todos os Pokémon dos tiers National Dex têm
  conjuntos pré-prontos — alguns (lendárias restritas em AG, e todo o LC)
  têm só o nome, e o jogador monta o próprio set manualmente.
- Sorteio automático de 4 Pokémon aleatórios + 2 de escolha livre por
  jogador, com set sugerido (editável).
- Sistema de reroll pago (preço escalonado, começa em 🪙30) para trocar um
  Pokémon sorteado por outro.
- W.O. (walkover): marca uma partida como vencida por desistência, sem
  fingir um placar — mostra "🏳️ Vitória por W.O." em vez de um resultado
  normal, com botão para desfazer se for engano.
- Travar apostas manualmente: botão "🔒 Travar apostas" em cada partida por
  decidir, para o organizador marcar quando ela realmente COMEÇOU (evita
  gente a apostar já sabendo o resultado a meio do jogo — detetar isso
  automaticamente não é possível para Bo1).
- Trocar posições no bracket: ferramenta no gestor para reorganizar quem
  joga onde (ex: colocar alguém no Play-in porque só pode jogar mais cedo).

## Economia — Moedas

- Ganhos: participação (🪙10), vitória (🪙5), campeão (🪙50), vice (🪙20),
  3º lugar (🪙10).
- Bónus diário de login, com sequência escalonada: dia 1→🪙5, 2→🪙6, 3→🪙8,
  4→🪙10, 5→🪙12, 6→🪙15, 7→🪙20 (fica em 🪙20 a partir do dia 7, não cresce
  mais). Reclamação é **atómica** a nível de base de dados (escrita
  condicional) para não ser possível reclamar duas vezes em cliques
  rápidos ou abas simultâneas — isto corrigiu um bug real já detetado em
  produção.
- Desconto por fidelidade: 5% por cada 30 dias TOTAIS de bónus diário
  reclamados (não precisa ser sequência contínua), até um máximo de 20%.

## Loja

- **Cosméticos**: fundos (agora = cor de um efeito, ver Personalização
  abaixo), cores de destaque do nome, molduras (= tipo de efeito animado),
  efeitos no nome, títulos, emblemas. Preços entre 🪙0 e 🪙220.
- **Caixa Surpresa**: 🪙35, item aleatório entre tudo o que ainda não tem.
- **Presente Surpresa**: 🪙40, dá um cosmético aleatório a OUTRO jogador.
- **Loja Rotativa**: um item em destaque diferente a cada semana
  (determinístico, a mesma semana dá sempre o mesmo item a todos), sempre
  com 30% de desconto.
- **Patrocínio de torneio**: 🪙200.
- **Bye garantido**: 🪙150.
- **Gráfico de evolução do Elo**: desbloqueio único de 🪙80.
- **Roleta**: aposta simples, multiplicador até 5x fixo (já existiu uma
  versão com jackpot progressivo cumulativo — foi **removida** por criar
  incentivo a apostar sempre o mínimo; ver `docs/BASE_DE_DADOS.md` sobre a
  tabela `roulette_jackpot`, que já não deve ser recriada).
- **Loteria**: bilhetes a 🪙10, mecânica de número sorteado (não
  proporcional), pote base de 🪙30 para rodadas novas. Ver
  `BASE_DE_DADOS.md` para o mecanismo completo.
- **Leilão de item raro**: itens exclusivos que nunca estão à venda direta,
  licitação por 3 dias por omissão.

## Personalização do Avatar (redesenhada — não é o sistema original)

O sistema original tinha "Fundo" como um preenchimento sólido/gradiente do
avatar, e "Moldura" como uma borda estática colorida. Isto foi
**redesenhado por completo** porque as duas competiam visualmente. Hoje:

- **Moldura** = tipo de efeito animado à volta do avatar: `sparks`
  (Faíscas), `starry` (Estrelado), `blossom` (Florescer), ou `none`. Puro
  CSS (sem imagens), com partículas posicionadas em círculo à volta do
  avatar via ângulos fixos + `animation-delay` escalonado.
- **Fundo** = a cor usada por esse efeito (`--fx-color`, uma CSS custom
  property). Se não houver moldura equipada, o fundo escolhido não faz
  nada visualmente (fica "guardado" para quando equipar uma moldura).
- A "Aurora Animada" (fundo mais caro) tem tratamento especial: em vez de
  cor fixa, faz o efeito ciclar de cor continuamente via `hue-rotate`.
- Os IDs dos cosméticos antigos foram **reaproveitados** para os novos
  efeitos (quem já tinha comprado uma moldura antiga não perdeu nada, só
  passou a vê-la animada).

## Conquistas

**50 no total**: 16 Bronze, 18 Prata, 16 Ouro. **14 são secretas** — ficam
escondidas da lista até serem desbloqueadas por quem as tem (a página de
Conquistas nem sequer as lista para quem ainda não as tem, para não
estragar a surpresa). O gestor tem uma ferramenta ("Conquistas Secretas
Reveladas") que mostra só as que **pelo menos um jogador já desbloqueou de
verdade** — nunca lista as que ninguém ainda alcançou.

Categorias de exibição: em blocos por camada (Bronze/Prata/Ouro), com
paginação de 6 por página dentro de cada camada — resolve tanto o
scroll infinito quanto alturas desiguais entre camadas com números
diferentes de conquistas.

**Regra de ouro ao criar conquistas novas**: nunca basear a condição em algo
que pode "regredir" com o tempo (streak atual, winrate geral, etc.) sem usar
uma versão "melhor de sempre"/"alguma vez alcançou" — já causou bugs reais
duas vezes (sequência de vitórias, e winrate geral que caía depois de mais
jogos). Preferir sempre uma função que recalcula "isto alguma vez foi
verdade no histórico completo", nunca "isto é verdade no estado atual".

Fontes de cálculo (ver `showdown-utils.js`):
- `computeAchievements` — a partir de estatísticas agregadas simples
  (cumulativas, nunca descem).
- `computeMatchPathAchievements` — precisa do histórico completo de
  partidas (streaks, Elo no momento exato de cada jogo, etc.).
- `computeAsyncAchievements` — precisa de consultar outras tabelas
  (predictions, gifts, leilões, Loteria, etc.), por isso é assíncrona.

## Palpiteiro (apostas)

- Aposta por partida individual (antes dela começar/ser marcada como
  iniciada), com multiplicador fixo.
- Aposta única por torneio em quem será campeão, multiplicador escala com
  o número de jogadores.

## Hall da Fama

Duas abas: "Torneios" (linha do tempo de campeões + MVP a cada bloco de 3
torneios concluídos) e "Apelidos" (Salão dos Apelidos, paginado 12 por
página, para não crescer sem fim).

## Fundo da Casa

Ver `BASE_DE_DADOS.md` → tabela `house_fund`. Devolve o lucro da taxa da
Loteria via aniversários de jogador (20%), aniversário do grupo (🪙20 fixos
a todos), e fatia ao MVP a cada bloco de 3 torneios (15%), além de mostrar
o total histórico como curiosidade na Loja.

## Temporadas

Blocos de **3 meses** (não é ano civil), ancorados na data do primeiro
torneio de sempre do grupo. Usado para: Comparador de Temporadas no perfil,
conquista "Bicampeão" (campeão em temporadas diferentes), conquista "Fiel
ao Grupo" (participação em 3 temporadas diferentes), e filtros nas
Estatísticas.

## Tags Especiais

Reconhecimentos manuais dados pelo organizador via gestor (não relacionados
com o sistema de títulos compráveis). Um jogador pode ter várias em
simultâneo; aparecem em destaque no perfil dele. Exemplos já usados:
reconhecimento a quem encontra bugs, a quem ajuda a testar, e "Criador"
para o próprio organizador.

## Vault de Sets Favoritos

Botão "⭐ Favoritar este set" junto a cada Pokémon já importado no
`viewer.html` (funciona em qualquer torneio passado que o jogador tenha
participado, não só o ativo). Lista consultável no perfil.
