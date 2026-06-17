import { describe, expect, it } from "vitest";
import { filterStartupItems, getStartupStats, mergeStartupSnapshot, shouldConfirmBeforeToggle } from "../../src/lib/items";
import type { DisabledRecord, StartupItem } from "../../src/types";

const active: StartupItem[] = [
  {
    id: "registry:Everything",
    name: "Everything",
    source: "registry",
    enabled: true,
    command: "\"C:\\Program Files\\Everything\\Everything.exe\"",
    riskLevel: "normal",
  },
  {
    id: "startup-folder:FreshStartTest.lnk",
    name: "FreshStartTest",
    source: "startup-folder",
    enabled: true,
    path: "C:\\Startup\\FreshStartTest.lnk",
    riskLevel: "normal",
  },
];

const disabled: DisabledRecord[] = [
  {
    id: "registry:Teams",
    name: "Teams",
    source: "registry",
    valueName: "Teams",
    command: "\"C:\\Users\\User\\Teams\\Update.exe\" --processStart Teams.exe",
    disabledAt: "2026-06-16T12:00:00.000Z",
  },
  {
    id: "registry:ScriptLauncher",
    name: "ScriptLauncher",
    source: "registry",
    valueName: "ScriptLauncher",
    command: "powershell.exe -File startup.ps1",
    disabledAt: "2026-06-16T12:00:00.000Z",
  },
];

describe("startup item utilities", () => {
  it("merges active items with disabled backup records", () => {
    const items = mergeStartupSnapshot({ active, disabled });

    expect(items).toHaveLength(4);
    expect(items.find((item) => item.id === "registry:Teams")).toMatchObject({
      enabled: false,
      source: "registry",
      command: disabled[0].source === "registry" ? disabled[0].command : "",
    });
  });

  it("does not duplicate a disabled record if the item is active again", () => {
    const items = mergeStartupSnapshot({
      active: [
        ...active,
        {
          id: "registry:Teams",
          name: "Teams",
          source: "registry",
          enabled: true,
          command: "teams.exe",
          riskLevel: "normal",
        },
      ],
      disabled,
    });

    expect(items.filter((item) => item.id === "registry:Teams")).toHaveLength(1);
    expect(items.find((item) => item.id === "registry:Teams")?.enabled).toBe(true);
  });

  it("filters by name, source label, and command", () => {
    const items = mergeStartupSnapshot({ active, disabled });

    expect(filterStartupItems(items, "everything")).toHaveLength(1);
    expect(filterStartupItems(items, "启动文件夹")[0].id).toBe("startup-folder:FreshStartTest.lnk");
    expect(filterStartupItems(items, "powershell")[0].id).toBe("registry:ScriptLauncher");
  });

  it("counts enabled and disabled items", () => {
    expect(getStartupStats(mergeStartupSnapshot({ active, disabled }))).toEqual({
      enabled: 2,
      disabled: 2,
      total: 4,
    });
  });

  it("marks unknown commands and suggested keep items for confirmation", () => {
    const items = mergeStartupSnapshot({
      active: [
        {
          id: "registry:Defender",
          name: "Defender Tray",
          source: "registry",
          enabled: true,
          command: "defender.exe",
          riskLevel: "normal",
        },
        {
          id: "registry:Script",
          name: "Script",
          source: "registry",
          enabled: true,
          command: "cmd.exe /c script.bat",
          riskLevel: "normal",
        },
      ],
      disabled: [],
    });

    expect(items[0].riskLevel).toBe("keep");
    expect(items[1].riskLevel).toBe("unknown");
    expect(shouldConfirmBeforeToggle(items[0])).toBe(true);
    expect(shouldConfirmBeforeToggle({ ...items[0], enabled: false })).toBe(false);
  });

  it("does not treat hkcmd.exe as cmd.exe", () => {
    const [item] = mergeStartupSnapshot({
      active: [
        {
          id: "registry:IntelHotkeys",
          name: "Intel Hotkeys",
          source: "registry",
          enabled: true,
          command: "\"C:\\Program Files\\Intel\\Hotkeys\\hkcmd.exe\"",
          riskLevel: "normal",
        },
      ],
      disabled: [],
    });

    expect(item.riskLevel).toBe("keep");
  });
});
