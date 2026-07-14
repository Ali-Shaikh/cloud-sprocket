import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

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
            const viewMatch = id.match(/\/views\/workspace\/([^/]+)\.tsx$/);
            if (viewMatch?.[1]) {
              return `view-${viewMatch[1].replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`;
            }
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
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/main.tsx",
        "src/types/**",
      ],
      reporter: ["text-summary", "json-summary", "lcov"],
      reportOnFailure: true,
      thresholds: {
        statements: 51,
        branches: 42,
        functions: 45,
        lines: 52,
      },
    },
  },
});
