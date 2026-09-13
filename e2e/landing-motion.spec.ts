import { expect, test } from "@playwright/test";

test("keeps the single landing readable at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("거친 말 속에서도");
  await expect(page.getByRole("article", { name: "정리된 피드백 예시" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("opens the source and usage guide without leaving the landing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const refined = page.getByRole("article", { name: "정리된 피드백 예시" });
  await expect(refined.getByText("존나 두서없이 하고싶은 말만 하네")).toBeHidden();
  await refined.locator("summary").click();
  await expect(refined.getByText("존나 두서없이 하고싶은 말만 하네")).toBeVisible();
  await page.getByRole("button", { name: "이용 방법", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("link", { name: "YouTube 연결하기" })).toHaveAttribute("href", "/auth/sign-in?next=%2Fapp%2Fconnect%2Fyoutube");
});
