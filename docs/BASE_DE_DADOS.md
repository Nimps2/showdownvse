# Base de Dados (Supabase / Postgres)

O ficheiro `supabase_setup_MASTER_VERIFICACAO_v2.sql` na raiz do projeto
cria/atualiza o schema inteiro de forma idempotente (seguro correr várias
vezes). Este documento explica o **porquê** de cada tabela e decisões de
design que não são óbvias só a olhar para as colunas.

Todas as tabelas têm RLS ligada com policies permissivas (select/insert
sempre `true`; update/delete só onde fizer sentido). Ver nota de segurança
em `ARQUITETURA.md`.

## `players` — a tabela central

Guarda tudo sobre cada jogador: identidade, moedas, cosméticos possuídos e
equipados, estatísticas económicas cumulativas, e reconhecimentos manuais.

Colunas que merecem explicação:
- `owned_cosmetics` (jsonb array de ids) vs `equipped_*` (um id cada,
  exceto `equipped_badges` que é array — pode ter vários emblemas
  equipados ao mesmo tempo, mas só um fundo/moldura/título/efeito).
- `equipped_background` e `equipped_frame`: **o significado mudou ao
  longo do projeto**. Hoje, `equipped_frame` escolhe um TIPO DE EFEITO
  ANIMADO à volta do avatar (`sparks` | `starry` | `blossom` | `none`), e
  `equipped_background` escolhe a COR desse efeito (já não preenche o
  avatar como um fundo sólido). Ver `FUNCIONALIDADES.md` → Cosméticos.
- `daily_streak_count` (sequência ATUAL, reseta ao faltar um dia) vs
  `best_daily_streak` (a MAIOR sequência já alcançada, nunca desce). Isto
  existe por causa de um bug real: conquistas baseadas em sequência
  "desapareciam" quando calculadas a partir do valor que reseta. **Ao criar
  qualquer conquista nova baseada em sequência/streak, usar sempre o
  campo "melhor de sempre", nunca o "atual".**
- `max_coins_reached` e `all_in_count`: contadores monotónicos (só sobem),
  atualizados sempre que o saldo muda — usados por conquistas que não podem
  reverter.
- `seen_achievements` vs conquistas "verdadeiras": as conquistas NÃO são
  guardadas como verdadeiro/falso na base de dados — são recalculadas ao
  vivo a partir do histórico sempre que a página carrega (ver
  `computeAllAchievements` em `showdown-utils.js`). `seen_achievements`
  serve só para saber quais já foram notificadas/celebradas, para não
  repetir a animação e o bónus de moedas.
- `special_tags`: reconhecimentos dados à mão pelo organizador via gestor
  (ex: "🐛 Caçador de Bugs"), sem relação com o sistema de títulos
  compráveis da loja. Um jogador pode ter várias ao mesmo tempo.
- `birthday_month` / `birthday_day`: sem ano — só para o sistema do Fundo
  da Casa saber quando celebrar.

## `tournaments`

Uma linha por torneio. `data` (jsonb) é onde vive TUDO sobre esse torneio:
lista de jogadores, bracket completo (`matches`, cada um com `p1`, `p2`,
`winner`, `bo`, `games`, `started`, `wo`, `label`, `next`, `nextSlot`), e os
sorteios de cada jogador (`draws`). Não há tabelas relacionais para
partidas/sorteios — está tudo dentro deste único blob JSON por torneio. Ao
adicionar uma funcionalidade que precise de "todas as partidas de sempre",
é preciso ler TODOS os `tournaments.data` e percorrer `matches`
manualmente (é assim que os cálculos de Elo, conquistas, e estatísticas
funcionam hoje).

## Tabelas de economia e histórico

- `coin_transactions` — log de TODO ganho/gasto de moedas, com `reason` em
  texto livre legível (usado também para detetar conquistas por padrão de
  texto, ex: procurar `reason LIKE '*Jackpot*'`).
- `activity_log` — auditoria separada (ações do organizador e dos
  jogadores), mostrada nas abas de Auditoria do gestor.
- `gifts` — presentes de moedas diretos entre jogadores.

## Tabelas de apostas

- `predictions` — Palpiteiro, aposta por partida individual.
- `champion_bets` — aposta única por torneio em quem será campeão.
- Ambas ficam "por resolver" (`resolved=false`) até o resultado sair.

## `tier_votes`

Votação (paga com moedas) do tier da próxima semana. **É esvaziada por
completo sempre que um torneio novo é criado no gestor** — não guarda
histórico de votações antigas de propósito. Se precisar de histórico de
votações de tier no futuro, terá de mudar este comportamento
deliberadamente (não é um esquecimento).

## `nickname_votes`

Votação semanal do apelido mais criativo dado a um Pokémon. Decisão de
design importante: **o vencedor é apurado por soma agrupada por DONO**, não
pelo apelido individual isolado. Um jogador com vários Pokémon nomeados
nesse torneio soma os votos de todos eles para decidir quem vence — mas o
apelido individual mais votado continua destacado no anúncio, como
reconhecimento à parte. Ver `resolveNicknameVoteWinner()` no gestor.

## `auctions` + `auction_bids`

Leilões ocasionais de itens cosméticos exclusivos (nunca à venda direta na
loja). `auctions.winner_name` pode conter **vários nomes separados por
vírgula** no caso raro de empate. Existe uma ferramenta no gestor
("Corrigir Vencedor de um Leilão") para sobrescrever manualmente o
resultado — reverte automaticamente o vencedor anterior (devolve o item e
as moedas) antes de atribuir ao novo. Foi construída depois de um jogador
reportar que um lance de última hora não foi contabilizado.

## `lottery_rounds` + `lottery_tickets`

**Não é sorteio proporcional aos bilhetes comprados.** Cada bilhete recebe
um número aleatório de 1 a `LOTTERY_NUMBER_RANGE` (50); um número vencedor
é sorteado à parte, e só ganha quem tiver algum bilhete com esse número
exato. Na maioria das rodadas ninguém acerta, e `pot` acumula para a rodada
seguinte (é isto que dá a sensação de "jackpot que cresce"). Comprar mais
bilhetes aumenta as chances (mais tentativas independentes), mas não
garante nada. 10% de cada compra vai para `house_fund` em vez do pote (ver
abaixo); os outros 90% entram no `pot`.

## `favorite_sets`

Vault pessoal de sets já importados que o jogador marca como favoritos, a
partir do `viewer.html` (funciona em qualquer torneio passado que ele
participou, não só o ativo).

## `house_fund` (tabela de uma linha só, `id=1` fixo)

Acumula os 10% retidos de cada compra de bilhete da Loteria.
`total_collected` nunca desce (é só para mostrar "quanto já se arrecadou
desde sempre", por curiosidade). `current_balance` é o saldo realmente
disponível para devolver, e desce quando é dado a alguém através de:
aniversário de um jogador (20% do saldo), aniversário do grupo (🪙20 fixos
a todos os jogadores registados, na data do primeiro torneio de sempre), ou
fatia do MVP a cada bloco de 3 torneios concluídos (15% do saldo). Também
dispara uma pequena celebração visual a cada marco redondo de 500 moedas
acumuladas.
