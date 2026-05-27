module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["dist", "src-tauri/target", "node_modules", ".eslintrc.cjs"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["react-refresh", "i18next"],
  rules: {
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    // Catch any user-visible JSX text that bypasses i18n. Only validates plain
    // text inside JSX markup (mode jsx-text-only); attribute coverage
    // (title / placeholder / aria-label) was migrated by hand. The words list
    // re-states the plugin defaults (ASCII punctuation, SCREAMING_CASE) and
    // adds the symbol glyphs used as separators / status icons in the UI.
    "i18next/no-literal-string": [
      "error",
      {
        mode: "jsx-text-only",
        words: {
          exclude: [
            "[0-9!-/:-@[-`{-~]+",
            "[A-Z_-]+",
            "[·—×✕✓⚠⏱↩⌘⇧]+",
            // Brand name and URL scheme literals are not translatable copy.
            "Taoscope",
            "https?://",
            "wss?://",
          ],
        },
      },
    ],
  },
  overrides: [
    {
      // Components must use the DataSource only via the Provider/hook, never
      // a concrete implementation. This keeps the Phase-2 swap (MockDataSource
      // -> TauriDataSource) a one-line change in App.tsx.
      files: ["src/components/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@/datasource/mock",
                message:
                  "Components must access DataSource via useDataSource(); do not import concrete implementations.",
              },
              {
                name: "@/datasource/tauri",
                message:
                  "Components must access DataSource via useDataSource(); do not import concrete implementations.",
              },
            ],
          },
        ],
      },
    },
  ],
};
