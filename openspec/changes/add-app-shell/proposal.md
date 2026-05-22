## Why

Taoscope 是一个面向 TDengine 3.x 的桌面管理工具。后续所有 UI / 数据 / 后端 change 都需要一个可运行的应用骨架作为承载。本 change 把工程脚手架一次性立起来，并锁定全局视觉风格，避免后续 change 各自重做布局或反复调主题。

## What Changes

- 初始化 Tauri 2 + React 18 + Vite + TypeScript 工程结构，包管理使用 pnpm
- 接入 Tailwind CSS + shadcn/ui CLI，建立 `src/components/ui/` 目录与基础设计 token（颜色、字体、间距、圆角）
- 主题：深色优先，强调色 `#06A77D`（TDengine 绿），整体风格对齐 Linear / Vercel 现代极简风
- 字体：UI 使用 Inter / 系统字体，代码与数据网格使用 JetBrains Mono
- 实现主窗口"空骨架"布局：自定义 TitleBar + 左侧 Sidebar + 中部 Schema Tree 占位 + 右侧主区 Tab 容器 + 底部 StatusBar
- 提供两种调试模式：`pnpm dev`（浏览器）与 `pnpm tauri dev`（Tauri 壳内），两者样式一致
- 项目规范：tsconfig 严格模式、ESLint + Prettier、路径别名 `@/*`

非目标（明确不做）：

- 不接任何真实数据（连接、Schema、SQL 等留给后续 change）
- 不引入 DataSource 抽象（留给 `add-mock-datasource`）
- 不引入 CodeMirror、TanStack Table、react-arborist（留给各自的 change）
- 不做 Rust 后端业务逻辑、凭据加密、SQLite 持久化（Phase 2 的 change）
- 不做代码签名 / notarization（发布期再处理）

## Capabilities

### New Capabilities

- `app-shell`: 桌面应用的窗口、布局骨架、主题系统与开发/构建工作流

### Modified Capabilities

（无，本项目首个 change）

## Impact

- 新增源码目录：`src/`、`src-tauri/`
- 新增配置文件：`package.json`、`pnpm-lock.yaml`、`vite.config.ts`、`tsconfig.json`、`tailwind.config.ts`、`postcss.config.js`、`components.json`（shadcn 配置）、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`.eslintrc`、`.prettierrc`
- 引入依赖：React、React DOM、Tailwind、shadcn 基础依赖（class-variance-authority、clsx、tailwind-merge、lucide-react）、Radix Primitives（按需）；Rust 端仅 Tauri 默认依赖
- 后续 change 的约定：所有 UI 组件复用本 change 建立的主题 token 与布局骨架，不再自行定义全局样式
