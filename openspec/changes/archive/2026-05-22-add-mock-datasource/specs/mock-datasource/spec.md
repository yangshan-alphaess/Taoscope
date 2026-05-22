## ADDED Requirements

### Requirement: DataSource Interface Contract

The application SHALL define a `DataSource` TypeScript interface in `src/datasource/types.ts` that all data access flows through. The interface SHALL include methods for `listConnections`, `testConnection`, `listDatabases`, `listSTables`, `listTables`, `describeTable`, `runSql`, `loadScratch`, and `saveScratch`. All methods SHALL return `Promise` values. Companion types (`Connection`, `Database`, `STable`, `Table`, `Column`, `TdDataType`, `QueryResult`, `Paged<T>`, `ListTablesOpts`) SHALL be exported alongside the interface.

#### Scenario: All interface methods return promises

- **WHEN** any `DataSource` method is invoked
- **THEN** the return value is a `Promise` (verified by TypeScript types) even when the underlying implementation could resolve synchronously

#### Scenario: Components never import concrete implementation

- **WHEN** searching the `src/components/` tree for `MockDataSource` (or any other concrete implementation class)
- **THEN** no import matches; components access data only via `useDataSource()`

#### Scenario: listTables requires pagination parameters

- **WHEN** a caller invokes `listTables(connId, db, opts)`
- **THEN** the `opts` parameter requires `page` and `pageSize` fields at the type level; omitting them causes a TypeScript error

### Requirement: DataSource Provider and Hook

The application SHALL expose the active `DataSource` via a React `<DataSourceProvider>` component and a `useDataSource()` hook. The provider SHALL wrap the application tree at the root level so all components can access the hook.

#### Scenario: Hook returns the provided instance

- **WHEN** a component calls `useDataSource()` inside `<DataSourceProvider value={x}>`
- **THEN** the hook returns the exact instance `x`

#### Scenario: Hook errors outside provider

- **WHEN** a component calls `useDataSource()` outside any `<DataSourceProvider>`
- **THEN** the hook throws an error with a clear message ("useDataSource must be used within DataSourceProvider")

### Requirement: MockDataSource Fixtures

The application SHALL provide a `MockDataSource` implementation that exposes three connections (`prod-shanghai` online, `staging-bj` online, `dev-local` offline), three databases per online connection (`iot_db`, `log_db`, `system`), and within `iot_db` two STables (`meters` with 3847 child tables and `devices` with 128 child tables) plus a regular table `alerts`. Column type coverage SHALL include at minimum `TIMESTAMP`, `INT`, `BIGINT`, `FLOAT`, `DOUBLE`, `BOOL`, `BINARY`, `NCHAR`, and `TINYINT`.

#### Scenario: listConnections returns the three fixtures

- **WHEN** `mock.listConnections()` resolves
- **THEN** the result has length 3 and contains entries with ids `prod-shanghai`, `staging-bj`, `dev-local`; the `dev-local` entry has `status: 'offline'`

#### Scenario: testConnection for offline reports failure

- **WHEN** `mock.testConnection('dev-local')` resolves
- **THEN** the result is `{ ok: false, message: <non-empty string> }`

#### Scenario: meters STable reports correct child count

- **WHEN** `mock.listSTables('prod-shanghai', 'iot_db')` resolves
- **THEN** the result contains an entry `{ name: 'meters', childCount: 3847, ... }` and an entry `{ name: 'devices', childCount: 128, ... }`

#### Scenario: meters has tag columns

- **WHEN** `mock.listSTables('prod-shanghai', 'iot_db')` resolves
- **THEN** the `meters` entry's `tagColumns` array contains at least one column whose `isTag` is `true`, and its non-tag `columns` array contains a column whose `isPrimaryTs` is `true` and whose `type` is `'TIMESTAMP'`

### Requirement: Paginated Child Table Listing

The MockDataSource `listTables` method SHALL honor `page`, `pageSize`, optional `search`, and optional `stable` filters, and SHALL return a `Paged<Table>` whose `total` reflects the full filtered count (not the page size).

#### Scenario: First page of meters child tables

- **WHEN** `mock.listTables('prod-shanghai', 'iot_db', { stable: 'meters', page: 1, pageSize: 50 })` resolves
- **THEN** `items.length === 50`, `total === 3847`, `page === 1`, `pageSize === 50`, and item names are `d_000001` through `d_000050`

#### Scenario: Search filters by substring

- **WHEN** `mock.listTables('prod-shanghai', 'iot_db', { stable: 'meters', page: 1, pageSize: 20, search: 'd_000005' })` resolves
- **THEN** every returned item's `name` includes the substring `d_000005`

### Requirement: runSql Stub Behavior

The MockDataSource `runSql` method SHALL ignore the SQL string content and return a fixed-shape `QueryResult` containing 10 rows of demo meter time-series data with a `TIMESTAMP` primary key, two tag columns (`location` BINARY, `groupId` INT), and three measurement columns (`current` FLOAT, `voltage` INT, `phase` FLOAT). The returned `elapsedMs` SHALL be a positive integer in the range 30–80 inclusive; `truncated` SHALL be `false`; `rowCount` SHALL equal `rows.length`.

#### Scenario: Any SQL returns the same shape

- **WHEN** `mock.runSql('prod-shanghai', 'iot_db', 'SELECT * FROM whatever')` resolves
- **THEN** the result has `rowCount === 10`, `truncated === false`, six columns in the documented order, and `elapsedMs` between 30 and 80

#### Scenario: Empty SQL still returns demo data

- **WHEN** `mock.runSql('prod-shanghai', 'iot_db', '')` resolves
- **THEN** the result still has `rowCount === 10` (the mock does not validate SQL)

### Requirement: Scratch Persistence via localStorage

The MockDataSource `saveScratch` SHALL persist the content to `localStorage` under the key `taoscope.scratch.<consoleId>`, and `loadScratch` SHALL return the persisted string or the empty string when no value is stored.

#### Scenario: Save then load roundtrip

- **WHEN** `mock.saveScratch('default', 'SELECT 1')` resolves, then `mock.loadScratch('default')` resolves
- **THEN** the second call returns `'SELECT 1'`

#### Scenario: Load with no prior save

- **WHEN** `localStorage` has no key `taoscope.scratch.default` and `mock.loadScratch('default')` resolves
- **THEN** the returned value is `''` (empty string)

#### Scenario: Key namespace

- **WHEN** `mock.saveScratch('default', 'x')` resolves
- **THEN** `localStorage.getItem('taoscope.scratch.default')` equals `'x'`

### Requirement: Global Application State

The application SHALL provide a global state store containing `currentConnectionId: string | null` and `currentDatabase: string | null`, both initialized to `null`. Selecting a different connection SHALL clear `currentDatabase`.

#### Scenario: Initial state is null

- **WHEN** the application starts and no user action has occurred
- **THEN** both `currentConnectionId` and `currentDatabase` are `null`

#### Scenario: Switching connection clears current database

- **WHEN** `currentConnectionId === 'prod-shanghai'` and `currentDatabase === 'iot_db'`, then a setter selects `staging-bj`
- **THEN** after the update, `currentConnectionId === 'staging-bj'` and `currentDatabase === null`

#### Scenario: Re-selecting same connection preserves database

- **WHEN** `currentConnectionId === 'prod-shanghai'` and `currentDatabase === 'iot_db'`, then a setter selects `prod-shanghai` again
- **THEN** `currentDatabase` remains `'iot_db'`

### Requirement: Sidebar Renders Connections

The Sidebar component SHALL list all connections returned by `useDataSource().listConnections()`, each showing the connection name and a status indicator (online/offline). Clicking a row SHALL update `currentConnectionId` in the global state. The currently selected row SHALL be visually highlighted.

#### Scenario: All three connections render

- **WHEN** the application loads with the MockDataSource provider
- **THEN** the Sidebar shows three rows: `prod-shanghai`, `staging-bj`, `dev-local`

#### Scenario: Offline status is visible

- **WHEN** rendering the Sidebar row for `dev-local`
- **THEN** the row visually distinguishes itself as offline (e.g., dimmed text and/or a non-green status dot)

#### Scenario: Click updates global state

- **WHEN** the user clicks the `prod-shanghai` row
- **THEN** `currentConnectionId` becomes `'prod-shanghai'` and that row gains a highlighted style

### Requirement: SchemaPanel Renders Databases, STables, and Tables

The SchemaPanel SHALL display nothing meaningful when `currentConnectionId` is null. When a connection is selected and online, it SHALL list databases from `listDatabases`. Selecting a database SHALL update `currentDatabase` and SHALL trigger `listSTables` and `listTables` (filtered to non-child tables) to populate the database's contents. Each STable SHALL be collapsible; expanding SHALL fetch the first 50 child tables via `listTables({ stable, page: 1, pageSize: 50 })` and display them, followed by a textual marker `"and <N> more"` when `total > 50`.

#### Scenario: No connection selected

- **WHEN** `currentConnectionId === null`
- **THEN** the SchemaPanel shows an empty-state hint (e.g., "Select a connection") and no database list

#### Scenario: Online connection lists databases

- **WHEN** the user selects `prod-shanghai`
- **THEN** the SchemaPanel lists `iot_db`, `log_db`, `system`

#### Scenario: Offline connection shows disconnected state

- **WHEN** the user selects `dev-local`
- **THEN** the SchemaPanel shows a disconnected hint instead of a database list (no calls to `listDatabases` are required to render the hint)

#### Scenario: Selecting database lists STables and tables

- **WHEN** the user selects `iot_db` under `prod-shanghai`
- **THEN** the SchemaPanel shows entries for `meters (STable · 3847)`, `devices (STable · 128)`, and `alerts`

#### Scenario: Expanding STable lists child tables with overflow marker

- **WHEN** the user expands `meters`
- **THEN** 50 child-table rows render (`d_000001` … `d_000050`) and a `"and 3797 more"` marker is visible below them

### Requirement: MainArea Console v0

The MainArea SHALL render a single fixed Tab labeled `Console #1`. The tab content SHALL contain a `<textarea>` (monospace font) and a `Run` button. When `currentConnectionId` and `currentDatabase` are both non-null, the button SHALL be enabled; otherwise it SHALL be disabled with a hint indicating that a database must be selected. On press, the Run button SHALL invoke `runSql(currentConnectionId, currentDatabase, textareaValue)` and render the resulting `QueryResult` as an HTML `<table>` below the editor. The textarea content SHALL be persisted via `saveScratch('default', content)` (debounced) and SHALL be restored from `loadScratch('default')` on mount.

#### Scenario: Run disabled before selection

- **WHEN** `currentConnectionId === null` or `currentDatabase === null`
- **THEN** the Run button is disabled and a hint such as "Select a database first" is visible

#### Scenario: Run executes and renders results

- **WHEN** both selections are made, the user types any text in the textarea, and clicks Run
- **THEN** an HTML table appears showing 10 rows and 6 columns (`ts`, `current`, `voltage`, `phase`, `location`, `groupId`)

#### Scenario: Scratch persists across reload

- **WHEN** the user types `SELECT 42` in the textarea and at least 500 ms passes, then the page is reloaded
- **THEN** after reload the textarea content is `SELECT 42`

### Requirement: StatusBar Reflects Execution Results

The StatusBar SHALL display state `ready` initially, `running…` while a `runSql` call is in flight, `OK · <N> rows · <M> ms` after a successful response, or `ERROR: <message>` when `runSql` rejects.

#### Scenario: Initial state

- **WHEN** the application has just loaded
- **THEN** the StatusBar shows `ready`

#### Scenario: Successful run

- **WHEN** Run completes successfully with a `QueryResult { rowCount: 10, elapsedMs: 47 }`
- **THEN** the StatusBar shows `OK · 10 rows · 47 ms`

#### Scenario: In-flight run

- **WHEN** Run has been pressed and the promise has not yet resolved
- **THEN** the StatusBar shows `running…`

### Requirement: TitleBar Reflects Current Connection

The TitleBar SHALL display `conn: <name>` followed by a colored dot (green for online, gray/red for offline). When `currentConnectionId` is null, the TitleBar SHALL display `conn: —`.

#### Scenario: No connection selected

- **WHEN** `currentConnectionId === null`
- **THEN** the TitleBar text is `conn: —`

#### Scenario: Online connection selected

- **WHEN** `currentConnectionId === 'prod-shanghai'`
- **THEN** the TitleBar text contains `prod-shanghai` and a green status dot

#### Scenario: Offline connection selected

- **WHEN** `currentConnectionId === 'dev-local'`
- **THEN** the TitleBar text contains `dev-local` and a non-green status dot
