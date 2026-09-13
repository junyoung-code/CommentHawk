begin;

create extension if not exists pgtap with schema extensions;

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '91000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'connection-stats-owner@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'connection-stats-other@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

insert into public.workspaces (id, owner_user_id, name)
values
  (
    '92000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'Connection stats owner workspace'
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    'Connection stats other workspace'
  );

insert into public.workspace_members (workspace_id, user_id, role)
values
  (
    '92000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    'owner'
  );

insert into public.youtube_connections (id, workspace_id, status)
values
  (
    '93000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'connected'
  ),
  (
    '93000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000002',
    'connected'
  );

insert into public.youtube_channel_candidates (
  connection_id,
  workspace_id,
  youtube_channel_id,
  title,
  selected
)
values
  (
    '93000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'selected-channel',
    'Selected channel',
    true
  ),
  (
    '93000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'unselected-channel',
    'Unselected channel',
    false
  ),
  (
    '93000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000002',
    'other-workspace-channel',
    'Other workspace channel',
    true
  );

insert into public.youtube_videos (
  id,
  workspace_id,
  youtube_channel_id,
  youtube_video_id,
  title
)
values
  (
    '94000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'selected-channel',
    'selected-video',
    'Selected video'
  ),
  (
    '94000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000001',
    'unselected-channel',
    'unselected-video',
    'Unselected video'
  ),
  (
    '94000000-0000-4000-8000-000000000003',
    '92000000-0000-4000-8000-000000000002',
    'other-workspace-channel',
    'other-workspace-video',
    'Other workspace video'
  );

insert into public.comment_import_jobs (
  id,
  workspace_id,
  youtube_video_id,
  requested_top_level_count
)
values
  (
    '95000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'selected-video',
    20
  ),
  (
    '95000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000001',
    'unselected-video',
    20
  ),
  (
    '95000000-0000-4000-8000-000000000003',
    '92000000-0000-4000-8000-000000000002',
    'other-workspace-video',
    20
  );

insert into public.raw_comments (
  workspace_id,
  youtube_video_id,
  youtube_comment_id,
  text_display,
  captured_at,
  first_import_job_id
)
values
  (
    '92000000-0000-4000-8000-000000000001',
    'selected-video',
    'selected-old',
    'Old selected-channel comment',
    ((timezone('Asia/Seoul', now())::date - 8)::timestamp at time zone 'Asia/Seoul'),
    '95000000-0000-4000-8000-000000000001'
  ),
  (
    '92000000-0000-4000-8000-000000000001',
    'selected-video',
    'selected-recent',
    'Recent selected-channel comment',
    ((timezone('Asia/Seoul', now())::date - 2)::timestamp at time zone 'Asia/Seoul'),
    '95000000-0000-4000-8000-000000000001'
  ),
  (
    '92000000-0000-4000-8000-000000000001',
    'selected-video',
    'selected-today',
    'Today selected-channel comment',
    now(),
    '95000000-0000-4000-8000-000000000001'
  ),
  (
    '92000000-0000-4000-8000-000000000001',
    'unselected-video',
    'unselected-comment',
    'Unselected-channel comment',
    now(),
    '95000000-0000-4000-8000-000000000002'
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    'other-workspace-video',
    'other-workspace-comment',
    'Other-workspace comment',
    now(),
    '95000000-0000-4000-8000-000000000003'
  );

select plan(5);

select has_function(
  'public',
  'get_youtube_connection_collection_stats',
  array['uuid'],
  'connection collection stats function exists'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);

select is(
  (
    select count(*)::integer
    from public.get_youtube_connection_collection_stats(
      '92000000-0000-4000-8000-000000000001'
    )
  ),
  7,
  'the chart always returns seven Seoul calendar days'
);

select is(
  (
    select max(total_count)
    from public.get_youtube_connection_collection_stats(
      '92000000-0000-4000-8000-000000000001'
    )
  ),
  3::bigint,
  'the total contains each selected-channel raw comment once'
);

select is(
  (
    select array_agg(cumulative_count order by bucket_date)
    from public.get_youtube_connection_collection_stats(
      '92000000-0000-4000-8000-000000000001'
    )
  ),
  array[1, 1, 1, 1, 2, 2, 3]::bigint[],
  'the trend uses first-capture time and carries the cumulative baseline forward'
);

select throws_ok(
  $$
    select *
    from public.get_youtube_connection_collection_stats(
      '92000000-0000-4000-8000-000000000002'
    )
  $$,
  '42501',
  'workspace access denied',
  'another workspace cannot be read'
);

select * from finish();
rollback;
