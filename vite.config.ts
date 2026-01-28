import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  
  // Optimize deps configuration
  optimizeDeps: {
    // Don't pre-bundle lamejs - it has internal globals that break when optimized
    exclude: ['lamejs'],
  },
  
  // Build configuration
  build: {
    // Ensure lamejs is bundled correctly without breaking its internal globals
    commonjsOptions: {
      include: [/lamejs/, /node_modules/],
      transformMixedEsModules: true,
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    // Bind to 0.0.0.0 to allow access from other devices on the network (for Live Slides notepad)
    host: host || "0.0.0.0",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
