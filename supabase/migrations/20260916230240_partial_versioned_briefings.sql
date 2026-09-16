alter table public.mug_projects
  alter column creation_mode drop not null;

alter table public.briefings
  alter column creation_mode drop not null;

alter table public.briefings
  add column creative_freedom boolean not null default false;

create or replace function public.ensure_chat_briefing_state(
  p_conversation_id uuid
)
returns table(
  project_id uuid,
  briefing_id uuid,
  version integer,
  briefing jsonb
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_customer_id uuid;
  v_briefing public.briefings%rowtype;
begin
  select c.active_project_id, c.customer_id
    into v_project_id, v_customer_id
  from public.conversations as c
  where c.id = p_conversation_id
    and c.status = 'open'
  for update;

  if not found then
    raise exception 'open conversation not found';
  end if;

  if v_project_id is not null then
    select b.*
      into v_briefing
    from public.mug_projects as p
    join public.briefings as b on b.id = p.current_briefing_id
    where p.id = v_project_id
      and p.conversation_id = p_conversation_id;

    if found then
      return query
      select v_project_id, v_briefing.id, v_briefing.version, to_jsonb(v_briefing);
      return;
    end if;

    select b.*
      into v_briefing
    from public.briefings as b
    where b.project_id = v_project_id
    order by b.version desc
    limit 1;

    if found then
      update public.mug_projects as p
      set current_briefing_id = v_briefing.id,
          updated_at = now()
      where p.id = v_project_id;

      return query
      select v_project_id, v_briefing.id, v_briefing.version, to_jsonb(v_briefing);
      return;
    end if;
  else
    insert into public.mug_projects(
      customer_id,
      conversation_id,
      creation_mode,
      status
    )
    values (
      v_customer_id,
      p_conversation_id,
      null,
      'building_briefing'
    )
    returning id into v_project_id;
  end if;

  insert into public.briefings(
    project_id,
    version,
    creation_mode,
    creative_freedom,
    missing_information,
    confidence_score,
    ready_to_generate
  )
  values (
    v_project_id,
    1,
    null,
    false,
    '["creation_mode","creative_context","style_or_creative_freedom"]'::jsonb,
    0,
    false
  )
  returning * into v_briefing;

  update public.mug_projects as p
  set current_briefing_id = v_briefing.id,
      status = 'building_briefing',
      updated_at = now()
  where p.id = v_project_id;

  update public.conversations as c
  set active_project_id = v_project_id,
      updated_at = now()
  where c.id = p_conversation_id;

  return query
  select v_project_id, v_briefing.id, v_briefing.version, to_jsonb(v_briefing);
end;
$$;

create or replace function public.append_chat_briefing_version(
  p_conversation_id uuid,
  p_project_id uuid,
  p_expected_version integer,
  p_briefing jsonb
)
returns table(
  project_id uuid,
  briefing_id uuid,
  version integer,
  briefing jsonb
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current_briefing_id uuid;
  v_current_version integer;
  v_creation_mode text;
  v_new_briefing public.briefings%rowtype;
begin
  if p_expected_version < 1 then
    raise exception 'expected briefing version must be positive';
  end if;

  if p_briefing is null or jsonb_typeof(p_briefing) <> 'object' then
    raise exception 'briefing payload must be an object';
  end if;

  select p.current_briefing_id
    into v_current_briefing_id
  from public.conversations as c
  join public.mug_projects as p
    on p.id = c.active_project_id
  where c.id = p_conversation_id
    and c.status = 'open'
    and p.id = p_project_id
    and p.conversation_id = p_conversation_id
  for update of c, p;

  if not found or v_current_briefing_id is null then
    raise exception 'active project briefing not found';
  end if;

  select b.version
    into v_current_version
  from public.briefings as b
  where b.id = v_current_briefing_id
    and b.project_id = p_project_id;

  if not found or v_current_version <> p_expected_version then
    raise exception using
      errcode = '40001',
      message = 'briefing version conflict';
  end if;

  v_creation_mode := nullif(btrim(p_briefing ->> 'creationMode'), '');

  insert into public.briefings(
    project_id,
    version,
    creation_mode,
    occasion,
    recipient,
    main_theme,
    desired_style,
    color_preferences,
    mandatory_text,
    names,
    dates,
    mandatory_elements,
    forbidden_elements,
    reference_items,
    composition_notes,
    creative_direction,
    creative_freedom,
    missing_information,
    confidence_score,
    ready_to_generate
  )
  values (
    p_project_id,
    p_expected_version + 1,
    v_creation_mode,
    nullif(btrim(p_briefing ->> 'occasion'), ''),
    nullif(btrim(p_briefing ->> 'recipient'), ''),
    nullif(btrim(p_briefing ->> 'mainTheme'), ''),
    nullif(btrim(p_briefing ->> 'desiredStyle'), ''),
    coalesce(p_briefing -> 'colorPreferences', '[]'::jsonb),
    coalesce(p_briefing -> 'mandatoryText', '[]'::jsonb),
    coalesce(p_briefing -> 'names', '[]'::jsonb),
    coalesce(p_briefing -> 'dates', '[]'::jsonb),
    coalesce(p_briefing -> 'mandatoryElements', '[]'::jsonb),
    coalesce(p_briefing -> 'forbiddenElements', '[]'::jsonb),
    coalesce(p_briefing -> 'references', '[]'::jsonb),
    nullif(btrim(p_briefing ->> 'compositionNotes'), ''),
    nullif(btrim(p_briefing ->> 'creativeDirection'), ''),
    coalesce((p_briefing ->> 'creativeFreedom')::boolean, false),
    coalesce(p_briefing -> 'missingInformation', '[]'::jsonb),
    coalesce((p_briefing ->> 'confidenceScore')::numeric, 0),
    coalesce((p_briefing ->> 'readyToGenerate')::boolean, false)
  )
  returning * into v_new_briefing;

  update public.mug_projects as p
  set creation_mode = coalesce(v_creation_mode, p.creation_mode),
      current_briefing_id = v_new_briefing.id,
      status = case
        when v_new_briefing.ready_to_generate then 'ready_to_generate'
        else 'building_briefing'
      end,
      updated_at = now()
  where p.id = p_project_id;

  return query
  select p_project_id, v_new_briefing.id, v_new_briefing.version, to_jsonb(v_new_briefing);
end;
$$;

revoke all on function public.ensure_chat_briefing_state(uuid) from public;
revoke all on function public.ensure_chat_briefing_state(uuid) from anon, authenticated;
grant execute on function public.ensure_chat_briefing_state(uuid) to service_role;

revoke all on function public.append_chat_briefing_version(uuid, uuid, integer, jsonb) from public;
revoke all on function public.append_chat_briefing_version(uuid, uuid, integer, jsonb) from anon, authenticated;
grant execute on function public.append_chat_briefing_version(uuid, uuid, integer, jsonb) to service_role;
