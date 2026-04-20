import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://wahengchang.github.io",
  base: "/ai-study-note",
  trailingSlash: "always",
  build: { format: "directory" },
  vite: { plugins: [tailwindcss()] },
});
