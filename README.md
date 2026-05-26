# Taoscope

**English** · [中文](README.zh-CN.md)

A fast, keyboard-friendly desktop manager for **TDengine 3.x**.

Built on Tauri 2 (Rust shell) + React 18 — a small, native binary that connects to TDengine over the REST API and gives you the productivity surfaces you'd expect from a modern SQL workbench, tuned for time-series specifics like super tables, child tables, and tags.

<p align="center">
  <img src="docs/images/ui.png" alt="Taoscope main window" width="900">
</p>

## Features

### Connections & resources

- **Multi-connection workspace** — manage many TDengine clusters side by side, online/offline indicators, per-connection refresh.
- **OS-keychain credential vault** — passwords never live as plaintext on disk; macOS Keychain / Windows Credential Manager / Secret Service on Linux.
- **Tree-style resources panel** — Connection → Database → STable / Table → inline **Columns & tags** + **Child tables**. No popups, expansion state persists across reloads.
- **Schema cache with TTL** — keystroke-driven completions don't hammer the backend.

### SQL console

- **Multiple consoles per workspace** — each bound to a connection + default DB, rename inline, kept across restarts.
- **CodeMirror editor** with a TDengine-tuned dialect (small keyword set, no MySQL bloat), syntax highlighting, line numbers, mono-spaced 13 px UI font.
- **Schema-aware autocomplete** that understands the active statement's `FROM` clause and surfaces only that table's columns + tags. Falls back silently when it can't.
- **Run modes** — selection / statement-at-cursor / full scratch, all on `⌘↵`.
- **Format**, **toggle-comment**, **copy-line-down**, history navigation — same shortcuts as JetBrains / VS Code.
- **Row cap** with one-click "show all" — large `SELECT *` queries can't accidentally fetch a million rows.

### Results

- **Virtualized grid** (TanStack Table + Virtual) — millions of rows scroll smooth.
- **Sortable / resizable columns**, per-column copy of names or values, **CSV** + **JSON** export.
- **Inline filter** across all columns.
- **Empty state** still shows the schema headers so you know what the query would have returned.
- **Per-console history** (last 50 queries), persisted to local SQLite.

### App shell

- **Custom title bar** that aligns text to native macOS traffic-light height; minimize / maximize / close on Win + Linux.
- **Compact dark theme** with a Linear/Vercel-ish palette, TDengine green (`#06A77D`) as the accent.
- **Right-click context menus everywhere** with the same typography density.

### Auto-update

- **In-app upgrade** powered by `tauri-plugin-updater` + GitHub Releases. Silent check on startup; status-bar chip turns green `v0.2.0 · install` when something's ready.
- **ed25519-signed** payloads — the bundled public key blocks tampered updates.
- See [docs/RELEASE.md](docs/RELEASE.md) for the publisher's SOP.

## Tech stack

| Layer    | Choice |
| -------- | ------ |
| Shell    | [Tauri 2](https://tauri.app) (Rust) |
| Frontend | React 18 + Vite + TypeScript (strict) |
| UI       | [shadcn/ui](https://ui.shadcn.com) + Tailwind + Radix |
| Editor   | CodeMirror 6 + `@codemirror/lang-sql` (custom TDengine dialect) |
| Grid     | TanStack Table + TanStack Virtual |
| State    | Zustand |
| Storage  | SQLite (rusqlite) for workspace; OS keychain (`keyring` crate) for secrets |
| Network  | reqwest over TDengine REST `/rest/sql/<db>` |
| Pkg mgr  | pnpm |

## Prerequisites

- **Node** ≥ 20
- **pnpm** ≥ 9 (`npm install -g pnpm`)
- **Rust** stable via [rustup](https://rustup.rs)
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: `libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev`

Verify with `pnpm tauri info`.

## Development

```bash
pnpm install
pnpm tauri dev          # full Tauri shell (Rust + React) — recommended
pnpm dev                # frontend only, mock data source, no real TDengine
```

`pnpm dev` is fastest for UI iteration and uses the mock data source. `pnpm tauri dev` is what you want for testing real queries, the updater, or the title bar.

### Useful scripts

| Command            | What it does |
| ------------------ | ------------ |
| `pnpm tauri dev`   | Native window + Vite dev server |
| `pnpm dev`         | Vite-only with mock data source on `http://localhost:1420` |
| `pnpm build`       | `tsc` typecheck + Vite production build |
| `pnpm tauri build` | Build distributable desktop app |
| `pnpm typecheck`   | `tsc --noEmit` |
| `pnpm lint`        | ESLint over `src/` |
| `pnpm format`      | Prettier write |
| `pnpm bump <kind>` | Bump version across `package.json` + `Cargo.toml` + `tauri.conf.json`, refresh `Cargo.lock`, commit, tag `v<x.y.z>` |

## Releasing

Push a tag like `v0.2.0` → [`.github/workflows/release.yml`](.github/workflows/release.yml) builds + signs + publishes a draft GitHub Release with `latest.json` for the in-app updater. Full setup (signing-key generation, secrets, per-release checklist) is in [docs/RELEASE.md](docs/RELEASE.md).

Quick recap:

```bash
pnpm bump patch                      # 0.1.0 → 0.1.1, commits + tags
git push --follow-tags origin main   # main + tag in one shot → CI fires
```

## Project layout

```
.
├── src/
│   ├── components/
│   │   ├── console/       # editor, result grid, autocomplete, history, run logic
│   │   ├── layout/        # TitleBar, ResourcesPanel, StatusBar
│   │   ├── keyboard/      # global shortcuts
│   │   └── ui/            # shadcn primitives
│   ├── datasource/        # DataSource interface + Tauri impl + mock
│   ├── lib/               # cn(), updater store, …
│   ├── store/             # zustand stores
│   └── App.tsx
├── src-tauri/
│   ├── src/
│   │   ├── commands.rs    # Tauri command boundary
│   │   ├── datasource/    # SQLite store + http_client (REST/TDengine) + vault
│   │   └── lib.rs
│   └── tauri.conf.json
├── scripts/bump-version.mjs
├── .github/workflows/     # release.yml
└── docs/RELEASE.md
```

## Status

- **1.0.0**: first stable cut. Phase 1 (mock data source, UI shell) + Phase 2 (Tauri backend, real TDengine queries, persistence, OS-keychain vault) closed; auto-update channel live.
- Code-signing certificates are **not yet** wired up — macOS users right-click → Open the first time; Windows users dismiss SmartScreen. Both `docs/RELEASE.md` and the in-app updater handle the subsequent upgrade path cleanly.

See [FEATURES.md](FEATURES.md) for the long-tail enhancement backlog (TLS, query cancel, WS protocol, etc.).
