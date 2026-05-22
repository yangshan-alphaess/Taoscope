## Context

Taoscope 仓库目前只有 OpenSpec 脚手架，没有任何源码。后续 change 都会向 `src/` 与 `src-tauri/` 写入业务代码（连接管理、Schema 浏览、SQL Console 等）。如果没有先把"工程结构 + 主题 + 布局骨架"立起来，每个后续 change 都会反复重做布局或散落定义全局样式，最终风格难收敛。

本 change 因此专注于：**搭好可运行的壳，定下视觉语言**。不引入任何业务逻辑、不接任何数据。

## Goals / Non-Goals

**Goals:**

- 一次性确定桌面应用的技术栈与目录结构，后续 change 不再讨论
- 锁定主题 token（颜色、字体、间距、圆角、阴影），后续 UI change 只增不改
- 提供"骨架可见即代码已对齐"的开发体验：`pnpm dev` 与 `pnpm tauri dev` 都能起，骨架完全一致
- 让 shadcn CLI 在仓库中可用，后续 change 通过 `pnpm dlx shadcn@latest add <component>` 增量引入控件
- 立项目规范（严格 tsconfig、ESLint、Prettier、路径别名）

**Non-Goals:**

- 不实现任何业务功能（连接、SQL、Schema 全部留空占位）
- 不引入 DataSource 抽象、Mock 数据（下一个 change `add-mock-datasource`）
- 不引入 CodeMirror、TanStack Table、react-arborist（各自专门 change）
- 不实现 Rust 后端逻辑、IPC 命令、SQLite、加密（Phase 2）
- 不做代码签名 / 公证、不做 CI 跨平台打包（发布期再处理）
- 不做国际化 / 多语言（后续可单独 change）

## Decisions

### 桌面框架：Tauri 2

- **选 Tauri 2**，不选 Electron / Compose Desktop / 纯 Web。
- 理由：安装包小（~5 MB 量级）、内存占用低、Rust 后端天然适合本项目 Phase 2 的 HTTP/加密/SQLite 需求；跨平台代码 95% 共用。
- 备选：Electron（生态最全，但 80 MB+ 安装包对轻量工具不划算）；Compose Desktop（JVM 启动慢，与工具气质不符）。

### 前端：React 18 + Vite + TypeScript

- React 训练数据与生态最厚，对 AI 协作最友好。
- Vite 用于 `pnpm dev`（浏览器模式）与 Tauri 的 `beforeDevCommand` / `beforeBuildCommand`。
- TypeScript 启严格模式，从一开始建立类型约束，避免后期重构成本。

### UI 框架：shadcn/ui + Tailwind CSS + Radix

- shadcn 不是传统库，而是把组件源码 copy 到本仓库的 `src/components/ui/`。优势是 AI 与开发者都可直接读改本地代码，不被官方版本迁移拖累。
- Tailwind 提供 utility class，对 AI 输出 UI 的命中率极高。
- Radix 作为无样式 primitives，shadcn 直接基于其构建。
- 备选 Ant Design / Mantine 被否：Ant 样式覆盖摩擦大且版本变迁多；Mantine 中文资料少。

### 风格 / 主题

- Linear / Vercel 现代极简风：深色优先，圆角中等（`--radius: 0.5rem`），阴影柔和，留白克制。
- 强调色 `#06A77D`（TDengine 绿）。在 Tailwind 主题中映射为 `primary`。
- 中性色采用 shadcn 默认 zinc 色阶，但背景偏暗（`--background: 240 6% 7%` 量级），强调"工具感"。
- 字体：UI 用 `Inter, system-ui, -apple-system, ...`；代码 / 数据网格用 `"JetBrains Mono", ui-monospace, ...`。字体文件不打包，使用系统/Web 安全栈，缺失时 fallback。

### 布局骨架

ASCII：

```
┌─ TitleBar (h-10, drag region) ───────────────────────────┐
│ ☰ Taoscope        conn: <placeholder> ●     ⚙  ⛶        │
├──────────┬──────────────────────────────────────────────┤
│ Sidebar  │  TabBar                                       │
│  (w-56)  │ ┌──────────────────────────────────────────┐ │
│          │ │  Main Tab Content (占位)                 │ │
│  conn    │ │                                          │ │
│  list    │ │                                          │ │
│  占位    │ │                                          │ │
│          │ └──────────────────────────────────────────┘ │
│          │ Schema Tree 占位 / 主区切换由后续 change 决定 │
├──────────┴──────────────────────────────────────────────┤
│ StatusBar (h-6, 文字 status / rows / ms 占位)           │
└──────────────────────────────────────────────────────────┘
```

- 本 change 的"中部 Schema Tree"与"右侧主区"先以单一可切换布局承载占位；具体三栏切分（哪里放 Schema 树、哪里放 Console）的细化留给 `add-schema-browser-ui` 与 `add-sql-console-ui`。
- 顶部 TitleBar 自定义（Tauri 隐藏原生标题栏），保留窗口拖动区域；mac 上保留红绿黄交通灯。

### 包管理：pnpm

- 节省磁盘、安装快、与 Tauri 默认脚手架兼容。

### 开发模式与两端一致

- `pnpm dev`：纯前端在浏览器跑（http://localhost:1420），用于快速迭代 UI 样式。
- `pnpm tauri dev`：Tauri 壳内跑，用于验证窗口装饰、字体渲染、自定义 TitleBar 行为。
- 两端必须使用完全相同的入口与样式；不允许在前端代码里出现"如果不在 Tauri 内则……"的样式分支。仅 Tauri 专属能力（窗口控制等）在 Phase 2 通过 DataSource 抽象隔离。

### Tauri 配置要点

- `tauri.conf.json`：窗口默认 1280×800，可调最小 960×600；`decorations: false`（自定义 TitleBar）；`titleBarStyle: "Overlay"`（mac 保留交通灯）。
- 开发端口 1420，固定，避免与常用端口冲突。

### Lint / Format / 路径别名

- ESLint：`@typescript-eslint`、`eslint-plugin-react-hooks`、`eslint-plugin-react-refresh`。
- Prettier：默认设置 + `prettier-plugin-tailwindcss` 自动排序 class。
- `tsconfig.json` 路径别名：`"@/*": ["./src/*"]`；Vite 端通过 `vite-tsconfig-paths` 同步识别。

## Risks / Trade-offs

- **[Risk] shadcn 复杂控件（Tree、复杂 DataGrid）需要自行拼装** → Mitigation：在后续 change（`add-schema-browser-ui` / `add-sql-console-ui`）中分别引入 `react-arborist`、`TanStack Table`，本 change 不试图提供。
- **[Risk] 自定义 TitleBar 在三平台行为不同（mac 交通灯、win 控制按钮、linux 无）** → Mitigation：本 change 先以 mac 为基准；win/linux 控制按钮在发布前的专门 change 补齐，不阻塞 Phase 1 推进。
- **[Risk] Tailwind 主题 token 若早期定得过细，后续难改** → Mitigation：本 change 只锁定有限 token（背景、前景、主色、卡片、边框、muted、destructive、ring + 字体 + 圆角），其余沿用 shadcn 默认。
- **[Trade-off] 不引入字体文件 = 不同平台字体渲染略有差异** → 接受。优先级低于安装包体积。
- **[Risk] 浏览器与 Tauri 两端样式漂移** → Mitigation：CI 不做，靠自检 + 在 README 里写明"任何样式分支需 PR 评审"。本 change 提供两端可跑的验收点作为基线。

## Migration Plan

不适用（项目首个 change，无既有状态需要迁移）。

## Open Questions

- 强调色 `#06A77D` 与 shadcn 默认中性色阶在深色背景下的对比度是否达 WCAG AA？实施时若发现对比不足，允许微调亮度，但仍以"TDengine 绿"为基调。本 change 不阻塞此细节，归入实施过程的最后视觉调整步骤。
