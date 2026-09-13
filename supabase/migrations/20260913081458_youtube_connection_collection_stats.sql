create function public.get_youtube_connection_collection_stats(
  target_workspace_id uuid
)
returns table (
  total_count bigint,
  bucket_date date,
  cumulative_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not public.is_workspace_member(target_workspace_id)
  then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;

  return query
  with selected_channel as (
    select candidate.youtube_channel_id
    from public.youtube_channel_candidates as candidate
    where candidate.workspace_id = target_workspace_id
      and candidate.selected
    limit 1
  ),
  channel_comments as (
    select comment.id, comment.captured_at
    from public.raw_comments as comment
    join public.youtube_videos as video
      on video.workspace_id = comment.workspace_id
      and video.youtube_video_id = comment.youtube_video_id
    join selected_channel
      on selected_channel.youtube_channel_id = video.youtube_channel_id
    where comment.workspace_id = target_workspace_id
  ),
  recent_days as (
    select generate_series(
      (timezone('Asia/Seoul', now())::date - 6)::timestamp,
      timezone('Asia/Seoul', now())::date::timestamp,
      interval '1 day'
    )::date as bucket_date
  ),
  totals as (
    select count(*)::bigint as total_count
    from channel_comments
  )
  select
    totals.total_count,
    recent_days.bucket_date,
    count(channel_comments.id)::bigint as cumulative_count
  from recent_days
  cross join totals
  left join channel_comments
    on channel_comments.captured_at < (
      (recent_days.bucket_date + 1)::timestamp at time zone 'Asia/Seoul'
    )
  group by totals.total_count, recent_days.bucket_date
  order by recent_days.bucket_date;
end;
$$;

revoke all on function public.get_youtube_connection_collection_stats(uuid)
  from public, anon, authenticated;

grant execute
  on function public.get_youtube_connection_collection_stats(uuid)
  to authenticated;
