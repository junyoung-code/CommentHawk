// @vitest-environment node

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle server rendering", () => {
  it("renders a dark fallback without browser globals", () => {
    expect(() => renderToString(<ThemeToggle />)).not.toThrow();
    expect(renderToString(<ThemeToggle />)).toContain(
      'aria-label="다크 모드 사용" aria-pressed="true"',
    );
  });
});
