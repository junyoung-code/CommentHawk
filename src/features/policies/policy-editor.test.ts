import { describe, expect, it } from "vitest";
import { withPolicyContexts } from "@/features/classification/profile";
import { DEFAULT_CLASSIFICATION_PROFILE, ClassificationProfileSchema } from "@/features/classification/schemas";
import { readPolicyEditor } from "./policy-editor";

describe("contextual policies", () => {
  it("keeps context pairs intact and prevents unconditional allowance of the same expression", () => {
    const profile = withPolicyContexts({...DEFAULT_CLASSIFICATION_PROFILE,allowedSlang:["감자대장","다른 말"]},[{phrase:"감자대장",context_note:"팬들의 애칭"}]);
    expect(profile.allowedSlang).toEqual(["다른 말"]);
    expect(profile.allowedContexts).toEqual([{phrase:"감자대장",context:"팬들의 애칭"}]);
    expect(ClassificationProfileSchema.safeParse(profile).success).toBe(true);
  });
  it("rejects oversized or delimiter-injected rules before persistence", () => {
    const data = new FormData();
    data.set("topics",JSON.stringify(["광고|다른 규칙"]));
    data.set("contexts","[]");
    expect(readPolicyEditor(data).success).toBe(false);
    data.set("topics","[]");
    data.set("contexts",JSON.stringify([{phrase:"별명",context:"가".repeat(201)}]));
    expect(readPolicyEditor(data).success).toBe(false);
  });
});
