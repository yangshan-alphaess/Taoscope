# Taoscope

[English](README.md) · **中文**

为 **TDengine 3.x** 打造的、键盘友好的桌面管理工具。

底层 Tauri 2（Rust 壳）+ React 18 —— 一个体积小巧的原生二进制，通过 REST API 直连 TDengine，提供你期望从现代 SQL 工作台得到的所有效率界面，并针对时序场景做了专门优化（super table、child table、tag 等）。

<p align="center">
  <img src="docs/images/ui.png" alt="Taoscope 主窗口" width="900">
</p>

## 功能

### 连接与资源

- **多连接工作区** —— 并列管理多个 TDengine 集群；在线/离线状态提示；每个连接独立刷新。
- **OS 钥匙串凭据保险箱** —— 密码绝不以明文落盘；macOS Keychain / Windows Credential Manager / Linux Secret Service。
- **树形资源面板** —— Connection → Database → STable / Table → 内联展开 **Columns & tags** 与 **Child tables**。无弹窗，展开状态跨重启保留。
- **带 TTL 的 schema 缓存** —— 每次输入触发补全也不会反复打后端。

### SQL 控制台

- **每个 workspace 多控制台** —— 各自绑定连接 + 默认库，内联重命名，重启不丢。
- **CodeMirror 编辑器** —— TDengine 定制方言（精简关键字集，没有 MySQL 那一堆冗余），语法高亮、行号，13 px 等宽 UI 字体。
- **Schema-aware 自动补全** —— 解析当前语句的 `FROM` 子句，**只**给出那张表的列 + tag；无法识别时静默退回到关键字。
- **运行模式** —— 选区 / 光标处语句 / 整个 scratch，统一 `⌘↵`。
- **格式化、注释切换、复制行向下、历史导航** —— 快捷键与 JetBrains / VS Code 一致。
- **行数封顶** —— 防止 `SELECT *` 意外拉百万行；一键"显示全部"放开。

### 查询结果

- **虚拟化网格**（TanStack Table + Virtual）—— 几百万行也能丝滑滚动。
- **可排序 / 可调宽列**，按列复制名/值，**CSV** + **JSON** 导出。
- **行内过滤**，跨全部列。
- **空态保留表头** —— 0 行结果也能看到列结构。
- **每个控制台独立历史**（最近 50 条），落盘到本地 SQLite。

### 应用外壳

- **自绘 TitleBar**：在 macOS 上文字与原生红绿灯中线对齐；Win/Linux 下提供最小化 / 最大化 / 关闭。
- **紧凑暗色主题**：Linear / Vercel 风格调色板，TDengine 绿（`#06A77D`）作为主色。
- **右键菜单全局统一字号密度**。

### 自动更新

- **应用内升级**：`tauri-plugin-updater` + GitHub Releases。启动时静默检查；状态栏右下角检测到新版会变绿色 `v1.x.y · install`。
- **ed25519 签名** —— 客户端用绑定的公钥拒绝任何被篡改的更新包。
- 发布操作手册见 [docs/RELEASE.md](docs/RELEASE.md)。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 壳 | [Tauri 2](https://tauri.app)（Rust） |
| 前端 | React 18 + Vite + TypeScript（strict） |
| UI | [shadcn/ui](https://ui.shadcn.com) + Tailwind + Radix |
| 编辑器 | CodeMirror 6 + `@codemirror/lang-sql`（自定义 TDengine 方言） |
| 表格 | TanStack Table + TanStack Virtual |
| 状态 | Zustand |
| 存储 | SQLite（rusqlite）放 workspace；OS keychain（`keyring` crate）放密钥 |
| 网络 | reqwest 走 TDengine REST `/rest/sql/<db>` |
| 包管理 | pnpm |

## 前置要求

- **Node** ≥ 20
- **pnpm** ≥ 9（`npm install -g pnpm`）
- **Rust** stable，通过 [rustup](https://rustup.rs)
- **macOS**：Xcode Command Line Tools（`xcode-select --install`）
- **Linux**：`libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev`

跑 `pnpm tauri info` 检查环境。

## 本地开发

```bash
pnpm install
pnpm tauri dev          # 推荐：Tauri 完整壳（Rust + React）
pnpm dev                # 仅前端 + 模拟数据源，不连真实 TDengine
```

`pnpm dev` 调 UI 最快，走的是 mock 数据源。`pnpm tauri dev` 是测试真实查询、updater、TitleBar 的时候用。

### 常用脚本

| 命令 | 用途 |
| --- | --- |
| `pnpm tauri dev`   | 原生窗口 + Vite dev server |
| `pnpm dev`         | 纯 Vite + mock 数据源，跑在 `http://localhost:1420` |
| `pnpm build`       | `tsc` 类型检查 + Vite 生产构建 |
| `pnpm tauri build` | 构建可分发桌面包 |
| `pnpm typecheck`   | `tsc --noEmit` |
| `pnpm lint`        | ESLint 扫 `src/` |
| `pnpm format`      | Prettier 格式化 |
| `pnpm bump <kind>` | 同步升 `package.json` + `Cargo.toml` + `tauri.conf.json` 三处版本号，刷新 `Cargo.lock`，提交并打 tag `v<x.y.z>` |

## 发布

推一个形如 `v1.0.1` 的 tag → [`.github/workflows/release.yml`](.github/workflows/release.yml) 自动多平台构建 + 签名 + 把草稿 Release 推到 GitHub，并附带应用内 updater 用的 `latest.json`。完整流程（签名密钥生成、Secrets 配置、每次发版 checklist）见 [docs/RELEASE.md](docs/RELEASE.md)。

简版回顾：

```bash
pnpm bump patch                      # 1.0.0 → 1.0.1，自动 commit + tag
git push --follow-tags origin main   # main + 新 tag 一次推完 → CI 起跑
```

## 项目结构

```
.
├── src/
│   ├── components/
│   │   ├── console/       # 编辑器、结果网格、自动补全、历史、运行逻辑
│   │   ├── layout/        # TitleBar、ResourcesPanel、StatusBar
│   │   ├── keyboard/      # 全局快捷键
│   │   └── ui/            # shadcn 原语
│   ├── datasource/        # DataSource 接口 + Tauri 实现 + mock
│   ├── lib/               # cn()、updater store……
│   ├── store/             # zustand store
│   └── App.tsx
├── src-tauri/
│   ├── src/
│   │   ├── commands.rs    # Tauri 命令边界
│   │   ├── datasource/    # SQLite store + http_client（REST/TDengine）+ vault
│   │   └── lib.rs
│   └── tauri.conf.json
├── scripts/bump-version.mjs
├── .github/workflows/     # release.yml
└── docs/RELEASE.md
```

## 状态

- **1.0.0**：首个稳定切片。Phase 1（mock 数据源、UI 壳）+ Phase 2（Tauri 后端、真实 TDengine 查询、持久化、OS keychain 保险箱）全部闭环；自动更新通道已上线。
- **代码签名证书暂未配置** —— macOS 用户首次右键 → 打开；Windows 用户在 SmartScreen 上点"仍要运行"。`docs/RELEASE.md` 和应用内 updater 都已经把后续的就地升级路径处理干净。

长尾增强候选（TLS、查询取消、WS 协议等）见 [FEATURES.md](FEATURES.md)。
