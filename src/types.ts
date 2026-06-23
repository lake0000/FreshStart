export type StartupSource = "registry" | "startup-folder";

export type RiskLevel = "normal" | "keep" | "unknown";

export interface StartupItem {
  id: string;
  name: string;
  rawName?: string;
  source: StartupSource;
  enabled: boolean;
  command?: string;
  path?: string;
  appPath?: string;
  riskLevel: RiskLevel;
  riskReason?: string;
  disabledAt?: string;
  remembered?: boolean;
}

export interface DisabledRegistryRecord {
  id: string;
  name: string;
  source: "registry";
  valueName: string;
  command: string;
  disabledAt: string;
}

export interface DisabledStartupFolderRecord {
  id: string;
  name: string;
  source: "startup-folder";
  originalPath: string;
  backupPath: string;
  disabledAt: string;
}

export type DisabledRecord = DisabledRegistryRecord | DisabledStartupFolderRecord;

export interface StartupSnapshot {
  active: StartupItem[];
  disabled: DisabledRecord[];
}

export interface StartupStats {
  enabled: number;
  disabled: number;
  total: number;
}

export interface AddStartupItemRequest {
  path: string;
  args?: string;
  name?: string;
}

export interface FreshStartBackend {
  listStartupItems(): Promise<StartupItem[]>;
  setStartupEnabled(id: string, enabled: boolean, expectedCommand?: string): Promise<StartupItem[]>;
  addStartupItemFromPath(request: AddStartupItemRequest): Promise<StartupItem[]>;
  pickExeFile(): Promise<string | null>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __FRESHSTART_BACKEND__?: FreshStartBackend;
  }
}
