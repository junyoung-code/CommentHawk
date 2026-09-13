import "@/features/inbox/inbox-shell.css";
import styles from "@/features/policies/policy.module.css";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr";

import { requireViewer } from "@/features/auth/require-viewer";
import {
  PolicyForm,
  type PolicyFormValues,
} from "@/features/policies/policy-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

import { previewCreatorPolicyAction } from "./preview-action";

import { saveCreatorPolicyAction } from "./actions";

type ModerationSettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const readJsonText = (
  source: Json,
  key: string,
  fallback: string,
) => {
  if (
    typeof source === "object" &&
    source !== null &&
    !Array.isArray(source) &&
    typeof source[key] === "string"
  ) {
    return source[key];
  }

  return fallback;
};

export default async function ModerationSettingsPage({
  searchParams,
}: ModerationSettingsPageProps) {
  const parameters = await searchParams;
  const { workspaceId } = await requireViewer();
  const supabase = await createServerSupabaseClient();
  const { data: policy, error: policyError } = await supabase
    .from("creator_policies")
    .select(
      "id, version, category_sensitivity, preferred_actions, harmful_text_hidden",
    )
    .eq("workspace_id", workspaceId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (policyError) {
    throw new Error("Creator policy could not be loaded");
  }

  const { data: rules, error: rulesError } = policy
    ? await supabase
        .from("phrase_rules")
        .select("kind, phrase, context_note")
        .eq("workspace_id", workspaceId)
        .eq("policy_id", policy.id)
        .eq("enabled", true)
        .order("created_at")
    : { data: [], error: null };

  if (rulesError) {
    throw new Error("Creator phrase rules could not be loaded");
  }

  const linesForKind = (
    kind: "blocked" | "allowed" | "context_exception",
  ) =>
    (rules ?? [])
      .filter((rule) => rule.kind === kind)
      .map((rule) =>
        rule.context_note
          ? `${rule.phrase} | ${rule.context_note}`
          : rule.phrase,
      )
      .join("\n");
  const { data: profile, error: profileError } = await supabase
    .from("classification_profiles").select("allowed_slang")
    .eq("workspace_id", workspaceId).maybeSingle();
  if (profileError) throw new Error("Classification profile could not be loaded");
  const initial: PolicyFormValues = {
    version: policy?.version ?? 0,
    blocked: linesForKind("blocked"),
    allowed: [...new Set([linesForKind("allowed"), ...(profile?.allowed_slang ?? [])].filter(Boolean))].join("\n"),
    contextExceptions: linesForKind("context_exception"),
    sensitivity: readJsonText(
      policy?.category_sensitivity ?? {},
      "level",
      "standard",
    ) as PolicyFormValues["sensitivity"],
    cautionAction: readJsonText(
      policy?.preferred_actions ?? {},
      "caution",
      "review",
    ) as PolicyFormValues["cautionAction"],
    riskAction: readJsonText(
      policy?.preferred_actions ?? {},
      "risk",
      "hold_for_review",
    ) as PolicyFormValues["riskAction"],
    harmfulTextHidden: policy?.harmful_text_hidden ?? true,
  };

  return (
    <div className={`${styles.page} policy-settings-page`}>
      <header className={styles.heading}>
        <h1>댓글 관리 기준</h1>
        <p>우리 채널에 맞는 댓글 판단 기준을 정하세요.</p>
      </header>

      {parameters.saved ? (
        <p className="form-message form-message-success" role="status">
          <CheckCircle aria-hidden="true" weight="fill" />
          댓글 관리 기준을 저장했습니다.
        </p>
      ) : null}

      {/* 넘친 것을 조용히 버리면, 등록했다고 믿은 표현이 판단에 없다. */}
      {parameters.dropped ? (
        <p className="form-message form-message-error" role="alert">
          표현 {parameters.dropped}개는 분류에 반영하지 못했습니다. 표현 하나가
          40자를 넘거나, 허용할 표현 50개·주의해서 볼 표현 30개를 넘은
          경우입니다. 기준 문서에는 그대로 남아 있습니다.
        </p>
      ) : null}

      {parameters.error === "profile_save_failed" ? (
        <p className="form-message form-message-error" role="alert">
          기준 버전은 저장했지만 분류에 반영하지 못했습니다. 이 상태로 두면
          화면에 적은 표현이 다음 댓글 판단에 닿지 않습니다. 다시 저장해 주세요.
        </p>
      ) : parameters.error ? (
        <p className="form-message form-message-error" role="alert">
          댓글 관리 기준을 저장하지 못했습니다. 입력 내용을 확인하고 다시 시도해
          주세요.
        </p>
      ) : null}

      <PolicyForm key={initial.version} action={saveCreatorPolicyAction} initial={initial} previewAction={previewCreatorPolicyAction} />
    </div>
  );
}
