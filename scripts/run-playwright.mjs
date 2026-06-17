import { spawnSync } from "node:child_process";
import { join } from "node:path";

process.env.PLAYWRIGHT_BROWSERS_PATH = join(process.cwd(), ".ms-playwright");

const args = process.argv.slice(2);
if (args[0] === "test" && !args.some((arg) => arg === "--config" || arg.startsWith("--config="))) {
  args.splice(1, 0, "--config", "config/playwright.config.ts");
}
const command = process.platform === "win32"
  ? join(process.cwd(), "node_modules", ".bin", "playwright.cmd")
  : join(process.cwd(), "node_modules", ".bin", "playwright");
const result = spawnSync(command, args, {
  cwd: process.cwd(),
  env: process.env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

process.exit(result.status ?? 1);
