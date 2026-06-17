import { copyFileSync, statSync } from "node:fs";
import { join } from "node:path";

const source = join(process.cwd(), "src-tauri", "target", "release", "freshstart.exe");
const target = join(process.cwd(), "freshstart.exe");

copyFileSync(source, target);

const stats = statSync(target);
console.log(`Copied release exe to ${target} (${stats.size} bytes)`);
