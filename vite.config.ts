import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // Projet sur un lecteur Windows monté en DrvFs (/mnt/c/...) : les
    // événements inotify natifs ne traversent pas cette frontière de façon
    // fiable côté WSL2, donc chokidar rate des changements de fichiers sans
    // le mode "polling" (le HMR sert alors silencieusement une version
    // périmée, déjà observé deux fois sur ce projet).
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      // Voir docs/adr/0001-vite-proxy-no-cors.md : le frontend n'appelle
      // que son propre origin, proxifié vers le backend Spring Boot.
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/ws": {
        target: "http://localhost:8080",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
