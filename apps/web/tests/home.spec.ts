import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("renders summary cards", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Active Assets")).toBeVisible();
    await expect(page.getByText("Maintenance Compliance")).toBeVisible();
    await expect(page.getByText("Upcoming Maintenance")).toBeVisible();
  });
});
