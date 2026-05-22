# Taoscope

A desktop manager for TDengine 3.x — fast, opinionated, keyboard-friendly.

> 🚧 Status: **early development**. This commit only ships the application shell
> (window, layout, theme). Connection management, schema browser, and SQL
> console arrive in subsequent OpenSpec changes.

## Tech stack

| Layer    | Choice                                                          |
| -------- | --------------------------------------------------------------- |
| Shell    | [Tauri 2](https://tauri.app) (Rust)                             |
| Frontend | React 18 + Vite + TypeScript (strict)                           |
| UI       | [shadcn/ui](https://ui.shadcn.com) + Tailwind CSS + Radix       |
| Style    | Linear/Vercel-ish, dark-first, accent `#06A77D` (TDengine green)|
| Fonts    | Inter (UI) · JetBrains Mono (code & data grids)                 |
| Pkg mgr  | pnpm                                                            |

## Prerequisites

- **Node** ≥ 20 (project tested on 25)
- **pnpm** ≥ 9 (`npm install -g pnpm` if missing)
- **Rust** stable toolchain via [rustup](https://rustup.rs)
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)

Check with `pnpm tauri info` — every line should be ✔.

## Development

```bash
pnpm install            # first time only
pnpm dev                # frontend-only, opens http://localhost:1420
pnpm tauri dev          # full Tauri shell (Rust + frontend)
```

`pnpm dev` is fastest for UI iteration; `pnpm tauri dev` is for verifying
window chrome, custom title bar drag region, and font rendering.

### Useful scripts

| Command             | What it does                                |
| ------------------- | ------------------------------------------- |
| `pnpm dev`          | Vite dev server on `http://localhost:1420`  |
| `pnpm tauri dev`    | Tauri window + Vite dev server              |
| `pnpm build`        | `tsc` typecheck + Vite production build     |
| `pnpm tauri build`  | Build distributable desktop app (unsigned)  |
| `pnpm typecheck`    | `tsc --noEmit`                              |
| `pnpm lint`         | ESLint over `src/`                          |
| `pnpm format`       | Prettier write across source                |

### Adding shadcn components

```bash
pnpm dlx shadcn@latest add <component> --cwd .
```

The explicit `--cwd .` is needed because pnpm-dlx runs from a temp path and
shadcn otherwise mis-detects the project root.

## Building a distributable

```bash
pnpm tauri build
```

Outputs an **unsigned** `.app` (and `.dmg`) under `src-tauri/target/release/bundle/`.
The first build is slow (~5–10 min) as Rust deps compile.

### Opening an unsigned macOS build

macOS Gatekeeper will block unsigned apps. To open:

- **Recommended**: right-click the app → **Open** → confirm "Open"
- Or via System Settings → Privacy & Security → "Open Anyway"
- Or strip quarantine attribute:
  ```bash
  xattr -d com.apple.quarantine /Applications/Taoscope.app
  ```

Code signing & notarization will be added before any wider release.

## Layout

```
┌─ TitleBar (custom, draggable) ─────────────────────────────┐
│ Taoscope            conn: —          ⚙  ⛶                  │
├──────────┬──────────┬─────────────────────────────────────┤
│ Sidebar  │ Schema   │  Console #1                          │
│          │ Panel    │  (placeholder)                       │
│  (placeh.)│ (placeh.)│                                     │
├──────────┴──────────┴─────────────────────────────────────┤
│ ready                — rows              — ms              │
└────────────────────────────────────────────────────────────┘
```

All five regions are placeholders in this change. Real content lands in:

- `add-connection-management` (Sidebar)
- `add-schema-browser` (SchemaPanel)
- `add-sql-console` (Console tabs + editor + result grid)

## Project layout

```
.
├── src/
│   ├── components/
│   │   ├── layout/        # TitleBar, Sidebar, SchemaPanel, MainArea, StatusBar
│   │   └── ui/            # shadcn components (button, card, …)
│   ├── lib/utils.ts       # cn() helper
│   ├── App.tsx            # shell assembly
│   ├── main.tsx           # React entry
│   └── index.css          # Tailwind + theme tokens
├── src-tauri/             # Rust shell
├── openspec/              # change proposals & specs
└── components.json        # shadcn CLI config
```

## OpenSpec workflow

This project uses [OpenSpec](./openspec) for proposing and tracking changes.
See `openspec/changes/` for active and archived proposals.
