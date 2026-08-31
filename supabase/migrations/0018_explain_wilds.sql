-- bluePi Slot — 0018 say when a wild carried the line
--
-- "Wins — Badminton Club: Min, Fluke, Eye, Oeii, Dodo" reads as a mistake when Eye
-- is not in that group. It is not: Eye is a wild, and a wild stands in for whatever
-- member the line is missing. The engine was right and the explanation was silent
-- about the one fact that made it right.
--
-- explain_grid now reports how many wilds were on each line and which they were, and
-- counts outsiders against the non-wild cells rather than all five, so the numbers in
-- the message add up to what the reader can see.

create or replace function slot.explain_grid(p_grid uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_max_wild int := slot.setting_int('max_wilds_per_line');
  pl       record;
  comb     record;
  syms     uuid[];
  nonwild  uuid[];
  wilds    int;
  allowed  int;
  outsiders int;
  dup      boolean;
  best_miss text;
  best_out  int;
  won_name  text;
  out      jsonb := '[]'::jsonb;
  names    text;
  wildnames text;
  n_real   int;
begin
  for pl in select id, family, cells from slot.payline order by id loop
    syms := slot.line_symbols(p_grid, pl.cells);

    select string_agg(coalesce(y.name, '?'), ', ' order by t.ord)
      into names
      from unnest(syms) with ordinality as t(s, ord)
      left join slot.symbol y on y.id = t.s;

    select count(*) into wilds
      from unnest(syms) s join slot.symbol y on y.id = s where y.is_wild;

    -- Named, because "1 wild" is far less useful than knowing it was Eye.
    select string_agg(distinct y.name, ', ')
      into wildnames
      from unnest(syms) s join slot.symbol y on y.id = s where y.is_wild;

    allowed := case when pl.family = 'corner' then 1 else v_max_wild end;

    select coalesce(array_agg(s), '{}') into nonwild
      from unnest(syms) s
     where not exists (select 1 from slot.symbol y where y.id = s and y.is_wild);

    n_real := coalesce(array_length(nonwild, 1), 0);

    won_name := null; best_miss := null; best_out := 999;

    if wilds > allowed then
      best_miss := format('%s wilds on the line (%s), at most %s allowed',
                          wilds, wildnames, allowed);
    else
      for comb in
        select c.id, c.name, c.bonus, count(cs.symbol_id) as size,
               array_agg(cs.symbol_id) as members
          from slot.combination c
          join slot.combination_symbol cs on cs.combination_id = c.id
         where c.is_active
         group by c.id, c.name, c.bonus
      loop
        select count(*) into outsiders
          from unnest(nonwild) s where not (s = any(comb.members));
        dup := comb.size >= 5
               and (select count(*) <> count(distinct s) from unnest(nonwild) s);

        if outsiders = 0 and not dup then
          won_name := comb.name;
          exit;
        elsif outsiders < best_out then
          best_out := outsiders;
          best_miss := case
            when outsiders > 0 then
              format('%s of the %s non-wild symbols are not in "%s" — every cell must belong to the group',
                     outsiders, n_real, comb.name)
            else
              format('"%s" needs %s different symbols, and one is repeated', comb.name, n_real)
          end;
        end if;
      end loop;
    end if;

    out := out || jsonb_build_object(
      'payline',    pl.id,
      'family',     pl.family,
      'symbols',    names,
      'won',        won_name is not null,
      'group',      won_name,
      'wilds',      wilds,
      'wild_names', wildnames,
      'reason',     case when won_name is not null then null else best_miss end
    );
  end loop;

  return out;
end $$;
