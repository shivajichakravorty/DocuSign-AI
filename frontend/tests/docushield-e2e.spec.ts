import { expect, test } from "@playwright/test";

test.describe("DocuShield AI E2E Flow", () => {
  test("redirects unauthenticated users to login page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("logs in and loads dashboard workspace", async ({ page }) => {
    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });

    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: "e2e-test-jwt-token",
          user: {
            id: "user-e2e-1",
            email: "test@docushield.ai",
            fullName: "Test User",
            role: "member",
          },
        }),
      });
    });

    await page.route("**/api/documents**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ documents: [] }),
      });
    });

    await page.goto("/login");
    await page
      .getByPlaceholder(/name@company\.com/i)
      .fill("test@docushield.ai");
    await page.getByPlaceholder(/••••••••/).fill("password123");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/upload pdf document/i)).toBeVisible();
  });
});
