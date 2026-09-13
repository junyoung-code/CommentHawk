import { readFileSync } from "node:fs";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChannelSyncProgress } from "./channel-sync-progress";
import {
  ChannelSyncProgressPanel,
  ChannelSyncSetup,
  CollectionTrendChart,
} from "./channel-sync-progress-panel";

const progress = (
  overrides: Partial<ChannelSyncProgress> = {},
): ChannelSyncProgress => ({
  configured: true,
  enabled: true,
  active: false,
  startDate: "2026-08-01",
  backfillStatus: "completed",
  backfillLabel: "초기 댓글 수집 완료",
  lastSuccessfulSyncAt: "2026-09-13T05:20:00.000Z",
  counts: { stored: 12, updated: 4, duplicate: 3, failed: 0, analyzed: 10 },
  latestRunLabel: "새 댓글을 확인한",
  statusMessage: "채널의 새 댓글을 자동으로 확인합니다.",
  errorMessage: null,
  reconnectRequired: false,
  ...overrides,
});

const action = vi
  .fn<(formData: FormData) => Promise<void>>()
  .mockResolvedValue(undefined);

afterEach(() => {
  action.mockClear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("channel sync setup", () => {
  it("starts collection from an explicit Seoul calendar date", () => {
    render(
      <ChannelSyncSetup
        configureAction={action}
        disconnectAction={action}
        maxDate="2026-09-13"
      />,
    );

    const date = screen.getByLabelText("댓글 수집 시작일");
    expect(date).toHaveAttribute("type", "date");
    expect(date).toHaveAttribute("max", "2026-09-13");
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByRole("button", { name: "수집 시작" })).toBeEnabled();
    expect(screen.queryByText("댓글 Inbox 보기")).not.toBeInTheDocument();
  });
});

describe("channel sync progress panel", () => {
  const renderPanel = (initialProgress = progress()) =>
    render(
      <ChannelSyncProgressPanel
        configureAction={action}
        disconnectAction={action}
        initialProgress={initialProgress}
        maxDate="2026-09-13"
        requestNowAction={action}
        setEnabledAction={action}
      />,
    );

  it("keeps only the approved compact controls in the default state", () => {
    renderPanel();

    expect(screen.getByRole("switch", { name: "자동 댓글 수집 끄기" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("댓글 수집 시작일")).toHaveValue("2026-08-01");
    expect(screen.getByText("2026. 09. 13 14:20")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "지금 동기화" })).toBeEnabled();
    expect(screen.getByText("연결 설정").closest("details")).not.toHaveAttribute(
      "open",
    );

    expect(screen.queryByText("확인한 댓글")).not.toBeInTheDocument();
    expect(screen.queryByText("신규 저장")).not.toBeInTheDocument();
    expect(screen.queryByText("분류 예약")).not.toBeInTheDocument();
    expect(screen.queryByText("중복 건너뜀")).not.toBeInTheDocument();
    expect(screen.queryByText("댓글 Inbox 보기")).not.toBeInTheDocument();
  });

  it("submits toggle and date changes through the existing server actions", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("switch", { name: "자동 댓글 수집 끄기" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const toggleData = action.mock.calls[0]?.[0] as FormData;
    expect(toggleData.get("enabled")).toBe("false");

    action.mockClear();
    fireEvent.change(screen.getByLabelText("댓글 수집 시작일"), {
      target: { value: "2026-08-02" },
    });
    await waitFor(() => expect(action).toHaveBeenCalled());
    const dateData = action.mock.calls[0]?.[0] as FormData;
    expect(dateData.get("startDate")).toBe("2026-08-02");
  });

  it("opens connection settings while keeping disconnect safeguards inside", async () => {
    const user = userEvent.setup();
    renderPanel();

    const details = screen.getByText("연결 설정").closest("details");
    await user.click(screen.getByText("연결 설정"));

    expect(details).toHaveAttribute("open");
    expect(screen.getByText(/이미 수집한 댓글 원문과/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "YouTube 연결 해제" }),
    ).toBeEnabled();
  });

  it("shows progress and failures only while those states are relevant", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>(() => undefined),
    );
    const view = renderPanel(
      progress({
        active: true,
        backfillStatus: "running",
        statusMessage: "선택한 날짜까지 댓글을 가져오고 있습니다.",
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "선택한 날짜까지 댓글을 가져오고 있습니다.",
    );
    view.unmount();

    renderPanel(
      progress({
        active: false,
        enabled: false,
        errorMessage: "YouTube 읽기 권한을 확인할 수 없습니다.",
        reconnectRequired: true,
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "YouTube 읽기 권한을 확인할 수 없습니다.",
    );
    expect(screen.getByRole("link", { name: "채널 다시 연결" })).toHaveAttribute(
      "href",
      "/api/youtube/oauth/start",
    );
  });

  it("gets status, posts one bounded process request, polls again, and stops after unmount", async () => {
    vi.useFakeTimers();
    const activeProgress = progress({ active: true, backfillStatus: "running" });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => activeProgress,
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValue({
        ok: true,
        json: async () => activeProgress,
      } as Response);
    const view = renderPanel(activeProgress);

    await act(async () => {
      for (let count = 0; count < 12; count += 1) {
        await Promise.resolve();
      }
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/channel-comment-sync/status",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/channel-comment-sync/process",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/channel-comment-sync/status",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const callsBeforeUnmount = fetchMock.mock.calls.length;

    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeUnmount);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal).toHaveProperty(
      "aborted",
      true,
    );
  });
});

describe("collection trend", () => {
  it("labels real cumulative history and provides an honest empty state", () => {
    const { rerender } = render(
      <CollectionTrendChart
        points={[
          { date: "2026-09-07", cumulativeCount: 118 },
          { date: "2026-09-13", cumulativeCount: 128 },
        ]}
        totalCount={128}
      />,
    );

    expect(screen.getByRole("img")).toHaveAccessibleName(
      "최근 7일 누적 댓글 추이. 현재 128개",
    );

    rerender(
      <CollectionTrendChart
        points={[
          { date: "2026-09-07", cumulativeCount: 0 },
          { date: "2026-09-13", cumulativeCount: 0 },
        ]}
        totalCount={0}
      />,
    );
    expect(screen.getByText("아직 수집 기록이 없습니다")).toBeInTheDocument();
  });

  it("keeps accessible controls and a stacked mobile layout", () => {
    const css = readFileSync(
      "src/features/ingestion/youtube-connection.module.css",
      "utf8",
    );

    expect(css).toMatch(/\.syncNowButton,[\s\S]*min-height:\s*46px/);
    expect(css).toMatch(
      /@media \(max-width:\s*1100px\)[\s\S]*\.connectedLayout[\s\S]*grid-template-columns:\s*1fr/,
    );
  });
});
