alter table public.channel_comment_sync_settings
  add column retry_blocked boolean not null default false;

alter table public.channel_comment_sync_runs
  add column attempt_count integer not null default 0
    check (attempt_count between 0 and 3);

alter table public.channel_comment_sync_runs
  drop constraint channel_comment_sync_runs_kind_check;

alter table public.channel_comment_sync_runs
  add constraint channel_comment_sync_runs_kind_check check (
    kind in (
      'backfill_recent',
      'incremental',
      'sync_cycle',
      'reply_reconciliation'
    )
  );

grant select (attempt_count) on public.channel_comment_sync_runs
  to authenticated;

create function public.configure_channel_comment_sync_cycle(
  target_workspace_id uuid,
  target_start_date date
)
returns public.channel_comment_sync_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  configured public.channel_comment_sync_settings;
begin
  configured := public.configure_channel_comment_sync(
    target_workspace_id,
    target_start_date
  );

  update public.channel_comment_sync_settings
  set
    last_successful_sync_at = now(),
    incremental_page_token = null,
    incremental_scan_started_at = null,
    retry_blocked = false,
    next_sync_at = now(),
    updated_at = now()
  where id = configured.id
  returning * into configured;

  return configured;
end;
$$;

create function public.request_channel_comment_sync_cycle_now(
  target_workspace_id uuid
)
returns public.channel_comment_sync_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_setting public.channel_comment_sync_settings;
begin
  changed_setting := public.request_channel_comment_sync_now(target_workspace_id);

  update public.channel_comment_sync_settings
  set
    retry_blocked = false,
    next_sync_at = now(),
    updated_at = now()
  where id = changed_setting.id
  returning * into changed_setting;

  return changed_setting;
end;
$$;

create function public.claim_channel_comment_sync_cycle_internal(
  target_workspace_id uuid,
  target_limit integer,
  target_lease_seconds integer
)
returns table (
  setting_id uuid,
  run_id uuid,
  claim_token uuid,
  workspace_id uuid,
  connection_id uuid,
  youtube_channel_id text,
  run_kind text,
  backfill_start_at timestamptz,
  page_token text,
  last_successful_sync_at timestamptz,
  incremental_scan_started_at timestamptz,
  incremental_page_token text,
  backfill_page_token text,
  backfill_status text,
  cycle_budget integer
)
language plpgsql
set search_path = public
as $$
declare
  claimed_setting public.channel_comment_sync_settings;
  claimed_run public.channel_comment_sync_runs;
  next_kind text;
begin
  for claimed_setting in
    select sync_setting.*
    from public.channel_comment_sync_settings as sync_setting
    join public.youtube_connections as connection
      on connection.id = sync_setting.connection_id
      and connection.workspace_id = sync_setting.workspace_id
      and connection.status = 'connected'
    where (target_workspace_id is null
      or sync_setting.workspace_id = target_workspace_id)
      and sync_setting.enabled
      and not sync_setting.retry_blocked
      and (sync_setting.lease_until is null
        or sync_setting.lease_until <= now())
      and (
        sync_setting.next_sync_at <= now()
        or sync_setting.reply_reconciliation_status in ('pending', 'running')
        or (
          sync_setting.next_reply_reconciliation_at is not null
          and sync_setting.next_reply_reconciliation_at <= now()
        )
      )
    order by
      case when sync_setting.next_sync_at <= now() then 0 else 1 end,
      sync_setting.next_sync_at,
      sync_setting.created_at
    for update of sync_setting skip locked
    limit least(greatest(target_limit, 1), 10)
  loop
    claimed_run := null;

    select sync_run.*
    into claimed_run
    from public.channel_comment_sync_runs as sync_run
    where sync_run.setting_id = claimed_setting.id
      and sync_run.status in ('pending', 'running')
      and sync_run.attempt_count < 3
    order by sync_run.created_at
    limit 1
    for update;

    if claimed_run.id is null then
      next_kind := case
        when claimed_setting.next_sync_at <= now() then 'sync_cycle'
        else 'reply_reconciliation'
      end;

      insert into public.channel_comment_sync_runs (
        setting_id,
        workspace_id,
        kind,
        status,
        claim_token,
        input_page_token,
        attempt_count,
        started_at
      ) values (
        claimed_setting.id,
        claimed_setting.workspace_id,
        next_kind,
        'running',
        gen_random_uuid(),
        case
          when next_kind = 'reply_reconciliation'
            then claimed_setting.reply_reconciliation_page_token
          else null
        end,
        1,
        now()
      )
      returning * into claimed_run;
    else
      update public.channel_comment_sync_runs
      set
        status = 'running',
        claim_token = gen_random_uuid(),
        attempt_count = attempt_count + 1,
        error_code = null,
        finished_at = null,
        started_at = coalesce(started_at, now())
      where id = claimed_run.id
      returning * into claimed_run;
    end if;

    update public.channel_comment_sync_settings as sync_setting
    set
      lease_until = now()
        + make_interval(secs => greatest(target_lease_seconds, 30)),
      backfill_status = case
        when claimed_run.kind = 'sync_cycle'
          and sync_setting.backfill_status <> 'completed'
          then 'running'
        else sync_setting.backfill_status
      end,
      incremental_scan_started_at = case
        when claimed_run.kind = 'sync_cycle'
          then coalesce(sync_setting.incremental_scan_started_at, now())
        else sync_setting.incremental_scan_started_at
      end,
      reply_reconciliation_status = case
        when claimed_run.kind = 'reply_reconciliation' then 'running'
        else sync_setting.reply_reconciliation_status
      end,
      updated_at = now()
    where sync_setting.id = claimed_setting.id
    returning * into claimed_setting;

    setting_id := claimed_setting.id;
    run_id := claimed_run.id;
    claim_token := claimed_run.claim_token;
    workspace_id := claimed_setting.workspace_id;
    connection_id := claimed_setting.connection_id;
    youtube_channel_id := claimed_setting.youtube_channel_id;
    run_kind := claimed_run.kind;
    backfill_start_at := claimed_setting.backfill_start_at;
    page_token := claimed_run.input_page_token;
    last_successful_sync_at := claimed_setting.last_successful_sync_at;
    incremental_scan_started_at := claimed_setting.incremental_scan_started_at;
    incremental_page_token := claimed_setting.incremental_page_token;
    backfill_page_token := claimed_setting.backfill_page_token;
    backfill_status := claimed_setting.backfill_status;
    cycle_budget := 100;
    return next;
  end loop;
end;
$$;

create function public.claim_channel_comment_sync_cycle(
  target_limit integer default 1,
  target_lease_seconds integer default 240
)
returns table (
  setting_id uuid,
  run_id uuid,
  claim_token uuid,
  workspace_id uuid,
  connection_id uuid,
  youtube_channel_id text,
  run_kind text,
  backfill_start_at timestamptz,
  page_token text,
  last_successful_sync_at timestamptz,
  incremental_scan_started_at timestamptz,
  incremental_page_token text,
  backfill_page_token text,
  backfill_status text,
  cycle_budget integer
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.claim_channel_comment_sync_cycle_internal(
    null,
    target_limit,
    target_lease_seconds
  );
$$;

create function public.claim_channel_comment_sync_cycle_for_workspace(
  target_workspace_id uuid,
  target_requesting_user_id uuid,
  target_lease_seconds integer default 240
)
returns table (
  setting_id uuid,
  run_id uuid,
  claim_token uuid,
  workspace_id uuid,
  connection_id uuid,
  youtube_channel_id text,
  run_kind text,
  backfill_start_at timestamptz,
  page_token text,
  last_successful_sync_at timestamptz,
  incremental_scan_started_at timestamptz,
  incremental_page_token text,
  backfill_page_token text,
  backfill_status text,
  cycle_budget integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_requesting_user_id is null or not exists (
    select 1
    from public.workspace_members as member
    where member.workspace_id = target_workspace_id
      and member.user_id = target_requesting_user_id
  ) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;

  return query
  select *
  from public.claim_channel_comment_sync_cycle_internal(
    target_workspace_id,
    1,
    target_lease_seconds
  );
end;
$$;

create function public.complete_channel_comment_sync_cycle_run(
  target_run_id uuid,
  target_claim_token uuid,
  target_next_page_token text,
  target_reached_boundary boolean,
  target_observed_count integer,
  target_stored_count integer,
  target_updated_count integer,
  target_duplicate_count integer,
  target_failed_count integer,
  target_analyzed_count integer,
  target_quota_units_used integer,
  target_reply_cursor text default null,
  target_incremental_next_page_token text default null,
  target_incremental_reached_boundary boolean default false,
  target_backfill_next_page_token text default null,
  target_backfill_reached_boundary boolean default false
)
returns public.channel_comment_sync_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  completed_run public.channel_comment_sync_runs;
  target_setting public.channel_comment_sync_settings;
begin
  select sync_run.*
  into completed_run
  from public.channel_comment_sync_runs as sync_run
  where sync_run.id = target_run_id
  for update;

  if completed_run.id is null then
    raise exception 'channel sync run not found' using errcode = 'P0002';
  end if;

  if completed_run.kind <> 'sync_cycle' then
    return public.complete_channel_comment_sync_run(
      target_run_id,
      target_claim_token,
      target_next_page_token,
      target_reached_boundary,
      target_observed_count,
      target_stored_count,
      target_updated_count,
      target_duplicate_count,
      target_failed_count,
      target_analyzed_count,
      target_quota_units_used,
      target_reply_cursor
    );
  end if;

  if target_observed_count < 0
    or target_stored_count < 0
    or target_updated_count < 0
    or target_duplicate_count < 0
    or target_failed_count < 0
    or target_analyzed_count < 0
    or target_quota_units_used < 0
    or target_stored_count + target_updated_count
      + target_duplicate_count + target_failed_count > 100
  then
    raise exception 'sync cycle counts are invalid' using errcode = '22023';
  end if;

  select sync_setting.*
  into target_setting
  from public.channel_comment_sync_settings as sync_setting
  where sync_setting.id = completed_run.setting_id
  for update;

  if completed_run.claim_token is distinct from target_claim_token
    or target_setting.lease_until is null
    or target_setting.lease_until <= now()
  then
    raise exception 'channel sync lease claim is stale' using errcode = '40001';
  end if;

  if completed_run.status = 'succeeded' then
    return completed_run;
  end if;
  if completed_run.status <> 'running' then
    raise exception 'channel sync run is not running' using errcode = '55000';
  end if;

  update public.channel_comment_sync_runs
  set
    status = 'succeeded',
    output_page_token = target_backfill_next_page_token,
    observed_count = target_observed_count,
    stored_count = target_stored_count,
    updated_count = target_updated_count,
    duplicate_count = target_duplicate_count,
    failed_count = target_failed_count,
    analyzed_count = target_analyzed_count,
    quota_units_used = target_quota_units_used,
    error_code = null,
    finished_at = now()
  where id = completed_run.id
  returning * into completed_run;

  update public.channel_comment_sync_settings
  set
    backfill_status = case
      when backfill_status = 'completed' then 'completed'
      when target_backfill_reached_boundary then 'completed'
      else 'pending'
    end,
    backfill_page_token = case
      when backfill_status = 'completed'
        or target_backfill_reached_boundary then null
      else target_backfill_next_page_token
    end,
    incremental_page_token = case
      when target_incremental_reached_boundary then null
      else target_incremental_next_page_token
    end,
    last_successful_sync_at = case
      when target_incremental_reached_boundary then coalesce(
        incremental_scan_started_at,
        completed_run.started_at,
        now()
      )
      else last_successful_sync_at
    end,
    incremental_scan_started_at = case
      when target_incremental_reached_boundary then null
      else incremental_scan_started_at
    end,
    next_sync_at = now() + make_interval(mins => sync_interval_minutes),
    lease_until = null,
    last_error_code = null,
    retry_blocked = false,
    updated_at = now()
  where id = target_setting.id;

  return completed_run;
end;
$$;

create function public.fail_channel_comment_sync_cycle_run(
  target_run_id uuid,
  target_claim_token uuid,
  target_error_code text
)
returns public.channel_comment_sync_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  failed_run public.channel_comment_sync_runs;
  target_setting public.channel_comment_sync_settings;
  retry_at timestamptz;
  should_retry boolean;
begin
  select sync_run.*
  into failed_run
  from public.channel_comment_sync_runs as sync_run
  where sync_run.id = target_run_id
  for update;

  if failed_run.id is null then
    raise exception 'channel sync run not found' using errcode = 'P0002';
  end if;

  if failed_run.kind <> 'sync_cycle' then
    return public.fail_channel_comment_sync_run(
      target_run_id,
      target_claim_token,
      target_error_code
    );
  end if;

  select sync_setting.*
  into target_setting
  from public.channel_comment_sync_settings as sync_setting
  where sync_setting.id = failed_run.setting_id
  for update;

  if failed_run.claim_token is distinct from target_claim_token
    or target_setting.lease_until is null
    or target_setting.lease_until <= now()
  then
    raise exception 'channel sync lease claim is stale' using errcode = '40001';
  end if;

  if failed_run.status = 'failed' then return failed_run; end if;
  if failed_run.status <> 'running' then
    raise exception 'channel sync run is not running' using errcode = '55000';
  end if;

  should_retry := failed_run.attempt_count < 3 and target_error_code in (
    'quota_exceeded',
    'youtube_rate_limited',
    'provider_error',
    'video_metadata_unavailable'
  );
  retry_at := case
    when target_error_code = 'quota_exceeded' then (
      date_trunc('day', now() at time zone 'America/Los_Angeles')
      + interval '1 day'
    ) at time zone 'America/Los_Angeles'
    when target_error_code in ('youtube_rate_limited', 'provider_error')
      then now() + interval '15 minutes'
    else now() + interval '5 minutes'
  end;

  update public.channel_comment_sync_runs
  set
    status = case when should_retry then 'pending' else 'failed' end,
    error_code = target_error_code,
    finished_at = case when should_retry then null else now() end
  where id = failed_run.id
  returning * into failed_run;

  update public.comment_import_jobs
  set
    status = 'failed',
    last_error_code = target_error_code,
    finished_at = coalesce(finished_at, now())
  where channel_sync_run_id = failed_run.id
    and trigger_kind = 'channel_sync'
    and status = 'running';

  update public.channel_comment_sync_settings
  set
    backfill_status = case
      when backfill_status = 'completed' then 'completed'
      when should_retry then 'pending'
      else 'failed'
    end,
    next_sync_at = retry_at,
    lease_until = null,
    last_error_code = target_error_code,
    retry_blocked = not should_retry,
    updated_at = now()
  where id = failed_run.setting_id;

  return failed_run;
end;
$$;

revoke all on function public.configure_channel_comment_sync_cycle(uuid, date)
  from public, anon;
revoke all on function public.request_channel_comment_sync_cycle_now(uuid)
  from public, anon;
revoke all on function public.claim_channel_comment_sync_cycle_internal(
  uuid, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function public.claim_channel_comment_sync_cycle(integer, integer)
  from public, anon, authenticated;
revoke all on function public.claim_channel_comment_sync_cycle_for_workspace(
  uuid, uuid, integer
) from public, anon, authenticated;
revoke all on function public.complete_channel_comment_sync_cycle_run(
  uuid, uuid, text, boolean, integer, integer, integer, integer,
  integer, integer, integer, text, text, boolean, text, boolean
) from public, anon, authenticated;
revoke all on function public.fail_channel_comment_sync_cycle_run(
  uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.configure_channel_comment_sync_cycle(uuid, date)
  to authenticated, service_role;
grant execute on function public.request_channel_comment_sync_cycle_now(uuid)
  to authenticated, service_role;
grant execute on function public.claim_channel_comment_sync_cycle(integer, integer)
  to service_role;
grant execute on function public.claim_channel_comment_sync_cycle_for_workspace(
  uuid, uuid, integer
) to service_role;
grant execute on function public.complete_channel_comment_sync_cycle_run(
  uuid, uuid, text, boolean, integer, integer, integer, integer,
  integer, integer, integer, text, text, boolean, text, boolean
) to service_role;
grant execute on function public.fail_channel_comment_sync_cycle_run(
  uuid, uuid, text
) to service_role;
