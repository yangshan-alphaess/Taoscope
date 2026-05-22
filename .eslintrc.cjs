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
  plugins: ["react-refresh"],
  rules: {
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
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
            ],
          },
        ],
      },
    },
  ],
};
