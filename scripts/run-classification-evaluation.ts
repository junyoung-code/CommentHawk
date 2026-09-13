/**
 * 사람이 검수한 실제 댓글 JSON을 현재 Classification 파이프라인에 다시 돌린다.
 * DB에는 아무것도 저장하지 않는다.
 *
 *   npm run eval:classification:run -- measurements/classification-real-50-reviewed.json
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import OpenAI from "openai";
import { z } from "zod";

import { routeFirstPass } from "../src/features/classification/branch";
import { finalizeClassification } from "../src/features/classification/finalize";
import { createFirstPassRunner } from "../src/features/classification/first-pass";
import { createLunaFirstPass } from "../src/features/classification/luna-first-pass";
import { createModerationScreen } from "../src/features/classification/moderation";
import { DEFAULT_CLASSIFICATION_PROFILE } from "../src/features/classification/schemas";
import { detectSpam } from "../src/features/classification/spam-rules";
import { createTerraVerification } from "../src/features/classification/terra-verification";
import { loadEnvFile } from "./test-comments";

const CaseSchema = z.object({
  id: z.string(),
  sourceText: z.string().min(1),
  videoTitle: z.string(),
  parentText: z.string().nullable(),
  expectedStatus: z.enum(["decided", "review_queue"]),
  expectedLevel: z.enum(["safe", "caution", "risk"]).nullable(),
  tags: z.array(z.string()),
});

const DatasetSchema = z.object({
  schemaVersion: z.literal("classification-real-v1"),
  cases: z.array(CaseSchema).min(1).max(50),
});

const actualLevel = (level: "safe" | "caution" | "danger" | null) =>
  level === "danger" ? "risk" : level;

const main = async () => {
  loadEnvFile();
  const path = resolve(
    process.cwd(),
    process.argv[2] ?? "measurements/classification-real-50-reviewed.json",
  );
  const dataset = DatasetSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const firstPass = createFirstPassRunner({
    luna: createLunaFirstPass({
      client: client as never,
      model: process.env.OPENAI_LUNA_MODEL ?? "gpt-5.6-luna",
    }),
    moderation: createModerationScreen({
      client: client as never,
      model: process.env.OPENAI_MODERATION_MODEL ?? "omni-moderation-latest",
    }),
  });
  const terra = createTerraVerification({
    client: client as never,
    model: process.env.OPENAI_TERRA_MODEL ?? "gpt-5.6-terra",
  });

  let correct = 0;
  let queued = 0;
  let roughPraiseErrors = 0;
  let hardRiskErrors = 0;
  let ambiguousSarcasmErrors = 0;

  for (const [index, evaluationCase] of dataset.cases.entries()) {
    process.stdout.write(`\r${index + 1}/${dataset.cases.length} ${evaluationCase.id}   `);
    const input = {
      commentId: evaluationCase.id,
      workspaceId: "local-real-evaluation",
      sourceText: evaluationCase.sourceText,
      videoTitle: evaluationCase.videoTitle,
      channelId: "local-real-evaluation",
      profile: DEFAULT_CLASSIFICATION_PROFILE,
      similarExamples: [],
      parent: evaluationCase.parentText
        ? { id: `${evaluationCase.id}-parent`, text: evaluationCase.parentText }
        : null,
    };
    const first = await firstPass.run(input);
    const branch = routeFirstPass(first);
    const verified =
      branch.kind === "verify"
        ? await terra.verify({
            ...input,
            moderation: first.moderation?.result ?? null,
          })
        : null;
    const verdict = finalizeClassification({
      firstPass: first,
      branch,
      terra: verified?.result ?? null,
      spam: detectSpam(evaluationCase.sourceText),
    });
    const level = actualLevel(verdict.level);
    const matched =
      verdict.status === evaluationCase.expectedStatus &&
      level === evaluationCase.expectedLevel;
    correct += Number(matched);
    queued += Number(verdict.status === "review_queue");

    if (
      evaluationCase.tags.includes("rough_praise") &&
      !(verdict.status === "decided" && level === "safe")
    ) {
      roughPraiseErrors += 1;
    }
    if (
      evaluationCase.tags.includes("hard_risk") &&
      !(verdict.status === "decided" && level === "risk")
    ) {
      hardRiskErrors += 1;
    }
    if (
      evaluationCase.tags.includes("ambiguous_sarcasm") &&
      verdict.status !== "review_queue"
    ) {
      ambiguousSarcasmErrors += 1;
    }

    if (!matched) {
      process.stdout.write(
        `\n  불일치 ${evaluationCase.id}: 기대 ${evaluationCase.expectedStatus}/${evaluationCase.expectedLevel ?? "-"}, 실제 ${verdict.status}/${level ?? "-"} (${verdict.basis})\n`,
      );
    }
  }

  const requiredCorrect = Math.ceil(dataset.cases.length * 0.9);
  const maxQueue = Math.floor(dataset.cases.length * 0.1);
  const passed =
    correct >= requiredCorrect &&
    queued <= maxQueue &&
    roughPraiseErrors === 0 &&
    hardRiskErrors === 0 &&
    ambiguousSarcasmErrors === 0;

  console.log("\n");
  console.log(`정확 ${correct}/${dataset.cases.length} (필요 ${requiredCorrect})`);
  console.log(`보류 ${queued}/${dataset.cases.length} (최대 ${maxQueue})`);
  console.log(`거친 칭찬 오탐 ${roughPraiseErrors}`);
  console.log(`강한 위험 미탐 ${hardRiskErrors}`);
  console.log(`애매한 비꼼 자동 확정 ${ambiguousSarcasmErrors}`);
  console.log(passed ? "통과" : "실패");
  if (!passed) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
