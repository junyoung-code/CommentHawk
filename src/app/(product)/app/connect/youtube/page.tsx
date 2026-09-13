import "@/features/inbox/inbox-shell.css";

import {
  ArrowRight,
  CheckCircle,
  ShieldCheck,
  YoutubeLogo,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { requireViewer } from "@/features/auth/require-viewer";
import { getKoreanToday } from "@/features/ingestion/channel-sync-contract";
import {
  ChannelSyncProgressPanel,
  ChannelSyncSetup,
  CollectionTrendChart,
  type ChannelCollectionPoint,
} from "@/features/ingestion/channel-sync-progress-panel";
import {
  reconcileChannelSyncConnection,
  toChannelSyncProgress,
} from "@/features/ingestion/channel-sync-progress";
import styles from "@/features/ingestion/youtube-connection.module.css";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import {
  configureChannelCommentSyncAction,
  disconnectYouTubeChannelAction,
  requestChannelCommentSyncNowAction,
  selectYouTubeChannelAction,
  setChannelCommentSyncEnabledAction,
} from "./actions";

type YouTubeConnectionPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const getErrorMessage = (
  parameters: Record<string, string | string[] | undefined>,
) => {
  switch (parameters.error) {
    case "invalid_start_date":
      return "오늘 또는 그 이전의 올바른 시작 날짜를 선택해 주세요.";
    case "sync_configuration_failed":
      return "댓글 수집 시작 날짜를 저장하지 못했습니다. 다시 시도해 주세요.";
    case "sync_request_failed":
      return "댓글 동기화를 요청하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    case "sync_toggle_invalid":
    case "sync_toggle_failed":
      return "자동 댓글 수집 상태를 변경하지 못했습니다. 다시 시도해 주세요.";
    case "channel_required":
      return "사용할 채널 하나를 선택해 주세요.";
    case "revoke_failed":
      return "Google 권한을 해제하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    case "invalid_callback":
    case "invalid_state":
    case "missing_code":
    case "oauth_failed":
      return "YouTube 연결을 완료하지 못했습니다. 다시 연결해 주세요.";
    default:
      return parameters.error
        ? "요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요."
        : null;
  }
};

const getSuccessMessage = (
  parameters: Record<string, string | string[] | undefined>,
) => {
  switch (parameters.sync) {
    case "started":
      return "댓글 수집을 시작했습니다.";
    case "requested":
      return "새 댓글 동기화를 요청했습니다.";
    case "enabled":
      return "자동 댓글 수집을 켰습니다.";
    case "paused":
      return "자동 댓글 수집을 껐습니다.";
    default:
      return parameters.connected || parameters.selected
        ? "YouTube 연결 상태를 저장했습니다."
        : null;
  }
};

export default async function YouTubeConnectionPage({
  searchParams,
}: YouTubeConnectionPageProps) {
  const parameters = await searchParams;
  const { workspaceId } = await requireViewer();
  const supabase = await createServerSupabaseClient();
  const [
    { data: connection, error: connectionError },
    { data: candidates, error: candidatesError },
    { data: syncSetting, error: syncSettingError },
    { data: collectionStatsRows, error: collectionStatsError },
  ] = await Promise.all([
    supabase
      .from("youtube_connection_overview")
      .select("id, status, granted_scopes, updated_at")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("youtube_channel_candidates")
      .select("youtube_channel_id, title, handle, thumbnail_url, selected")
      .eq("workspace_id", workspaceId)
      .order("title"),
    supabase
      .from("channel_comment_sync_settings")
      .select(
        "id, enabled, backfill_start_at, backfill_status, last_successful_sync_at, last_error_code",
      )
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase.rpc("get_youtube_connection_collection_stats", {
      target_workspace_id: workspaceId,
    }),
  ]);

  if (
    connectionError ||
    candidatesError ||
    syncSettingError ||
    collectionStatsError
  ) {
    throw new Error("YouTube connection could not be loaded");
  }

  const { data: latestSyncRun, error: latestSyncRunError } = syncSetting
    ? await supabase
        .from("channel_comment_sync_runs")
        .select(
          "kind, status, stored_count, updated_count, duplicate_count, failed_count, analyzed_count, error_code, started_at, finished_at",
        )
        .eq("workspace_id", workspaceId)
        .eq("setting_id", syncSetting.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null, error: null };

  if (latestSyncRunError) {
    throw new Error("YouTube sync progress could not be loaded");
  }

  const selectedChannel = candidates?.find((candidate) => candidate.selected);
  const syncProgress = reconcileChannelSyncConnection(
    toChannelSyncProgress({
      setting: syncSetting,
      latestRun: latestSyncRun,
    }),
    connection?.status,
  );
  const errorMessage = getErrorMessage(parameters);
  const successMessage = getSuccessMessage(parameters);
  const isDisconnected =
    !connection ||
    connection.status === "disconnected" ||
    connection.status === "revoked";
  const reconnectRequired = connection?.status === "revoked";
  const collectionPoints: ChannelCollectionPoint[] = (
    collectionStatsRows ?? []
  ).map((row) => ({
    date: row.bucket_date,
    cumulativeCount: Number(row.cumulative_count),
  }));
  const totalCommentCount = Number(collectionStatsRows?.[0]?.total_count ?? 0);
  const maxDate = getKoreanToday();

  return (
    <div className={`${styles.page} youtube-connection-page`}>
      <header className={styles.pageTitle}>
        <span aria-hidden="true" className={styles.youtubeTitleIcon}>
          <YoutubeLogo weight="fill" />
        </span>
        <h1>YouTube 연결</h1>
      </header>

      {errorMessage ? (
        <p className={styles.pageError} role="alert">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className={styles.pageSuccess} role="status">
          {successMessage}
        </p>
      ) : null}

      {isDisconnected ? (
        <section className={styles.statePanel}>
          <span className={styles.stateIcon} aria-hidden="true">
            <YoutubeLogo weight="fill" />
          </span>
          <div>
            <p>{reconnectRequired ? "재연결 필요" : "YOUTUBE CONNECTION"}</p>
            <h2>
              {reconnectRequired
                ? "YouTube 권한을 다시 연결해 주세요"
                : "내 YouTube 채널을 연결하세요"}
            </h2>
            <span>
              {reconnectRequired
                ? "자동 댓글 수집을 다시 시작하려면 Google에서 채널 권한을 갱신해 주세요. 이미 수집한 댓글과 분석 기록은 그대로 보존됩니다."
                : "채널과 영상, 공개 댓글을 읽는 데 필요한 최소 권한만 요청합니다. 댓글 숨김이나 삭제는 사용자의 확인 없이 실행하지 않습니다."}
            </span>
          </div>
          <Link className={styles.primaryButton} href="/api/youtube/oauth/start">
            {reconnectRequired ? "Google에서 다시 연결" : "Google에서 연결"}
            <ArrowRight aria-hidden="true" weight="bold" />
          </Link>
          <div className={styles.permissionNote}>
            <ShieldCheck aria-hidden="true" weight="duotone" />
            <span>
              OAuth token은 서버에서 암호화하며 브라우저에 노출하지 않습니다.
            </span>
          </div>
        </section>
      ) : null}

      {connection?.status === "pending_channel_selection" &&
      candidates &&
      candidates.length > 1 ? (
        <section className={styles.selectionPanel}>
          <div>
            <p>채널 선택</p>
            <h2>관리할 채널 하나를 선택하세요</h2>
            <span>
              하나의 CrowdSift workspace에는 한 번에 채널 하나만 연결합니다.
            </span>
          </div>
          <form action={selectYouTubeChannelAction}>
            <fieldset className={styles.channelOptions}>
              <legend className="sr-only">YouTube 채널 후보</legend>
              {candidates.map((candidate) => (
                <label key={candidate.youtube_channel_id}>
                  <input
                    name="channelId"
                    required
                    type="radio"
                    value={candidate.youtube_channel_id}
                  />
                  <span
                    aria-hidden="true"
                    className={styles.candidateAvatar}
                    style={
                      candidate.thumbnail_url
                        ? {
                            backgroundImage: `url(${candidate.thumbnail_url})`,
                          }
                        : undefined
                    }
                  >
                    {candidate.thumbnail_url
                      ? null
                      : candidate.title.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>{candidate.title}</strong>
                    <small>{candidate.handle ?? "YouTube 채널"}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <button className={styles.primaryButton} type="submit">
              이 채널 사용하기
              <ArrowRight aria-hidden="true" weight="bold" />
            </button>
          </form>
        </section>
      ) : null}

      {connection?.status === "connected" && selectedChannel ? (
        <section
          aria-label={`${selectedChannel.title} YouTube 연결 관리`}
          className={styles.connectedLayout}
        >
          <div className={styles.channelColumn}>
            <span
              aria-label={`${selectedChannel.title} 채널 프로필`}
              className={styles.channelAvatar}
              role="img"
              style={
                selectedChannel.thumbnail_url
                  ? {
                      backgroundImage: `url(${selectedChannel.thumbnail_url})`,
                    }
                  : undefined
              }
            >
              {selectedChannel.thumbnail_url ? null : (
                <YoutubeLogo aria-hidden="true" weight="fill" />
              )}
            </span>
            <div className={styles.channelIdentity}>
              <h2>{selectedChannel.title}</h2>
              <p>{selectedChannel.handle ?? "YouTube 채널"}</p>
              <span className={styles.connectedStatus}>
                <CheckCircle aria-hidden="true" weight="fill" />
                연결됨
              </span>
            </div>

            <div className={styles.collectionSummary}>
              <span>가져온 댓글</span>
              <strong>{totalCommentCount.toLocaleString("ko-KR")}개</strong>
              <small>누적 · 최근 7일</small>
              <CollectionTrendChart
                points={collectionPoints}
                totalCount={totalCommentCount}
              />
            </div>
          </div>

          <div className={styles.settingsColumn}>
            {syncProgress.configured ? (
              <ChannelSyncProgressPanel
                configureAction={configureChannelCommentSyncAction}
                disconnectAction={disconnectYouTubeChannelAction}
                initialProgress={syncProgress}
                key={JSON.stringify(syncProgress)}
                maxDate={maxDate}
                requestNowAction={requestChannelCommentSyncNowAction}
                setEnabledAction={setChannelCommentSyncEnabledAction}
              />
            ) : (
              <ChannelSyncSetup
                configureAction={configureChannelCommentSyncAction}
                disconnectAction={disconnectYouTubeChannelAction}
                maxDate={maxDate}
              />
            )}
          </div>
        </section>
      ) : null}

      {connection?.status === "connected" && !selectedChannel ? (
        <section className={styles.statePanel}>
          <span className={styles.stateIcon} aria-hidden="true">
            <YoutubeLogo weight="fill" />
          </span>
          <div>
            <p>채널 확인 필요</p>
            <h2>연결된 YouTube 채널 정보를 찾지 못했습니다</h2>
            <span>소유한 채널이 있는 Google 계정으로 다시 연결해 주세요.</span>
          </div>
          <Link className={styles.primaryButton} href="/api/youtube/oauth/start">
            다시 연결하기
          </Link>
        </section>
      ) : null}

      {connection?.status === "error" ? (
        <section className={styles.statePanel}>
          <span className={styles.stateIcon} aria-hidden="true">
            <YoutubeLogo weight="fill" />
          </span>
          <div>
            <p>채널을 찾지 못했습니다</p>
            <h2>소유한 YouTube 채널이 있는 Google 계정으로 다시 연결하세요</h2>
          </div>
          <Link className={styles.primaryButton} href="/api/youtube/oauth/start">
            다시 연결하기
          </Link>
        </section>
      ) : null}
    </div>
  );
}
