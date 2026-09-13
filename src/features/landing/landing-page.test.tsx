import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingPage } from "./landing-page";

describe("LandingPage", () => {
  it("keeps the approved single hero and routes connection through sign in", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("거친 말 속에서도,");
    expect(screen.getByRole("link", { name: "YouTube 연결하기" })).toHaveAttribute("href", "/auth/sign-in?next=%2Fapp%2Fconnect%2Fyoutube");
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/auth/sign-in");
    expect(screen.getByText("댓글 예시 · 실제 사용자 데이터가 아닙니다")).toBeInTheDocument();
    expect(screen.queryByText("THE PROBLEM")).not.toBeInTheDocument();
  });

  it("retains the original author and keeps the refined card source collapsed", () => {
    render(<LandingPage />);
    const original = screen.getByRole("article", { name: "원문 댓글 예시" });
    const refined = screen.getByRole("article", { name: "정리된 피드백 예시" });
    expect(within(original).getByText(/@example/)).toBeInTheDocument();
    expect(within(refined).getByText(/@example/)).toBeInTheDocument();
    expect(within(refined).getByText(/핵심을 정리해서 말하면/)).toHaveTextContent("더 이해하기 좋을 것 같아요!");
    expect(refined.querySelector("details")).not.toHaveAttribute("open");
    expect(within(refined).getByText("존나 두서없이 하고싶은 말만 하네")).not.toBeVisible();
  });

  it("keeps example reactions local and explains that replies need a connection", () => {
    render(<LandingPage />);
    const card = within(screen.getByRole("article", { name: "정리된 피드백 예시" }));
    fireEvent.click(card.getByRole("button", { name: "좋아요" }));
    expect(card.getByRole("button", { name: "좋아요" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(card.getByRole("button", { name: "싫어요" }));
    expect(card.getByRole("button", { name: "좋아요" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(card.getByRole("button", { name: "답글" }));
    expect(card.getByRole("status")).toHaveTextContent("실제 답글은 채널 연결 후");
  });
});
