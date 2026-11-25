import { expect, test } from "@playwright/test";

test("redirects unauthenticated visitors to login and renders login form", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("button", { name: /sign in|log in/i }),
  ).toBeVisible();
});
