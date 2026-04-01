import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (
            id.includes("/d3-geo/") ||
            id.includes("/topojson-client/") ||
            id.includes("/world-atlas/")
          ) {
            return "geo";
          }

          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
            return "react-vendor";
          }

          if (id.includes("/zustand/")) {
            return "state";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
