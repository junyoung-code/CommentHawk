"use server";

import { requireViewer } from "@/features/auth/require-viewer";
import { createFirstPass, createSecondPass } from "@/features/classification/openai-clients";
import type { FirstPassInput } from "@/features/classification/contracts";
import { routeFirstPass } from "@/features/classification/branch";
import { finalizeClassification } from "@/features/classification/finalize";
import { detectSpam } from "@/features/classification/spam-rules";
import { DEFAULT_CLASSIFICATION_PROFILE } from "@/features/classification/schemas";
import { readPolicyEditor, type PolicyPreviewResult } from "@/features/policies/policy-editor";
import { getServerEnv } from "@/lib/env";

export async function previewCreatorPolicyAction(data: FormData): Promise<PolicyPreviewResult> {
  const { workspaceId } = await requireViewer();
  const parsed = readPolicyEditor(data);
  const text = String(data.get("comment") ?? "").trim();
  const fixture = getServerEnv().EXTERNAL_PROVIDER_MODE === "fixture";
  if (!parsed.success || !text || text.length > 2000) {
    return { level:null, fixture, error:"기준과 댓글 입력을 확인해 주세요. 댓글은 2,000자까지 가능해요." };
  }
  const { topics, contexts } = parsed.data;
  const sensitivity = data.get("sensitivity");
  const input: FirstPassInput = {
    commentId: crypto.randomUUID(), workspaceId, sourceText:text, videoTitle:"", channelId:"",
    similarExamples:[], parent:null,
    profile: {
      ...DEFAULT_CLASSIFICATION_PROFILE,
      protectionLevel: sensitivity === "low" || sensitivity === "high" ? sensitivity : "standard" as const,
      sensitiveTopics:topics,
      allowedSlang:contexts.filter(row => !row.context).map(row => row.phrase),
      allowedContexts:contexts.filter(row => row.context),
    },
  };
  try {
    const first = await createFirstPass().run(input);
    const branch = routeFirstPass(first);
    const terra = branch.kind === "verify"
      ? (await createSecondPass().verify({ ...input, moderation:first.moderation?.result ?? null })).result
      : null;
    const verdict = finalizeClassification({firstPass:first,branch,terra,spam:detectSpam(text)});
    const intent = terra?.intent ?? first.luna.result.intent;
    const reasons = {
      profanity:"욕설", vulgarity:"비속어", mockery:"조롱", sarcasm:"비꼼",
      personal_attack:"개인 공격", appearance_attack:"외모 공격", family_attack:"가족 공격",
      sexual_harassment:"성희롱", hate_speech:"혐오 표현", threat:"협박", stalking:"스토킹",
      personal_info:"개인정보 노출", self_harm_or_death:"자해·죽음 유도",
    };
    const detected = terra?.reasonCodes.map(code => reasons[code]).slice(0, 3).join(" · ");
    const reason = !verdict.level ? "댓글만으로 판단하기 어려워 직접 확인이 필요해요."
      : verdict.raisedBySpam ? "스팸 신호가 감지되어 검토가 필요해요."
      : verdict.level === "safe" ? (intent === "praise" ? "칭찬의 의미로 판단해요." : "공격성이 낮은 댓글로 판단해요.")
      : verdict.raisedByModeration ? "안전 검토에서 위험 신호가 감지되었어요."
      : detected ? `${detected} 표현이 감지되어 검토가 필요해요.`
      : "주의가 필요한 표현으로 판단해요.";
    return { level:verdict.level, fixture, reason };
  } catch {
    return { level:null, fixture, error:"지금은 분석할 수 없어요. 잠시 후 다시 시도해 주세요." };
  }
}
