import type { AddStartupItemRequest, FreshStartBackend, StartupItem } from "./types";
import { createMockItems } from "./mockData";

function createMockBackend(): FreshStartBackend {
  let items = createMockItems();

  return {
    async listStartupItems() {
      await delay(80);
      return clone(items);
    },
    async setStartupEnabled(id: string, enabled: boolean) {
      await delay(120);
      items = items.map((item) => (item.id === id ? { ...item, enabled } : item));
      return clone(items);
    },
    async addStartupItemFromPath(request: AddStartupItemRequest) {
      await delay(140);
      const name = request.name?.trim() || appNameFromPath(request.path);
      const command = `"${request.path.trim().replace(/^["']|["']$/g, "")}"${request.args?.trim() ? ` ${request.args.trim()}` : ""}`;
      const id = `registry:FreshStart_${name}`;
      if (items.some((item) => item.id === id)) {
        throw new Error("同名开机启动项已存在，已拒绝覆盖");
      }
      items = [
        {
          id,
          name,
          rawName: `FreshStart_${name}`,
          source: "registry",
          enabled: true,
          command,
          appPath: request.path,
          riskLevel: "normal",
        },
        ...items,
      ];
      return clone(items);
    },
    async pickExeFile() {
      await delay(80);
      return "C:\\Tools\\Kimi\\Kimi.exe";
    },
  };
}

function createTauriBackend(): FreshStartBackend {
  return {
    async listStartupItems() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<StartupItem[]>("list_startup_items");
    },
    async setStartupEnabled(id: string, enabled: boolean, expectedCommand?: string) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<StartupItem[]>("set_startup_enabled", { id, enabled, expectedCommand });
    },
    async addStartupItemFromPath(request: AddStartupItemRequest) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<StartupItem[]>("add_startup_item_from_path", { request });
    },
    async pickExeFile() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<string | null>("pick_exe_file");
    },
  };
}

export function getBackend(): FreshStartBackend {
  if (window.__FRESHSTART_BACKEND__) {
    return window.__FRESHSTART_BACKEND__;
  }

  if (window.__TAURI_INTERNALS__) {
    return createTauriBackend();
  }

  return createMockBackend();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function appNameFromPath(path: string) {
  const normalized = path.trim().replace(/^["']|["']$/g, "").replace(/\\/g, "/");
  const fileName = normalized.split("/").filter(Boolean).pop() || "新启动项";
  return fileName.replace(/\.exe$/i, "") || "新启动项";
}
