## Context

`add-app-shell` 完成后，五个 UI 区域只有占位文字。Phase 2 才会接 Rust + HTTP + TDengine，所以 Phase 1 必须有一层假数据来支撑 UI 调试。如果让组件直接 import 一个 `mockData.ts`，Phase 2 替换真后端时会改穿前端 —— 不可接受。本 change 因此先把 DataSource 接口契约定下来，再实现 Mock，组件只通过 hook 访问。

## Goals / Non-Goals

**Goals:**

- 确立稳定的 `DataSource` TypeScript 接口契约，使 Phase 2 替换实现时前端组件零改动
- 提供"像真的" Mock 数据，让 UI 视觉验收有意义（3 个连接、3 个库、子表数 3847 用于测分页演示）
- 把骨架五个区域全部"接活"，最小代码量、最少依赖
- 引入最小全局状态层（当前连接 / 当前库）
- 锁定 scratch 的持久化键名格式，后续真后端迁移时直接复用

**Non-Goals:**

- 不实现正式连接管理 UI、CodeMirror、TanStack Table、react-arborist
- 不做 SQL 补全、不做多 Tab、不做结果截断 / 1000 行硬上限
- 不做 Rust 后端 / HTTP / 加密
- 不实现完整 TDengine SQL 行为（runSql 档位 A：永远返回同一份 demo 数据）

## Decisions

### 1. 全局状态：使用 Zustand，不用纯 Context

- **决定**：引入 `zustand`。
- **理由**：
  - 当前需要的全局状态极少（`currentConnectionId`、`currentDatabase`、`dataSource` 引用），Context 也能做。但 Zustand 的 selector 订阅可避免无关组件 rerender，未来加 tabs、连接列表缓存等都更顺。
  - Zustand 极小（~1 KB gzipped），无 reducer / action / dispatch 仪式，AI 与人都易读。
  - 不会带来生态绑定，将来也容易拆掉换 Context。
- **备选**：纯 React Context + `useReducer`。被否：随状态增长 rerender 控制成本上升，每个新选择都要拆 Provider。Redux Toolkit 直接淘汰，量级不匹配。

### 2. DataSource 注入：仍用 Context（与 store 分开）

- **决定**：DataSource 实例通过 `<DataSourceProvider value={mockDataSourceInstance}>` 注入；组件用 `useDataSource()` 取。
- **理由**：DataSource 是"服务"，不是"状态"。它在 app 生命周期内不变。混入 Zustand store 会模糊"状态 vs 服务"边界。
- **测试性**：测试时可以包一个不同 Provider 注入桩。

### 3. DataSource 接口冻结契约（核心，本 change 唯一的"长期资产"）

```typescript
type TdDataType =
  | 'TIMESTAMP' | 'INT' | 'BIGINT' | 'SMALLINT' | 'TINYINT'
  | 'INT UNSIGNED' | 'BIGINT UNSIGNED' | 'SMALLINT UNSIGNED' | 'TINYINT UNSIGNED'
  | 'FLOAT' | 'DOUBLE'
  | 'BINARY' | 'NCHAR' | 'VARCHAR' | 'JSON'
  | 'BOOL';

interface Column {
  name: string;
  type: TdDataType;
  length?: number;       // BINARY/NCHAR/VARCHAR 长度
  isTag?: boolean;
  isPrimaryTs?: boolean; // 是否为主时间列
}

interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  color?: string;        // 用户区分多连接的色标
  status: 'online' | 'offline';
}

interface Database {
  name: string;
  retention?: string;    // e.g. '7d'
  vgroups?: number;
  precision?: 'ms' | 'us' | 'ns';
}

interface STable {
  name: string;
  columns: Column[];     // 不含 tag 列
  tagColumns: Column[];
  childCount: number;    // 子表总数（演示分页用）
}

interface Table {
  name: string;
  isChild: boolean;
  stableName?: string;   // 子表才有
}

interface QueryResult {
  columns: Column[];
  rows: unknown[][];
  rowCount: number;
  elapsedMs: number;
  truncated: boolean;    // 预留给 add-sql-console-ui 的 1000 行硬上限
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;          // 1-based
  pageSize: number;
}

interface ListTablesOpts {
  stable?: string;       // 限定某个 STable 下的子表
  page: number;
  pageSize: number;
  search?: string;       // 名称模糊过滤
}

interface DataSource {
  listConnections(): Promise<Connection[]>;
  testConnection(connId: string): Promise<{ ok: boolean; message?: string }>;

  listDatabases(connId: string): Promise<Database[]>;
  listSTables(connId: string, db: string): Promise<STable[]>;
  listTables(connId: string, db: string, opts: ListTablesOpts): Promise<Paged<Table>>;
  describeTable(connId: string, db: string, table: string): Promise<Column[]>;

  runSql(connId: string, db: string | null, sql: string): Promise<QueryResult>;

  loadScratch(consoleId: string): Promise<string>;
  saveScratch(consoleId: string, content: string): Promise<void>;
}
```

- 所有方法都返回 Promise（即使 Mock 是同步可得），保持"未来真后端必然异步"的接口形态稳定。
- `listTables` 强制传 `page`/`pageSize`，避免未来误用"全量取回"。
- `QueryResult.truncated` 字段提前预留，避免后期破坏 schema。

### 4. MockDataSource 数据形态

```
Connections:
  - prod-shanghai    online    host: 192.168.10.20  user: root
  - staging-bj       online    host: 10.0.3.15      user: dev
  - dev-local        offline   host: 127.0.0.1      user: root
                              ↑ testConnection 返回 { ok: false, message: 'ECONNREFUSED' }

Databases (每个 online 连接):
  - iot_db           retention: '14d'  vgroups: 4   precision: 'ms'
  - log_db           retention: '7d'   vgroups: 2   precision: 'ms'
  - system           （内置库）

iot_db 内 STables:
  meters    columns:    ts (TIMESTAMP, primary), current (FLOAT), voltage (INT),
                        phase (FLOAT)
            tagColumns: location (BINARY 64), groupId (INT)
            childCount: 3847
            子表命名: d_000001, d_000002, ... d_003847

  devices   columns:    ts (TIMESTAMP, primary), online (BOOL), uptime (BIGINT)
            tagColumns: model (NCHAR 32), region (BINARY 32)
            childCount: 128

iot_db 内普通 table:
  alerts    columns: ts (TIMESTAMP), level (INT), code (BINARY 32),
                     msg (NCHAR 128), acked (BOOL)

log_db 内 STable:
  app_logs  columns: ts, severity (TINYINT), message (NCHAR 256)
            tagColumns: app_name (BINARY 64), host (BINARY 64)
            childCount: 12

system 库可以为空（只为体现"切库"动作）
```

- 列类型选择故意覆盖 TIMESTAMP / FLOAT / INT / BIGINT / BOOL / BINARY(64) / NCHAR(32) / NCHAR(128) / NCHAR(256) / TINYINT —— 后续 UI（特别是结果表）能验证类型渲染。
- 3847 这个数字"够大但不离谱"，便于演示分页（page 1 显示 1..50，UI 提示"and 3797 more"）。

### 5. runSql 档位 A 的具体行为

固定返回（含轻微随机化以"显得真实"）：

```
QueryResult {
  columns: [
    { name: 'ts', type: 'TIMESTAMP', isPrimaryTs: true },
    { name: 'current', type: 'FLOAT' },
    { name: 'voltage', type: 'INT' },
    { name: 'phase', type: 'FLOAT' },
    { name: 'location', type: 'BINARY', length: 64, isTag: true },
    { name: 'groupId', type: 'INT', isTag: true },
  ],
  rows: [10 rows of随时间递增的 ts + 随机 current/voltage/phase + 'shanghai'/'beijing' + 1..5],
  rowCount: 10,
  elapsedMs: random(30, 80),
  truncated: false,
}
```

- 每次调用 ts 序列以"当前时间 - 9s ... 当前时间"为基准，行内值用 seeded random 让同一会话不同请求**有所变化**但**不刺眼**。
- 故意不解析 SQL：保持档位 A 简单，也避免未来真后端"为什么 mock 行为不一致"的认知漂移。
- 预留扩展点：若日后想升级为档位 B（按 SQL 关键字粗判），只需在 MockDataSource 内加 switch，接口不变。

### 6. Scratch 持久化

- key 形如 `taoscope.scratch.<consoleId>`，本 change 只有一个固定的 `consoleId = 'default'`。
- 存 raw 字符串到 `localStorage`。`loadScratch` 返回空串若 key 不存在。
- 故意不引入 IndexedDB / SQLite：scratch 是"轻量、文本、单值"，localStorage 完美匹配；Phase 2 SQLite 落地时单独迁移。

### 7. SchemaPanel 的"轻量树"形态

- 单层折叠，不嵌套，不引 react-arborist。结构：
  ```
  ▼ Databases [自动展开]
    ▼ iot_db   [点击成为 current]
       ⊞ meters (STable · 3847)        [click 展开]
          ├─ d_000001
          ├─ ...
          ├─ d_000050
          └─ and 3797 more
       ⊞ devices (STable · 128)
       📋 alerts
    ▶ log_db
    ▶ system
  ```
- 列子表用 `listTables({ stable, page: 1, pageSize: 50 })`，结果直接展示前 50；"and N more"是 `total - 50` 的字面提示。后续 `add-schema-browser-ui` 才把"翻页 / 搜索"暴露出来。
- offline 连接选中后 SchemaPanel 显示 "Disconnected" 占位。

### 8. MainArea 占位 Console v0

```
┌─ MainArea ──────────────────────────────────────┐
│ Tab: Console #1 [固定，不可关闭]                │
├─────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ Run │
│ │ <textarea> (font-mono, h-32)            │     │
│ │ 占位文字: "-- SELECT ... FROM ..."      │     │
│ └─────────────────────────────────────────┘     │
├─────────────────────────────────────────────────┤
│ Result (HTML table, font-mono)                  │
│  ts                  | current | voltage | ...  │
│  2026-05-22 10:00:01 | 12.34   | 220     | ...  │
└─────────────────────────────────────────────────┘
```

- Console 区域只有在 `currentConnectionId && currentDatabase` 都已选时才启用 Run；否则按钮 disabled 显示"Select a database first"。
- Run 调 `runSql(connId, currentDb, textareaValue)`；结果直接渲染为简易 HTML `<table>`，无虚拟滚动 —— mock 只有 10 行不需要。
- textarea 内容变化时（debounce 400ms）调 `saveScratch('default', content)`；mount 时调 `loadScratch('default')` 填回。

### 9. StatusBar / TitleBar 接入

- StatusBar 三段：
  - 左：当前状态文字（`ready` / `running...` / `OK` / `ERROR: <msg>`）
  - 中：`<N> rows`（仅 OK 时显示）
  - 右：`<N> ms`（仅 OK 时显示）
- TitleBar 中段：`conn: <name> ●` 圆点颜色根据 online/offline 切换；未选连接时显示 `conn: —`。

### 10. 目录结构

```
src/
  datasource/
    types.ts         ← 所有接口与类型（DataSource 契约）
    mock.ts          ← MockDataSource 实现（含假数据 fixture）
    context.tsx      ← DataSourceProvider + useDataSource hook
  store/
    appState.ts      ← Zustand store（currentConnectionId / currentDatabase）
  components/layout/
    Sidebar.tsx      ← 改：渲染 useDataSource().listConnections()
    SchemaPanel.tsx  ← 改：渲染库/STable/Table
    MainArea.tsx     ← 改：textarea + Run + 结果表
    TitleBar.tsx     ← 改：显示 currentConnection
    StatusBar.tsx    ← 改：显示 runSql 后的 rowCount/elapsedMs
  App.tsx            ← 改：包裹 Provider
```

- `datasource/mock.ts` 内的 fixture 数据用一个独立的 `const FIXTURES = { ... }`，方便日后增删。

### 11. 异步加载策略（不上 React Query）

- 直接用 `useEffect` + `useState` 处理 fetch / loading / error，每个调用方自己管。
- 理由：本 change 调用点只有 5 个，引入 TanStack Query 太重；后续真后端再说。
- 加载状态用一句"Loading..."文字占位即可，无 skeleton。

## Risks / Trade-offs

- **[Risk] DataSource 接口冻结过早，Phase 2 真后端发现字段不够** → Mitigation：3.x 的 REST 响应字段已知，接口预留 `QueryResult.truncated`、`Database.precision` 等；真接不上时允许在 Phase 2 起一个**新** change 做 schema 扩展（非破坏），而非现在过度设计。
- **[Risk] Zustand 引入 = 多一个依赖维护** → Mitigation：~1 KB，API 稳定，社区活跃；接受。
- **[Risk] 档位 A 的 runSql 太"傻"，日后用户期望"按 SHOW DATABASES 真返库列表"** → Mitigation：将来想升级时只改 MockDataSource 内部，外部契约不变；本 change 不做。
- **[Risk] localStorage 在 Tauri webview 中跨平台行为是否一致** → Mitigation：所有平台的 WebView 都支持 localStorage；持久化到 webview 域名（`tauri://localhost`），重装应用会丢失，对 Phase 1 mock 无影响（Phase 2 会迁到 SQLite）。
- **[Trade-off] 不引入 React Query** = 多写几行 useEffect → 接受，对应规模匹配。
- **[Trade-off] STable 展开只显示前 50 + "and N more"** = 用户暂时翻不到第 2 页 → 接受，分页 UI 是 `add-schema-browser-ui` 的范围。

## Migration Plan

主 spec `app-shell` 的一个 scenario 需要废止：

- 在 `specs/app-shell/spec.md` 中通过 `MODIFIED` 重写 `Requirement: Application Shell Layout`，删掉 `Placeholders contain no business data` scenario 并增补"占位区由 DataSource 数据驱动"的 scenario 替代。

实现侧：

1. 接口与 MockDataSource 先落
2. Provider 与 store 落地
3. 五个组件按 Sidebar → SchemaPanel → MainArea → StatusBar → TitleBar 顺序接入
4. 每步本地 `pnpm dev` 即时验证

## Open Questions

- `meters` 子表的 ts 主键值是否要"看上去随子表不同而错开"？Mock 不需要演示这个；保持简单——所有子表 `describeTable` 返回相同列（与 STable 一致）。
- offline 连接被选中时，SchemaPanel 是否要"忘记上次的库选择"？决定：是，切到 offline 连接时 store 自动清空 `currentDatabase`。
