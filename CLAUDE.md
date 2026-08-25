# VSE — Pokémon Showdown Amateur Tournament Manager

Este ficheiro é o ponto de entrada para qualquer sessão de trabalho neste
projeto. Leia-o primeiro, sempre. Os outros documentos em `/docs` aprofundam
partes específicas — leia-os quando a tarefa em mãos tocar nesse assunto.

## O que é isto, em uma frase

Um site para gerir um torneio amador semanal de Pokémon Showdown entre um
grupo de amigos (Discord), com bracket, sorteio automático de Pokémon,
estatísticas, e uma camada inteira de "gamificação" por cima (moedas,
conquistas, loja, apostas, loteria, leilões) para tornar a experiência mais
divertida entre torneios.

Não é um produto comercial. É construído e mantido por uma pessoa (o
"organizador", dono do repositório) para o seu próprio grupo de amigos. As
decisões de design privilegiam simplicidade e diversão sobre robustez de
nível empresarial — não sobre-engenheirar.

## Como está estruturado (visão rápida — ver `docs/ARQUITETURA.md` para detalhe)

- **`torneio_showdown.html`** — o "gestor". Corre LOCALMENTE no PC do
  organizador, aberto como ficheiro (`file://`), nunca é publicado no
  GitHub. Só o organizador o usa. Cria torneios, gera o bracket, sorteia
  Pokémon, regista resultados, e faz toda a administração da economia.
- **`showdown-utils.js`** — biblioteca partilhada de funções JS, carregada
  por todas as páginas HOSPEDADAS (não pelo gestor — ver constrangimento
  crítico abaixo). É onde vive quase toda a lógica de jogo.
- **Páginas hospedadas** (GitHub Pages, ficam junto do `showdown-utils.js`):
  `viewer.html`, `estatisticas.html`, `perfil.html`, `conquistas.html`,
  `loja.html`, `palpites.html`, `hall-da-fama.html`, `index.html`. Estas são
  o que os JOGADORES veem e usam.
- **`replays/`** — pasta com um subdiretório por tier (`Torneios NU/`,
  `Torneios OU/`, etc.), e dentro um subdiretório por torneio (`Torneio 1/`,
  `Torneio 2/`...), contendo os `.html` de replay exportados do Showdown.
  Vai para o GitHub.
- **Supabase** — a base de dados (Postgres via API REST). Ver
  `docs/BASE_DE_DADOS.md` e `supabase_setup_MASTER_VERIFICACAO_v2.sql`.

## O constrangimento mais importante de todo o projeto

**O gestor (`torneio_showdown.html`) NÃO pode carregar `showdown-utils.js`.**
Correndo como `file://` local, o Chrome/Opera bloqueia o carregamento de
scripts externos. Por isso, sempre que o gestor precisa de uma função que
também existe em `showdown-utils.js` (ex: `escapeHtml`, `copyText`, lógica de
achievements, lógica de economia), essa função está **duplicada** dentro do
próprio `torneio_showdown.html`, numa cópia local.

**Isto significa:** ao alterar uma regra de jogo que existe nos dois sítios
(ex: preço de algo, fórmula de cálculo, texto de uma mensagem), é preciso
editar **as duas cópias**, e mantê-las consistentes manualmente. Não há
importação nem partilha de código entre o gestor e o resto do site. Ao fazer
qualquer alteração, procure sempre se a mesma lógica existe duplicada no
`torneio_showdown.html` antes de dar a tarefa por terminada.

## Outro padrão a manter sempre

Cada ficheiro entregue deve ser a **versão completa e final**, não um patch.
O organizador substitui o ficheiro inteiro no GitHub/computador dele — não
há sistema de diff/patch manual da parte dele. (Isto deixa de ser um
problema depois de migrar para Git a sério com o Claude Code, mas o hábito
de "war sempre o ficheiro completo e coerente" deve manter-se.)

## Convenção de nomes dos replays

Ficheiros de replay seguem sempre este padrão exato:
- Bo1 (normalmente só o Play-in): `Jogador1 vs Jogador2 - Ronda.html`
- Bo3 (Semifinal, Final): `Partida N Jogador1 vs Jogador2 - Ronda.html`
  (N = 1, 2 ou 3, consoante quantos jogos foram precisos)

Sem travessões a mais, nomes de jogadores exatamente como aparecem no
bracket, "Ronda" sempre no fim depois de " - ".

## Idioma e tom

Todo o texto visível no site (UI, mensagens, nomes de conquistas) está em
**português europeu** (o organizador é de Portugal). O código (nomes de
variáveis, comentários técnicos) está em português também, misturado com
termos técnicos em inglês onde é natural (ex: `winner`, `bracket`, `Bo3`).
Mantenha esse estilo em código novo.

## Onde ver mais

- `docs/ARQUITETURA.md` — estrutura de ficheiros a fundo, hospedagem, o
  problema do gestor isolado, como as páginas se ligam ao Supabase.
- `docs/BASE_DE_DADOS.md` — todas as tabelas, para que servem, decisões de
  design não óbvias (ex: por que a Loteria funciona por número sorteado e
  não por proporção de bilhetes).
- `docs/FUNCIONALIDADES.md` — catálogo completo do que já existe: economia,
  conquistas, cosméticos, loja, apostas, loteria, leilões, fundo da casa.
- `supabase_setup_MASTER_VERIFICACAO_v2.sql` — script único e idempotente
  que cria/atualiza toda a base de dados. Substitui a versão antiga
  (`supabase_setup_MASTER_VERIFICACAO.sql`) que ficou desatualizada.
