-- ===== Fix: jogo por tempo só finaliza quando duration_seconds IS NOT NULL =====
-- Antes: resolve_match finalizava assim que score_a != score_b, ignorando o cronômetro.
-- Agora: enquanto duration_seconds IS NULL, o jogo fica em_andamento mesmo com placar.

create or replace function public.resolve_match(_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record; st record; g record;
  _P int; _need int;
  _sa int := 0; _sb int := 0; _sd int := 0; _gc int := 0;
  _res match_result; _status match_status;
begin
  select * into m from public.matches where id = _match_id;
  if not found or m.stage_id is null then return; end if;
  select * into st from public.championship_stages where id = m.stage_id;

  if st.counting = 'tempo' then
    -- Jogo por tempo: só finaliza se o cronômetro foi encerrado (duration_seconds gravado)
    if m.duration_seconds is null then
      -- Cronômetro ainda não encerrou → apenas marca em_andamento se há games
      select * into g from public.match_games where match_id=_match_id limit 1;
      if found then _status := 'em_andamento'; else _status := 'agendado'; end if;
      _res := null;
    else
      -- Cronômetro encerrado → aplica resultado pelo placar
      select * into g from public.match_games where match_id=_match_id order by game_number limit 1;
      if not found then
        _res := null; _status := 'agendado';
      elsif g.score_a > g.score_b then
        _res := 'lado_a'; _status := 'finalizado';
      elsif g.score_b > g.score_a then
        _res := 'lado_b'; _status := 'finalizado';
      elsif st.set_draw_enabled then
        _res := 'empate'; _status := 'finalizado';
      else
        _res := null; _status := 'em_andamento';
      end if;
    end if;

  else
    -- Sets / pontos corridos: lógica original
    _P    := st.points_per_set;
    _need := (st.sets_to_play / 2) + 1;

    for g in select * from public.match_games where match_id=_match_id order by game_number loop
      _gc := _gc + 1;
      if    g.score_a >= _P and g.score_a - g.score_b >= 2 then
        _sa := _sa + 1;
      elsif g.score_b >= _P and g.score_b - g.score_a >= 2 then
        _sb := _sb + 1;
      elsif st.set_draw_enabled and g.score_a = g.score_b and g.score_a >= _P then
        _sd := _sd + 1;
      end if;
    end loop;

    if _sa >= _need then
      _res := 'lado_a'; _status := 'finalizado';
    elsif _sb >= _need then
      _res := 'lado_b'; _status := 'finalizado';
    elsif _gc >= st.sets_to_play and (_sa + _sb + _sd) = st.sets_to_play then
      if    _sa > _sb then _res := 'lado_a'; _status := 'finalizado';
      elsif _sb > _sa then _res := 'lado_b'; _status := 'finalizado';
      elsif st.set_draw_enabled then _res := 'empate'; _status := 'finalizado';
      else  _res := null; _status := 'em_andamento';
      end if;
    elsif _gc = 0 then
      _res := null; _status := 'agendado';
    else
      _res := null; _status := 'em_andamento';
    end if;
  end if;

  update public.matches set result = _res, status = _status where id = _match_id;
end; $$;
