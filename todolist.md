# FreshStart Todo

## 状态说明

- `[ ]` 未开始
- `[~]` 进行中
- `[x]` 已完成
- `[!]` 阻塞或需人工环境

## 任务清单

- [x] 创建 `task.md` 工作指南。
- [x] 创建 `todolist.md` 任务同步表。
- [x] 创建 `test.md` 测试计划。
- [x] 搭建 React + TypeScript + Tailwind + Vite 项目骨架。
- [x] 增加 Tauri v2 项目结构和 Rust 命令接口。
- [x] 实现前端数据模型、mock backend、Tauri backend adapter。
- [x] 实现列表、搜索、统计、开关、风险确认、错误提示 UI。
- [x] 实现关闭窗口隐藏、托盘左键打开、托盘菜单退出。
- [x] 实现注册表启动项读取、禁用、恢复源码。
- [x] 实现 Startup 文件夹 `.lnk` 扫描、移动禁用、恢复源码。
- [x] 实现 SQLite 历史持久化。
- [x] 实现风险识别规则和冲突保护。
- [x] 编写业务逻辑单元测试。
- [x] 编写 React 组件测试。
- [x] 编写 Playwright UI/E2E 测试。
- [x] 盘点当前环境版本，不升级全局环境。
- [x] 将缺失依赖安装到项目目录或 E 盘隔离目录。
- [x] 运行可执行的自动化测试并记录结果。
- [x] 检查本机是否具备 Rust/Cargo；缺失后已安装到 E 盘隔离目录。
- [x] 生成 release exe。
- [x] 原生 exe 启动冒烟测试。
- [x] 最终同步 `todolist.md` 和 `test.md`。

## 当前环境记录

- 工作区：`<project-root>`
- Node：本地已可用。
- npm：依赖安装在当前项目 `node_modules`。
- Rust/Cargo：隔离安装到项目本地 `.rustup` / `.cargo`。
- Playwright 浏览器：安装到项目本地 `.ms-playwright`。
- release exe：`<project-root>\src-tauri\target\release\freshstart.exe`。

## 最终状态

- [x] 前端构建通过。
- [x] TypeScript 业务逻辑和 React 组件测试通过。
- [x] Playwright UI/E2E 测试通过。
- [x] Rust/Tauri cargo test 通过。
- [x] Tauri release exe 构建通过。
- [x] 原生 exe 启动冒烟测试通过。
- [!] MSI 安装包打包未作为交付门槛；`npm run tauri:bundle` 可能因 WiX 下载或 TLS 证书校验失败阻塞。当前交付物采用已验证的 release exe。

## 2026-06-16 修正记录

- [x] 修复关闭后刷新不更新的根因：改为 SQLite 历史库合并真实扫描结果，关闭项不会因系统入口被删除而从列表消失。
- [x] 增加 `freshstart.sqlite` 持久化：所有见过的启动项都会保留历史，下次开机后仍可显示和恢复。
- [x] 注册表项名称优化：优先解析启动命令中的 exe，并读取 Windows 版本资源 `FileDescription/ProductName` 作为实际 APP 名；读不到时回退到 exe 文件名。
- [x] UI 保留“原始项”显示，方便对应注册表值名。
- [x] release 构建增加 `windows_subsystem = "windows"`，避免正式 exe 启动时出现终端黑框。
- [x] 补充 Rust 单元测试：命令解析、`hkcmd.exe` 不误判为 `cmd.exe`、SQLite 历史保留。

## 2026-06-16 二次优化记录

- [x] 明确框架：Tauri + Rust 构建 Windows exe，React/TypeScript/Tailwind/Vite 构建界面。
- [x] 增加当前用户 32 位注册表启动入口扫描：`HKCU\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run`。
- [x] `registry:` 与 `registry32:` 分开开关和恢复，避免 32 位启动项写回错误位置。
- [x] 增加已知 APP 识别规则：百度网盘、微信、Microsoft Teams、Microsoft Edge。
- [x] 百度网盘相关组件如 `YunDetectService`、`BaiduYunDetect`、`BaiduYunGuanjia` 统一显示为“百度网盘”，原始项仍在副信息保留。
- [x] 微信路径/命令如 `Tencent\WeChat\WeChat.exe` 统一显示为“微信”。
- [x] 修正交付路径混淆：根目录 `freshstart.exe` 曾是旧版本，最新构建在 `src-tauri\target\release\freshstart.exe`。现已同步替换根目录 exe。
- [x] `npm run tauri:build` 现在会自动复制最新 release exe 到根目录 `freshstart.exe`。

## 2026-06-17 三次优化记录

- [x] 将 Startup 文件夹中的“发送至 OneNote / Send to OneNote”快捷方式识别为 `OneNote`，避免继续显示为快捷方式标题。
- [x] Startup 文件夹扫描改为复用统一的友好应用名解析逻辑，优先从快捷方式路径和命令中定位实际 APP。
- [x] 启动项路径显示改为可点击展开/收起，默认保持清爽列表。
- [x] 展开后的完整路径支持横向滚动、文本选择和复制按钮，便于用户粘贴排查。
- [x] 为路径展开和复制状态补充 React 组件测试。
- [x] 为路径展开补充 Playwright 桌面/窄屏 E2E 测试。
- [x] 修正 E2E 首屏打开方式，改为等待 DOM ready 后用标题可见性确认页面可用，减少 Vite 冷启动偶发超时。
- [x] 重新构建 release exe，并同步到项目根目录 `freshstart.exe`。

## 2026-06-21 添加开机自启记录

- [x] 新增“小白模式”添加入口：顶部 `+` 按钮展开添加面板。
- [x] 支持粘贴 exe 路径并填写可选启动参数。
- [x] 支持拖入 exe 文件尝试自动填入路径；若 WebView/浏览器无法提供真实路径，则提示手动粘贴。
- [x] 后端新增 `add_startup_item_from_path` Tauri 命令，默认写入当前用户 HKCU Run，不操作 HKLM、服务或计划任务。
- [x] 添加前校验 exe 文件必须存在、必须是文件、扩展名必须为 `.exe`。
- [x] 拒绝把 `cmd.exe`、`powershell.exe`、`rundll32.exe`、`wscript.exe` 等命令解释器/脚本宿主加入自启。
- [x] 自动读取友好应用名并生成 `FreshStart_应用名` 注册表值名；同名项存在时拒绝覆盖。
- [x] 添加成功后写入 SQLite 历史并立即刷新列表，可继续用原开关关闭/恢复。
- [x] 补充 React 组件测试、Playwright E2E 测试和 Rust 纯逻辑测试。
- [x] 重新构建 release exe，并同步到项目根目录 `freshstart.exe`。

## 2026-06-23 拖入 exe 解析修正记录

- [x] 修复桌面版拖入 exe 无法自动解析路径的问题。
- [x] 保留浏览器 `drop` 事件作为 mock/测试 fallback。
- [x] 在 Tauri 桌面环境中改用 `getCurrentWebview().onDragDropEvent` 读取真实本机文件路径。
- [x] 在 Tauri 窗口配置中显式启用 `dragDropEnabled`。
- [x] 支持 Tauri `enter` / `over` / `leave` / `drop` 状态更新拖拽提示。
- [x] 增加 `file:///C:/...` 形式路径的 Windows 规范化处理。
- [x] 重新构建 release exe，并同步到项目根目录 `freshstart.exe`。

## 2026-06-23 选择 exe 兜底记录

- [x] 新增“选择”按钮，打开原生 Windows 文件选择框定位 `.exe`。
- [x] 新增 `pick_exe_file` Tauri 命令，使用 Rust 后端返回真实本机路径。
- [x] 添加 `rfd` 依赖用于原生文件选择对话框。
- [x] 保留拖入 exe 能力，但把“选择 exe”作为更稳定的主路径。
- [x] 补充 React 组件测试，覆盖点击“选择”后填入 exe 路径。
- [x] 重新构建 release exe，并同步到项目根目录 `freshstart.exe`。
