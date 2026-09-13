import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./actions", () => ({
  requestMagicLink: vi.fn(async () => undefined),
}));
import SignInPage from "./page";

describe("SignInPage", () => {
  it("explains that CrowdSift login and YouTube access are separate", async () => {
    const page = await SignInPage({
      searchParams: Promise.resolve({}),
    });

    render(page);

    expect(
      screen.getByRole("heading", { name: "CrowdSift에 로그인" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Google로 계속하기" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("다른 방법으로 로그인")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("이메일")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "로그인 링크 받기" })).not.toBeInTheDocument();
    expect(
      screen.getByText(/YouTube 채널 권한은 로그인 후 별도로 연결/),
    ).toBeInTheDocument();
  });
});
