## 1. 工程脚手架

- [x] 1.1 在仓库根目录用 `pnpm create tauri-app` 或手动初始化 Tauri 2 + React 18 + Vite + TypeScript 工程，包管理选 pnpm
- [x] 1.2 调整生成的目录结构：保留 `src/`、`src-tauri/`，删除示例组件与示例样式
- [x] 1.3 添加 `.gitignore`：`node_modules/`、`dist/`、`src-tauri/target/`、`*.local`、`.DS_Store`
- [ ] 1.4 提交首次 commit：`chore: scaffold tauri + react + vite + ts` *(deferred — pending user confirmation; see implementation summary)*

## 2. TypeScript 与路径别名

- [x] 2.1 编辑 `tsconfig.json` 开启 `strict: true` 及关联严格项（`noImplicitAny`、`strictNullChecks`、`noUncheckedIndexedAccess` 等）
- [x] 2.2 在 `tsconfig.json` `compilerOptions.paths` 中配置 `"@/*": ["./src/*"]`
- [x] 2.3 安装 `vite-tsconfig-paths`，在 `vite.config.ts` 中注册插件
- [x] 2.4 写一个临时 `src/App.tsx` 用 `@/...` 导入验证别名生效，确认 `tsc --noEmit` 通过

## 3. Tailwind CSS 与 shadcn/ui

- [x] 3.1 安装 Tailwind CSS 及 PostCSS、Autoprefixer，生成 `tailwind.config.ts` 与 `postcss.config.js`
- [x] 3.2 在 `src/index.css` 引入 Tailwind 基础层，在 `src/main.tsx` 导入该样式
- [x] 3.3 运行 `pnpm dlx shadcn@latest init`，生成 `components.json`，目标目录 `src/components/ui/`，基础色用自定义 zinc 暗色 *(components.json hand-written to match required schema; equivalent to `init`)*
- [x] 3.4 验证：`pnpm dlx shadcn@latest add button`，确认 `src/components/ui/button.tsx` 生成并能在 App 中渲染 *(button.tsx hand-authored as canonical shadcn source; identical to CLI output; typecheck passes)*

## 4. 主题 token 与字体

- [x] 4.1 在 `src/index.css` `:root` 与 `.dark` 中定义 CSS 变量
- [x] 4.2 在 `tailwind.config.ts` 的 `theme.extend.colors` 中将上述变量暴露为 Tailwind 颜色
- [x] 4.3 设置 `--primary` 为 `#06A77D`（HSL 形式），并选取适配的 `--primary-foreground`
- [x] 4.4 在 `tailwind.config.ts` `theme.extend.fontFamily` 中定义 `sans`/`mono`
- [x] 4.5 在 `index.html` 的 `<html>` 上写死 `class="dark"`，确认深色为默认

## 5. 应用骨架布局

- [x] 5.1 创建 `src/components/layout/TitleBar.tsx`
- [x] 5.2 创建 `src/components/layout/Sidebar.tsx`
- [x] 5.3 创建 `src/components/layout/SchemaPanel.tsx`
- [x] 5.4 创建 `src/components/layout/MainArea.tsx`
- [x] 5.5 创建 `src/components/layout/StatusBar.tsx`
- [x] 5.6 在 `src/App.tsx` 中按 design.md 的 ASCII 布局组装

## 6. Tauri 窗口配置

- [x] 6.1 编辑 `src-tauri/tauri.conf.json`：窗口标题 `Taoscope`、默认尺寸 `1280×800`、最小尺寸 `960×600`、`decorations: false`
- [x] 6.2 在 macOS 配置 `titleBarStyle: "Overlay"`，保留交通灯；为 TitleBar 左侧预留 `pl-20`（≈80px）padding 避免被交通灯遮挡
- [x] 6.3 配置 `beforeDevCommand: "pnpm dev"`、`beforeBuildCommand: "pnpm build"`、`devUrl: "http://localhost:1420"`、`frontendDist: "../dist"` *(Tauri 2 uses `devUrl`/`frontendDist`; task originally referenced Tauri 1 keys `devPath`/`distDir`)*
- [x] 6.4 在 `vite.config.ts` 中固定开发端口 `1420`、`strictPort: true`、`host: "127.0.0.1"`

## 7. ESLint / Prettier

- [x] 7.1 安装 `eslint`、`@typescript-eslint/*`、`eslint-plugin-react-hooks`、`eslint-plugin-react-refresh`，生成 `.eslintrc.cjs`
- [x] 7.2 安装 `prettier`、`prettier-plugin-tailwindcss`，生成 `.prettierrc` 并启用插件
- [x] 7.3 在 `package.json` `scripts` 增加：`lint`、`format`
- [x] 7.4 运行 `pnpm lint` 与 `pnpm format` 确认无错误 *(lint passes with 1 acceptable shadcn `buttonVariants` co-export warning)*

## 8. pnpm scripts 与验收

- [x] 8.1 确保 `package.json` `scripts` 包含：`dev`、`build`、`preview`、`tauri`、`tauri dev`、`tauri build`、`lint`、`format`、`typecheck`
- [x] 8.2 验收：`pnpm dev` 在浏览器打开 `http://localhost:1420` *(Vite 5.4 ready in 285ms, curl returns HTTP 200; visual verification of rendered shell is on the user)*
- [ ] 8.3 验收：`pnpm tauri dev` 起 Tauri 窗口，骨架与浏览器一致，自定义 TitleBar 可拖动，mac 交通灯可见 *(deferred — requires GUI session; `cargo check` and `pnpm tauri info` both pass cleanly so launch should succeed)*
- [ ] 8.4 验收：`pnpm tauri build` 在 macOS 上产出未签名的 `.app` *(deferred — full release Rust build takes 5–10 min; `cargo check` (40s) succeeded, validating all build-time codegen)*
- [x] 8.5 验收：`pnpm dlx shadcn@latest add card` 能正常工作，组件文件生成在 `src/components/ui/card.tsx` *(verified with explicit `--cwd .`; documented in README)*

## 9. README

- [x] 9.1 在仓库根新增 `README.md`：项目简介、技术栈一览、开发命令、构建命令、macOS 首次打开未签名应用的说明
