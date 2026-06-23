import { expect, test, type Page } from "@playwright/test";

async function openApp(page: Page) {
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.getByRole("heading", { name: "让开机更清爽" })).toBeVisible({ timeout: 15_000 });
}

test("renders the FreshStart panel and filters items", async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole("heading", { name: "Everything" })).toBeVisible();

  await page.getByLabel("搜索启动项").fill("Teams");
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Everything" })).toBeHidden();
});

test("toggles a normal startup item", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "关闭 Everything" }).click();
  await expect(page.getByRole("button", { name: "开启 Everything" })).toBeVisible();
});

test("expands a startup path", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "展开 Everything 的路径" }).click();
  await expect(page.getByRole("button", { name: "复制 Everything 的路径" })).toBeVisible();
  await expect(page.locator("code").filter({ hasText: '"C:\\Program Files\\Everything\\Everything.exe" -startup' })).toBeVisible();
});

test("adds a startup item from an exe path", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "添加开机自启" }).click();
  await page.getByRole("button", { name: "选择" }).click();
  await expect(page.getByLabel("exe 路径")).toHaveValue("C:\\Tools\\Kimi\\Kimi.exe");
  await page.getByLabel("启动参数").fill("--startup");
  await page.getByRole("button", { name: "添加", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Kimi" })).toBeVisible();
  await expect(page.getByRole("button", { name: "展开 Kimi 的路径" })).toBeVisible();
});

test("asks for confirmation before toggling a suggested keep item", async ({ page }) => {
  await openApp(page);

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("建议保留");
    await dialog.dismiss();
  });

  await page.getByRole("button", { name: "关闭 Intel Hotkeys" }).click();
  await expect(page.getByRole("button", { name: "关闭 Intel Hotkeys" })).toBeVisible();
});

test("narrow viewport keeps key controls visible", async ({ page }) => {
  await openApp(page);

  await expect(page.getByLabel("搜索启动项")).toBeVisible();
  await expect(page.getByLabel("启动项统计")).toBeVisible();
  await expect(page.getByRole("heading", { name: "BaiduNetdisk" })).toBeVisible();
});
