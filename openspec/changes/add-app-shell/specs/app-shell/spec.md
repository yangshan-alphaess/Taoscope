## ADDED Requirements

### Requirement: Project Scaffold

The project SHALL ship a runnable Tauri 2 + React 18 + Vite + TypeScript application scaffold managed by pnpm, with a strict TypeScript configuration and the `@/*` path alias pointing to `src/`.

#### Scenario: Fresh clone runs in browser

- **WHEN** a developer clones the repository, runs `pnpm install`, then `pnpm dev`
- **THEN** Vite serves the application on `http://localhost:1420` and the browser renders the application shell without runtime errors

#### Scenario: Fresh clone runs in Tauri shell

- **WHEN** a developer runs `pnpm tauri dev` on the same machine
- **THEN** a native Tauri window opens displaying the same application shell, sharing the Vite dev server on port 1420

#### Scenario: TypeScript strict mode is enforced

- **WHEN** any TypeScript source contains an implicit-any or unchecked nullable access
- **THEN** `tsc --noEmit` fails the build

#### Scenario: Path alias resolves

- **WHEN** a source file imports `@/components/ui/button`
- **THEN** both `tsc` and Vite resolve it to `src/components/ui/button.tsx` (or `.ts`) without configuration warnings

### Requirement: Tailwind and shadcn/ui Integration

The project SHALL integrate Tailwind CSS and the shadcn/ui CLI so that local component sources live under `src/components/ui/` and new components can be added incrementally via the CLI.

#### Scenario: shadcn CLI adds a component locally

- **WHEN** a developer runs `pnpm dlx shadcn@latest add button`
- **THEN** the CLI writes a `button.tsx` source file into `src/components/ui/` and the file compiles without further edits

#### Scenario: Tailwind utility classes apply

- **WHEN** a component uses Tailwind classes such as `bg-background text-foreground`
- **THEN** the rendered output reflects the configured theme tokens in both `pnpm dev` and `pnpm tauri dev`

### Requirement: Design Tokens and Theme

The application SHALL define a dark-first theme using CSS variables for background, foreground, primary, card, border, muted, destructive, and ring; the primary color SHALL be `#06A77D`; UI font SHALL default to Inter with a system fallback stack, and monospace font SHALL default to JetBrains Mono with a `ui-monospace` fallback stack.

#### Scenario: Dark theme is the default

- **WHEN** the application loads with no user preference set
- **THEN** the document root carries the `dark` class (or equivalent attribute) and the background renders the dark token

#### Scenario: Primary color matches brand

- **WHEN** any element uses the `bg-primary` or `text-primary` Tailwind utility
- **THEN** the computed color resolves to `#06A77D` (or its HSL equivalent)

#### Scenario: Monospace font applies to code surfaces

- **WHEN** an element uses the `font-mono` utility
- **THEN** the computed font-family begins with `"JetBrains Mono"` followed by a `ui-monospace` fallback

### Requirement: Application Shell Layout

The main window SHALL render five regions with no business logic: a custom TitleBar at top, a left Sidebar placeholder, a central Schema area placeholder, a right Main area with a Tab container placeholder, and a StatusBar at bottom.

#### Scenario: All five regions are present

- **WHEN** the application is opened in either `pnpm dev` or `pnpm tauri dev`
- **THEN** the DOM contains identifiable elements for TitleBar, Sidebar, Schema area, Main area with at least one placeholder Tab, and StatusBar

#### Scenario: TitleBar is custom and draggable

- **WHEN** the application runs inside the Tauri shell
- **THEN** the native window decorations are hidden and the custom TitleBar exposes a drag region that allows moving the window

#### Scenario: macOS traffic lights remain visible

- **WHEN** the application runs on macOS inside the Tauri shell
- **THEN** the native close / minimize / maximize controls (traffic lights) remain visible and functional on top of the custom TitleBar

#### Scenario: Placeholders contain no business data

- **WHEN** inspecting Sidebar, Schema area, Main area, or StatusBar
- **THEN** content is limited to non-functional placeholders (labels, empty states) with no real connections, schemas, SQL editors, or result grids

### Requirement: Tooling and Project Conventions

The project SHALL configure ESLint and Prettier with Tailwind class sorting, and SHALL expose pnpm scripts `dev`, `build`, `tauri dev`, and `tauri build`.

#### Scenario: Lint script runs

- **WHEN** a developer runs `pnpm lint`
- **THEN** ESLint executes against `src/` and exits with code 0 on a clean tree

#### Scenario: Formatter sorts Tailwind classes

- **WHEN** Prettier formats a file containing `className="text-foreground bg-background p-4"`
- **THEN** the resulting class order matches the Tailwind recommended ordering produced by `prettier-plugin-tailwindcss`

#### Scenario: Tauri production build succeeds

- **WHEN** a developer runs `pnpm tauri build` on macOS
- **THEN** the command produces a distributable `.app` (and `.dmg` if configured) without errors, even though the artifact is unsigned
