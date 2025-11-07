import { test, expect } from "@playwright/test";

test.describe("Asset Management", () => {
  test("renders asset list with search controls", async ({ page }) => {
    await page.goto("/assets");

    await expect(page.getByRole("heading", { name: "Asset Inventory" })).toBeVisible();
    await expect(page.getByPlaceholder("Search by name or asset tag")).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();

    const tableRows = page.locator("tbody tr");
    await expect(tableRows.first()).toBeVisible();
  });
});
