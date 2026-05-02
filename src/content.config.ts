import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

export const CATEGORIES = [
  "openclaw",
  "claude-code",
  "prompt-notes",
  "setup-env",
  "seo-and-geo",
] as const;

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    category: z
      .string()
      .transform((v) => v.toLowerCase().trim())
      .pipe(z.enum(CATEGORIES)),
    tags: z.array(z.string().toLowerCase().trim()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
