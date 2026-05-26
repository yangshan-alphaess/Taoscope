import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

import pkg from "./package.json" with { type: "json" };

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],

  define: {
    // Surface the package.json version to the frontend so the StatusBar can
    // render it without an extra runtime IPC round-trip.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  // Vite options tailored for Tauri development.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Don't watch src-tauri to avoid restart loops during Rust rebuilds.
      ignored: ["**/src-tauri/**"],
    },
  },
});
