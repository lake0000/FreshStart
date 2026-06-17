import type { DisabledRecord, StartupItem, StartupSnapshot, StartupStats } from "../types";
import { classifyRisk } from "./risk";

export function recordToDisabledItem(record: DisabledRecord): StartupItem {
  const base = {
    id: record.id,
    name: record.name,
    source: record.source,
    enabled: false,
    disabledAt: record.disabledAt,
  } satisfies Partial<StartupItem>;

  if (record.source === "registry") {
    const risk = classifyRisk({ name: record.name, command: record.command });
    return {
      ...base,
      command: record.command,
      riskLevel: risk.riskLevel,
      riskReason: risk.riskReason,
    } as StartupItem;
  }

  const risk = classifyRisk({ name: record.name, command: record.originalPath });
  return {
    ...base,
    path: record.originalPath,
    command: record.originalPath,
    riskLevel: risk.riskLevel,
    riskReason: risk.riskReason,
  } as StartupItem;
}

export function mergeStartupSnapshot(snapshot: StartupSnapshot): StartupItem[] {
  const active = snapshot.active.map((item) => ({
    ...item,
    enabled: true,
    ...classifyRisk(item),
  }));
  const activeIds = new Set(active.map((item) => item.id));
  const disabled = snapshot.disabled
    .filter((record) => !activeIds.has(record.id))
    .map(recordToDisabledItem);

  return [...active, ...disabled].sort((a, b) => {
    if (a.enabled !== b.enabled) {
      return a.enabled ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });
}

export function filterStartupItems(items: StartupItem[], query: string): StartupItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return items;
  }

  return items.filter((item) => {
    const haystack = [
      item.name,
      item.rawName,
      item.source === "registry" ? "注册表 registry" : "启动文件夹 startup folder",
      item.command,
      item.path,
      item.appPath,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

export function getStartupStats(items: StartupItem[]): StartupStats {
  const enabled = items.filter((item) => item.enabled).length;
  const disabled = items.length - enabled;
  return {
    enabled,
    disabled,
    total: items.length,
  };
}

export function shouldConfirmBeforeToggle(item: StartupItem): boolean {
  return item.enabled && item.riskLevel !== "normal";
}
