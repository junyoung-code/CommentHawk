import { PROFILE_LIMITS } from "@/features/classification/schemas";

import { parsePolicyPhraseLines, type PolicySensitivity } from "./policy-service";

/**
 * Flat preferences are stored in classification_profiles. Context-specific allowances
 * remain in versioned phrase_rules and are loaded separately as allowedContexts.
 */

export type ProfileUpdate = {
  protectionLevel: PolicySensitivity;
  allowedSlang: string[];
  sensitiveTopics: string[];
};

export type ProfileConversion = {
  profile: ProfileUpdate;
  /** 스키마를 넘겨 담지 못한 것. 조용히 버리지 않고 화면이 말하게 한다. */
  dropped: string[];
};

/**
 * 스키마가 받아 주는 만큼만 남긴다.
 *
 * 넘치면 `toClassificationProfile` 이 파싱에 실패하고 **프로필 전체가 기본값으로
 * 되돌아간다.** 하나를 더 넣었다가 등록해 둔 것이 통째로 사라지는 셈이라, 여기서
 * 자른다. 자른 것은 돌려주어 화면이 알린다.
 *
 * 긴 문구는 줄이지 않고 버린다. 40자에서 끊으면 뜻이 달라진 말이 등록된다.
 */
const clamp = (lines: string[], max: number) => {
  const kept: string[] = [];
  const dropped: string[] = [];

  for (const line of lines) {
    // `표현 | 설명` 으로 적었다면 앞의 표현만 가져온다. 맥락 예외와 같은 표기다.
    const phrase = line.split("|")[0]!.trim();
    if (phrase.length === 0) continue;

    if (phrase.length > PROFILE_LIMITS.phraseChars || kept.length >= max) {
      dropped.push(phrase);
      continue;
    }
    kept.push(phrase);
  }

  return { kept, dropped };
};

export const toClassificationProfileUpdate = ({
  allowed,
  blocked,
  sensitivity,
}: {
  allowed: string;
  blocked: string;
  sensitivity: PolicySensitivity;
}): ProfileConversion => {
  const slang = clamp(parsePolicyPhraseLines(allowed), PROFILE_LIMITS.allowedSlang);
  const topics = clamp(parsePolicyPhraseLines(blocked), PROFILE_LIMITS.sensitiveTopics);

  return {
    profile: {
      protectionLevel: sensitivity,
      allowedSlang: slang.kept,
      sensitiveTopics: topics.kept,
    },
    dropped: [...slang.dropped, ...topics.dropped],
  };
};
