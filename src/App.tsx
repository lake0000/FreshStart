import { AlertTriangle, Check, ChevronDown, ChevronRight, Copy, Loader2, Plus, Power, RefreshCw, Search, ShieldAlert, X } from "lucide-react";
import type { DragEvent, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getBackend } from "./backend";
import { filterStartupItems, getStartupStats, shouldConfirmBeforeToggle } from "./lib/items";
import type { StartupItem } from "./types";

const sourceLabels: Record<StartupItem["source"], string> = {
  registry: "注册表",
  "startup-folder": "启动文件夹",
};

export default function App() {
  const backend = useMemo(() => getBackend(), []);
  const [items, setItems] = useState<StartupItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [expandedPathIds, setExpandedPathIds] = useState<Set<string>>(() => new Set());
  const [copiedPathId, setCopiedPathId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addPath, setAddPath] = useState("");
  const [addArgs, setAddArgs] = useState("");
  const [adding, setAdding] = useState(false);
  const [pickingExe, setPickingExe] = useState(false);
  const [draggingExe, setDraggingExe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(
    async (mode: "initial" | "refresh" = "refresh") => {
      setError(null);
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        setItems(await backend.listStartupItems());
      } catch (err) {
        setError(toErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [backend],
  );

  useEffect(() => {
    void loadItems("initial");
  }, [loadItems]);

  const filteredItems = useMemo(() => filterStartupItems(items, query), [items, query]);
  const stats = useMemo(() => getStartupStats(items), [items]);

  const handleDroppedPath = useCallback((value: string) => {
    const path = normalizeDroppedPath(value);
    if (!path) {
      setError("没有读取到完整文件路径，请直接粘贴 exe 路径");
      return;
    }
    if (!path.toLowerCase().endsWith(".exe")) {
      setError("当前只支持添加 .exe 程序");
      return;
    }
    setAddPath(path);
    setAddOpen(true);
    setError(null);
  }, []);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) {
      return;
    }

    let unlisten: (() => void) | undefined;
    let disposed = false;

    void import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === "enter" || payload.type === "over") {
            setDraggingExe(true);
            return;
          }
          if (payload.type === "leave") {
            setDraggingExe(false);
            return;
          }
          setDraggingExe(false);
          handleDroppedPath(payload.paths[0] ?? "");
        }),
      )
      .then((handler) => {
        if (disposed) {
          handler();
        } else {
          unlisten = handler;
        }
      })
      .catch(() => {
        setDraggingExe(false);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [handleDroppedPath]);

  async function handleToggle(item: StartupItem) {
    const nextEnabled = !item.enabled;
    setError(null);

    if (shouldConfirmBeforeToggle(item)) {
      const ok = window.confirm(`${item.name} 被标记为「${riskLabel(item)}」。确定要关闭它吗？`);
      if (!ok) {
        return;
      }
    }

    setPendingId(item.id);
    try {
      setItems(await backend.setStartupEnabled(item.id, nextEnabled, item.command ?? item.path));
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setPendingId(null);
    }
  }

  function togglePath(id: string) {
    setExpandedPathIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function copyPath(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedPathId(id);
      window.setTimeout(() => setCopiedPathId((current) => (current === id ? null : current)), 1400);
    } catch {
      setError("复制失败，请手动选择路径后复制");
    }
  }

  async function handleAddSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = addPath.trim();
    if (!path) {
      setError("请先输入或拖入 exe 路径");
      return;
    }

    setError(null);
    setAdding(true);
    try {
      setItems(await backend.addStartupItemFromPath({ path, args: addArgs.trim() || undefined }));
      setAddOpen(false);
      setAddPath("");
      setAddArgs("");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  async function handlePickExe() {
    setError(null);
    setPickingExe(true);
    try {
      const path = await backend.pickExeFile();
      if (path) {
        handleDroppedPath(path);
      }
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setPickingExe(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDraggingExe(false);
    const file = event.dataTransfer.files.item(0);
    const path = file ? filePathFromDrop(file) : event.dataTransfer.getData("text/plain");
    handleDroppedPath(path);
  }

  return (
    <main
      className="shell"
      aria-label="FreshStart 自启管理面板"
      onDragOver={(event) => {
        event.preventDefault();
        setDraggingExe(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setDraggingExe(false);
        }
      }}
      onDrop={handleDrop}
    >
      <section className="panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">FreshStart</p>
            <h1>让开机更清爽</h1>
          </div>
          <div className="headerActions">
            <button className="iconButton" type="button" aria-label="添加开机自启" onClick={() => setAddOpen((value) => !value)}>
              <Plus size={18} />
            </button>
            <button className="iconButton" type="button" aria-label="刷新启动项" onClick={() => void loadItems()}>
              {refreshing ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            </button>
          </div>
        </header>

        <div className="searchRow">
          <Search size={17} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索启动项"
            aria-label="搜索启动项"
          />
          {query ? (
            <button className="clearButton" type="button" aria-label="清空搜索" onClick={() => setQuery("")}>
              <X size={16} />
            </button>
          ) : null}
        </div>

        <div className="summary" aria-label="启动项统计">
          <span>
            已启用 <strong>{stats.enabled}</strong>
          </span>
          <span>
            已关闭 <strong>{stats.disabled}</strong>
          </span>
          <span>
            总计 <strong>{stats.total}</strong>
          </span>
        </div>

        {addOpen ? (
          <form
            className={draggingExe ? "addPanel dragging" : "addPanel"}
            aria-label="添加开机自启"
            onSubmit={(event) => void handleAddSubmit(event)}
          >
            <div className="addPanelHeader">
              <strong>添加开机自启</strong>
              <button className="clearButton" type="button" aria-label="关闭添加面板" onClick={() => setAddOpen(false)}>
                <X size={15} />
              </button>
            </div>
            <label className="fieldLabel">
              exe 路径
              <span className="pathInputRow">
                <input
                  value={addPath}
                  onChange={(event) => setAddPath(event.target.value)}
                  placeholder={'例如 "C:\\Program Files\\App\\App.exe"'}
                  aria-label="exe 路径"
                />
                <button className="secondaryButton" type="button" onClick={() => void handlePickExe()} disabled={pickingExe}>
                  {pickingExe ? <Loader2 className="spin" size={14} /> : null}
                  选择
                </button>
              </span>
            </label>
            <label className="fieldLabel">
              启动参数
              <input
                value={addArgs}
                onChange={(event) => setAddArgs(event.target.value)}
                placeholder="可选，例如 --startup"
                aria-label="启动参数"
              />
            </label>
            <div className="dropHint">推荐点击“选择”定位 exe；拖入 exe 会继续尝试自动填入</div>
            <button className="primaryButton" type="submit" disabled={adding}>
              {adding ? <Loader2 className="spin" size={15} /> : <Plus size={15} />}
              添加
            </button>
          </form>
        ) : draggingExe ? (
          <div className="dropOverlay">松开后填入 exe 路径</div>
        ) : null}

        {error ? (
          <div className="notice" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="list" aria-live="polite">
          {loading ? (
            <div className="emptyState">
              <Loader2 className="spin" size={20} />
              <span>正在读取启动项</span>
            </div>
          ) : null}

          {!loading && filteredItems.length === 0 ? <div className="emptyState">没有匹配的启动项</div> : null}

          {!loading
            ? filteredItems.map((item) => {
                const commandText = item.command ?? item.path;
                const isPathExpanded = expandedPathIds.has(item.id);
                return (
                <article className={isPathExpanded ? "itemRow expanded" : "itemRow"} key={item.id}>
                  <div className="avatar" aria-hidden="true">
                    {getInitial(item.name)}
                  </div>
                  <div className="itemMain">
                    <div className="itemTitleRow">
                      <h2>{item.name}</h2>
                      <span className={item.enabled ? "status enabled" : "status disabled"}>
                        {item.enabled ? "开启" : "关闭"}
                      </span>
                    </div>
                    <div className="metaLine">
                      <span>{sourceLabels[item.source]}</span>
                      {item.rawName && item.rawName !== item.name ? <span className="rawName">原始项: {item.rawName}</span> : null}
                      {!item.enabled && item.remembered ? <span className="memoryTag">已记住</span> : null}
                      {item.riskLevel !== "normal" ? (
                        <span className={`risk ${item.riskLevel}`}>
                          <ShieldAlert size={13} />
                          {riskLabel(item)}
                        </span>
                      ) : null}
                    </div>
                    {commandText ? (
                      <div className="pathBlock">
                        <button
                          className="pathToggle"
                          type="button"
                          aria-expanded={isPathExpanded}
                          aria-label={`${isPathExpanded ? "收起" : "展开"} ${item.name} 的路径`}
                          onClick={() => togglePath(item.id)}
                        >
                          {isPathExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          <span className={isPathExpanded ? "pathText expanded" : "pathText"} title={commandText}>
                            {commandText}
                          </span>
                        </button>
                        {isPathExpanded ? (
                          <div className="pathExpanded">
                            <code>{commandText}</code>
                            <button
                              className="copyButton"
                              type="button"
                              aria-label={`复制 ${item.name} 的路径`}
                              onClick={() => void copyPath(item.id, commandText)}
                            >
                              <Copy size={13} />
                              {copiedPathId === item.id ? "已复制" : "复制"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <button
                    className={item.enabled ? "toggle on" : "toggle"}
                    type="button"
                    aria-label={`${item.enabled ? "关闭" : "开启"} ${item.name}`}
                    aria-pressed={item.enabled}
                    disabled={pendingId === item.id}
                    onClick={() => void handleToggle(item)}
                  >
                    {pendingId === item.id ? <Loader2 className="spin" size={15} /> : item.enabled ? <Check size={15} /> : <Power size={15} />}
                  </button>
                </article>
                );
              })
            : null}
        </div>
      </section>
    </main>
  );
}

function filePathFromDrop(file: File) {
  const maybePath = file as File & { path?: string; webkitRelativePath?: string };
  return maybePath.path || maybePath.webkitRelativePath || "";
}

function normalizeDroppedPath(value: string) {
  const trimmed = value.trim().replace(/^file:\/\//i, "");
  try {
    return normalizeWindowsFileUriPath(decodeURIComponent(trimmed));
  } catch {
    return normalizeWindowsFileUriPath(trimmed);
  }
}

function normalizeWindowsFileUriPath(value: string) {
  return value.replace(/^\/([a-zA-Z]:[\\/])/, "$1");
}

function riskLabel(item: StartupItem) {
  if (item.riskLevel === "keep") {
    return "建议保留";
  }
  if (item.riskLevel === "unknown") {
    return "未知启动方式";
  }
  return "普通";
}

function getInitial(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

function toErrorMessage(err: unknown) {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  return "操作失败，请刷新后重试";
}
