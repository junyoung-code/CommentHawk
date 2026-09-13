import { describe, expect, it } from "vitest";

import {
  buildReviewDocument,
  escapeInlineJson,
} from "./export-classification-evaluation";

describe("classification evaluation export", () => {
  it("keeps comment text from breaking the inline script", () => {
    expect(escapeInlineJson({ text: "</script><b>원문</b>" })).not.toContain(
      "</script>",
    );
  });

  it("builds a local reviewer with four outcomes and JSON download", () => {
    const html = buildReviewDocument([
      {
        id: "real-1",
        sourceText: "개맛있게 먹는다",
        videoTitle: "요리 영상",
        parentText: null,
        capturedAt: "2026-08-20T00:00:00.000Z",
        current: {
          status: "decided",
          level: "caution",
          basis: "both_agreed",
          luna: null,
          terra: null,
        },
        expectedStatus: null,
        expectedLevel: null,
        reviewReason: null,
        tags: [],
      },
    ]);

    expect(html).toContain("실제 댓글 분류 검수");
    expect(html).toContain("review_queue");
    expect(html).toContain("classification-real-50-reviewed.json");
  });
});
