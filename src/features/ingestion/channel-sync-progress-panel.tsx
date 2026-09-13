"use client";

import {
  ArrowsClockwise,
  CalendarBlank,
  CaretDown,
  Clock,
  GearSix,
  LinkBreak,
  SpinnerGap,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import styles from "./youtube-connection.module.css";
import type { ChannelSyncProgress } from "./channel-sync-progress";

const STATUS_ENDPOINT = "/api/channel-comment-sync/status";
const PROCESS_ENDPOINT = "/api/channel-comment-sync/process";
const POLL_INTERVAL_MS = 2_000;

type FormAction = (formData: FormData) => void | Promise<void>;

export type ChannelCollectionPoint = {
  date: string;
  cumulativeCount: number;
};

const formatShortDate = (value: string) => {
  const [, month = "", day = ""] = value.split("-");
  return `${Number(month)}.${Number(day)}`;
};

const formatDisplayDate = (value: string) =>
  value ? value.split("-").join(". ") : "시작일 선택";

export function CollectionTrendChart({
  points,
  totalCount,
}: {
  points: ChannelCollectionPoint[];
  totalCount: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasHistory = points.some((point) => point.cumulativeCount > 0);

  useEffect(() => {
    if (!hasHistory || process.env.NODE_ENV === "test") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const width = Math.max(canvas.clientWidth, 1);
      const height = Math.max(canvas.clientHeight, 1);
      const density = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = Math.round(width * density);
      canvas.height = Math.round(height * density);

      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(density, density);
      context.clearRect(0, 0, width, height);

      const values = points.map((point) => point.cumulativeCount);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = Math.max(max - min, 1);
      const horizontalPadding = 5;
      const topPadding = 13;
      const bottomPadding = 12;
      const graphWidth = width - horizontalPadding * 2;
      const graphHeight = height - topPadding - bottomPadding;
      const coordinates = values.map((value, index) => ({
        x:
          horizontalPadding +
          (graphWidth * index) / Math.max(values.length - 1, 1),
        y:
          max === min
            ? topPadding + graphHeight / 2
            : topPadding + ((max - value) / range) * graphHeight,
      }));

      context.beginPath();
      coordinates.forEach(({ x, y }, index) => {
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      const last = coordinates.at(-1);
      const first = coordinates[0];
      if (last && first) {
        context.lineTo(last.x, height - bottomPadding);
        context.lineTo(first.x, height - bottomPadding);
        context.closePath();
        context.fillStyle = "rgba(47, 128, 255, 0.13)";
        context.fill();
      }

      context.beginPath();
      coordinates.forEach(({ x, y }, index) => {
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 2.5;
      context.strokeStyle = "#2f80ff";
      context.stroke();

      if (last) {
        context.beginPath();
        context.arc(last.x, last.y, 4.5, 0, Math.PI * 2);
        context.fillStyle = "#2f80ff";
        context.fill();
      }
    };

    draw();
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(draw);
    resizeObserver?.observe(canvas);
    return () => resizeObserver?.disconnect();
  }, [hasHistory, points]);

  const firstDate = points[0]?.date;
  const lastDate = points.at(-1)?.date;

  return (
    <div className={styles.trendChart}>
      {hasHistory ? (
        <canvas
          aria-label={`최근 7일 누적 댓글 추이. 현재 ${totalCount.toLocaleString("ko-KR")}개`}
          className={styles.trendCanvas}
          ref={canvasRef}
          role="img"
        />
      ) : (
        <div className={styles.trendEmpty} role="status">
          아직 수집 기록이 없습니다
        </div>
      )}
      <div className={styles.trendLabels} aria-hidden="true">
        <span>{firstDate ? formatShortDate(firstDate) : ""}</span>
        <span>{lastDate ? formatShortDate(lastDate) : ""}</span>
      </div>
    </div>
  );
}

function PendingSubmitButton({
  children,
  className,
  pendingLabel,
}: {
  children: React.ReactNode;
  className: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} type="submit">
      {pending ? pendingLabel : children}
    </button>
  );
}

function SyncToggle({
  enabled,
  setEnabledAction,
}: {
  enabled: boolean;
  setEnabledAction: FormAction;
}) {
  return (
    <form action={setEnabledAction} className={styles.toggleForm}>
      <input name="enabled" type="hidden" value={enabled ? "false" : "true"} />
      <ToggleButton enabled={enabled} />
    </form>
  );
}

function ToggleButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      aria-checked={enabled}
      aria-label={enabled ? "자동 댓글 수집 끄기" : "자동 댓글 수집 켜기"}
      className={`${styles.toggle}${enabled ? ` ${styles.toggleOn}` : ""}`}
      disabled={pending}
      role="switch"
      type="submit"
    >
      <span aria-hidden="true" />
    </button>
  );
}

function SyncDateForm({
  configureAction,
  maxDate,
  startDate,
}: {
  configureAction: FormAction;
  maxDate: string;
  startDate: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedDate, setSelectedDate] = useState(startDate);
  return (
    <form action={configureAction} className={styles.dateForm} ref={formRef}>
      <CalendarBlank aria-hidden="true" weight="bold" />
      <span className={styles.dateInputWrap}>
        <span aria-hidden="true">{formatDisplayDate(selectedDate)}</span>
        <input
          aria-label="댓글 수집 시작일"
          defaultValue={startDate}
          key={startDate}
          max={maxDate}
          name="startDate"
          onChange={(event) => {
            setSelectedDate(event.currentTarget.value);
            formRef.current?.requestSubmit();
          }}
          required
          type="date"
        />
        <CaretDown aria-hidden="true" weight="bold" />
      </span>
      <button className="sr-only" type="submit">
        시작일 저장
      </button>
    </form>
  );
}

function ConnectionSettings({
  disconnectAction,
}: {
  disconnectAction: FormAction;
}) {
  return (
    <details className={styles.connectionSettings}>
      <summary>
        <span className={styles.rowIcon} aria-hidden="true">
          <GearSix weight="bold" />
        </span>
        <strong>연결 설정</strong>
        <CaretDown
          aria-hidden="true"
          className={styles.settingsCaret}
          weight="bold"
        />
      </summary>
      <div className={styles.settingsContent}>
        <p>
          연결을 해제하면 Google token은 폐기하지만, 이미 수집한 댓글 원문과
          분석 기록은 그대로 보존합니다.
        </p>
        <form
          action={disconnectAction}
          onSubmit={(event) => {
            if (!window.confirm("YouTube 채널 연결을 해제할까요?")) {
              event.preventDefault();
            }
          }}
        >
          <PendingSubmitButton
            className={styles.disconnectButton}
            pendingLabel="연결 해제 중"
          >
            <LinkBreak aria-hidden="true" weight="bold" />
            YouTube 연결 해제
          </PendingSubmitButton>
        </form>
      </div>
    </details>
  );
}

export function ChannelSyncSetup({
  configureAction,
  disconnectAction,
  maxDate,
}: {
  maxDate: string;
  configureAction: FormAction;
  disconnectAction: FormAction;
}) {
  return (
    <div className={styles.controlsPanel}>
      <div className={styles.controlRow}>
        <span className={styles.rowIcon} aria-hidden="true">
          <ArrowsClockwise weight="bold" />
        </span>
        <div className={styles.rowCopy}>
          <div className={styles.rowTitle}>
            <h2>자동 댓글 수집</h2>
            <span className={styles.statusBadge}>설정 필요</span>
          </div>
          <p>시작일을 선택하면 새 댓글을 자동으로 가져옵니다.</p>
        </div>
        <button
          aria-checked="false"
          aria-label="시작일 선택 후 자동 댓글 수집 사용 가능"
          className={styles.toggle}
          disabled
          role="switch"
          type="button"
        >
          <span aria-hidden="true" />
        </button>
      </div>

      <form action={configureAction} className={styles.setupDateRow}>
        <span className={styles.rowIcon} aria-hidden="true">
          <CalendarBlank weight="bold" />
        </span>
        <label className={styles.rowCopy} htmlFor="channel-sync-start-date">
          <span className={styles.rowTitle}>
            <strong>댓글 수집 시작일</strong>
          </span>
          <span>Asia/Seoul 자정부터 포함해 최신 댓글부터 수집합니다.</span>
        </label>
        <div className={styles.setupDateActions}>
          <input
            aria-label="댓글 수집 시작일"
            id="channel-sync-start-date"
            max={maxDate}
            name="startDate"
            required
            type="date"
          />
          <PendingSubmitButton
            className={styles.primaryButton}
            pendingLabel="시작 중"
          >
            수집 시작
          </PendingSubmitButton>
        </div>
      </form>

      <div className={styles.controlRow}>
        <span className={styles.rowIcon} aria-hidden="true">
          <Clock weight="bold" />
        </span>
        <div className={styles.rowCopy}>
          <div className={styles.rowTitle}>
            <h2>마지막 확인</h2>
          </div>
          <p>수집을 시작하면 확인 시각이 표시됩니다.</p>
        </div>
      </div>

      <ConnectionSettings disconnectAction={disconnectAction} />
    </div>
  );
}

const formatLastSuccess = (value: string | null) => {
  if (!value) return "아직 확인 기록 없음";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(new Date(value))
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});

  return `${parts.year}. ${parts.month}. ${parts.day} ${parts.hour}:${parts.minute}`;
};

const readProgress = async (signal: AbortSignal) => {
  const response = await fetch(STATUS_ENDPOINT, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error("channel_sync_status_failed");
  return (await response.json()) as ChannelSyncProgress;
};

export function ChannelSyncProgressPanel({
  configureAction,
  disconnectAction,
  initialProgress,
  maxDate,
  requestNowAction,
  setEnabledAction,
}: {
  initialProgress: ChannelSyncProgress;
  maxDate: string;
  configureAction: FormAction;
  disconnectAction: FormAction;
  requestNowAction: FormAction;
  setEnabledAction: FormAction;
}) {
  const [progress, setProgress] = useState(initialProgress);
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (
      !initialProgress.configured ||
      (!initialProgress.enabled && !initialProgress.active)
    ) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const before = await readProgress(controller.signal);
        if (cancelled) return;
        setProgress(before);
        if (!before.active) return;

        const processResponse = await fetch(PROCESS_ENDPOINT, {
          method: "POST",
          signal: controller.signal,
        });
        if (!processResponse.ok) {
          throw new Error("channel_sync_process_failed");
        }

        const after = await readProgress(controller.signal);
        if (cancelled) return;
        setProgress(after);
        if (after.active) {
          pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setClientError(
          error instanceof Error && error.message === "channel_sync_status_failed"
            ? "동기화 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
            : "댓글 동기화를 진행하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
    };

    void poll();

    return () => {
      cancelled = true;
      controller.abort();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [
    initialProgress.active,
    initialProgress.configured,
    initialProgress.enabled,
  ]);

  const alertMessage = clientError ?? progress.errorMessage;

  return (
    <div className={styles.controlsPanel}>
      <div className={styles.controlRow}>
        <span className={styles.rowIcon} aria-hidden="true">
          <ArrowsClockwise weight="bold" />
        </span>
        <div className={styles.rowCopy}>
          <div className={styles.rowTitle}>
            <h2>자동 댓글 수집</h2>
            <span
              className={`${styles.statusBadge}${
                progress.enabled ? ` ${styles.statusBadgeOn}` : ""
              }`}
            >
              {progress.enabled ? "켜짐" : "꺼짐"}
            </span>
          </div>
          <p>새 댓글을 자동으로 가져와요.</p>
        </div>
        <SyncToggle
          enabled={progress.enabled}
          setEnabledAction={setEnabledAction}
        />
      </div>

      <div className={styles.controlRow}>
        <span className={styles.rowIcon} aria-hidden="true">
          <CalendarBlank weight="bold" />
        </span>
        <div className={styles.rowCopy}>
          <div className={styles.rowTitle}>
            <h2>댓글 수집 시작일</h2>
          </div>
        </div>
        <SyncDateForm
          configureAction={configureAction}
          maxDate={maxDate}
          startDate={progress.startDate ?? maxDate}
        />
      </div>

      <div className={styles.controlRow}>
        <span className={styles.rowIcon} aria-hidden="true">
          <Clock weight="bold" />
        </span>
        <div className={styles.rowCopy}>
          <div className={styles.rowTitle}>
            <h2>마지막 확인</h2>
          </div>
          <p className={styles.lastChecked}>
            {formatLastSuccess(progress.lastSuccessfulSyncAt)}
          </p>
        </div>
        <form action={requestNowAction} className={styles.syncNowForm}>
          <PendingSubmitButton
            className={styles.syncNowButton}
            pendingLabel="동기화 중"
          >
            <ArrowsClockwise aria-hidden="true" weight="bold" />
            지금 동기화
          </PendingSubmitButton>
        </form>
      </div>

      {progress.active ? (
        <div className={styles.progressNotice} role="status">
          <SpinnerGap aria-hidden="true" weight="bold" />
          <span aria-live="polite">{progress.statusMessage}</span>
        </div>
      ) : null}

      {alertMessage ? (
        <div className={styles.errorNotice} role="alert">
          <span>{alertMessage}</span>
          {progress.reconnectRequired ? (
            <a href="/api/youtube/oauth/start">채널 다시 연결</a>
          ) : null}
        </div>
      ) : null}

      <ConnectionSettings disconnectAction={disconnectAction} />
    </div>
  );
}
