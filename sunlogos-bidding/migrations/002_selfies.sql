create table if not exists room_selfies (
  code text not null references rooms(code) on delete cascade,
  player_id text not null,
  data text not null,
  primary key (code, player_id)
);

insert into room_selfies (code, player_id, data)
select r.code, p.elem->>'id', p.elem->>'selfieDataUrl'
from rooms r
cross join lateral jsonb_array_elements(r.state->'players') as p(elem)
where coalesce(p.elem->>'selfieDataUrl', '') <> ''
on conflict (code, player_id) do update set data = excluded.data;

update rooms
set state = jsonb_set(
  state,
  '{players}',
  coalesce(
    (
      select jsonb_agg(
        (player.elem - 'selfieDataUrl') || jsonb_build_object('selfieDataUrl', to_jsonb(''::text))
        order by player.ord
      )
      from jsonb_array_elements(state->'players') with ordinality as player(elem, ord)
    ),
    '[]'::jsonb
  )
);
