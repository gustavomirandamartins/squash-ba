-- ===== Nova coluna =====
alter table public.championships
  add column if not exists has_third_place boolean not null default false;

-- ===== Geração do bracket =====
create or replace function public.generate_bracket_matches(_championship_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  _stage_id uuid;
  _n        int;
  _size     int;
  _slots    uuid[]; -- participant_id ou null (bye) indexado por slot 1..size
  _i        int; _round int; _half int;
  _created  int := 0;
  _match_id uuid;
  _has_finished boolean;
  _has_third boolean;
  _cur_round_ids uuid[];
  _next_round_ids uuid[];
  _ma uuid; _mb uuid;
begin
  select exists(select 1 from public.matches
    where championship_id=_championship_id and status='finalizado')
  into _has_finished;
  if _has_finished then
    raise exception 'campeonato ja iniciado: nao e possivel regenerar os jogos';
  end if;

  select id into _stage_id from public.championship_stages
    where championship_id=_championship_id order by ordering limit 1;
  if _stage_id is null then return 0; end if;

  select has_third_place into _has_third
    from public.championships where id=_championship_id;

  -- carrega participantes confirmados ordenados por seed asc nulls last, created_at
  select array_agg(p.id order by coalesce(p.seed,9999), p.created_at)
  into _slots
  from public.participants p
  where p.championship_id=_championship_id and p.enrollment_status='confirmado';

  _n := coalesce(array_length(_slots,1),0);
  if _n < 2 then return 0; end if;

  -- triangular: delega ao round-robin
  if _n = 3 then
    return public.generate_liga_matches(_championship_id);
  end if;

  -- calcula próxima potência de 2
  _size := 1;
  while _size < _n loop _size := _size * 2; end loop;

  delete from public.matches where championship_id=_championship_id;

  -- monta slots com byes (null) usando distribuição ATP: seed1 vs seedN, seed2 vs seedN-1
  -- posições do bracket: 1,2,...,_size
  -- coloca seeds nas posições opostas; byes preenchem posições sem participante
  -- algoritmo: distribui _n participantes nas _size posições (posição = slot no array)
  -- posições preenchidas na ordem: 1, _size, _size/2+1, _size/2, ...
  declare
    _positions int[] := array[]::int[];
    _pos_count int := 0;
    _lo int := 1; _hi int := _size; _toggle boolean := true;
    _filled uuid[] := array_fill(null::uuid, array[_size]);
  begin
    -- distribui alternando topo e base
    while _pos_count < _size loop
      if _toggle then
        _positions := array_append(_positions, _lo); _lo := _lo + 1;
      else
        _positions := array_append(_positions, _hi); _hi := _hi - 1;
      end if;
      _toggle := not _toggle;
      _pos_count := _pos_count + 1;
    end loop;
    -- preenche os primeiros _n com participantes, resto null (bye)
    for _i in 1.._size loop
      if _i <= _n then
        _filled[_positions[_i]] := _slots[_i];
      end if;
    end loop;
    -- gera matches da rodada 1 (slots adjacentes: 1vs2, 3vs4, ...)
    _cur_round_ids := array[]::uuid[];
    _i := 1;
    while _i <= _size loop
      _ma := _filled[_i]; _mb := _filled[_i+1];
      -- determina se algum lado é bye
      if _ma is null and _mb is null then
        -- dois byes: não gera match (não deve acontecer com distribuição ATP)
        _cur_round_ids := array_append(_cur_round_ids, null);
      elsif _ma is null then
        -- bye no lado A: lado B avança
        insert into public.matches
          (championship_id, stage_id, round, bracket_slot,
           side_a_participant_id, side_b_participant_id, status, result)
        values (_championship_id, _stage_id, 1, (_i+1)/2,
                null, _mb, 'finalizado', 'lado_b')
        returning id into _match_id;
        _cur_round_ids := array_append(_cur_round_ids, _match_id);
        _created := _created + 1;
      elsif _mb is null then
        -- bye no lado B: lado A avança
        insert into public.matches
          (championship_id, stage_id, round, bracket_slot,
           side_a_participant_id, side_b_participant_id, status, result)
        values (_championship_id, _stage_id, 1, (_i+1)/2,
                _ma, null, 'finalizado', 'lado_a')
        returning id into _match_id;
        _cur_round_ids := array_append(_cur_round_ids, _match_id);
        _created := _created + 1;
      else
        -- match real
        insert into public.matches
          (championship_id, stage_id, round, bracket_slot,
           side_a_participant_id, side_b_participant_id, status)
        values (_championship_id, _stage_id, 1, (_i+1)/2,
                _ma, _mb, 'agendado')
        returning id into _match_id;
        _cur_round_ids := array_append(_cur_round_ids, _match_id);
        _created := _created + 1;
      end if;
      _i := _i + 2;
    end loop;

    -- gera rounds seguintes (placeholders: participantes preenchidos pelo trigger de avanço)
    _round := 2;
    _half := _size / 2;
    while _half >= 2 loop
      _next_round_ids := array[]::uuid[];
      _i := 1;
      while _i <= array_length(_cur_round_ids,1) loop
        insert into public.matches
          (championship_id, stage_id, round, bracket_slot, status)
        values (_championship_id, _stage_id, _round, (_i+1)/2, 'agendado')
        returning id into _match_id;
        _next_round_ids := array_append(_next_round_ids, _match_id);
        -- linka os dois matches anteriores para este
        if _cur_round_ids[_i] is not null then
          update public.matches set winner_advances_to=_match_id
            where id=_cur_round_ids[_i];
        end if;
        if _cur_round_ids[_i+1] is not null then
          update public.matches set winner_advances_to=_match_id
            where id=_cur_round_ids[_i+1];
        end if;
        _created := _created + 1;
        _i := _i + 2;
      end loop;
      _cur_round_ids := _next_round_ids;
      _round := _round + 1;
      _half := _half / 2;
    end loop;

    -- match de bronze (disputa do 3º): gerado como placeholder,
    -- perdedores das semifinais são inseridos pelo trigger
    if _has_third and array_length(_cur_round_ids,1) >= 2 then
      -- as duas semifinais são os matches na penúltima rodada
      -- bronze usa bracket_slot=-2 como identificador
      insert into public.matches
        (championship_id, stage_id, round, bracket_slot, status)
      values (_championship_id, _stage_id, _round - 1, -2, 'agendado')
      returning id into _match_id;
      _created := _created + 1;
    end if;
  end;

  -- propaga avanços imediatos dos byes (lado único já tem vencedor)
  perform public.propagate_bracket_advances(_championship_id);

  return _created;
end; $$;

-- ===== Propagação de avanço no bracket =====
create or replace function public.propagate_bracket_advances(_championship_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record; _winner uuid; _next record; _side text;
begin
  -- itera matches finalizados que têm winner_advances_to
  for m in
    select * from public.matches
    where championship_id=_championship_id
      and status='finalizado'
      and winner_advances_to is not null
    order by round asc
  loop
    _winner := case m.result
      when 'lado_a' then m.side_a_participant_id
      when 'lado_b' then m.side_b_participant_id
      else null end;
    if _winner is null then continue; end if;

    select * into _next from public.matches where id=m.winner_advances_to;
    if not found then continue; end if;

    -- determina qual slot preencher (A ou B) baseado em qual match alimenta
    -- convenção: match com bracket_slot ímpar -> lado A; par -> lado B
    if m.bracket_slot % 2 = 1 then _side := 'a'; else _side := 'b'; end if;

    if _side='a' and _next.side_a_participant_id is null then
      update public.matches set side_a_participant_id=_winner where id=_next.id;
    elsif _side='b' and _next.side_b_participant_id is null then
      update public.matches set side_b_participant_id=_winner where id=_next.id;
    end if;

    -- se ambos os lados preenchidos, ativa o match
    select * into _next from public.matches where id=m.winner_advances_to;
    if _next.side_a_participant_id is not null
       and _next.side_b_participant_id is not null
       and _next.status='agendado' then
      update public.matches set status='agendado' where id=_next.id;
    end if;
  end loop;

  -- propaga perdedores para o bronze (bracket_slot=-2)
  if exists (select 1 from public.championships
    where id=_championship_id and has_third_place=true) then
    declare
      _bronze_id uuid;
      _loser_a uuid := null; _loser_b uuid := null;
      _sf record; _slot int := 1;
    begin
      select id into _bronze_id from public.matches
        where championship_id=_championship_id and bracket_slot=-2;
      if _bronze_id is not null then
        -- semifinais = matches da rodada máxima-1 exceto bronze e final
        for _sf in
          select * from public.matches
          where championship_id=_championship_id
            and bracket_slot > 0
            and status='finalizado'
            and round=(
              select max(round)-1 from public.matches
              where championship_id=_championship_id and bracket_slot>0
            )
          order by bracket_slot
        loop
          declare _loser uuid;
          begin
            _loser := case _sf.result
              when 'lado_a' then _sf.side_b_participant_id
              when 'lado_b' then _sf.side_a_participant_id
              else null end;
            if _loser is not null then
              if _slot=1 then
                update public.matches set side_a_participant_id=_loser where id=_bronze_id;
              else
                update public.matches set side_b_participant_id=_loser where id=_bronze_id;
              end if;
              _slot := _slot + 1;
            end if;
          end;
        end loop;
      end if;
    end;
  end if;
end; $$;

-- ===== Trigger: ao finalizar match, propaga avanço =====
create or replace function public.trg_bracket_advance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status='finalizado' and (old.status is distinct from 'finalizado') then
    perform public.propagate_bracket_advances(new.championship_id);
  end if;
  return new;
end; $$;
drop trigger if exists bracket_advance on public.matches;
create trigger bracket_advance
  after update of status on public.matches
  for each row execute function public.trg_bracket_advance();

-- ===== Atualiza trg_championship_status para cobrir eliminatória =====
create or replace function public.trg_championship_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare _has_finished boolean; _generated int;
begin
  if new.status='ativo' and old.status is distinct from 'ativo' then
    if new.format in ('liga') or (new.format='desafio' and new.unit='player') then
      perform public.generate_liga_matches(new.id);
    elsif new.format='desafio' and new.unit='team' then
      perform public.generate_team_challenge_matches(new.id);
    elsif new.format='eliminatoria' then
      perform public.generate_bracket_matches(new.id);
    end if;
  end if;
  if new.status='rascunho' and old.status='ativo' then
    select exists(select 1 from public.matches
      where championship_id=new.id and status='finalizado')
    into _has_finished;
    if _has_finished then
      raise exception 'nao e possivel voltar para rascunho: ha jogo realizado';
    end if;
    delete from public.matches where championship_id=new.id;
  end if;
  return new;
end; $$;

grant execute on function public.generate_bracket_matches(uuid) to authenticated;
grant execute on function public.propagate_bracket_advances(uuid) to authenticated;
