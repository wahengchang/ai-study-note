import { joinSegments } from "../../util/path"
import { QuartzEmitterPlugin } from "../types"
import { write } from "./helpers"
import { FullSlug } from "../../util/path"

export const RobotsTxt: QuartzEmitterPlugin = () => ({
  name: "RobotsTxt",
  async *emit(ctx) {
    const cfg = ctx.cfg.configuration
    const base = cfg.baseUrl ?? ""
    const sitemapUrl = `https://${joinSegments(base, "sitemap.xml")}`

    const content = `User-agent: *
Allow: /

Sitemap: ${sitemapUrl}
`

    yield write({
      ctx,
      content,
      slug: "robots" as FullSlug,
      ext: ".txt",
    })
  },
  async *partialEmit() {},
})
