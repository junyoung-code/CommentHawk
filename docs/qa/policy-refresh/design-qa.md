# 댓글 관리 기준 — final design QA

- Source: `references/crowdsift-ui/2026-09-13-policy-approved.png` (1490 × 1056)
- Implementation: `docs/qa/policy-refresh/desktop-dark.png` (1488 × 1056)
- Viewport: 1488 × 1056 CSS px, 1× screenshot density. The reference has 2 extra pixels of width; no stretching was applied.
- State: saved default three topics, empty custom/context inputs, sample preview, dark theme. Test environment banner replaces the mock's design banner.
- Full comparison: `comparison.png`, originals side by side at original dimensions. Typography and chip detail were also inspected directly in individual full-size captures.
- Additional captures: `desktop-light.png`, `mobile-top.png`, `mobile-bottom.png` (390 × 844 CSS px).

## Findings and comparison history

1. Initial desktop capture (`desktop-before.png`) exposed a white rectangle around the owl. Fixed with a dark background rendition of the existing asset; the logo uses a circular crop. The post-fix desktop and mobile captures show the correction.
2. Mobile navigation initially clipped the active tab. Scoped three-column navigation with smaller icons/text resolves this at 390 px. Verified in `mobile-top.png`.
3. No remaining P0/P1/P2 issues. Original shared 240px navigation and product gutters remain, rather than changing Inbox/YouTube geometry to match the generated 264px sidebar. Form sections are slightly more compact than the mock. These are deliberate adaptations to the existing app and the requested smaller type.

## Required fidelity surfaces

- Typography: existing product font stack; 28px title, 20px section headings, 14px controls, 12–13px secondary text. No clipped headings/inputs; small mobile navigation fits all three entries.
- Spacing: editor/preview hierarchy retained, thin divider, rounded chips, two input columns on desktop and stacked inputs on mobile. Save button is reachable at the mobile bottom.
- Color: shared dark/light tokens; restrained blue selection and ×, neutral +, green sample badge. Keyboard focus outline retained.
- Imagery: supplied brand logo, supplied light owl; built-in ImageGen used to produce `public/brand/shifty-policy-dark.png` from the existing owl with a dark background. Prompt: replace only white background with solid #15171b, retain full owl and badge. The earlier checkerboard rendition was rejected and is not used.
- Copy: approved labels and concrete placeholders retained. Sample result and actual preview have distinct labels; fixture mode is explicit. The selection hint says defaults are for first use, so it remains truthful for saved selections.

## Functional evidence

- Selected chips, custom topic addition, paired context serialization, legacy allowances and saved empty selections: component/schema tests.
- Authenticated preview accepts the current form, returns a classification, and marks fixtures. Input edits clear stale results.
- Browser: saved the selected three defaults and reopened the route; selections persisted. Direct preview of the benign sample returned 안전.
- Browser error/warning log after final navigation: empty.
- No auto-moderation actions added. Public/unknown-source profile isolation has regression coverage.

## Follow-up polish

- Preview avatar uses the existing icon library rather than a generated anonymous avatar. This is a minor visual difference.
- Next.js development indicator appears only in local development.

final result: passed

## Direct-input result alignment follow-up

- User reference: `codex-clipboard-9c152a81-11dd-4803-95de-859f7ff61884.png`.
- Added a result header row with left label and right verdict badge, zero paragraph margins, explicit 10px result gaps and a divider separating input from output.
- Dark caution/risk badges now use muted theme-appropriate fills.
- Browser reproduced the user's input and returned 위험. Result/header/body edges and mobile wrapping checked at 390 × 844.
- Detail evidence: `preview-aligned.png`. Lint, component tests, production build passed.

final result: passed

## Submitted-comment card follow-up

- Latest user reference: `codex-clipboard-b5a2991c-858c-4a75-9567-18b3b14f687c.png` supersedes the preceding header-row layout.
- Sample and submitted comments now share one avatar/comment/verdict/reason component. The server returns a concise reason based on classification signals; fixture output remains explicitly labeled.
- Another-comment control clears the previous result and focuses the input. Existing edit invalidation remains in place.
- Browser verified the submitted original and returned family-attack reason at 390 × 844. Updated evidence: `preview-aligned.png`; viewport restored afterward.
- Lint, production build, and 4 component tests passed. `git diff --check` passed.
