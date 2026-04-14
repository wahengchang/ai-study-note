import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { resolveRelative } from "../util/path"
import { QuartzPluginData } from "../plugins/vfile"
import style from "./styles/relatedNotes.scss"
import { classNames } from "../util/lang"

interface Options {
  title?: string
  limit: number
  showTags: boolean
}

const defaultOptions: Options = {
  title: "Related Articles",
  limit: 5,
  showTags: false,
}

export default ((userOpts?: Partial<Options>) => {
  const RelatedNotes: QuartzComponent = ({
    allFiles,
    fileData,
    displayClass,
    cfg,
  }: QuartzComponentProps) => {
    const opts = { ...defaultOptions, ...userOpts }
    const currentTags = fileData.frontmatter?.tags ?? []

    if (currentTags.length === 0) {
      return null
    }

    const currentTagSet = new Set(currentTags)

    // Find pages sharing at least one tag, excluding self
    const related: { page: QuartzPluginData; sharedCount: number }[] = []
    for (const page of allFiles) {
      if (page.slug === fileData.slug) continue
      const pageTags = page.frontmatter?.tags ?? []
      const sharedCount = pageTags.filter((t: string) => currentTagSet.has(t)).length
      if (sharedCount > 0) {
        related.push({ page, sharedCount })
      }
    }

    if (related.length === 0) {
      return null
    }

    // Sort by shared tag count (desc), then by date (desc)
    related.sort((a, b) => {
      if (b.sharedCount !== a.sharedCount) return b.sharedCount - a.sharedCount
      const dateA = a.page.dates?.modified ?? a.page.dates?.created
      const dateB = b.page.dates?.modified ?? b.page.dates?.created
      if (dateA && dateB) return new Date(dateB).getTime() - new Date(dateA).getTime()
      return 0
    })

    const items = related.slice(0, opts.limit)

    return (
      <div class={classNames(displayClass, "related-notes")}>
        <h3>{opts.title}</h3>
        <ul>
          {items.map(({ page }) => {
            const title = page.frontmatter?.title ?? page.slug!
            return (
              <li>
                <a href={resolveRelative(fileData.slug!, page.slug!)} class="internal">
                  {title}
                </a>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  RelatedNotes.css = style
  return RelatedNotes
}) satisfies QuartzComponentConstructor
