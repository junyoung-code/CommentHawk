import { z } from "zod";
import { parsePolicyPhraseLines } from "./policy-service";

export const POLICY_PRESETS = ["외모 비하", "가족 언급", "반복 홍보", "사생활 추측", "타인과 비교", "스포일러"];
export const DEFAULT_POLICY_TOPICS = POLICY_PRESETS.slice(0, 3);
export type AllowedContext = { phrase: string; context: string };
export type PolicyPreviewResult = {
  level: "safe" | "caution" | "danger" | null;
  fixture: boolean;
  reason?: string;
  error?: string;
};

export const parseAllowedContexts = (value: string): AllowedContext[] =>
  parsePolicyPhraseLines(value).map((line) => {
    const [phrase, ...parts] = line.split("|");
    return { phrase: phrase.trim(), context: parts.join("|").trim() };
  });

// Bound both UI and server input before saving or sending policy data to AI.
const phrase = z.string().trim().min(1).max(40).regex(/^[^|\r\n]+$/);
export const policyEditorSchema = z.object({
  topics: z.array(phrase).max(30),
  contexts: z.array(z.object({
    phrase,
    context: z.string().trim().max(200).regex(/^[^\r\n]*$/),
  })).max(50),
});

export function readPolicyEditor(formData: FormData) {
  try {
    return policyEditorSchema.safeParse({
      topics: JSON.parse(String(formData.get("topics") ?? "[]")),
      contexts: JSON.parse(String(formData.get("contexts") ?? "[]")),
    });
  } catch {
    return policyEditorSchema.safeParse(null);
  }
}
