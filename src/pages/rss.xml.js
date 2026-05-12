import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export async function GET(context) {
  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort(
    (a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime(),
  );

  const siteWithBase = new URL(import.meta.env.BASE_URL, context.site).toString();

  return rss({
    title: "Waheng Note",
    description:
      "關於程式、工藝與機器的筆記 — AI agent、Claude Code、prompt 工程。",
    site: siteWithBase,
    xmlns: { content: "http://purl.org/rss/1.0/modules/content/" },
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `blog/${post.id}/`,
      categories: [post.data.category, ...post.data.tags],
    })),
    customData: "<language>zh-Hant-TW</language>",
  });
}
