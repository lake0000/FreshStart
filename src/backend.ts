import type { FreshStartBackend, StartupItem } from "./types";
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
