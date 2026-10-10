# Contrato da API — SquashBa

Referência para o **app iOS nativo**, que usa o mesmo backend do web: o projeto Supabase
`rghlwuucqkvyzyycewje` (`https://rghlwuucqkvyzyycewje.supabase.co`). Tudo foi tirado do
código e do banco atuais em **2026-10-10** (main em `eba7035`; 67 migrations, a última
`20261010145445_push_devices`). O que não foi possível confirmar está marcado como
**NÃO CONFIRMADO**.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| [telas.md](telas.md) | Por tela: o que é lido (colunas, joins, filtros, ordem), RPCs, escritas diretas, realtime, Storage, estados vazios e mensagens de erro |
| [rpcs.md](rpcs.md) | As 50 RPCs executáveis por `authenticated`: assinatura, retorno, quem pode, validações e mensagens de erro exatas |
| [modelo.md](modelo.md) | Tabelas e colunas, enums e valores de status, views, RLS, grants, gatilhos, realtime e buckets |
| [regras.md](regras.md) | Regras de negócio: senha, termos, pontuação, sets, tempo, W.O., desempate, ranking, bloqueio, limites, `onAppReturn`, `groupLabel` |
| [placar-offline.md](placar-offline.md) | Diário e fila do placar, payload de `apply_match_ops`, conflito, idempotência, `import_championship` e os casos dos testes |
| [auth.md](auth.md) | Cadastro, login, link mágico, callback, senha, exclusão de conta (`delete-account`), termos, templates de e-mail |
| [push.md](push.md) | `register_push_device`/`unregister_push_device`, payload APNs, notificações geradas e `url` → tela |
| [visual.md](visual.md) | Cores, fontes, raios, sombras, vidro, abas, menu do avatar, ícones e títulos |

## Fontes e método

- **Banco (só leitura).** Em produção, via `execute_sql`, só `select`: lista de RPCs
  executáveis, grants de tabela, publicação de realtime, buckets e políticas de Storage,
  Edge Functions publicadas.
- **Banco local.** Os corpos de função, colunas, checks, views e políticas vieram de um
  Postgres local com as mesmas 67 migrations, conferido antes contra produção: são iguais
  (ignorando comentários) as funções, as 34 tabelas e views, as 72 políticas, os 8 enums,
  os 23 checks, os 28 gatilhos e a publicação de realtime.
- **Código.** Para o que o cliente faz: `src/` (Next.js), `supabase/functions/` (Edge
  Functions) e os testes (`*.test.ts`, `e2e/`).
- Nada foi alterado no código nem no banco.

## Para começar no iOS

- **Cliente:** `supabase-swift` com a URL do projeto e a **chave publicável** (a mesma do web,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). A chave de serviço **nunca** vai para o app.
- **Ao abrir o app** (a mesma ordem do web):
  1. sem sessão → login;
  2. `profiles.onboarding_completed = false` → onboarding;
  3. `profiles.terms_accepted_at = null` → aceite dos termos.
- **Escritas que mudam regras** (criar campeonato ou desafio, placar, encerramento,
  inscrição) vão por RPC. As demais escritas diretas permitidas pelo RLS estão em
  [telas.md](telas.md).
- **Realtime:** só funciona em `messages`, `notifications`, `conversations` e
  `conversation_members`. Partidas e placares não emitem eventos.
- **Push:** registrar o token com `register_push_device` depois do login; remover com
  `unregister_push_device` antes do logout.
- **Excluir a conta:** Edge Function `delete-account`, com o token do usuário.

## Tipos Swift pelo CLI

Só verificado; nada foi gerado. O Supabase CLI instalado é a versão **2.120.0**, e
`supabase gen types --help` lista `--lang` com as opções
`typescript, go, python, swift, dart`, além de `--swift-access-control`
(`internal`, `public`, `private`, `package`; padrão `internal`). Ou seja, ele **gera tipos
Swift**. Comando, se e quando for usar:

```bash
supabase gen types --linked --lang=swift --swift-access-control=public > Database.swift
```

## Itens NÃO CONFIRMADOS

1. **Templates de e-mail de produção:** se exibem `{{ .Token }}` (código de 6 dígitos). O
   repositório não tem templates, e o painel não foi lido. → [auth.md](auth.md#templates-de-e-mail-e--token-)
2. **Formato do link nos e-mails de produção:** `?code=` (PKCE) ou `?token_hash=&type=`. O
   callback aceita os dois. → [auth.md](auth.md#retorno-dos-e-mails-authcallback)
3. **Confirmação de e-mail ligada em produção.** O `config.toml` é local e tem `false`; o web
   trata os dois casos. → [auth.md](auth.md#cadastro-e-mail--senha)
4. **Mínimo e requisitos de senha no Auth de produção.** O cliente exige 8; o `config.toml`
   local tem 6. → [regras.md](regras.md#senha)
5. **Demais configurações do Auth de produção:**
   - Site URL e URLs de redirecionamento permitidas (o iOS precisará do seu esquema ou
     Universal Link);
   - validade do JWT e do OTP;
   - proteção contra senhas vazadas;
   - limites de envio de e-mail.
   → [auth.md](auth.md#configurações-do-auth-em-produção)
6. **Secrets do APNs em produção** (`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`,
   `APNS_BUNDLE_ID`): se estão definidos e qual é o bundle id (`apns-topic`). Os secrets não
   foram lidos. → [push.md](push.md#payload-apns)

## Observações encontradas no levantamento

São fatos confirmados, não pendências. Ficam aqui porque afetam o iOS:

- **`matches` e `match_games` não estão na publicação de realtime.** As assinaturas do web
  nessas tabelas (classificação, chave e placar) não recebem eventos.
- `create_liga_championship` e `create_grupos_elim_championship` continuam executáveis, mas
  são legadas: o web usa `create_championship`.
- Apagar uma conversa direta tira só o meu vínculo. Ao falar de novo com a pessoa, nasce
  outra conversa, e ela continua com a antiga.
- A notificação de campeonato oficial (criado ou iniciado) vai para **todos** os perfis.
- Organizador e admin passam em `can_manage_championship` de **qualquer** campeonato.
- O aceite dos termos não tem versão: um aceite vale para qualquer revisão do texto.
