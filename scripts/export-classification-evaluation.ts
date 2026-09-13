/**
 * 최근 실제 댓글 50건을 로컬 전용 검수 자료로 내보낸다.
 * 원문은 measurements/ 아래에만 쓰며 저장소에는 커밋하지 않는다.
 *
 *   npm run eval:classification:export
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { loadEnvFile } from "./test-comments";

type ReviewLevel = "safe" | "caution" | "risk";
type ExpectedStatus = "decided" | "review_queue";

type EvaluationCase = {
  id: string;
  sourceText: string;
  videoTitle: string;
  parentText: string | null;
  capturedAt: string;
  current: {
    status: string | null;
    level: ReviewLevel | null;
    basis: string | null;
    luna: unknown;
    terra: unknown;
  };
  expectedStatus: ExpectedStatus | null;
  expectedLevel: ReviewLevel | null;
  reviewReason: string | null;
  tags: string[];
};

export const escapeInlineJson = (value: unknown) =>
  JSON.stringify(value).replaceAll("<", "\\u003c");

export const buildReviewDocument = (cases: EvaluationCase[]) => `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CrowdSift 실제 댓글 50건 검수</title>
  <style>
    :root { color-scheme: dark; font-family: Pretendard, system-ui, sans-serif; }
    body { max-width: 1040px; margin: 0 auto; padding: 32px 20px 80px; background: #0a0f17; color: #edf2f7; }
    header { position: sticky; top: 0; z-index: 2; padding: 18px 0; background: #0a0f17ee; backdrop-filter: blur(12px); }
    h1 { margin: 0 0 8px; font-size: 28px; } p { line-height: 1.65; }
    .case { margin: 16px 0; border: 1px solid #273244; border-radius: 16px; padding: 18px; background: #111925; }
    .meta { color: #91a0b5; font-size: 13px; } .comment { font-size: 18px; white-space: pre-wrap; }
    .parent { border-left: 3px solid #42516a; padding-left: 12px; color: #bdc7d6; }
    .current { color: #a9b5c7; } .fields { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    label { display: grid; gap: 6px; color: #b9c4d4; font-size: 13px; }
    select, input, textarea, button { border: 1px solid #36445a; border-radius: 9px; padding: 10px; background: #0b121d; color: inherit; font: inherit; }
    textarea { min-height: 64px; resize: vertical; } button { cursor: pointer; background: #2563eb; border-color: #2563eb; font-weight: 700; }
    .actions { display: flex; align-items: center; gap: 14px; } #progress { color: #9fb0c7; }
    @media (max-width: 720px) { .fields { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>실제 댓글 분류 검수</h1>
    <p>모델이 받은 원문·영상 제목·부모 댓글만 보고 안전, 주의, 위험, 보류를 정합니다.</p>
    <div class="actions"><button id="download" type="button">검수 JSON 저장</button><span id="progress"></span></div>
  </header>
  <main id="cases"></main>
  <script>
    const cases = ${escapeInlineJson(cases)};
    const root = document.querySelector('#cases');
    const progress = document.querySelector('#progress');
    const levels = [
      ['', '선택'],
      ['safe', '안전'],
      ['caution', '주의'],
      ['risk', '위험'],
      ['review_queue', '보류'],
    ];
    const updateProgress = () => {
      const reviewed = cases.filter((item) => item.expectedStatus).length;
      progress.textContent = reviewed + ' / ' + cases.length + '건 완료';
    };
    for (const item of cases) {
      const article = document.createElement('article'); article.className = 'case';
      const meta = document.createElement('p'); meta.className = 'meta'; meta.textContent = item.id + ' · ' + item.videoTitle;
      const comment = document.createElement('p'); comment.className = 'comment'; comment.textContent = item.sourceText;
      article.append(meta, comment);
      if (item.parentText) { const parent = document.createElement('p'); parent.className = 'parent'; parent.textContent = '부모: ' + item.parentText; article.append(parent); }
      const current = document.createElement('p'); current.className = 'current';
      current.textContent = '현재: ' + (item.current.status || '없음') + ' · ' + (item.current.level || '등급 없음') + ' · ' + (item.current.basis || '근거 없음');
      article.append(current);
      const fields = document.createElement('div'); fields.className = 'fields';
      const levelLabel = document.createElement('label'); levelLabel.textContent = '사람 판단';
      const select = document.createElement('select');
      for (const [value, label] of levels) { const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option); }
      select.addEventListener('change', () => {
        if (select.value === 'review_queue') { item.expectedStatus = 'review_queue'; item.expectedLevel = null; }
        else if (select.value) { item.expectedStatus = 'decided'; item.expectedLevel = select.value; }
        else { item.expectedStatus = null; item.expectedLevel = null; }
        updateProgress();
      });
      const reasonLabel = document.createElement('label'); reasonLabel.textContent = '판단 사유';
      const reason = document.createElement('textarea'); reason.addEventListener('input', () => { item.reviewReason = reason.value.trim() || null; });
      const tagsLabel = document.createElement('label'); tagsLabel.textContent = '태그(쉼표 구분)';
      const tags = document.createElement('input'); tags.addEventListener('input', () => { item.tags = tags.value.split(',').map((value) => value.trim()).filter(Boolean); });
      levelLabel.append(select); reasonLabel.append(reason); tagsLabel.append(tags); fields.append(levelLabel, reasonLabel, tagsLabel); article.append(fields); root.append(article);
    }
    updateProgress();
    document.querySelector('#download').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ schemaVersion: 'classification-real-v1', cases }, null, 2)], { type: 'application/json' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'classification-real-50-reviewed.json'; link.click(); URL.revokeObjectURL(link.href);
    });
  </script>
</body>
</html>`;

const main = async () => {
  loadEnvFile();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: rawRows, error: rawError } = await supabase
    .from("raw_comments")
    .select(
      "id, first_import_job_id, youtube_video_id, youtube_comment_id, parent_youtube_comment_id, text_display, captured_at, classification_verdicts(status, level, basis, created_at), classification_stage_runs(stage, status, output, created_at)",
    )
    .order("captured_at", { ascending: false })
    .limit(250);
  if (rawError) throw rawError;

  const rows = rawRows ?? [];
  const jobIds = [...new Set(rows.map((row) => row.first_import_job_id).filter(Boolean))];
  const videoIds = [...new Set(rows.map((row) => row.youtube_video_id))];
  const [{ data: jobs, error: jobsError }, { data: videos, error: videosError }] =
    await Promise.all([
      supabase.from("comment_import_jobs").select("id, provider_mode").in("id", jobIds),
      supabase.from("youtube_videos").select("youtube_video_id, title").in("youtube_video_id", videoIds),
    ]);
  if (jobsError) throw jobsError;
  if (videosError) throw videosError;

  const liveJobs = new Set((jobs ?? []).filter((job) => job.provider_mode === "live").map((job) => job.id));
  const videoTitles = new Map((videos ?? []).map((video) => [video.youtube_video_id, video.title ?? "제목 없음"]));
  const byYoutubeId = new Map(rows.map((row) => [row.youtube_comment_id, row]));

  const cases = rows
    .filter((row) => row.first_import_job_id && liveJobs.has(row.first_import_job_id))
    .flatMap<EvaluationCase>((row) => {
      const verdict = [...(row.classification_verdicts ?? [])].sort((a, b) => a.created_at < b.created_at ? 1 : -1)[0];
      if (!verdict) return [];
      const runs = [...(row.classification_stage_runs ?? [])].sort((a, b) => a.created_at < b.created_at ? 1 : -1);
      const run = (stage: string) => runs.find((entry) => entry.stage === stage && entry.status === "succeeded")?.output ?? null;
      return [{
        id: `real-${row.id.slice(0, 8)}`,
        sourceText: row.text_display,
        videoTitle: videoTitles.get(row.youtube_video_id) ?? "제목 없음",
        parentText: row.parent_youtube_comment_id ? byYoutubeId.get(row.parent_youtube_comment_id)?.text_display ?? null : null,
        capturedAt: row.captured_at,
        current: { status: verdict.status, level: verdict.level, basis: verdict.basis, luna: run("luna"), terra: run("terra") },
        expectedStatus: null,
        expectedLevel: null,
        reviewReason: null,
        tags: [],
      } satisfies EvaluationCase];
    })
    .slice(0, 50);

  if (cases.length === 0) throw new Error("실제 분류 댓글을 찾지 못했습니다");

  const directory = resolve(process.cwd(), "measurements");
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "classification-real-50-draft.json"), JSON.stringify({ schemaVersion: "classification-real-v1", cases }, null, 2));
  writeFileSync(resolve(directory, "classification-review.html"), buildReviewDocument(cases));
  console.log(`실제 댓글 ${cases.length}건을 measurements/classification-review.html 로 내보냈습니다.`);
};

if (process.argv[1]?.endsWith("export-classification-evaluation.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
