import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://wahengchang.github.io",
  base: "/ai-study-note",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [
    sitemap({
      i18n: { defaultLocale: "zh-Hant-TW", locales: { "zh-Hant-TW": "zh-Hant-TW" } },
    }),
  ],
  vite: { plugins: [tailwindcss()] },
});
