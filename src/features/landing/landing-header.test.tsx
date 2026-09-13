import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingHeader } from "./landing-header";

describe("LandingHeader", () => {
  afterEach(() => vi.restoreAllMocks());
  it("opens and closes the compact usage guide without navigating away", () => {
    const { container } = render(<LandingHeader />);
    const dialog = container.querySelector("dialog")!;
    const show = vi.fn(() => dialog.setAttribute("open", ""));
    const close = vi.fn(() => dialog.removeAttribute("open"));
    dialog.showModal = show;
    dialog.close = close;
    fireEvent.click(screen.getByRole("button", { name: "이용 방법" }));
    expect(show).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog")).toHaveTextContent("Comment Inbox");
    fireEvent.click(screen.getByRole("button", { name: "이용 방법 닫기" }));
    expect(close).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
