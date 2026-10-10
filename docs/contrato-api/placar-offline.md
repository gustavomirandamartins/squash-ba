# Placar offline e sincronização

Como o web lança placar sem rede e sincroniza depois. As fontes são
`src/lib/score-engine/SyncEngine.ts`, `useScoreEngine.ts`, `src/lib/offline/*` e
`src/components/offline/OfflineSync.tsx`. O iOS não precisa copiar o armazenamento
(IndexedDB e `localStorage` são do navegador), mas precisa respeitar o **contrato com o
servidor**: payload, ordem das ações, conflito e idempotência.

## Princípios

1. Toda ação de placar é gravada **primeiro no aparelho** e enviada depois. A tela mostra o
   estado local na hora, sem esperar a rede.
2. Placar é **absoluto**: cada game carrega `score_a`/`score_b` completos, nunca "+1".
   Reenviar o mesmo game não soma nada.
3. Conflito é detectado **comparando games** (servidor × base × local), nunca por relógio.
4. O que o servidor **recusa** não some: vai para uma lista de falhas visível em
   `/sincronizacao`, com "tentar de novo" e "descartar".
5. Um envio por partida por vez, no app inteiro.

## Armazenamento local (web)

| Onde | Chave | Conteúdo |
|---|---|---|
| `localStorage` | `squashba_device_id` | UUID do aparelho (gerado uma vez); vai em `match_games.last_device_id` |
| `localStorage` | `sb-queue-journal` | **diário**: ações ainda não confirmadas no IndexedDB |
| IndexedDB (`idb-keyval`) | `queue:<matchId>` | fila de ações da partida (`QueueAction[]`) |
| IndexedDB | `base:<matchId>` | games do servidor que este aparelho viu por último (`GameRow[]`) |
| IndexedDB | `sync-meta:<matchId>` | `{ label: "A × B", href }` para a tela de sincronização |
| IndexedDB | `sync-failures` | ações recusadas (`SyncFailure[]`) |
| IndexedDB | `creation-outbox` | campeonatos e desafios criados offline (`OutboxItem[]`) |

`QueueAction = { id: uuid, matchId, type, payload, timestamp: ms, deviceId }`.

## Diário (nenhum toque se perde)

A gravação no IndexedDB é assíncrona: fechar o app logo depois de um toque podia perdê-lo.
Por isso cada ação entra **antes** num diário síncrono no `localStorage` e sai dele quando o
IndexedDB confirma a gravação.

Ao abrir o app, antes de qualquer leitura da fila, o que sobrou no diário volta para a
fila. Só entram ações **mais novas** que tudo o que a fila já tem, para não ressuscitar o
que já foi gravado ou compactado.

Toques que chegam enquanto o IndexedDB grava entram juntos na próxima transação.

## Tipos de ação

| `type` | `payload` | Observação |
|---|---|---|
| `upsert_game` | `{ game_number, score_a, score_b }` | placar absoluto de um game |
| `delete_game` | `{ game_number }` | |
| `finalize_match` | `{ result, isOrganizer, isDq?, isWo?, isDoubleWo? }` | encerrar, desclassificação, W.O., W.O. duplo |
| `finish_timer` | `{ seconds, score_a, score_b, drawAllowed }` | fim do cronômetro (modo tempo) |
| `reopen_match` | `{ isOrganizer }` | |
| `clear_match` | `{}` | apaga placar e encerramento |
| `set_schedule` | `{ at: ISO 8601 \| null }` | data da partida |

## Compactação da fila

Ao enfileirar:

- `upsert_game`: remove `upsert_game`/`delete_game` anteriores **do mesmo game**, mas só
  depois da última "barreira". Barreiras: `finalize_match`, `finish_timer`, `reopen_match`,
  `clear_match`. O que veio antes de encerrar precisa chegar antes do encerramento.
- `set_schedule`: só a última vale.
- `clear_match`: descarta tudo o que veio antes, menos a data.
- As demais ações são acrescentadas no fim.

## Envio

Disparos:

| Gatilho | Comportamento |
|---|---|
| Tela de placar aberta | loop a cada **3 s** (sem pendência, só lê o IndexedDB) |
| Ação na tela | envio imediato, em segundo plano |
| App inteiro (`startBackgroundSync`) | ao abrir, ao reconectar (`online`), ao voltar ao app (`focus`/`visibilitychange`, em 300 ms). Com pendência, repete com espera crescente: 2 s, 4 s… até 60 s |
| Tela `/sincronizacao` | botão "Sincronizar agora" |

Ordem entre partidas: a partida com a pendência **mais antiga** sai primeiro. Assim a chave
já avançou no servidor quando chega o placar da rodada seguinte.

Exclusividade: um envio por partida, com Web Locks (`sb-flush:<matchId>`) entre abas e uma
promessa única dentro da aba. Um pedido que chega durante o envio gera mais uma passada no
fim.

Antes de enviar, `auth.getSession()` renova o token se ele venceu offline.

### Caminho principal: RPC `apply_match_ops`

Uma chamada por partida, com a fila inteira:

```json
{
  "_match_id": "uuid",
  "_ops": [
    { "type": "upsert_games", "ids": ["a1", "a2"], "games": [{ "game_number": 1, "score_a": 11, "score_b": 9 }] },
    { "type": "delete_game", "ids": ["a3"], "game_number": 3 },
    { "type": "finish_timer", "ids": ["a4"], "seconds": 1200, "score_a": 5, "score_b": 3 },
    { "type": "finalize", "ids": ["a5"], "kind": "result", "result": "lado_a" },
    { "type": "reopen", "ids": ["a6"] },
    { "type": "clear", "ids": ["a7"] },
    { "type": "schedule", "ids": ["a8"], "at": "2026-10-10T15:00:00.000Z" }
  ],
  "_base":  [{ "game_number": 1, "score_a": 10, "score_b": 9 }],
  "_local": [{ "game_number": 1, "score_a": 11, "score_b": 9 }],
  "_device_id": "uuid-do-aparelho"
}
```

- `_ops`: as ações na ordem da fila. `upsert_game` seguidos viram **um** `upsert_games`
  (último placar de cada game). `ids` = ids das `QueueAction` cobertas, usados para
  devolver as recusas.
- `finalize.kind`: `result` | `dq` | `wo` | `double_wo`. `result` é `lado_a`/`lado_b`/`empate`
  (em `dq`/`wo`, é o vencedor; em `double_wo`, é ignorado).
- `_base`: games do servidor vistos por último por este aparelho, ou `null` se não houver.
- `_local`: games finais que a fila vai deixar (último upsert de cada game; `finish_timer`
  conta como game 1), ou `null` se a fila não mexe em game.
- `schedule.at`: vazio ou `null` apaga a data.

No servidor, cada operação roda dentro de um bloco próprio. Uma que falha é desfeita
**sozinha** e entra em `rejected`; as outras seguem. Encerramentos reaproveitam as RPCs
`finalize_match_*` (a versão de organizador se `can_manage`, senão a de participante).
`reopen` de organizador só reabre partida `finalizado`. `finish_timer` grava
`duration_seconds` antes do game 1.

Respostas e o que o cliente faz:

| Resposta | Cliente |
|---|---|
| `{"status":"ok","applied","rejected":[{ids,error}],"games"}` | tira **todo** o lote da fila; manda as recusas para as falhas; grava `base = games` |
| `{"status":"conflict"}` ou `{"status":"conflict","games"}` | mantém a fila, **pausa** o envio automático da partida e mostra o banner de conflito |
| `{"status":"missing"}` | a fila inteira vai para as falhas com `A partida não existe mais no servidor.` |
| erro de rede ou de sessão (`jwt`, `not authenticated`, `refresh token`, `PGRST301/302`) | mantém a fila e tenta depois |
| outro erro (ex.: `sem permissao para lancar o placar desta partida`) | a fila inteira vai para as falhas com a mensagem |
| RPC inexistente (`PGRST202` / `could not find the function`) | usa o envio ação a ação e testa a RPC de novo em 10 min |

"Erro de rede" é reconhecido pela mensagem: `failed to fetch`, `load failed`,
`networkerror`, `network request failed`, `fetch failed`, `internet connection`,
`unexpected response`, `network connection was lost`. O supabase-js não lança exceção em
falha de rede: devolve `{ error }`.

### Caminho alternativo: ação a ação

Só usado quando o banco não tem `apply_match_ops`. Produção tem a RPC.

1. Lê `matches.status` e os games.
2. Partida inexistente → fila para as falhas. Status `revisao` → pausa.
3. Se há base e `detectConflict(base, servidor, local)`: chama `flag_match_conflict` com
   `{ games: <servidor> }` e pausa. Se a recusa for de permissão (participante), segue
   aplicando: o placar local prevalece.
4. Aplica em ordem: upserts seguidos num só `upsert` em `match_games` (com
   `onConflict: match_id,game_number`); `delete_game`; RPC de encerramento; `finish_timer`
   (`update matches.duration_seconds`, depois upsert do game 1); `reopen_match`
   (organizador: `update matches set status='em_andamento', result=null, is_wo=false where
   status='finalizado'`; participante: `reopen_match_by_participant`); `clear_match`
   (`reset_match_data`); `set_schedule` (`update matches.scheduled_at`).
5. Erro de rede para tudo e mantém o resto na fila. Recusa: a ação vai para as falhas e o
   envio segue.

## Conflito

```
conflito = existe game g, entre os que a fila muda (local), tal que
           servidor[g] ≠ base[g]   (outro aparelho mudou g)
       e   servidor[g] ≠ local[g]  (para um valor diferente do nosso)
```

Game ausente conta como 0×0.

- Games que só um dos lados mudou se juntam sem conflito. Os toques do próprio aparelho
  nunca viram conflito, porque a base é atualizada depois de cada envio.
- A **base** só é registrada com a fila **vazia** (ao ler o servidor). Com pendências, ela
  continua sendo o estado sobre o qual as pendências foram feitas.
- Com conflito, **só o organizador** (`can_manage`) põe a partida em `revisao`, com
  `conflict_server_snapshot = {"games":[…]}`. Para o participante, o placar enviado
  prevalece e não trava quem está marcando.
- Partida em `revisao` recusa novos lotes (`conflict`) até alguém resolver.
- Resolver (organizador), com `resolve_match_conflict(_match_id, _chosen_side)`:
  - `server`: o servidor regrava o snapshot; o cliente **apaga a fila** da partida.
  - `local`: o servidor só sai da revisão (`em_andamento`) e recalcula; o cliente **esquece
    a base** (o próximo envio não checa conflito), tira a pausa e envia a fila.

## Idempotência

- Os games são absolutos e gravados com `upsert` por `(match_id, game_number)`. Reenviar o
  mesmo lote, por exemplo depois de perder a resposta, chega ao mesmo estado.
- Encerrar, reabrir, limpar e mudar a data também podem ser reaplicados sem efeito
  diferente.
- **O servidor não deduplica por `ids`:** a segurança vem do conteúdo absoluto.
- A fila só perde itens depois da resposta do servidor. Itens enfileirados durante o envio
  não são apagados: a remoção é por id, numa transação.
- Criação de campeonato e desafio: `create_championship`, `create_challenge` e
  `import_championship` aceitam um `id` gerado no cliente. Repetir com o mesmo `id` devolve
  o mesmo campeonato (do mesmo usuário); com o `id` de outro usuário, o erro é
  `id de campeonato ja usado`.

## Estado mostrado offline

O cliente sobrepõe a fila ao último estado conhecido do servidor (`queuedStateOf`):

- games da fila sobrepõem os do servidor;
- encerramento na fila → partida encerrada (W.O., W.O. duplo e desclassificação apagam os
  games);
- `finish_timer` → encerrada se o placar decide (empate só com `drawAllowed`, que é o
  `set_draw_enabled` da fase);
- reabrir → `em_andamento`; limpar → `agendado`;
- com a fase conhecida, o placar que decide pelas regras encerra a partida (como
  `resolve_match`) e o vencedor avança na chave local; reabrir esvazia a vaga seguinte.

## Encerrar online

`finalizeMatch` primeiro envia a fila. Com a fila **vazia** e rede, chama a RPC direto e
mostra o erro na hora. Senão, enfileira o encerramento (`queued: true`). Com placar ainda
pendente, o encerramento precisa chegar **depois** dele: um placar tardio reabriria a
partida.

O fim do cronômetro, reabrir, limpar e mudar a data **sempre** vão pela fila.

## Campeonato criado offline

`submitCreation` tenta criar no servidor. Sem rede, ou com falha de rede, guarda no
`creation-outbox` com um id `local-<uuid>` e mostra o campeonato como **provisório**: os
jogos são gerados e jogados no aparelho.

Ao reconectar (`OfflineSync`, com 1,5 s de espera depois do evento `online`):

1. **`import_championship`** com o campeonato provisório inteiro (mesmos IDs, jogos, chave e
   placares). Resultados:
   - ok → remove o provisório e o item da fila;
   - rede → volta a `pending`;
   - erro → `error`, com "Tentar novamente".
2. Não importável (oficial, desafio 1v1 ou id fora do formato UUID) ou RPC ausente →
   caminho antigo: `create_championship`/`create_challenge` (guarda o id real em
   `createdRealId`, para não recriar) e depois envia os placares por casamento de jogos
   (`reconcile-liga.ts`).

Itens presos em `syncing` (app morto no meio) voltam a `pending`. Itens em `error` só são
reenviados pelo botão.

### import_championship

`import_championship(_c jsonb) → uuid`. Payload montado por `buildImportPayload`
(`src/lib/offline/import-championship.ts`):

```json
{
  "id": "uuid (o do aparelho, sem o prefixo local-)",
  "name": "texto",
  "format": "liga | eliminatoria | grupos_elim | desafio",
  "unit": "player | pair | team",
  "start_date": "YYYY-MM-DD | null",
  "end_date": "YYYY-MM-DD | null",
  "description": "texto | null",
  "venue_id": "uuid | null",
  "allow_draw": false,
  "has_third_place": false,
  "has_final": false,
  "points_win": 1, "points_draw": 0, "points_loss": 0,
  "tiebreakers": ["sets_ganhos", "pontos_ganhos", "pontos_sofridos_asc"],
  "stages": [{
    "id": "uuid", "name": "Liga", "ordering": 1, "kind": "liga | eliminatoria | grupos",
    "counting": "set | tempo", "rounds": 1, "sets_to_play": 3, "points_per_set": 11,
    "win_by_two": true, "set_draw_enabled": false, "time_minutes": null
  }],
  "groups": [{ "id": "uuid", "stage_id": "uuid da fase grupos", "name": "Grupo A", "ordering": 1 }],
  "teams": [{ "id": "uuid", "name": "Time 1", "team_id": "uuid | null", "ordering": 0 }],
  "participants": [{
    "id": "uuid", "kind": "player | pair", "seed": null,
    "group_id": "uuid | null", "team_id": "uuid | null", "user_ids": ["uuid"]
  }],
  "matches": [{
    "id": "uuid", "stage_id": "uuid", "group_id": "uuid | null",
    "round": 1, "bracket_slot": null,
    "side_a": "uuid | null", "side_b": "uuid | null",
    "status": "agendado | finalizado | …", "result": "lado_a | lado_b | empate | null",
    "winner_advances_to": "uuid | null",
    "duration_seconds": null,
    "games": [{ "game_number": 1, "score_a": 11, "score_b": 7 }]
  }]
}
```

- IDs locais (`lp-`, `lm-`, `lg-`, `lt-`, `local-` + UUID) viram o UUID, em minúsculas. Se
  algum não converter, o campeonato não é importável.
- Fases: liga = `Liga`; eliminatória = `Eliminatória`; grupos+elim = `Grupos` (1) e
  `Eliminatórias` (2); desafio = `Fase única` (`kind: liga`).
- Desafio: só `duplas` (`unit: pair`) e `times` (`unit: team`, exatamente 2 times, cada
  participante é um jogador `kind: player` ligado a um time). 1v1 não é importado porque
  depende do aceite do convite.
- Jogo por tempo encerrado: `duration_seconds = 0`, para o servidor poder finalizar.

O que o servidor faz, numa transação:

1. Cria o campeonato em rascunho (`is_official = false`), as fases, os grupos, os times e os
   participantes, na ordem enviada (`created_at` crescente).
2. Ativa o campeonato: o gatilho gera os jogos do servidor, que são **apagados** e trocados
   pelos do aparelho, com os mesmos IDs. O status vira `agendado`, exceto o bye
   (`finalizado` sem games), que mantém o `result`.
3. Confere que tudo o que os jogos referenciam é deste campeonato.
4. Grava `winner_advances_to`.
5. Insere os games rodada a rodada (por `round`, depois `bracket_slot`). Os gatilhos de
   sempre (`resolve_match`, avanço da chave, encerramento do campeonato) recalculam status,
   resultados e chave.

Idempotente pelo `id`. Erros em [rpcs.md](rpcs.md#import_championship).

## Casos cobertos pelos testes

`src/lib/score-engine/SyncEngine.test.ts`. Os testes de envio rodam duas vezes: com
`apply_match_ops` e no envio ação a ação.

- Compactação
  - guarda só o último placar de cada game;
  - não compacta por cima de um encerramento ou de uma reabertura;
  - limpar descarta o que veio antes; da data, só a última vale;
  - no lote, upserts seguidos viram uma operação.
- Envio
  - envia a fila inteira e esvazia;
  - não perde o toque feito durante o envio;
  - pedidos simultâneos viram um envio só;
  - sem rede, mantém a fila e envia depois;
  - ação recusada sai da fila e vai para as falhas;
  - partida que não existe mais: a fila vai para as falhas;
  - fim do cronômetro grava a duração e o placar final;
  - reabrir, limpar e mudar a data chegam ao servidor em ordem;
  - toques do próprio aparelho nunca viram conflito;
  - conflito real abre revisão e segura a fila;
  - sem permissão para revisão, o placar local prevalece, sem travar.
- Banco sem a migração da Fase 2: cai no envio ação a ação e não insiste na RPC.
- Estado da fila
  - o fim do cronômetro mostra o resultado; empate sem permissão não finaliza;
  - reabrir depois de encerrar deixa a partida em andamento;
  - placar mexido depois de reabrir fica marcado;
  - pendências saem da mais antiga para a mais nova (uma rodada antes da seguinte).

`src/lib/score-engine/journal.test.ts`:

- o toque que não chegou ao IndexedDB (app fechado na hora) volta para a fila;
- não ressuscita ação antiga já gravada ou compactada;
- numa sequência rápida de toques, tudo é gravado, a fila é compactada e o diário fica
  limpo;
- cada toque vai ao diário antes de qualquer espera.

`src/lib/offline/import-championship.test.ts`:

- `toUuid` tira o prefixo local;
- liga por tempo: IDs do aparelho, uma fase, duração só nos encerrados;
- eliminatória: avanço da chave e byes preservados;
- grupos: jogos de grupo na fase de grupos e chave na eliminatória;
- oficial e 1v1 não são importados (caminho antigo).

`src/lib/offline/desafio.test.ts`:

- duplas: 2 duplas, um jogo por rodada;
- times: cada jogador de A enfrenta cada jogador de B;
- a final só sai quando todos os jogos terminam, com o melhor de cada time;
- um jogo reaberto antes de a final começar retira a final;
- final já começada não é mexida; sem final configurada, não gera;
- importação: duplas (fase única, participante dupla), times (2 times, jogadores ligados,
  final junto); 1v1 não é importado.

`src/lib/offline/local-championship.test.ts`:

- trocar o vencedor de uma semifinal corrige a final;
- partida reaberta esvazia o lado seguinte;
- byes avançam sozinhos;
- a chave é gerada quando os grupos terminam;
- um jogo de grupo corrigido antes de a chave começar refaz a chave;
- depois que a chave começa, ela não é mexida.

`src/lib/offline/cached-bracket.test.ts`:

- placar que decide encerra a partida (como `resolve_match`); placar parcial deixa em
  andamento;
- sem a fase, o resultado não é deduzido; por tempo, a partida não encerra sozinha;
- vencedores avançam na chave offline e a final abre;
- não sobrescreve vaga que o servidor já preencheu;
- reabrir na fila esvazia a vaga seguinte de novo; placar corrigido depois de reabrir volta
  a decidir;
- cache antigo (sem lados) não quebra.

E2E `e2e/offline.spec.ts` (Playwright, com service worker):

- sem rede, o campeonato abre dentro do app, com a navegação;
- vencedores avançam na chave offline, sem recarregar a página;
- a fila e a chave sobrevivem a fechar e reabrir o app offline;
- campeonato provisório: joga e classifica sem rede;
- Início offline: a mesma tela do online, com o que está no aparelho;
- Campeonatos offline: a mesma lista do online (filtros e status);
- campeonato ainda não guardado: aviso dentro do app;
- sem perfil guardado: aviso para entrar com internet;
- quando a rede volta, oferece atualizar;
- versão nova descarta as páginas guardadas pela anterior;
- redirecionamento não é guardado como página: sem rede, cai no shell;
- imagens do shell e da moldura carregam sem rede (logo incluído).

## Mensagens da tela de placar

| Mensagem | Quando |
|---|---|
| `Não foi possível encerrar a partida.` | falha não identificada ao encerrar |
| `Não foi possível desclassificar.` | falha na desclassificação |
| `Não foi possível decretar o W.O.` | falha no W.O. |
| `Não foi possível reabrir a partida.` | falha ao reabrir |
| `Não foi possível excluir os dados da partida.` | falha ao limpar |
| `Erro ao resolver conflito` | falha em `resolve_match_conflict` sem mensagem |
| `A partida não existe mais no servidor.` | fila sem destino (vai para as falhas) |

Quando a RPC devolve uma mensagem de erro, a tela mostra essa mensagem, como está no banco.
