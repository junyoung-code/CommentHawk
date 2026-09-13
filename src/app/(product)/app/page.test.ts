import { describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));

import AppPage from "./page";

describe("AppPage", () => {
  it("sends the removed overview route to YouTube connection", () => {
    AppPage();

    expect(redirect).toHaveBeenCalledWith("/app/connect/youtube");
  });
});
