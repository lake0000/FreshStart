import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { withRustEnv } from "./rust-env.mjs";

const args = process.argv.slice(2);
const command = process.platform === "win32"
  ? join(process.cwd(), ".cargo", "bin", "cargo.exe")
  : join(process.cwd(), ".cargo", "bin", "cargo");

const result = spawnSync(command, args, {
  cwd: join(process.cwd(), "src-tauri"),
  env: withRustEnv(),
  stdio: "inherit",
});

process.exit(result.status ?? 1);
