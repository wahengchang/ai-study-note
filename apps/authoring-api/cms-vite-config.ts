import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(import.meta.dirname, "cms"),
  base: "/cms/",
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, "../../dist/cms"),
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    rollupOptions: { output: { entryFileNames: "assets/[name]-[hash].js", chunkFileNames: "assets/[name]-[hash].js", assetFileNames: "assets/[name]-[hash][extname]" } },
  },
});
