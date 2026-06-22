import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@tauri-apps")) {
              return "tauri";
            }
            if (id.includes("@codemirror") || id.includes("@lezer")) {
              return "codemirror";
            }
            if (id.includes("react-dom") || id.includes("/react/")) {
              return "react-vendor";
            }
            return undefined;
          }
          if (id.includes("/src/views/workspace/") && !id.includes("lazy-views")) {
            return "workspace-views";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 1420,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
});
