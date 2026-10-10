# Autenticação e conta

O app usa o Supabase Auth com e-mail. O web usa `@supabase/ssr`, com sessão em cookies. O
iOS usa o `supabase-swift` com a mesma URL e a mesma chave publicável.

## Fluxos

### Cadastro (e-mail + senha)

```
auth.signUp({
  email,
  password,                         // cliente exige ≥ 8
  options: {
    emailRedirectTo: "<origem>/auth/callback",
    data: { terms_accepted: true }  // obrigatório: só é enviado com o aceite marcado
  }
})
```

- O gatilho `handle_new_user` (em `auth.users`) cria:
  - `profiles` (`terms_accepted_at = now()` se `terms_accepted == "true"`);
  - `profiles_private` (com o e-mail);
  - o papel `player`.
- Se a resposta traz `session`, o usuário já entra. Se não, a confirmação de e-mail está
  ligada e a tela mostra `Confirme seu e-mail`:
  `Enviamos um e-mail de confirmação para <e-mail>. Confirme para ativar sua conta e depois entre com e-mail e senha.`
- **Se a confirmação de e-mail está ligada em produção: NÃO CONFIRMADO.** O
  `config.toml` do repositório é local (`enable_confirmations = false`); o código trata os
  dois casos.
- Depois do primeiro login, o app manda para `/onboarding` (perfil) e depois segue (ver
  [regras.md](regras.md#termos-de-uso-obrigatórios)).

### Login com senha

```
auth.signInWithPassword({ email, password })   // senha só não pode ser vazia
```

Depois, vai para `?next=` (caminho interno validado) ou para `/`.

### Link mágico

```
auth.signInWithOtp({ email, options: { emailRedirectTo: "<origem>/auth/callback" } })
```

A tela mostra `Verifique seu e-mail`:
`Enviamos um link mágico para <e-mail>. Clique no link para entrar.`

O destino depois do login vai num cookie (`sb-login-next`, 15 min). O endereço de retorno
não muda, porque precisa estar na lista de URLs permitidas do Auth.

### Retorno dos e-mails: `/auth/callback`

Aceita os dois formatos:

1. **PKCE**: `?code=…` → `auth.exchangeCodeForSession(code)`.
2. **token_hash**: `?token_hash=…&type=<tipo>` → `auth.verifyOtp({ type, token_hash })`.

Com sucesso, redireciona para `next` (query), para o cookie `sb-login-next` ou para `/`.
Com falha, vai para `/login?error=auth`.

`next` só é aceito se começa com `/`, não começa com `//` ou `/\`, não é `/login…` e não é
`/auth/…`.

**Qual dos dois formatos os e-mails de produção usam: NÃO CONFIRMADO** (depende dos
templates; ver abaixo).

### Esqueci a senha

```
auth.resetPasswordForEmail(email, { redirectTo: "<origem>/auth/callback?next=/auth/update-password" })
```

A tela mostra `Link enviado!`:
`Enviamos um link para <e-mail>. Clique nele para criar ou redefinir sua senha.`

Em `/auth/update-password`, uma server action confere a sessão (`getUser`) e chama
`auth.updateUser({ password })`.

| Mensagem | Quando |
|---|---|
| `A senha precisa de pelo menos 8 caracteres.` | menos de 8 (checado no servidor do Next) |
| `Sessão expirada ou inválida. Solicite um novo link de redefinição.` | sem sessão de recuperação |
| a tradução do Auth (abaixo), ou a mensagem original | o Auth recusou |

### Trocar a senha logado (Perfil)

`auth.updateUser({ password })`. Exige 8 ou mais caracteres e a confirmação igual. Em caso de
erro: a tradução do Auth ou `Não foi possível salvar a senha. Tente novamente.`. O texto da
seção explica que serve para quem entrava por link mágico passar a entrar com senha.

### Sair

`auth.signOut()` (menu do avatar → `Sair`). No iOS, chamar antes
`unregister_push_device(token)` (ver [push.md](push.md)).

### Exclusão da conta

- **Web:** `POST /api/account/delete` (rota do Next, com a sessão em cookie).
- **iOS:** Edge Function **`delete-account`** (publicada em produção, versão 1,
  `verify_jwt = true`):

```
POST https://rghlwuucqkvyzyycewje.supabase.co/functions/v1/delete-account
Authorization: Bearer <access_token do usuário>
apikey: <chave publicável>
```

| Resposta | Quando |
|---|---|
| `200 {"ok":true}` | conta excluída |
| `401 {"error":"Não autenticado."}` | sem token ou token sem usuário (anônimo ou de serviço) |
| `405 {"error":"Método não permitido."}` | método ≠ POST (`OPTIONS` responde CORS) |
| `500 {"error":"<mensagem do Auth>"}` | falha ao excluir |

- A função valida o token no Auth (`getUser`) e exclui **só** esse usuário, com a chave de
  serviço. Nunca usa um id vindo do corpo.
- O token é conferido duas vezes: o gateway (`verify_jwt`) e a função.
- Exclusão em cascata: [modelo.md](modelo.md#exclusões-em-cascata). Depois, o cliente deve
  apagar a sessão local.
- Mensagem do web em caso de falha: `Não foi possível excluir a conta.`

### Aceite dos termos

- **No cadastro:** metadado `terms_accepted: true` (acima).
- **Depois:** RPC `accept_terms()` → `timestamptz` (ver [rpcs.md](rpcs.md#accept_terms)). Na
  tela `/termos/aceitar`, o botão `Aceitar e continuar` só é liberado com
  `Li e aceito os Termos de Uso do SquashBa.` marcado. Em caso de erro:
  `Não foi possível registrar o aceite. Tente de novo.`
- O texto dos termos é público em `/termos`; a privacidade, em `/privacidade`.

## Proteção de rotas (web)

`src/proxy.ts` confere a sessão com `getClaims()`. Sem sessão, qualquer rota fora das
públicas vai para `/login?next=<caminho>`.

Rotas públicas:

- `/login`, `/auth/*`, `/api/*` (cada rota confere o próprio acesso), `/privacidade`,
  `/~offline`;
- `/termos` (só o caminho exato: `/termos/aceitar` exige sessão).

## Mensagens de erro

Tradução das mensagens do Auth na tela de login (`traduzErro`, `translatePasswordError`):

| Mensagem do Auth contém | Texto exibido |
|---|---|
| `invalid login credentials` | `E-mail ou senha incorretos. Se você costuma entrar por link mágico, defina uma senha no seu perfil.` |
| `email not confirmed` | `Confirme seu e-mail antes de entrar.` |
| `user already registered` | `Este e-mail já tem conta. Use "Entrar".` |
| `at least N characters` | `A senha precisa de pelo menos N caracteres.` |
| `pwned`, `leaked`, `known to be weak`, `weak password` | `Esta senha é fraca ou já apareceu em vazamentos. Escolha outra.` |
| `should contain`, `characters of each` | `A senha precisa misturar letras e números.` |
| `should be different` | `A nova senha precisa ser diferente da atual.` |
| `rate limit`, `too many` | `Muitas tentativas. Aguarde um instante.` |
| outra | `Algo deu errado. Tente novamente.` |

Na tela de login, os botões ficam desabilitados com e-mail inválido (é preciso `@` e mais de
3 caracteres).

## Templates de e-mail e `{{ .Token }}`

- O repositório **não tem** templates de e-mail: não existe `supabase/templates/`, e as
  seções `[auth.email.template.*]` do `config.toml` estão comentadas.
- O `config.toml` é de ambiente local e não reflete produção. Ele tem
  `otp_length = 6` e `otp_expiry = 3600`.
- **Se os templates de produção exibem `{{ .Token }}` (o código numérico de 6 dígitos):
  NÃO CONFIRMADO.** Eles ficam no painel (Authentication → Emails) e não foram lidos
  neste levantamento.
- O web atual não tem campo para digitar código: depende só do link. Se o iOS for usar
  código, o template precisa exibir `{{ .Token }}` e o app chama
  `auth.verifyOTP(email:token:type:)`.

## Configurações do Auth em produção

Não foram lidas; todas estão como **NÃO CONFIRMADO**:

- tamanho mínimo e requisitos de senha;
- confirmação de e-mail ligada ou não;
- Site URL e URLs de redirecionamento permitidas. O iOS precisará do seu esquema ou
  Universal Link na lista;
- validade do JWT e do OTP;
- proteção contra senhas vazadas;
- limites de envio de e-mail.
