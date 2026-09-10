import { test, expect, type Page } from "@playwright/test";

/**
 * The v1 money path (Part A metric A.4):
 *   register → create project (auto-activated) → tree loads →
 *   open lib/main.dart → edit → release build → preview iframe appears.
 *
 * Requires a real backend (flutter SDK) and real frontend:
 *   backend:  FCB_SECRET=<x> uvicorn server:app --port 5000
 *   frontend: npm run dev   (NEXT_PUBLIC_API_URL=http://localhost:5000)
 */

const EMAIL = `e2e${Date.now()}@test.dev`;
const PASSWORD = "password123";

async function register(page: Page) {
  await page.goto("/");
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible({ timeout: 15_000 });

  // Switch to register mode if not defaulted there.
  const createLink = page.getByRole("button", { name: "Create an account" });
  if (await createLink.isVisible().catch(() => false)) {
    await createLink.click();
  }
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();

  await page.getByPlaceholder("you@example.com").fill(EMAIL);
  await page.getByPlaceholder("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // After registration we should land in the empty/Projects view.
  await expect(page.getByText("New Project").first()).toBeVisible({ timeout: 20_000 });
}

test("money path: register → create → edit → build → preview", async ({ page }) => {
  await register(page);

  // Create a project — flutter create runs server-side (~30-120s).
  await page.getByRole("button", { name: /new project/i }).first().click();
  await page.getByPlaceholder("My Flutter App").fill(`E2E App ${Date.now()}`);
  await page.getByRole("button", { name: "OK" }).click();

  // Project is auto-activated; wait for the file tree (main.dart) to load.
  await expect(page.getByText("main.dart").first()).toBeVisible({ timeout: 180_000 });

  // Open lib/main.dart from the tree.
  await page.getByText("lib", { exact: true }).first().click().catch(() => {});
  await page.getByText("main.dart", { exact: true }).first().dblclick().catch(async () => {
    await page.getByText("main.dart", { exact: true }).first().click();
  });

  // A Monaco editor should appear; replace its content with a marker app.
  const editor = page.locator(".monaco-editor").first();
  await editor.waitFor({ timeout: 60_000 });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(
    "import 'package:flutter/material.dart';\nvoid main() => runApp(const MaterialApp(home: Scaffold(body: Center(child: Text('E2E_MARKER')))));"
  );

  // Save via the navbar (auto-save is debounced; force an explicit save).
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText(/saved|all changes saved/i).first()).toBeVisible({ timeout: 25_000 });

  // Choose release build mode, then build.
  await page.getByText("Build", { exact: true }).first().click();
  await expect(page.getByText(/build complete|build finished/i).first()).toBeVisible({
    timeout: 300_000,
  });

  // Preview iframe should now point at /preview/...
  const previewFrame = page.locator('iframe[src*="/preview/"]').first();
  await expect(previewFrame).toBeVisible({ timeout: 30_000 });
  await expect(previewFrame).toHaveAttribute("src", /\/preview\//, { timeout: 30_000 });
});
