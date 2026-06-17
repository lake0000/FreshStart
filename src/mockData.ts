import type { DisabledRecord, StartupItem } from "./types";
import { mergeStartupSnapshot } from "./lib/items";

export const mockActiveItems: StartupItem[] = [
  {
    id: "registry:Everything",
    name: "Everything",
    rawName: "Everything",
    source: "registry",
    enabled: true,
    command: "\"C:\\Program Files\\Everything\\Everything.exe\" -startup",
    riskLevel: "normal",
  },
  {
    id: "registry:BaiduNetdisk",
    name: "BaiduNetdisk",
    rawName: "BaiduNetdisk",
    source: "registry",
    enabled: true,
    command: "\"C:\\Program Files\\BaiduNetdisk\\BaiduNetdisk.exe\"",
    riskLevel: "normal",
  },
  {
    id: "startup-folder:FreshStartTest.lnk",
    name: "FreshStartTest",
    rawName: "FreshStartTest.lnk",
    source: "startup-folder",
    enabled: true,
    path: "C:\\Users\\User\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\FreshStartTest.lnk",
    riskLevel: "normal",
  },
  {
    id: "registry:IntelHotkeys",
    name: "Intel Hotkeys",
    rawName: "IntelHotkeys",
    source: "registry",
    enabled: true,
    command: "\"C:\\Program Files\\Intel\\Hotkeys\\hkcmd.exe\"",
    riskLevel: "keep",
    riskReason: "名称包含 Intel，建议保留",
  },
];

export const mockDisabledRecords: DisabledRecord[] = [
  {
    id: "registry:Teams",
    name: "Teams",
    source: "registry",
    valueName: "Teams",
    command: "\"C:\\Users\\User\\AppData\\Local\\Microsoft\\Teams\\Update.exe\" --processStart Teams.exe",
    disabledAt: "2026-06-16T12:00:00.000Z",
  },
  {
    id: "registry:ScriptLauncher",
    name: "ScriptLauncher",
    source: "registry",
    valueName: "ScriptLauncher",
    command: "powershell.exe -ExecutionPolicy Bypass -File startup.ps1",
    disabledAt: "2026-06-16T12:30:00.000Z",
  },
];

export function createMockItems(): StartupItem[] {
  return mergeStartupSnapshot({
    active: mockActiveItems,
    disabled: mockDisabledRecords,
  });
}
