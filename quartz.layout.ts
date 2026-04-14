import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [
    Component.ConditionalRender({
      component: Component.Backlinks(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ConditionalRender({
      component: Component.RecentNotes({ title: "More Reading", limit: 8, showTags: false }),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ConditionalRender({
      component: Component.RecentNotes({ title: "Recently Updated", limit: 8, showTags: true }),
      condition: (page) => page.fileData.slug === "index",
    }),
    Component.Graph(),
  ],
  footer: Component.Footer({
    links: {
      GitHub: "https://github.com/wahengchang/ai-study-note",
      "Powered by Quartz": "https://quartz.jzhao.xyz/",
    },
  }),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ConditionalRender({
      component: Component.ArticleTitle(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ContentMeta(),
    Component.TagList(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.ReaderMode() },
      ],
    }),
    Component.Explorer({
      folderClickBehavior: "collapse",
      folderDefaultState: "open",
      mapFn: (node) => {
        // Convert kebab-case slugs to readable titles
        if (!node.isFolder && node.displayName) {
          node.displayName = node.displayName
            .replace(/^(ch\d+)-/, "$1: ")
            .replace(/-/g, " ")
        }
        if (node.isFolder && node.displayName) {
          node.displayName = node.displayName
            .replace(/-/g, " ")
        }
      },
    }),
  ],
  right: [
    Component.ConditionalRender({
      component: Component.DesktopOnly(Component.TableOfContents()),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ConditionalRender({
      component: Component.RelatedNotes({ title: "Related Articles", limit: 5, showTags: false }),
      condition: (page) => page.fileData.slug !== "index",
    }),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.Breadcrumbs(), Component.ArticleTitle(), Component.ContentMeta()],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
      ],
    }),
    Component.Explorer({
      folderClickBehavior: "collapse",
      folderDefaultState: "open",
      mapFn: (node) => {
        if (!node.isFolder && node.displayName) {
          node.displayName = node.displayName
            .replace(/^(ch\d+)-/, "$1: ")
            .replace(/-/g, " ")
        }
        if (node.isFolder && node.displayName) {
          node.displayName = node.displayName
            .replace(/-/g, " ")
        }
      },
    }),
  ],
  right: [],
}
