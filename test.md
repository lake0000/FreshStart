# FreshStart 测试计划

## 禁止测试范围

以下行为不允许自动化执行：
- 关机、重启、注销。
- 断网、禁用网卡、修改代理、关闭或断开 Clash。
- 修改 `HKLM`、Services、Drivers、Scheduled Tasks、System32。
- 对真实常用软件启动项做 destructive 测试。

## 自动化测试

### TypeScript 业务逻辑

覆盖：
- 系统扫描结果和禁用备份记录合并。
- 注册表项关闭后仍显示为可恢复。
- Startup 文件夹项关闭后仍显示为可恢复。
- 搜索过滤名称、来源和命令。
- 统计启用/关闭数量。
- 风险识别：`cmd.exe`、`powershell.exe`、`rundll32.exe`、`wscript.exe` 标为未知启动方式。
- 建议保留：`Lenovo`、`Intel`、`Realtek`、`Defender`、`Security`、`Hotkeys` 标为建议保留。

命令：
```powershell
npm run test:unit
```

### React 组件测试

覆盖：
- 渲染启动项列表。
- 搜索过滤。
- 点击普通项开关直接调用 backend。
- 点击风险项先弹确认。
- backend 报错时显示错误消息并回滚加载态。

命令：
```powershell
npm run test:unit
```

### Playwright UI/E2E

覆盖：
- 首屏面板布局可见。
- 搜索框过滤结果。
- 普通启动项开关可切换。
- 风险启动项出现确认对话框。
- 窄屏视口无文本重叠。

命令：
```powershell
npm run test:e2e
```

## Rust/Tauri 测试

目标覆盖：
- SQLite 历史库读写。
- 禁用记录合并。
- 注册表写回前冲突检测。
- Startup 文件夹恢复前同名冲突检测。
- 备份文件名唯一化。

命令：
```powershell
npm run tauri:test
npm run tauri:build
```

## 手动验收测试

仅允许使用专用测试项：

### 注册表测试

测试项：
- 名称：`FreshStartTest`
- 命令：`notepad.exe`
- 位置：`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`

验收：
- FreshStart 显示 `FreshStartTest` 为开启。
- 点击关闭后，注册表项被移除，SQLite 有记录，UI 仍显示为关闭。
- 点击开启后，注册表项恢复，UI 显示为开启。
- 测试结束后清理 `FreshStartTest`。

### Startup 文件夹测试

测试项：
- 在当前用户 Startup 文件夹放置 `FreshStartTest.lnk`。

验收：
- FreshStart 显示来源为 Startup 文件夹。
- 点击关闭后 `.lnk` 移到 FreshStart disabled 目录，UI 显示关闭。
- 点击开启后 `.lnk` 移回原位置，UI 显示开启。
- 测试结束后清理 `FreshStartTest.lnk` 和对应备份。

## 测试结果

- 前端构建、单元测试、E2E 测试、Rust/Tauri 测试和 release exe 冒烟测试此前均已通过。
- 未执行真实常用软件启动项关闭/恢复破坏性测试。
- 未执行关机、断网、关闭 Clash、系统级注册表、服务、驱动、计划任务相关测试。

## 2026-06-16 修正后测试结果

- `npm run build`
  - 通过。
- `npm run test:unit`
  - 2 个测试文件通过。
  - 11 个前端/业务用例通过。
- `npm run test:e2e`
  - 8 个 Playwright 用例通过。
  - 覆盖桌面和窄屏视口、首屏、搜索、普通项开关、建议保留项确认、关键控件可见性。
- `npm run tauri:test`
  - 4 个 Rust 单元测试通过。
  - 覆盖命令路径解析、风险识别边界、SQLite 历史保留。
- `npm run tauri:build`
  - 通过。
  - 产物：`<project-root>\src-tauri\target\release\freshstart.exe`。
- release exe 冒烟测试
  - 通过。
  - 进程保持运行 5 秒，随后已停止。

说明：
- 未执行真实启动项关闭/恢复破坏性测试。
- SQLite 数据库位置为当前用户应用数据目录下的 `FreshStart\freshstart.sqlite`。
- 旧 `state.json` 会在 SQLite 为空时自动迁移一次。

## 2026-06-16 二次优化测试结果

- `npm run test:unit`
  - 通过。
  - 11 个前端/业务用例通过。
- `npm run test:e2e`
  - 通过。
  - 8 个 Playwright 用例通过。
- `npm run tauri:test`
  - 通过。
  - 7 个 Rust 用例通过。
  - 新增覆盖：百度网盘组件识别、微信路径识别、`registry32:` 路径选择。
- `npm run tauri:build`
  - 通过。
  - 产物：`<project-root>\src-tauri\target\release\freshstart.exe`。
- release exe 冒烟测试
  - 通过。
  - 启动后保持运行 5 秒，随后已停止。
- 根目录 exe 同步验证
  - 通过。
  - 已停止旧进程并将 `src-tauri\target\release\freshstart.exe` 复制到项目根目录 `freshstart.exe`。
  - `npm run tauri:build` 已验证会自动执行复制。

说明：

- 仍保持第一阶段安全边界：不扫描/操作 HKLM、服务、驱动、计划任务。
- 新增扫描仅限当前用户 32 位注册表 Run 入口。

## 2026-06-17 三次优化测试结果

- `npm run build`
  - 通过。
  - Vite 生产构建成功。
- `npm run test:unit`
  - 通过。
  - 2 个测试文件通过。
  - 12 个前端/业务用例通过。
  - 新增覆盖：启动项完整路径展开、复制按钮状态。
- `npm run test:e2e`
  - 通过。
  - 10 个 Playwright 用例通过。
  - 新增覆盖：桌面和窄屏视口下展开启动项完整路径。
  - E2E 打开页面逻辑已调整为 `domcontentloaded` + 首屏标题可见，避免 Vite 冷启动时等待完整 `load` 偶发超时。
- `npm run tauri:test`
  - 通过。
  - 8 个 Rust 用例通过。
  - 新增覆盖：`发送至 OneNote` / `Send to OneNote` 识别为 `OneNote`。
- `npm run tauri:build`
  - 通过。
  - 产物：`<project-root>\src-tauri\target\release\freshstart.exe`。
  - 已自动同步到：`<project-root>\freshstart.exe`。
- 根目录 exe 冒烟测试
  - 通过。
  - `<project-root>\freshstart.exe` 启动后保持运行 5 秒，随后已停止。

说明：

- 未执行关机、断网、关闭 Clash、系统级注册表、服务、驱动、计划任务相关测试。
- 未对真实常用软件启动项做破坏性关闭/恢复测试；自动化验证均使用 mock、组件测试、E2E UI 和 Rust 单元测试完成。

## 2026-06-21 添加开机自启测试结果

- `npm run build`
  - 通过。
  - TypeScript 与 Vite 生产构建成功。
- `npm run test:unit`
  - 通过。
  - 2 个测试文件通过。
  - 13 个前端/业务用例通过。
  - 新增覆盖：添加面板输入 exe 路径和启动参数后调用 backend，并在列表展示新启动项。
- `npm run test:e2e`
  - 通过。
  - 12 个 Playwright 用例通过。
  - 新增覆盖：桌面和窄屏视口下添加 exe 路径为开机自启项。
- `npm run tauri:test`
  - 通过。
  - 11 个 Rust 用例通过。
  - 新增覆盖：启动命令构造、注册表值名清理、拒绝高风险命令解释器。
- `npm run tauri:build`
  - 通过。
  - 产物：`<project-root>\src-tauri\target\release\freshstart.exe`。
  - 已自动同步到：`<project-root>\freshstart.exe`。
- 根目录 exe 冒烟测试
  - 通过。
  - `<project-root>\freshstart.exe` 启动后保持运行 5 秒，随后已停止。

说明：

- 未执行真实注册表添加测试，避免把测试程序实际加入当前用户开机自启。
- 自动化测试使用 mock backend、组件测试、E2E UI 和 Rust 纯逻辑测试完成。
- 新增功能仍保持安全边界：只支持当前用户 HKCU Run，不操作 HKLM、服务、驱动、计划任务。

## 2026-06-23 拖入 exe 解析修正测试结果

- `npm run build`
  - 通过。
  - TypeScript 与 Vite 生产构建成功。
- `npm run test:unit`
  - 通过。
  - 2 个测试文件通过。
  - 13 个前端/业务用例通过。
- `npm run test:e2e`
  - 12 个 Playwright 用例均输出通过状态。
  - 当前环境下 Playwright/Windows dev-server 回收阶段未正常退出，命令被外层超时截断；未出现断言失败。
- `npm run tauri:build`
  - Tauri release 构建通过。
  - 初次复制根目录 exe 时旧 `freshstart.exe` 正在运行导致 `EBUSY`。
  - 已确认占用进程路径为 `<project-root>\freshstart.exe` 后停止该进程，并成功同步最新 exe。
- Tauri 配置验证
  - 通过。
  - `dragDropEnabled` 已被 release 构建接受。
- 根目录 exe
  - 已更新为最新构建：`<project-root>\freshstart.exe`。
- 根目录 exe 冒烟测试
  - 通过。
  - `<project-root>\freshstart.exe` 启动后保持运行 5 秒，随后已停止。

说明：

- 本轮修复主要针对 Tauri 桌面文件拖放事件，自动化环境无法真实模拟 Windows Explorer 拖入 exe 到 WebView。
- 保留了浏览器 drop fallback，Tauri 桌面版使用 `getCurrentWebview().onDragDropEvent` 获取真实路径。

## 2026-06-23 选择 exe 兜底测试结果

- `npm run build`
  - 通过。
  - TypeScript 与 Vite 生产构建成功。
- `npm run test:unit`
  - 通过。
  - 2 个测试文件通过。
  - 14 个前端/业务用例通过。
  - 新增覆盖：点击“选择”按钮后由 backend 返回 exe 路径并填入输入框。
- `npm run tauri:test`
  - 通过。
  - 11 个 Rust 用例通过。
  - 首次运行需要下载新增 Rust 依赖 `rfd`。
- `npm run tauri:build`
  - Tauri release 构建通过。
  - 初次复制根目录 exe 时旧 `freshstart.exe` 正在运行导致 `EBUSY`。
  - 已确认占用进程路径为 `<project-root>\freshstart.exe` 后停止该进程，并成功同步最新 exe。
- 根目录 exe 冒烟测试
  - 通过。
  - `<project-root>\freshstart.exe` 启动后保持运行 5 秒，随后已停止。

说明：

- 新增“选择”按钮作为拖放不可用时的稳定主路径，打开原生 Windows 文件选择框，不依赖浏览器文件拖放路径暴露。
