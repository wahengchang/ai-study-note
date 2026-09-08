import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  base: "/cms/",
  plugins: [react()],
  build: { outDir: resolve(root, "../../dist/cms"), emptyOutDir: true, manifest: true },
});
