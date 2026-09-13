import type {
  ChannelCommentCollectionKind,
  ChannelCommentCollectionPage,
} from "./channel-comment-page-collector";
import {
  createChannelCommentSyncService,
  type ChannelSyncBatchResult,
  type ChannelSyncClaim,
  type ChannelSyncRepository,
  type ChannelSyncSource,
} from "./channel-comment-sync-service";
import type { SourceComment } from "./comment-mapper";

const DEFAULT_CYCLE_BUDGET = 100;
const MAX_PROVIDER_PAGES_PER_PHASE = 20;

type PhaseResult = {
  page: ChannelCommentCollectionPage;
  nextPageToken: string | null;
  reachedBoundary: boolean;
};

const emptyPage = (): ChannelCommentCollectionPage => ({
  comments: [],
  groups: new Map(),
  observedCount: 0,
  topLevelCount: 0,
  replyCount: 0,
  invalidCount: 0,
  nextPageToken: null,
  reachedBoundary: true,
  quotaUnitsUsed: 0,
});

const mergePages = (
  pages: ChannelCommentCollectionPage[],
): ChannelCommentCollectionPage => {
  const comments: SourceComment[] = [];
  const groups = new Map<string, SourceComment[]>();
  const seen = new Set<string>();
  let invalidCount = 0;
  let quotaUnitsUsed = 0;

  for (const page of pages) {
    invalidCount += page.invalidCount;
    quotaUnitsUsed += page.quotaUnitsUsed;
    for (const [youtubeVideoId, items] of page.groups) {
      const group = groups.get(youtubeVideoId) ?? [];
      for (const item of items) {
        if (seen.has(item.youtubeCommentId)) continue;
        seen.add(item.youtubeCommentId);
        comments.push(item);
        group.push(item);
      }
      if (group.length > 0) groups.set(youtubeVideoId, group);
    }
  }

  const topLevelCount = comments.filter(
    (item) => item.parentYoutubeCommentId === null,
  ).length;
  return {
    comments,
    groups,
    observedCount: comments.length + invalidCount,
    topLevelCount,
    replyCount: comments.length - topLevelCount,
    invalidCount,
    nextPageToken: null,
    reachedBoundary: true,
    quotaUnitsUsed,
  };
};

const collectPhase = async ({
  boundaryAt,
  budget,
  kind,
  pageToken,
  source,
  youtubeChannelId,
}: {
  source: ChannelSyncSource;
  youtubeChannelId: string;
  boundaryAt: string;
  pageToken: string | null;
  kind: ChannelCommentCollectionKind;
  budget: number;
}): Promise<PhaseResult> => {
  if (budget === 0) {
    return {
      page: emptyPage(),
      nextPageToken: pageToken,
      reachedBoundary: false,
    };
  }

  const pages: ChannelCommentCollectionPage[] = [];
  let cursor = pageToken;
  let reachedBoundary = false;

  for (let pageIndex = 0; pageIndex < MAX_PROVIDER_PAGES_PER_PHASE; pageIndex += 1) {
    const used = pages.reduce((sum, page) => sum + page.comments.length, 0);
    const remaining = budget - used;
    if (remaining <= 0) break;

    const page = await source.collectPage({
      youtubeChannelId,
      pageToken: cursor,
      boundaryAt,
      kind,
      maxComments: remaining,
    });
    pages.push(page);
    const previousCursor = cursor;
    cursor = page.nextPageToken;
    reachedBoundary = page.reachedBoundary || cursor === null;
    if (reachedBoundary || cursor === previousCursor) break;
  }

  return {
    page: mergePages(pages),
    nextPageToken: cursor,
    reachedBoundary,
  };
};

export const createChannelCommentSyncCycleService = ({
  analysisConfigurationKey,
  providerMode,
  repository,
  source,
}: {
  repository: ChannelSyncRepository;
  source: ChannelSyncSource;
  analysisConfigurationKey: string;
  providerMode: "live" | "fixture";
}) => ({
  async process(claim: ChannelSyncClaim): Promise<ChannelSyncBatchResult> {
    if (claim.runKind !== "sync_cycle") {
      throw new TypeError("channel_sync_cycle_claim_required");
    }

    const cycleBudget = claim.cycleBudget ?? DEFAULT_CYCLE_BUDGET;
    if (!Number.isInteger(cycleBudget) || cycleBudget < 1 || cycleBudget > 100) {
      throw new RangeError("channel_sync_cycle_budget_out_of_range");
    }
    const incrementalBoundary =
      claim.lastSuccessfulSyncAt ?? claim.incrementalScanStartedAt;
    if (!incrementalBoundary) {
      throw new TypeError("channel_sync_cycle_watermark_required");
    }

    const incremental = await collectPhase({
      source,
      youtubeChannelId: claim.youtubeChannelId,
      boundaryAt: incrementalBoundary,
      pageToken: claim.incrementalPageToken ?? null,
      kind: "incremental",
      budget: cycleBudget,
    });
    const remainingBudget = Math.max(
      0,
      cycleBudget - incremental.page.comments.length,
    );
    const backfill =
      claim.backfillStatus === "completed"
        ? {
            page: emptyPage(),
            nextPageToken: null,
            reachedBoundary: true,
          }
        : await collectPhase({
            source,
            youtubeChannelId: claim.youtubeChannelId,
            boundaryAt: claim.backfillStartAt,
            pageToken: claim.backfillPageToken ?? null,
            kind: "backfill_recent",
            budget: remainingBudget,
          });
    const combinedPage = mergePages([incremental.page, backfill.page]);

    const cycleRepository: ChannelSyncRepository = {
      ...repository,
      completeRun: (input) =>
        repository.completeRun({
          ...input,
          incrementalNextPageToken: incremental.nextPageToken,
          incrementalReachedBoundary: incremental.reachedBoundary,
          backfillNextPageToken: backfill.nextPageToken,
          backfillReachedBoundary: backfill.reachedBoundary,
        }),
    };

    return createChannelCommentSyncService({
      repository: cycleRepository,
      source: {
        collectPage: async () => combinedPage,
        listVideosByIds: source.listVideosByIds,
      },
      analysisConfigurationKey,
      providerMode,
    }).process({
      ...claim,
      runKind: "incremental",
      pageToken: null,
    });
  },
});
