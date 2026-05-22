## 1. 依赖与目录

- [x] 1.1 安装 `zustand`（`pnpm add zustand`） *(zustand 5.0.13)*
- [x] 1.2 创建目录：`src/datasource/`、`src/store/`

## 2. DataSource 接口与类型

- [x] 2.1 在 `src/datasource/types.ts` 中定义：`TdDataType`、`Column`、`Connection`、`Database`、`STable`、`Table`、`QueryResult`、`Paged<T>`、`ListTablesOpts`、`DataSource`（见 design.md）
- [x] 2.2 所有 DataSource 方法签名返回 `Promise`，`listTables` 第三参强类型要求 `page` 与 `pageSize`
- [x] 2.3 `pnpm typecheck` 通过

## 3. MockDataSource 实现

- [x] 3.1 在 `src/datasource/mock.ts` 中定义 `FIXTURES`：3 个连接（含 `dev-local` offline）、每个 online 连接 3 个库（`iot_db`/`log_db`/`system`）、`iot_db` 内 `meters`/`devices`/`alerts`、`log_db` 内 `app_logs`
- [x] 3.2 `meters` STable：`columns`=[ts(TIMESTAMP, isPrimaryTs), current(FLOAT), voltage(INT), phase(FLOAT)]、`tagColumns`=[location(BINARY 64, isTag), groupId(INT, isTag)]、`childCount: 3847`
- [x] 3.3 `devices` STable：`columns`=[ts(TIMESTAMP, isPrimaryTs), online(BOOL), uptime(BIGINT)]、`tagColumns`=[model(NCHAR 32, isTag), region(BINARY 32, isTag)]、`childCount: 128`
- [x] 3.4 `alerts` 普通表：`columns`=[ts, level(INT), code(BINARY 32), msg(NCHAR 128), acked(BOOL)]
- [x] 3.5 实现 `class MockDataSource implements DataSource`
- [x] 3.6 `listConnections` / `testConnection`（`dev-local` 返回 `{ ok:false, message:'ECONNREFUSED' }`）/ `listDatabases` / `listSTables` / `describeTable`
- [x] 3.7 `listTables`：动态生成子表名 `d_000001..d_<childCount>`；支持 `stable` 限定 + `search` 子串过滤 + 分页；返回 `Paged<Table>` 且 `total` 反映过滤后总数
- [x] 3.8 `runSql` 档位 A：忽略 SQL 内容，固定 6 列 10 行 demo 数据，`elapsedMs` 在 [30, 80] 闭区间内随机整数，`truncated: false`，`rowCount === rows.length`
- [x] 3.9 `loadScratch` / `saveScratch`：`localStorage` key `taoscope.scratch.<consoleId>`，无值返回 `''`
- [x] 3.10 每个方法内部加最小 `await Promise.resolve()` 模拟异步（统一通过 `tick()` 实现）

## 4. Provider 与 hook

- [x] 4.1 在 `src/datasource/context.tsx` 创建 `DataSourceContext = createContext<DataSource | null>(null)`
- [x] 4.2 实现 `<DataSourceProvider value>` 组件
- [x] 4.3 实现 `useDataSource()`：context 为 null 时 throw `'useDataSource must be used within DataSourceProvider'`
- [x] 4.4 在 `src/App.tsx` 顶层用 `<DataSourceProvider value={new MockDataSource()}>` 包裹（`useMemo` 保稳定实例）

## 5. 全局状态 store

- [x] 5.1 在 `src/store/appState.ts` 用 Zustand 定义 store：`currentConnectionId`、`currentDatabase`、`setConnection`、`setDatabase`
- [x] 5.2 `setConnection(newId)`：若 `newId !== state.currentConnectionId` 则同时把 `currentDatabase` 置 `null`；若相同则不动
- [x] 5.3 默认值都是 `null`

## 6. Sidebar 接入

- [x] 6.1 修改 `src/components/layout/Sidebar.tsx`：用 `useEffect` 调 `useDataSource().listConnections()`，写入 store
- [x] 6.2 渲染列表项：名字 + 状态圆点（online 绿色 `bg-primary`，offline 灰色 `bg-muted-foreground/50`）
- [x] 6.3 当前选中项高亮（`bg-muted` + 字色加重）
- [x] 6.4 点击行调 `setConnection(id)`
- [x] 6.5 加载中文字 "Loading…"，无数据兜底

## 7. SchemaPanel 接入

- [x] 7.1 修改 `src/components/layout/SchemaPanel.tsx`
- [x] 7.2 `currentConnectionId === null` → 显示提示 "Select a connection"
- [x] 7.3 当前连接是 offline → 显示提示 "Disconnected"，不调 `listDatabases`
- [x] 7.4 当前连接 online → `useEffect` 调 `listDatabases(currentConnectionId)`，渲染库列表
- [x] 7.5 点击库 → `setDatabase(name)`；当前库高亮
- [x] 7.6 `currentDatabase` 非空 → 调 `listSTables` 和 `listTables({ page: 1, pageSize: 200 })` 渲染 STable 与普通 table 列表项
- [x] 7.7 STable 节点支持 expand/collapse 状态（本地组件 state，Set<string>）
- [x] 7.8 展开 STable 时调 `listTables({ stable: name, page: 1, pageSize: 50 })`，渲染 50 个子表名 + 当 `total > 50` 时显示 "and <total-50> more"
- [x] 7.9 STable 节点显示 `<childCount>` 后缀（数字右对齐），普通 table 加 FileText 图标
- [x] 7.10 加载状态用 "Loading…" 文字

## 8. MainArea Console v0 接入

- [x] 8.1 修改 `src/components/layout/MainArea.tsx`
- [x] 8.2 顶部 Tab 条固定 "Console #1"（一个静态 tab）
- [x] 8.3 中间一个 `<textarea>` (`font-mono`, `h-32`, `resize-y`)，placeholder `-- write your SQL here`
- [x] 8.4 mount 时 `loadScratch('default')` 填入 textarea
- [x] 8.5 textarea onChange debounce 400ms 调 `saveScratch('default', value)`
- [x] 8.6 Run 按钮：仅在 `currentConnectionId && currentDatabase` 都非空时启用；否则 disabled 并显示 hint "Select a database first"
- [x] 8.7 Run 调 `runSql(...)`：写入 `execStatus` `running` / `ok` / `error` 与 `lastResult`
- [x] 8.8 结果区：若有 `QueryResult` 则渲染 `<table>`，表头列出 `name` + `type`；TIMESTAMP 渲染为 ISO 字符串
- [x] 8.9 结果表用 `font-mono`，容器 `overflow-auto`

## 9. StatusBar 与 TitleBar 接入

- [x] 9.1 在 `appState` store 增加 `lastResult` / `execStatus` / `execError`；MainArea Run 时写入
- [x] 9.2 修改 `StatusBar.tsx`：左侧 status 文字 + 状态圆点 / 中间 `<rowCount> rows`（仅 ok）/ 右侧 `<elapsedMs> ms`（仅 ok）；error 时左侧 `ERROR: <message>`
- [x] 9.3 修改 `TitleBar.tsx`：从 store 读 `currentConnectionId` + `connections`；显示 `conn: <name>` + 状态圆点；未选时 `conn: —`
- [x] 9.4 Sidebar 与 TitleBar 共享 `appState.connections`（Sidebar 首次 fetch 后填入，TitleBar 直接读取，无双重 fetch）

## 10. 防止组件 import 具体实现

- [x] 10.1 `.eslintrc.cjs` 增加 `overrides`：`src/components/**` 禁止 import `@/datasource/mock`，使用 `no-restricted-imports`
- [x] 10.2 验证：在 `src/components/_lint_probe.tsx` 临时写违例 → ESLint 报错；移除文件后继续

## 11. 验收与回归

- [x] 11.1 `pnpm typecheck` 通过
- [x] 11.2 `pnpm lint` 通过（2 个 react-refresh 警告：`button.tsx` 导出 `buttonVariants` 与 `context.tsx` 导出 `useDataSource`；shadcn / React 标准模式，可接受）
- [x] 11.3 `pnpm build` 通过（1590 modules → 184 kB JS / 13 kB CSS / 796 ms）
- [ ] 11.4 *(deferred — 用户手测)* `pnpm dev`：Sidebar 3 个连接；点 `prod-shanghai` → SchemaPanel 3 个库；点 `iot_db` → `meters`/`devices`/`alerts`；展开 `meters` → 50 个 `d_*` + "and 3797 more"
- [ ] 11.5 *(deferred — 用户手测)* `pnpm dev`：点 `dev-local` → SchemaPanel "Disconnected"
- [ ] 11.6 *(deferred — 用户手测)* `pnpm dev`：选 `prod-shanghai`+`iot_db`，Run → 10 行 6 列结果表，StatusBar `OK · 10 rows · <ms> ms`，TitleBar `conn: prod-shanghai ●`（绿点）
- [ ] 11.7 *(deferred — 用户手测)* `pnpm dev`：刷新后 textarea 内容仍在
- [ ] 11.8 *(deferred — 待用户验收后)* commit：`feat(mock): add DataSource abstraction and MockDataSource wiring`
