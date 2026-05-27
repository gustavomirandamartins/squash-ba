-- ===== ENUMS =====
do $$ begin if not exists (select 1 from pg_type where typname='championship_format') then
  create type championship_format as enum ('liga','grupos_elim','eliminatoria','desafio'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type where typname='confront_unit') then
  create type confront_unit as enum ('player','pair','team'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type where typname='counting_system') then
  create type counting_system as enum ('tempo','set'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type where typname='match_status') then
  create type match_status as enum ('agendado','em_andamento','finalizado'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type where typname='match_result') then
  create type match_result as enum ('lado_a','lado_b','empate'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type where typname='participant_kind') then
  create type participant_kind as enum ('player','pair','team'); end if; end $$;

-- ===== CAMPEONATO =====
create table if not exists public.championships (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  format championship_format not null,
  unit confront_unit not null,
  -- pontuação/desempate configuráveis (cálculo é view futura):
  points_win int not null default 3,
  points_draw int not null default 1,
  points_loss int not null default 0,
  allow_draw boolean not null default false,
  tiebreakers text[] not null default array['sets_ganhos','pontos_ganhos','pontos_sofridos_asc'],
  status text not null default 'rascunho' check (status in ('rascunho','ativo','encerrado')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== ETAPAS (cada uma carrega seu sistema de contagem) =====
create table if not exists public.championship_stages (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references public.championships(id) on delete cascade,
  name text not null,
  ordering int not null default 0,
  kind text not null check (kind in ('grupos','liga','eliminatoria','triangular','final','desafio')),
  counting counting_system not null default 'set',
  -- parâmetros de contagem (aplicáveis conforme counting):
  rounds int not null default 1,                 -- nº de rodadas (liga/desafio)
  sets_to_play int not null default 3,           -- 1, 3, 5 (melhor de)
  points_per_set int not null default 11,
  win_by_two boolean not null default true,
  set_draw_enabled boolean not null default false, -- variante 11x11 = empate
  time_minutes int,                              -- usado quando counting='tempo'
  created_at timestamptz not null default now()
);

-- ===== GRUPOS (dentro de etapa de grupos) =====
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.championship_stages(id) on delete cascade,
  name text not null,
  ordering int not null default 0
);

-- ===== TIMES DO CAMPEONATO (agrupamento p/ unit='team') =====
create table if not exists public.championship_teams (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references public.championships(id) on delete cascade,
  name text not null,
  team_id uuid references public.teams(id) on delete set null, -- opcional: liga ao time cadastrado
  ordering int not null default 0
);

-- ===== PARTICIPANTES (unifica player/pair/team-member) =====
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references public.championships(id) on delete cascade,
  kind participant_kind not null,
  display_name text,                              -- nome do lado (ex.: dupla)
  championship_team_id uuid references public.championship_teams(id) on delete set null, -- p/ unit='team'
  enrollment_source text not null default 'organizador' check (enrollment_source in ('organizador','jogador')),
  enrollment_status text not null default 'confirmado' check (enrollment_status in ('pendente','confirmado','recusado')),
  seed int,                                        -- cabeça de chave (eliminatória)
  created_at timestamptz not null default now()
);

-- membros de um participante: 1 (player), 2 (pair), N (team)
create table if not exists public.participant_members (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  unique (participant_id, user_id)
);

-- ===== JOGOS (sempre individual/pair: dois lados) =====
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references public.championships(id) on delete cascade,
  stage_id uuid references public.championship_stages(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  round int,                                      -- rodada (liga) ou nível do bracket
  bracket_slot int,                               -- posição no chaveamento (eliminatória)
  side_a_participant_id uuid references public.participants(id) on delete set null,
  side_b_participant_id uuid references public.participants(id) on delete set null,
  court_id uuid references public.courts(id) on delete set null,
  scheduled_at timestamptz,
  status match_status not null default 'agendado',
  result match_result,
  duration_seconds int,                           -- jogo por tempo
  winner_advances_to uuid references public.matches(id) on delete set null, -- avanço no bracket
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== PLACAR POR SET (1 linha p/ jogo por tempo) =====
create table if not exists public.match_games (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  game_number int not null default 1,
  score_a int not null default 0,
  score_b int not null default 0,
  unique (match_id, game_number)
);

-- ===== ÍNDICES =====
create index if not exists idx_stages_champ on public.championship_stages(championship_id);
create index if not exists idx_groups_stage on public.groups(stage_id);
create index if not exists idx_champ_teams_champ on public.championship_teams(championship_id);
create index if not exists idx_participants_champ on public.participants(championship_id);
create index if not exists idx_participants_team on public.participants(championship_team_id);
create index if not exists idx_pmembers_participant on public.participant_members(participant_id);
create index if not exists idx_pmembers_user on public.participant_members(user_id);
create index if not exists idx_matches_champ on public.matches(championship_id);
create index if not exists idx_matches_stage on public.matches(stage_id);
create index if not exists idx_matches_group on public.matches(group_id);
create index if not exists idx_matches_side_a on public.matches(side_a_participant_id);
create index if not exists idx_matches_side_b on public.matches(side_b_participant_id);
create index if not exists idx_match_games_match on public.match_games(match_id);

-- ===== updated_at =====
drop trigger if exists trg_champ_updated_at on public.championships;
create trigger trg_champ_updated_at before update on public.championships
  for each row execute function public.set_updated_at();
drop trigger if exists trg_matches_updated_at on public.matches;
create trigger trg_matches_updated_at before update on public.matches
  for each row execute function public.set_updated_at();

-- ===== RLS =====
alter table public.championships         enable row level security;
alter table public.championship_stages   enable row level security;
alter table public.groups                enable row level security;
alter table public.championship_teams    enable row level security;
alter table public.participants          enable row level security;
alter table public.participant_members   enable row level security;
alter table public.matches               enable row level security;
alter table public.match_games           enable row level security;

-- leitura pública / escrita organizador-admin (padrão para todas)
do $$
declare t text;
begin
  foreach t in array array[
    'championships','championship_stages','groups','championship_teams',
    'participants','participant_members','matches','match_games'
  ] loop
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('create policy %I on public.%I for select using (true)', t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($f$create policy %I on public.%I for all
      using (public.is_organizer_or_admin((select auth.uid())))
      with check (public.is_organizer_or_admin((select auth.uid())))$f$, t||'_write', t);
  end loop;
end $$;
