# Taoscope — 长尾增强候选

Phase 1 + Phase 2 主路径已闭环。下面是已识别但**当前不动**的长尾增强候选，按主题分类。每条只记标题 + 触发动机 + 前置条件；具体 spec / design 留到真有需求时再用 OpenSpec 起草。

格式约定：`change-name` 一律 kebab-case，对应 `openspec/changes/<name>/`。

## TDengine 协议 / 连通

- **add-query-retry-policy** — 失败自动重试（限次 + 退避）。触发：网络抖动场景被用户反馈过。低优先。

## 数据持久化 / 安全

- ~~**cleanup-rust-mock**~~ — ✅ 已完成。`mock.rs` 现仅剩 `seed_connections()`（返回空 Vec），schema fixtures / `MockBackend::*` 旧 helpers 早已随 backend 演进移除，无独立 change 必要。
- **add-db-backup** — 导出 / 导入 `taoscope.db` 文件，用户搬机器。前置：db 文件已携带密码（明文列），导出即完整可迁移——无需单独 prompt 重输密码（vault 已撤）。
- ~~**add-vault-export**~~ — ❌ 不适用。vault 在 `revert-credential-vault` 已撤，密码直接存 `connections` 表，`add-db-backup` 即覆盖完整迁移。
- **add-history-normalize** — `histories` 表从「一 console 一个 BLOB 数组」改为「一行 = 一 entry」。触发：要做「全局 SQL 执行时长 TopN」之类的跨 console 聚合查询。
- ~~**add-connection-delete-cascade**~~ — ✅ 已完成。`Store::delete_connection` 现在单事务级联删除该 connection 下所有 console + scratch / result / history（FK 关闭，显式 DELETE）；mock datasource 同步级联；前端删除前确认框按 console 数量提示（zero / N 三态 i18n）。注：当前无 vault，故无 vault 级联项。
- **add-startup-recovery-ui** — `Store::open` 失败时弹 dialog「db 损坏：重置 / 退出 / 改路径」而不是 panic。触发：用户真碰到一次损坏 db。
- ~~**add-keyring-error-mapper**~~ — ❌ 不适用。`revert-credential-vault` 后已无 keyring 依赖（密码存 db 列），无平台错误可映射。
- ~~**add-uninstall-cleanup**~~ — ❌ 基本不适用。密码不再进 OS keyring，卸载删 app data dir 即清空全部数据；唯一残留是少数 dev 在 vault 试用那几分钟写进 Keychain 的旧 entry（一次性、无害），不值得做成 feature。

## 用户体验 / Connection 管理

- **add-connection-auto-ping** — 启动时后台 ping 所有 connections，更新 status；ResourcesPanel 状态点实时刷新。触发：用户觉得「Test 按钮」太手动。前置：避免阻塞 startup（异步并行）。
- **add-token-import** — 从粘贴板 / 文件导入连接配置（含 token）。触发：团队共享连接信息。
- **add-connection-color-picker** — connection.color 字段当前 schema 有但 UI 未暴露。
- **add-connection-folder** — 大量连接的分组 / 文件夹。触发：用户连接数 > 10。

## 查询 / 结果

- **add-result-pagination** — 超过 row-cap 1001 时支持继续 fetch 下一页（手动 Load more 或自动 scroll）。触发：用户跑大查询想看完整结果。前置：TDengine cursor 支持有限，需要客户端构造 LIMIT/OFFSET。
- **add-result-export-csv-xlsx** — ResultGrid 导出当前结果到 CSV / xlsx。当前已有 export，确认覆盖度。
- **add-query-saved-snippets** — 保存的 SQL 模板 / 命名片段。触发：用户反复打同一个查询。前置：新表 `snippets`。
- **add-explain-plan** — 跑 `EXPLAIN` 显示执行计划。触发：性能调优场景。
- **add-multi-result-tabs** — 一个 console 可同时打开多个查询结果（多 tab）。触发：用户希望对比。

## 平台 / 开发体验

- **add-tray-icon** — 系统托盘常驻、快捷开窗。触发：用户希望后台运行。
- **add-bundle-signing** — macOS / Windows 代码签名。触发：分发要求。
- **add-i18n** — 中英文 UI 切换。触发：海外用户反馈。
- **add-store-tests** — `Store` 单元测试（用 `Connection::open_in_memory()`）。触发：`add-sqlite-persistence` 实施后 baseline 稳定即可补。

## 已观察、可能不做

- **add-stables-batch-count** — `list_stables` N+1 性能优化。已在 `add-tdengine-http-client` design.md decision 6 直接采用 `information_schema.ins_tables` 单 query 方案，**已隐式完成**，无需独立 change。

---

需要起草哪条直接说，按 OpenSpec 4-artifact 流程走。
