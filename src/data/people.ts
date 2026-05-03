// Registry of notable figures referenced from notes in src/content/blog/.
// Posts attribute via the `people: [slug, ...]` frontmatter field; build fails
// on unknown slugs (validated by the Zod schema in src/content.config.ts).
//
// Adding a person:
//   1. Append a record below with full-name kebab-case slug.
//   2. Write a one-paragraph zh-tw bio (~60-100 chars).
//   3. List 2-4 canonical external links (no aggregators).
//   4. Tag the relevant posts' frontmatter `people:` field.

export interface PersonLink {
  label: string;
  url: string;
}

export interface Person {
  slug: string;
  displayName: string;
  bio: string;
  links: PersonLink[];
}

export const PEOPLE = [
  {
    slug: "matt-pocock",
    displayName: "Matt Pocock",
    bio: "TypeScript 教育者，Total TypeScript 課程作者，目前經營 AI Hero 教大家寫 LLM 應用。前 Vercel 與 Stately 工程師，以短而可實作的開發者教學內容著稱。",
    links: [
      { label: "Total TypeScript", url: "https://www.totaltypescript.com/" },
      { label: "AI Hero", url: "https://www.aihero.dev/" },
      { label: "Twitter / X", url: "https://x.com/mattpocockuk" },
      { label: "GitHub", url: "https://github.com/mattpocock" },
    ],
  },
  {
    slug: "harry-dry",
    displayName: "Harry Dry",
    bio: "Marketing Examples 創辦人，每週寄一封精煉的廣告文案案例 newsletter，訂閱人數超過 13 萬。專長把抽象訴求改寫成可視覺化、可驗證的具體句子。",
    links: [
      { label: "Marketing Examples", url: "https://marketingexamples.com/" },
      { label: "Twitter / X", url: "https://x.com/harrydry" },
      {
        label: "Learn Copywriting in 76 Minutes",
        url: "https://www.youtube.com/watch?v=TUMjnmfsPeM",
      },
    ],
  },
] as const satisfies readonly Person[];

export type PersonSlug = (typeof PEOPLE)[number]["slug"];

export const PEOPLE_SLUGS = PEOPLE.map((p) => p.slug) as readonly PersonSlug[];

export function getPerson(slug: string): Person | undefined {
  return PEOPLE.find((p) => p.slug === slug);
}
