import { describe, expect, it, vi } from "vitest";

import type { YouTubeVideo } from "@/features/youtube/video-service";

import type { ChannelCommentCollectionPage } from "./channel-comment-page-collector";
import { createChannelCommentSyncCycleService } from "./channel-comment-sync-cycle-service";
import type {
  ChannelSyncClaim,
  ChannelSyncRepository,
  ChannelSyncSource,
} from "./channel-comment-sync-service";
import type { SourceComment } from "./comment-mapper";

const sourceComment = (id: string): SourceComment => ({
  youtubeCommentId: id,
  parentYoutubeCommentId: null,
  textDisplay: id,
  textOriginal: id,
  authorChannelId: null,
  authorDisplayName: "viewer",
  authorAvatarUrl: null,
  likeCount: 0,
  sourceModerationStatus: "published",
  publishedAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
  rawPayload: { id },
});

const page = (
  prefix: string,
  count: number,
  overrides: Partial<ChannelCommentCollectionPage> = {},
): ChannelCommentCollectionPage => {
  const comments = Array.from({ length: count }, (_, index) =>
    sourceComment(`${prefix}-${index + 1}`),
  );
  return {
    comments,
    groups: new Map([["video-1", comments]]),
    observedCount: comments.length,
    topLevelCount: comments.length,
    replyCount: 0,
    invalidCount: 0,
    nextPageToken: null,
    reachedBoundary: true,
    quotaUnitsUsed: 1,
    ...overrides,
  };
};

const claim: ChannelSyncClaim = {
  settingId: "setting-1",
  runId: "run-1",
  claimToken: "claim-1",
  workspaceId: "workspace-1",
  connectionId: "connection-1",
  youtubeChannelId: "channel-1",
  runKind: "sync_cycle",
  backfillStartAt: "2026-07-01T00:00:00.000Z",
  pageToken: null,
  lastSuccessfulSyncAt: "2026-08-17T00:00:00.000Z",
  incrementalScanStartedAt: "2026-08-18T00:00:00.000Z",
  incrementalPageToken: null,
  backfillPageToken: "older-page",
  backfillStatus: "pending",
  cycleBudget: 100,
};

const repository = (): ChannelSyncRepository => ({
  upsertVideoMetadata: vi.fn(async () => undefined),
  createOrGetVideoImportJob: vi.fn(async () => ({
    id: "import-1",
    state: "running" as const,
    analyzedCount: 0,
  })),
  storeComment: vi.fn(async ({ comment }) => ({
    disposition: "stored" as const,
    rawCommentId: `raw-${comment.youtubeCommentId}`,
  })),
  recordFailedItem: vi.fn(async () => undefined),
  completeVideoImportJob: vi.fn(async () => undefined),
  attachRecoverableAnalysisItems: vi.fn(async () => ({
    analysisJobId: "analysis-1",
    attachedRawCommentIds: [],
  })),
  completeRun: vi.fn(async () => undefined),
  failRun: vi.fn(async () => undefined),
});

const video: YouTubeVideo = {
  id: "video-1",
  title: "Video",
  thumbnailUrl: null,
  publishedAt: "2026-07-01T00:00:00.000Z",
};

const cycleService = (
  targetRepository: ChannelSyncRepository,
  targetSource: ChannelSyncSource,
) =>
  createChannelCommentSyncCycleService({
    repository: targetRepository,
    source: targetSource,
    analysisConfigurationKey: "config-1",
    providerMode: "live",
  });

describe("hourly channel comment sync cycle", () => {
  it("collects 15 fresh comments and uses the remaining 85 for backfill", async () => {
    const targetRepository = repository();
    const collectPage = vi.fn(async ({ kind }: { kind: string }) =>
      kind === "incremental" ? page("fresh", 15) : page("old", 85),
    );

    const result = await cycleService(targetRepository, {
      collectPage,
      listVideosByIds: vi.fn(async () => [video]),
    }).process(claim);

    expect(collectPage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: "incremental", maxComments: 100 }),
    );
    expect(collectPage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: "backfill_recent",
        maxComments: 85,
        pageToken: "older-page",
      }),
    );
    expect(result.storedCount).toBe(100);
    expect(targetRepository.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        incrementalReachedBoundary: true,
        backfillReachedBoundary: true,
      }),
    );
  });

  it("postpones backfill when fresh comments fill all 100 slots", async () => {
    const targetRepository = repository();
    const collectPage = vi.fn(async () =>
      page("fresh", 100, {
        nextPageToken: "fresh-next",
        reachedBoundary: false,
      }),
    );

    await cycleService(targetRepository, {
      collectPage,
      listVideosByIds: vi.fn(async () => [video]),
    }).process(claim);

    expect(collectPage).toHaveBeenCalledTimes(1);
    expect(targetRepository.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        incrementalNextPageToken: "fresh-next",
        incrementalReachedBoundary: false,
        backfillNextPageToken: "older-page",
        backfillReachedBoundary: false,
      }),
    );
  });

  it("does not enqueue duplicate comments for analysis", async () => {
    const targetRepository = repository();
    vi.mocked(targetRepository.storeComment).mockResolvedValue({
      disposition: "duplicate",
      rawCommentId: "raw-existing",
    });
    vi.mocked(targetRepository.attachRecoverableAnalysisItems).mockResolvedValue({
      analysisJobId: null,
      attachedRawCommentIds: [],
    });

    const result = await cycleService(targetRepository, {
      collectPage: vi.fn(async ({ kind }) =>
        kind === "incremental" ? page("duplicate", 1) : page("old", 0),
      ),
      listVideosByIds: vi.fn(async () => [video]),
    }).process({ ...claim, backfillStatus: "completed" });

    expect(result).toMatchObject({ duplicateCount: 1, analyzedCount: 0 });
  });
});
