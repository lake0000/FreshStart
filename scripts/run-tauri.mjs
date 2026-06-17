import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { withRustEnv } from "./rust-env.mjs";

const args = process.argv.slice(2);
const command = process.platform === "win32"
  ? join(process.cwd(), "node_modules", ".bin", "tauri.cmd")
  : join(process.cwd(), "node_modules", ".bin", "tauri");

const result = spawnSync(command, args, {
  cwd: process.cwd(),
  env: withRustEnv(),
  shell: process.platform === "win32",
  stdio: "inherit",
});

process.exit(result.status ?? 1);
