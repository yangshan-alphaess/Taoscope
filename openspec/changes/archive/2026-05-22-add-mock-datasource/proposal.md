## Why

`add-app-shell` 留下了五个空区域，看不出"连接之后是什么样子"，无法对 UI 视觉密度、信息层级做有意义的判断。Phase 2 才接真后端，但 Phase 1 的 UI 迭代需要"像真的"数据驱动。本 change 在前端注入一层 DataSource 抽象 + Mock 实现，把骨架瞬间变成可视、可点、可执行 SQL 的演示版本，作为后续所有 UI change 的视觉基准与契约定义。

同时这一层抽象是 Phase 2 的关键接缝：Rust 后端就位时只新增一个 `TauriDataSource` 实现，前端组件一行不改。

## What Changes

- 定义 `DataSource` TypeScript 接口与配套类型（`Connection`、`Database`、`STable`、`Table`、`Column`、`QueryResult`、`Paged<T>` 等），覆盖 TDengine 3.x 常见数据形态
- 实现 `MockDataSource`：3 个连接（含一个 offline）、3 个库、典型 STable / 子表（其中 `meters` 含 3847 个子表用于演示分页）、覆盖 TDengine 主要列类型
- `runSql` 行为采用档位 A：忽略 SQL 内容，永远返回同一份固定 demo 行（约 10 行 meter 时序数据），随机生成 elapsedMs，足以演示"按下 Run 看到表格"
- 通过 `<DataSourceProvider>` + `useDataSource()` 暴露给组件
- 引入最小全局状态（currentConnectionId / currentDatabase）
- 把现有占位"接活"（最小范围）：Sidebar 列出连接，SchemaPanel 列出库/STable/Table 并支持 STable 展开看子表，MainArea 提供 textarea + Run 按钮 + 简易 HTML 结果表，StatusBar 显示真实 rowCount/elapsedMs，TitleBar 显示当前连接名
- localStorage 持久化 Console scratch
- **BREAKING**（仅对 spec 而言，无运行时迁移）：废止 `app-shell` 中的 `Placeholders contain no business data` scenario —— 因为占位现在通过 DataSource 填充内容

非目标（明确不做）：

- 不做正式的连接管理 UI（新建/编辑/删除连接） → `add-connection-ui`
- 不引入 CodeMirror（用原生 `<textarea>` 占位） → `add-sql-console-ui`
- 不引入 react-arborist（手写折叠列表） → `add-schema-browser-ui`
- 不引入 TanStack Table（简易 HTML `<table>`） → `add-sql-console-ui` / 后续
- 不做 SQL 补全（L3）、不做多 Tab Console、不做 1000 行结果截断
- 不做 Rust 后端 / HTTP 调用 / 加密 → Phase 2

## Capabilities

### New Capabilities

- `mock-datasource`: DataSource 接口契约与基于内存的 Mock 实现，含全局当前连接/库状态、Console scratch 持久化、以及"接活"骨架五个区域所需的最小渲染契约

### Modified Capabilities

- `app-shell`: 废止"Placeholders contain no business data"约束；占位区现在通过 DataSource hook 填充内容

## Impact

- 新增源码目录：`src/datasource/`（接口与 mock 实现）、`src/store/`（全局状态）、`src/hooks/`（如需）
- 修改 `src/App.tsx`：包裹 `<DataSourceProvider>`，初始化全局 store
- 修改 `src/components/layout/Sidebar.tsx`、`SchemaPanel.tsx`、`MainArea.tsx`、`TitleBar.tsx`、`StatusBar.tsx`：替换占位为 mock 数据驱动
- 新增依赖（候选，最终在 design.md 决定）：`zustand`（轻量全局状态）；`nanoid`（可选，生成 id）
- 不新增 Rust 端依赖；`src-tauri/` 完全不动
- 后续 change 的约定：所有 UI 组件**只通过 `useDataSource()` 读数据**，不允许直接 import `MockDataSource` 具体类
