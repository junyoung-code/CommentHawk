import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InboxFilters } from "./inbox-filters";

const props = {
  filters: { reviewLevels: ["safe", "caution", "risk"] as const },
  videos: [{ id: "one", title: "첫 영상" }, { id: "two", title: "둘째 영상" }],
  categories: [["question", "질문"]], analysisStates: [["analyzed", "분석 완료"]], actionStates: [["succeeded", "조치 완료"]],
};
const setup = () => render(<InboxFilters {...props} filters={{ reviewLevels: [...props.filters.reviewLevels] }} />);
afterEach(() => vi.restoreAllMocks());

describe("Inbox filter interactions", () => {
  it("expands and collapses the advanced controls", () => {
    setup();
    expect(screen.getByLabelText("기간")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "상세 필터" }));
    expect(screen.getByLabelText("기간")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "상세 필터" }));
    expect(screen.getByLabelText("기간")).not.toBeVisible();
  });
  it("submits the selected quick level with the current search, without a stale page", () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => {});
    setup();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "자막" } });
    fireEvent.click(screen.getByRole("button", { name: "주의" }));
    const form = screen.getByRole("form", { name: "댓글 필터" }) as HTMLFormElement;
    const values = new FormData(form);
    expect(values.get("levels")).toBe("caution");
    expect(values.get("search")).toBe("자막");
    expect(values.has("page")).toBe(false);
    expect(submit).toHaveBeenCalledOnce();
  });
  it("uses a separate held status and clears it when selecting all", () => {
    vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => {});
    setup();
    const form = screen.getByRole("form", { name: "댓글 필터" }) as HTMLFormElement;
    fireEvent.click(screen.getByRole("button", { name: "판단 보류" }));
    expect(new FormData(form).get("status")).toBe("review_queue");
    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    expect(new FormData(form).get("status")).toBe("");
    expect(new FormData(form).get("levels")).toBe("safe,caution,risk");
  });
  it("supports multiple videos and clearing back to all videos", () => {
    setup();
    fireEvent.click(screen.getByLabelText("첫 영상"));
    fireEvent.click(screen.getByLabelText("둘째 영상"));
    expect(screen.getByText("영상 2개 선택")).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "댓글 필터" }) as HTMLFormElement;
    expect(new FormData(form).getAll("video")).toEqual(["one", "two"]);
    fireEvent.click(screen.getByRole("button", { name: "전체 영상 선택" }));
    expect(new FormData(form).getAll("video")).toEqual([]);
  });
  it("submits a new sort while retaining the period", () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => {});
    setup();
    fireEvent.change(screen.getByLabelText("기간"), { target: { value: "30d" } });
    fireEvent.change(screen.getByLabelText("댓글 정렬"), { target: { value: "likes" } });
    const form = screen.getByRole("form", { name: "댓글 필터" }) as HTMLFormElement;
    expect(new FormData(form).get("period")).toBe("30d");
    expect(new FormData(form).get("sort")).toBe("likes");
    expect(submit).toHaveBeenCalledOnce();
  });
});
