import assert from "node:assert/strict";
import test from "node:test";

import { analyzeCmsSeo, contributePublicSeoPage, contributePublicSeoSite } from "../../../extensions/plugins/seo-basics/index.js";

const settings = Object.freeze({ contract: "seo-plugin-settings/v1" as const, publicSiteUrl: "https://notes.example", indexing: "allow" as const });
const content = Object.freeze({ title: "內容標題", seo: Object.freeze({}) });

test("seo-basics 以內容標題與路由建立非阻斷預覽建議", () => {
  const result = analyzeCmsSeo({ contract: "cms-seo-analysis-input/v1", inputDigest: "sha256:input", content, route: "/guide", settings });
  assert.deepEqual(result, {
    contract: "cms-seo-analysis-output/v1",
    preview: { title: "內容標題", canonicalPath: "/guide" },
    suggestions: [{ code: "SEO_TITLE_MISSING", field: "title" }, { code: "SEO_DESCRIPTION_MISSING", field: "description" }],
  });
});

test("seo-basics 的公開貢獻完整回顯頁面綁定並保留站點索引設定", () => {
  const page = contributePublicSeoPage({ contract: "public-seo-page-input/v1", entryId: "entry", revisionId: "r1", route: "/guide", content: Object.freeze({ title: "內容", seo: Object.freeze({ title: "SEO 標題", description: "描述", canonicalPath: "/canonical" }) }), settings });
  assert.deepEqual(page, {
    contract: "public-seo-page-contribution/v1", entryId: "entry", revisionId: "r1", route: "/guide", title: "SEO 標題", description: "描述", canonicalPath: "/canonical",
    openGraph: { title: "SEO 標題", description: "描述", urlPath: "/canonical", type: "article" },
    jsonLd: { type: "WebPage", name: "SEO 標題", description: "描述", urlPath: "/canonical" },
  });
  assert.deepEqual(contributePublicSeoSite({ contract: "public-seo-site-input/v1", settings }), { contract: "public-seo-site-contribution/v1", sitemap: { include: "all-published" }, robots: { indexing: "allow" } });
});
