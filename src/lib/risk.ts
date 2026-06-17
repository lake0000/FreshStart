import type { RiskLevel, StartupItem } from "../types";

const UNKNOWN_COMMANDS = ["cmd.exe", "powershell.exe", "rundll32.exe", "wscript.exe"];
const KEEP_NAMES = ["Lenovo", "Intel", "Realtek", "Defender", "Security", "Hotkeys"];

export function classifyRisk(input: Pick<StartupItem, "name" | "command">): {
  riskLevel: RiskLevel;
  riskReason?: string;
} {
  const command = input.command?.toLowerCase() ?? "";
  const matchedCommand = UNKNOWN_COMMANDS.find((entry) => includesExecutable(command, entry));
  if (matchedCommand) {
    return {
      riskLevel: "unknown",
      riskReason: `命令包含 ${matchedCommand}，启动方式不明确`,
    };
  }

  const matchedName = KEEP_NAMES.find((entry) => input.name.toLowerCase().includes(entry.toLowerCase()));
  if (matchedName) {
    return {
      riskLevel: "keep",
      riskReason: `名称包含 ${matchedName}，建议保留`,
    };
  }

  return { riskLevel: "normal" };
}

function includesExecutable(command: string, executable: string): boolean {
  const escaped = executable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[\\\\/"'\\s])${escaped}($|[\\\\/"'\\s-])`, "i");
  return pattern.test(command);
}
