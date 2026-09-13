import type {
  ChannelCommentProvider,
  ChannelCommentThread,
  OwnerReadTokens,
} from "@/features/youtube/channel-comment-contracts";

import {
  mapProviderComment,
  type ProviderComment,
  type SourceComment,
} from "./comment-mapper";

export type ChannelCommentCollectionPage = {
  comments: SourceComment[];
  groups: Map<string, SourceComment[]>;
  observedCount: number;
  topLevelCount: number;
  replyCount: number;
  invalidCount: number;
  nextPageToken: string | null;
  reachedBoundary: boolean;
  quotaUnitsUsed: number;
};

export type ChannelCommentCollectionKind =
  | "backfill_recent"
  | "incremental";

const CURSOR_PREFIX = "crowdsift:v1:";

type PageCursor = {
  providerPageToken: string | null;
  offset: number;
};

const decodePageCursor = (value: string | null): PageCursor => {
  if (!value?.startsWith(CURSOR_PREFIX)) {
    return { providerPageToken: value, offset: 0 };
  }

  try {
    const parsed = JSON.parse(
      decodeURIComponent(value.slice(CURSOR_PREFIX.length)),
    ) as Partial<PageCursor>;
    if (
      (parsed.providerPageToken === null ||
        typeof parsed.providerPageToken === "string") &&
      Number.isInteger(parsed.offset) &&
      (parsed.offset ?? -1) >= 0
    ) {
      return {
        providerPageToken: parsed.providerPageToken,
        offset: parsed.offset,
      } as PageCursor;
    }
  } catch {
    // Treat malformed CrowdSift cursors as provider cursors for compatibility.
  }

  return { providerPageToken: value, offset: 0 };
};

const encodePageCursor = (cursor: PageCursor) =>
  `${CURSOR_PREFIX}${encodeURIComponent(JSON.stringify(cursor))}`;

const RFC3339_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/;

const daysInMonth = (year: number, month: number) => {
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

const parseRfc3339Timestamp = (value: string): number | null => {
  const match = RFC3339_TIMESTAMP.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = Number(match[9] ?? 0);
  const offsetMinute = Number(match[10] ?? 0);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isCandidate = ({
  boundaryValue,
  kind,
  publishedAt,
}: {
  boundaryValue: number;
  kind: ChannelCommentCollectionKind;
  publishedAt: string | null;
}) => {
  if (publishedAt === null) {
    return true;
  }

  const publishedAtValue = parseRfc3339Timestamp(publishedAt);
  if (publishedAtValue === null) {
    return true;
  }

  return kind === "backfill_recent"
    ? publishedAtValue >= boundaryValue
    : publishedAtValue > boundaryValue;
};

const withParent = (
  comment: ProviderComment,
  parentYoutubeCommentId: string,
): ProviderComment => ({
  ...comment,
  parentId: parentYoutubeCommentId,
});

async function collectReplies({
  inlineReplies,
  parentYoutubeCommentId,
  provider,
  tokens,
  totalReplyCount,
}: {
  inlineReplies: ProviderComment[];
  parentYoutubeCommentId: string;
  provider: ChannelCommentProvider;
  tokens?: OwnerReadTokens;
  totalReplyCount: number;
}) {
  const replies = inlineReplies.map((reply) =>
    withParent(reply, parentYoutubeCommentId),
  );
  let quotaUnitsUsed = 0;

  if (totalReplyCount > inlineReplies.length) {
    let pageToken: string | undefined;
    const seenPageTokens = new Set<string>();

    while (true) {
      const page = await provider.listReplies({
        parentYoutubeCommentId,
        maxResults: 100,
        pageToken,
        tokens,
      });
      quotaUnitsUsed += page.quotaUnitsUsed;
      replies.push(
        ...page.items.map((reply) =>
          withParent(reply, parentYoutubeCommentId),
        ),
      );

      const nextPageToken = page.nextPageToken ?? undefined;
      if (!nextPageToken || seenPageTokens.has(nextPageToken)) {
        break;
      }

      seenPageTokens.add(nextPageToken);
      pageToken = nextPageToken;
    }
  }

  const uniqueReplies = new Map<string, ProviderComment>();
  for (const reply of replies) {
    if (!uniqueReplies.has(reply.id)) {
      uniqueReplies.set(reply.id, reply);
    }
  }

  return {
    replies: [...uniqueReplies.values()],
    quotaUnitsUsed,
  };
}

export async function collectChannelCommentPage({
  boundaryAt,
  kind,
  maxComments = 100,
  pageToken,
  provider,
  tokens,
  youtubeChannelId,
}: {
  provider: ChannelCommentProvider;
  youtubeChannelId: string;
  pageToken: string | null;
  boundaryAt: string;
  kind: ChannelCommentCollectionKind;
  maxComments?: number;
  /** 있으면 소유자로 읽어 보류된 댓글까지 가져온다. */
  tokens?: OwnerReadTokens;
}): Promise<ChannelCommentCollectionPage> {
  if (!Number.isInteger(maxComments) || maxComments < 1 || maxComments > 100) {
    throw new RangeError("channel_comment_limit_out_of_range");
  }
  const boundaryValue = parseRfc3339Timestamp(boundaryAt);
  if (boundaryValue === null) {
    throw new TypeError("invalid_channel_comment_boundary");
  }

  const cursor = decodePageCursor(pageToken);
  const page = await provider.listChannelCommentThreads({
    youtubeChannelId,
    maxResults: 100,
    pageToken: cursor.providerPageToken ?? undefined,
    tokens,
  });
  const comments: SourceComment[] = [];
  const groups = new Map<string, SourceComment[]>();
  const selectedCommentIds = new Set<string>();
  let quotaUnitsUsed = page.quotaUnitsUsed;
  let reachedBoundary = false;
  const includedThreads: Array<{
    youtubeVideoId: string;
    parent: ProviderComment;
    inlineReplies: Map<string, ProviderComment>;
    totalReplyCount: number;
  }> = [];
  const includedThreadsByParentId = new Map<
    string,
    (typeof includedThreads)[number]
  >();

  const include = (thread: ChannelCommentThread) => {
    const parent = {
      ...thread.topLevelComment,
      parentId: null,
    };
    const includedThread = includedThreadsByParentId.get(parent.id);

    if (includedThread) {
      for (const reply of thread.inlineReplies) {
        if (!includedThread.inlineReplies.has(reply.id)) {
          includedThread.inlineReplies.set(
            reply.id,
            withParent(reply, parent.id),
          );
        }
      }
      includedThread.totalReplyCount = Math.max(
        includedThread.totalReplyCount,
        thread.totalReplyCount,
      );
      return;
    }

    const newIncludedThread = {
      youtubeVideoId: thread.youtubeVideoId,
      parent,
      inlineReplies: new Map(
        thread.inlineReplies.map((reply) => [
          reply.id,
          withParent(reply, parent.id),
        ]),
      ),
      totalReplyCount: thread.totalReplyCount,
    };
    includedThreads.push(newIncludedThread);
    includedThreadsByParentId.set(parent.id, newIncludedThread);
  };

  const withinBoundary = (thread: ChannelCommentThread) =>
    isCandidate({
      boundaryValue,
      kind,
      publishedAt: thread.topLevelComment.publishedAt,
    });

  // 게시 목록은 최신순이다. 경계보다 오래된 것을 만나면 그 뒤는 볼 필요가 없다.
  for (const thread of page.items) {
    if (!withinBoundary(thread)) {
      reachedBoundary = true;
      break;
    }
    include(thread);
  }

  /**
   * 보류 목록은 따로 훑는다.
   *
   * 시간과 무관하게 딸려 오므로 위와 같은 규칙을 쓰면 오래된 보류 댓글 하나가
   * 백필 전체를 첫 장에서 끊는다. 여기서는 한 건씩 걸러 내고 넘어가며,
   * `reachedBoundary` 도 건드리지 않는다 — 페이지 넘김은 게시 목록이 정한다.
   */
  for (const thread of page.heldItems) {
    if (withinBoundary(thread)) {
      include(thread);
    }
  }

  for (const thread of includedThreads) {
    const { parent } = thread;
    selectedCommentIds.add(parent.id);
    const group = groups.get(thread.youtubeVideoId) ?? [];
    const mappedParent = mapProviderComment(parent);
    group.push(mappedParent);
    groups.set(thread.youtubeVideoId, group);
    comments.push(mappedParent);

    const collectedReplies = await collectReplies({
      inlineReplies: [...thread.inlineReplies.values()],
      parentYoutubeCommentId: parent.id,
      provider,
      tokens,
      totalReplyCount: thread.totalReplyCount,
    });
    quotaUnitsUsed += collectedReplies.quotaUnitsUsed;

    for (const reply of collectedReplies.replies) {
      if (
        selectedCommentIds.has(reply.id) ||
        (kind === "incremental" &&
          !isCandidate({
            boundaryValue,
            kind,
            publishedAt: reply.publishedAt,
          }))
      ) {
        continue;
      }

      selectedCommentIds.add(reply.id);
      const mappedReply = mapProviderComment(reply);
      group.push(mappedReply);
      comments.push(mappedReply);
    }
  }

  const selectedComments = comments.slice(
    cursor.offset,
    cursor.offset + maxComments,
  );
  const selectedGroups = new Map<string, SourceComment[]>();
  const selectedIds = new Set(
    selectedComments.map((item) => item.youtubeCommentId),
  );
  for (const [youtubeVideoId, videoComments] of groups) {
    const selected = videoComments.filter((item) =>
      selectedIds.has(item.youtubeCommentId),
    );
    if (selected.length > 0) selectedGroups.set(youtubeVideoId, selected);
  }

  const consumedOffset = cursor.offset + selectedComments.length;
  const hasMoreOnCurrentPage = consumedOffset < comments.length;
  const nextPageToken = hasMoreOnCurrentPage
    ? encodePageCursor({
        providerPageToken: cursor.providerPageToken,
        offset: consumedOffset,
      })
    : reachedBoundary
      ? null
      : (page.nextPageToken ?? null);
  const selectedTopLevelCount = selectedComments.filter(
    (item) => item.parentYoutubeCommentId === null,
  ).length;
  const selectedInvalidCount = cursor.offset === 0 ? page.invalidItemCount : 0;

  return {
    comments: selectedComments,
    groups: selectedGroups,
    observedCount: selectedComments.length + selectedInvalidCount,
    topLevelCount: selectedTopLevelCount,
    replyCount: selectedComments.length - selectedTopLevelCount,
    invalidCount: selectedInvalidCount,
    nextPageToken,
    reachedBoundary: reachedBoundary && !hasMoreOnCurrentPage,
    quotaUnitsUsed,
  };
}
