# Push

Há dois canais, disparados pelo banco: o **Web Push** (PWA, VAPID) e o **APNs** (app iOS).
As duas Edge Functions abaixo enviam pelos dois canais ao mesmo tempo.

| Origem | Gatilho no banco | Edge Function | Destinatários |
|---|---|---|---|
| Nova mensagem (`messages` insert) | `on_new_message_push` | `send-push` | membros da conversa, menos o remetente e quem bloqueou o remetente |
| Nova notificação (`notifications` insert) | `notify_push` | `notify-push` | o `user_id` da notificação. **`type = 'mensagem'` é ignorado aqui**, porque a mensagem já teve push via `send-push` |

As duas funções estão publicadas em produção (`send-push` e `notify-push`, versão 4,
`verify_jwt = true`). Elas só aceitam chamadas com papel `service_role`: o gatilho usa a
chave guardada no Vault (`push_webhook_key`). Qualquer outro token recebe
`403 {"error":"forbidden"}`. **O app nunca chama essas funções.**

## Registro do aparelho (iOS)

### register_push_device

```
rpc register_push_device(_token text, _environment text) → uuid
```

- `_token`: o device token do APNs em **hex**. É aparado e convertido para minúsculas, e
  precisa casar com `^[0-9a-f]{64,200}$`.
- `_environment`: `sandbox` (build de desenvolvimento ou do Xcode) ou `production`
  (TestFlight ou App Store). Define o host do APNs usado para esse aparelho.
- O token é único: se outro usuário já tinha registrado o mesmo token, o registro passa
  para o usuário atual, troca o ambiente e limpa `last_error`.
- Chamar depois do login, sempre que o iOS entregar o token (ele pode mudar).
- Erros: `Usuário não autenticado.`, `Token de aparelho inválido.`,
  `Ambiente inválido: <valor>`.

### unregister_push_device

```
rpc unregister_push_device(_token text) → boolean
```

Apaga o token, só se for do usuário atual. Chamar **antes** do `signOut`. Retorna `true` se
apagou. Erro: `Usuário não autenticado.`

`push_devices` tem `SELECT` só das próprias linhas e nenhuma escrita direta. A exclusão da
conta apaga os aparelhos em cascata.

### Limpeza automática

| Resposta da Apple | Efeito |
|---|---|
| HTTP 410, `BadDeviceToken` ou `Unregistered` | o aparelho é **apagado** |
| outros erros | a razão (até 200 caracteres) fica em `push_devices.last_error` |
| `ExpiredProviderToken` / `InvalidProviderToken` | o JWT da função é refeito na próxima chamada |

## Payload APNs

Requisição feita pela função (`_shared/apns.ts`):

```
POST https://api.push.apple.com/3/device/<token>             (production)
POST https://api.sandbox.push.apple.com/3/device/<token>     (sandbox)
authorization: bearer <JWT ES256: kid = APNS_KEY_ID, iss = APNS_TEAM_ID>
apns-topic: <APNS_BUNDLE_ID>
apns-push-type: alert
apns-priority: 10
```

Corpo:

```json
{
  "aps": {
    "alert": { "title": "<título>", "body": "<texto>" },
    "sound": "default",
    "thread-id": "<agrupamento>"
  },
  "url": "<caminho da tela>"
}
```

| Campo | Mensagem (`send-push`) | Notificação (`notify-push`) |
|---|---|---|
| `title` | nome do remetente (`profiles.full_name`, ou `Alguém`) | `notifications.title`, ou `SquashBa` |
| `body` | texto da mensagem, até 120 caracteres | `notifications.body`, até 120 caracteres (vazio se não houver) |
| `thread-id` | id da conversa | o `type` da notificação |
| `url` | `/mensagens/<conversation_id>` | `notifications.url`, ou `/` |

- Não há `badge`, `category` nem `mutable-content`. O contador de não lidas no ícone fica a
  cargo do app (`get_unread_total`).
- O web também grava a notificação no sino (`notifications`). No iOS, abrir o push não marca
  a notificação como lida: o app precisa fazer isso
  (`update notifications set read = true where id = …`), como o sino do web.
- Sem os secrets `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` e `APNS_BUNDLE_ID`, a
  função não envia por APNs e só registra no log. **Se estão definidos em produção, e o valor
  do bundle id: NÃO CONFIRMADO** (secrets não foram lidos).

### Payload Web Push (referência)

`{ "title", "body", "url" }`:

- mensagem: `body` até 80 caracteres e `url` fixa `/mensagens`;
- notificação: `body` até 120 caracteres e `url = notifications.url`.

Assinaturas que respondem 410 (ou 404 em `notify-push`) são apagadas.

## Notificações geradas e telas

Todas as notificações nascem em gatilhos (`public.notify` ou insert direto). O cliente não
cria notificações.

| `type` | Título | Texto | `url` | Para quem |
|---|---|---|---|---|
| `mensagem` | nome do remetente (ou `Alguém`) | início da mensagem (90 caracteres) | `/mensagens/<conversation_id>` | membros da conversa, menos o remetente e quem o bloqueou (push via `send-push`) |
| `desafio_convite` | `Novo desafio` | `Você foi desafiado — toque para responder.` | `/desafios/<id>` | o convidado pendente de um desafio (não o criador) |
| `desafio_aceito` | `Desafio aceito` | `Seu desafio foi aceito. Bom jogo!` | `/desafios/<id>` | o criador do desafio |
| `campeonato` | `Novo campeonato` | `Você foi inscrito em <nome>.` | `/campeonatos/<id>` | jogador incluído num campeonato (não o criador) |
| `campeonato` | `Novo campeonato oficial` | `<nome> — inscrições abertas` | `/campeonatos/<id>` | **todos** os perfis, quando um oficial é criado em rascunho |
| `campeonato` | `Campeonato oficial iniciado` | `<nome> começou!` | `/campeonatos/<id>` | **todos** os perfis, quando um oficial passa a ativo |
| `denuncia` | `Nova denúncia` | `Denunciaram um post/um comentário/uma mensagem/um perfil. Toque para analisar.` | `/admin/denuncias` | admins |
| `feedback` | `Novo feedback` | `Um usuário enviou um feedback.` | `/admin/feedbacks` | admins |
| `professor` | `Solicitação de professor` | `<nome> quer ser professor.` | `/admin/professores` | admins |

### `url` → tela

| Padrão de `url` | Tela | Observação |
|---|---|---|
| `/mensagens/<uuid>` | Chat da conversa | só membros; não membro → 404 |
| `/mensagens` | Lista de conversas | web push de mensagem |
| `/desafios/<uuid>` | Detalhe do desafio (com aceitar/recusar se o convite está pendente) | |
| `/campeonatos/<uuid>` | Detalhe do campeonato | |
| `/admin/denuncias` | Painel admin → Denúncias | só admin |
| `/admin/feedbacks` | Painel admin → Feedbacks | só admin |
| `/admin/professores` | Painel admin → Professores | só admin |
| `/` | Início | padrão quando não há `url` |

Outras rotas que o web abre a partir de listas, para referência do roteamento no iOS:
`/campeonatos/<id>/jogos/<matchId>` e `/desafios/<id>/jogos/<matchId>` (placar),
`/jogador/<userId>` (ficha), `/perfil`, `/ajuda`, `/organizador`, `/gestao/*` e
`/sincronizacao`.

## Sino de notificações (como o web usa)

- Lista: `notifications` com `select id, type, title, body, url, read, created_at`, filtro
  `user_id = eu`, ordem `created_at desc`, até 30.
- Tempo real: canal `notifications-<userId>`, `INSERT` em `notifications` com filtro
  `user_id=eq.<userId>`. A notificação nova entra no topo.
- Marcar todas como lidas: `update notifications set read = true where user_id = eu and
  read = false`. Tocar numa notificação marca só ela e abre a `url`.
- Vazio: `Nenhuma notificação ainda.`
