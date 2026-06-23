import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import type { FreshStartBackend, StartupItem } from "../../src/types";

const baseItems: StartupItem[] = [
  {
    id: "registry:Everything",
    name: "Everything",
    source: "registry",
    enabled: true,
    command: "everything.exe",
    riskLevel: "normal",
  },
  {
    id: "registry:IntelHotkeys",
    name: "Intel Hotkeys",
    source: "registry",
    enabled: true,
    command: "intel.exe",
    riskLevel: "keep",
    riskReason: "名称包含 Intel，建议保留",
  },
  {
    id: "registry:Teams",
    name: "Teams",
    source: "registry",
    enabled: false,
    command: "teams.exe",
    riskLevel: "normal",
  },
];

let writeTextMock: ReturnType<typeof vi.fn>;

function installBackend(overrides: Partial<FreshStartBackend> = {}) {
  let items = structuredClone(baseItems);
  const backend: FreshStartBackend = {
    listStartupItems: vi.fn(async () => structuredClone(items)),
    setStartupEnabled: vi.fn(async (id, enabled) => {
      items = items.map((item) => (item.id === id ? { ...item, enabled } : item));
      return structuredClone(items);
    }),
    addStartupItemFromPath: vi.fn(async (request) => {
      const name = request.name || "Kimi";
      items = [
        {
          id: `registry:FreshStart_${name}`,
          name,
          rawName: `FreshStart_${name}`,
          source: "registry",
          enabled: true,
          command: `"${request.path}"${request.args ? ` ${request.args}` : ""}`,
          appPath: request.path,
          riskLevel: "normal",
        },
        ...items,
      ];
      return structuredClone(items);
    }),
    pickExeFile: vi.fn(async () => "C:\\Tools\\Kimi\\Kimi.exe"),
    ...overrides,
  };
  window.__FRESHSTART_BACKEND__ = backend;
  return backend;
}

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    writeTextMock = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock,
      },
    });
  });

  afterEach(() => {
    delete window.__FRESHSTART_BACKEND__;
  });

  it("renders the panel, items, and summary", async () => {
    installBackend();

    render(<App />);

    expect(await screen.findByText("Everything")).toBeInTheDocument();
    expect(screen.getByText("Intel Hotkeys")).toBeInTheDocument();
    expect(screen.getByLabelText("启动项统计")).toHaveTextContent("已启用 2");
    expect(screen.getByLabelText("启动项统计")).toHaveTextContent("已关闭 1");
  });

  it("filters startup items from the search box", async () => {
    installBackend();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Everything");
    await user.type(screen.getByLabelText("搜索启动项"), "Teams");

    expect(screen.getByText("Teams")).toBeInTheDocument();
    expect(screen.queryByText("Everything")).not.toBeInTheDocument();
  });

  it("toggles a normal item directly", async () => {
    const backend = installBackend();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Everything");
    await user.click(screen.getByRole("button", { name: "关闭 Everything" }));

    await waitFor(() => {
      expect(backend.setStartupEnabled).toHaveBeenCalledWith("registry:Everything", false, "everything.exe");
    });
    const row = screen.getByText("Everything").closest("article");
    expect(row).not.toBeNull();
    expect(within(row!).getByText("关闭")).toBeInTheDocument();
  });

  it("asks for confirmation before disabling a protected item", async () => {
    const backend = installBackend();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Intel Hotkeys");
    await user.click(screen.getByRole("button", { name: "关闭 Intel Hotkeys" }));

    expect(confirm).toHaveBeenCalled();
    expect(backend.setStartupEnabled).not.toHaveBeenCalled();
  });

  it("shows backend errors", async () => {
    installBackend({
      setStartupEnabled: vi.fn(async () => {
        throw new Error("同名启动项已存在，已拒绝覆盖");
      }),
    });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Everything");
    await user.click(screen.getByRole("button", { name: "关闭 Everything" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("同名启动项已存在");
  });

  it("expands and copies a startup command", async () => {
    installBackend();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Everything");
    await user.click(screen.getByRole("button", { name: "展开 Everything 的路径" }));
    await user.click(screen.getByRole("button", { name: "复制 Everything 的路径" }));

    expect(screen.getByRole("button", { name: "复制 Everything 的路径" })).toHaveTextContent("已复制");
  });

  it("adds an exe path as a startup item", async () => {
    const backend = installBackend();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Everything");
    await user.click(screen.getByRole("button", { name: "添加开机自启" }));
    await user.type(screen.getByLabelText("exe 路径"), "C:\\Tools\\Kimi\\Kimi.exe");
    await user.type(screen.getByLabelText("启动参数"), "--startup");
    await user.click(screen.getByRole("button", { name: "添加" }));

    await waitFor(() => {
      expect(backend.addStartupItemFromPath).toHaveBeenCalledWith({
        path: "C:\\Tools\\Kimi\\Kimi.exe",
        args: "--startup",
      });
    });
    expect(await screen.findByText("Kimi")).toBeInTheDocument();
  });

  it("fills the exe path from the native picker", async () => {
    const backend = installBackend();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Everything");
    await user.click(screen.getByRole("button", { name: "添加开机自启" }));
    await user.click(screen.getByRole("button", { name: "选择" }));

    await waitFor(() => {
      expect(backend.pickExeFile).toHaveBeenCalled();
    });
    expect(screen.getByLabelText("exe 路径")).toHaveValue("C:\\Tools\\Kimi\\Kimi.exe");
  });
});
