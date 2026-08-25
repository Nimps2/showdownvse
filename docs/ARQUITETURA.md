# Arquitetura

## Hospedagem

O site inteiro (exceto o gestor) é hospedado no **GitHub Pages** — ficheiros
HTML/JS estáticos, sem servidor próprio. A base de dados é o **Supabase**
(Postgres gerido, acedido diretamente do browser via API REST, usando a
`anon key` pública — não há backend próprio nem chave secreta escondida).
Isto é intencional: é um projeto pequeno, para amigos, e a segurança via
Row Level Security (RLS) permissiva é aceitável para este contexto (ver
nota de segurança no fim deste documento).

## Estrutura de pastas no computador do organizador

```
showdownvse-project/
├── torneio_showdown.html   (gestor — NUNCA vai para o GitHub)
├── showdown-utils.js       (vai para o GitHub)
├── viewer.html             (vai para o GitHub)
├── estatisticas.html       (vai para o GitHub)
├── perfil.html             (vai para o GitHub)
├── conquistas.html         (vai para o GitHub)
├── loja.html               (vai para o GitHub)
├── palpites.html           (vai para o GitHub)
├── hall-da-fama.html       (vai para o GitHub)
├── index.html              (vai para o GitHub)
├── replays/                (vai para o GitHub)
│   ├── Torneios NU/
│   │   ├── Torneio 1/*.html
│   │   └── Torneio 2/*.html
│   ├── Torneios OU/...
│   ├── Torneios PU/...
│   ├── Torneios UU/...
│   └── Torneios ZU/...
├── Backups/                (NÃO vai para o GitHub — .json gerados pelo
│                             botão de backup do gestor)
└── Notas e SupabaseTester/ (NÃO vai para o GitHub — notas pessoais do
    ├── Notas de Atualização   organizador entre sessões, e o SQL antigo
    ├── Notas de pedencias     que este projeto de documentação substitui)
    └── supabase_setup_MASTER_VERIFICACAO - ...sql
```

Ao configurar o repositório Git para o Claude Code, replicar esta separação:
`torneio_showdown.html` e `Backups/` não devem ser rastreados/publicados
(considerar `.gitignore`, ou pelo menos confirmar com o organizador antes de
os incluir num commit ou num deploy).

## Por que o gestor é separado e isolado

O gestor precisa de correr **sem internet/servidor**, aberto localmente por
duplo-clique (`file://`), porque é usado num contexto informal (o
organizador a gerir o torneio ao vivo, por vezes sem estar no mesmo sítio
onde o site está hospedado). Correr como `file://` tem uma consequência
técnica direta: **navegadores bloqueiam scripts `<script src="...">`
externos** nesse modo, por segurança. Por isso o gestor não consegue
`<script src="showdown-utils.js">` — teve de duplicar internamente qualquer
lógica que precisasse de partilhar com o resto do site.

Isto já causou pelo menos um bug real na história do projeto: uma correção
feita só em `showdown-utils.js` (não propagada à cópia do gestor) deixou os
dois lados a calcular a mesma coisa de forma diferente. **Sempre que alterar
uma função que suspeite estar duplicada, procure ativamente a cópia
correspondente no `torneio_showdown.html`.**

## Como as páginas hospedadas se autenticam

Não há sistema de login com sessão/token. Cada jogador introduz o seu nome +
password (guardada como hash simples na tabela `players`); o "estar logado"
vive só na variável `loggedInPlayerName` em memória da página (não persiste
entre reloads — o jogador tem de voltar a entrar sempre que abre o site de
novo, sem "lembrar-me"). Isto é deliberadamente simples.

## Fluxo típico de uma semana de torneio

1. Organizador confere a "Votação de Tier" no gestor (moedas apostadas pelos
   jogadores em cada tier, na Loja) para decidir o tier da semana.
2. Organizador cria o torneio no gestor: escolhe tier, número de jogadores,
   gera o bracket. Isto **dispara um ciclo de fecho** do torneio anterior:
   limpa `tier_votes`, apura a votação de "Apelido da Semana", sorteia a
   Loteria (fecha a rodada ativa), e verifica se um bloco de 3 torneios
   concluídos acabou de fechar (para dar a fatia do Fundo da Casa ao MVP).
3. Jogadores importam os seus Pokémon sorteados no `viewer.html`, jogam as
   partidas no Showdown, e o organizador regista os resultados no gestor à
   medida que saem (incluindo marcar partidas como "iniciadas" para travar
   apostas, e W.O. se alguém desistir).
4. Replays exportados do Showdown são renomeados (ver convenção em
   `CLAUDE.md`) e colocados na pasta `replays/<Tier>/<Torneio N>/`.
5. Ao longo da semana, jogadores usam a Loja (compram cosméticos, bilhetes
   da Loteria, licitam em leilões), o Palpiteiro (apostas por partida e por
   campeão), e acompanham as Estatísticas/Hall da Fama/Conquistas.

## Nota de segurança (aceite conscientemente, não é descuido)

Todas as tabelas Supabase têm RLS **permissiva** (qualquer pessoa com a
`anon key` pública pode ler e escrever). Não há verificação server-side de
"és mesmo tu" antes de aceitar uma ação (ex: nada impede tecnicamente
alguém de editar o pedido de rede e fingir ser outro jogador). Isto é uma
troca deliberada — o grupo é pequeno e de confiança, e o valor de uma
autenticação real não compensaria a complexidade para este projeto. Não
"corrigir" isto sem que o organizador peça explicitamente.
