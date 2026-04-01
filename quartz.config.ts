import { QuartzConfig } from "./quartz/cfg";
import * as Plugin from "./quartz/plugins";

const isServeMode = process.argv.includes("--serve");

/**
 * Quartz 4 Configuration
 *
 * See https://quartz.jzhao.xyz/configuration for more information.
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "AI Study Note",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: true,
    analytics: {
      provider: "google",
      tagId: "G-HQ2GFFXNDD",
    },
    locale: "en-US",
    baseUrl: "wahengchang.github.io/ai-study-note",
    ignorePatterns: ["private", "templates", ".obsidian"],
    defaultDateType: "modified",
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        header: "Inter",
        body: "Inter",
        code: "JetBrains Mono",
      },
      colors: {
        lightMode: {
          light: "#050505",
          lightgray: "#222222",
          gray: "#666666",
          darkgray: "#e5e5e5",
          dark: "#ffffff",
          secondary: "#ffffff",
          tertiary: "#ffffff",
          highlight: "#111111",
          textHighlight: "#ffffff1a",
        },
        darkMode: {
          light: "#050505",
          lightgray: "#222222",
          gray: "#666666",
          darkgray: "#e5e5e5",
          dark: "#ffffff",
          secondary: "#ffffff",
          tertiary: "#ffffff",
          highlight: "#111111",
          textHighlight: "#ffffff1a",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "git", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "github-light",
          dark: "github-dark",
        },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.SmartColumns(),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
      // OG image generation fetches fonts from the network. Skip it in local serve mode.
      ...(isServeMode ? [] : [Plugin.CustomOgImages()]),
    ],
  },
};

export default config;
