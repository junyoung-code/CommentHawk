import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("renders the complete customer landing page", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        name: "거친 말 속에서도,도움 되는 의견만 또렷하게.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "정리된 피드백 예시" })).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "CrowdSift 개발 지도" }),
    ).not.toBeInTheDocument();
  });
});
