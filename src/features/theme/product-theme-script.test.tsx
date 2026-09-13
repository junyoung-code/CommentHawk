import { beforeEach, describe, expect, it, vi } from "vitest";

import { PRODUCT_THEME_STORAGE_KEY } from "./product-theme";
import { PRODUCT_THEME_BOOTSTRAP_SCRIPT } from "./product-theme-script";

describe("product theme bootstrap script", () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = "light";
    window.localStorage.clear();
  });

  it("applies a stored dark theme before React hydrates", () => {
    window.localStorage.setItem(PRODUCT_THEME_STORAGE_KEY, "dark");

    new Function(PRODUCT_THEME_BOOTSTRAP_SCRIPT)();

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it.each([null, "system"])("uses dark for unset or invalid preferences (%s)", (stored) => {
    if (stored !== null) window.localStorage.setItem(PRODUCT_THEME_STORAGE_KEY, stored);

    new Function(PRODUCT_THEME_BOOTSTRAP_SCRIPT)();

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("preserves an explicitly selected light theme", () => {
    window.localStorage.setItem(PRODUCT_THEME_STORAGE_KEY, "light");
    new Function(PRODUCT_THEME_BOOTSTRAP_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("uses dark when storage is unavailable", () => {
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    try {
      new Function(PRODUCT_THEME_BOOTSTRAP_SCRIPT)();
      expect(document.documentElement.dataset.theme).toBe("dark");
    } finally {
      read.mockRestore();
    }
  });
});
