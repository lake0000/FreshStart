# FreshStart 工作指南

## 目标

实现一个轻量、清爽、可恢复的 Windows 当前用户开机自启开关面板。第一阶段只管理：

- `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`

不管理 `HKLM`、服务、驱动、计划任务、系统组件、进程、网络、关机、Clash 或任何会让开发环境失联的行为。

## 需求评审

FreshStart 的边界应保持清晰：只处理当前用户可恢复的启动入口，并且任何关闭/恢复动作都必须可以回滚。

实现时需要遵守：

1. 注册表禁用必须防止误删：删除前重新读取当前值，确认和扫描值一致；如果值已变化，拒绝操作并提示刷新。
2. 恢复必须防冲突：`HKCU Run` 同名值已存在时不覆盖；Startup 文件夹同名 `.lnk` 已存在时不覆盖。
3. 备份文件名必须防碰撞：禁用 `.lnk` 时保留原始路径，并在备份区生成唯一文件名。
4. 本地状态写入需要可靠持久化，当前实现使用 SQLite 保留历史记录。
5. 启动项 ID 要稳定：注册表使用 `registry:<valueName>`，Startup 文件夹使用 `startup-folder:<fileName>`。
6. “建议保留”和“未知启动方式”不是硬禁用，但关闭前必须二次确认。
7. 自动化测试只允许使用隔离测试数据；涉及真实注册表和 Startup 文件夹的验证只允许创建、操作并清理专用 `FreshStartTest` 项。

## 技术方案

前端：
- React + TypeScript
- Tailwind CSS
- Vite
- Vitest + Testing Library
- Playwright UI/E2E

桌面壳与系统能力：
- Tauri v2
- Rust 命令层负责 Windows API/文件系统操作
- 前端通过 `@tauri-apps/api/core.invoke` 调用后端
- 浏览器开发和测试环境使用 mock backend，不触碰真实系统启动项

数据模型：
- `StartupItem`
- `DisabledRecord`
- SQLite 历史库保留曾见过和已禁用的启动项

## 实现原则

- UI 首屏就是工具面板，不做营销页。
- 打开时先展示 mock 或缓存数据，再刷新真实状态。
- 所有开关操作后重新扫描并以真实状态为准。
- 失败必须返回可读错误，不静默吞掉。
- 不提取真实软件图标，使用应用首字母圆形图标。
- 不执行任何会导致关机、断网、断 Clash、修改系统级启动入口的测试。
- 不升级或替换全局开发环境版本。缺失依赖优先安装在项目目录或 E 盘隔离目录。

## 验收标准

- 能展示注册表、Startup 文件夹和已禁用备份合并后的列表。
- 搜索能按名称、来源、命令过滤。
- 开关关闭后项目仍保留在列表中，状态为关闭。
- 开关恢复时按备份恢复，不猜测命令或路径。
- 保护项关闭前需要确认。
- 冲突时不覆盖用户已有项。
- 前端单元测试、组件测试、浏览器 UI 测试全部通过。
- Rust/Tauri 测试和 release 构建在本机环境可用时通过。
