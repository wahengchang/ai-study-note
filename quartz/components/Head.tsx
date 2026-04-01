import { i18n } from "../i18n"
import { FullSlug, getFileExtension, joinSegments, pathToRoot, simplifySlug } from "../util/path"
import { CSSResourceToStyleElement, JSResourceToScriptElement } from "../util/resources"
import { googleFontHref, googleFontSubsetHref } from "../util/theme"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { unescapeHTML } from "../util/escape"
import { CustomOgImagesEmitterName } from "../plugins/emitters/ogImage"
import { getDate } from "./Date"

export default (() => {
  const Head: QuartzComponent = ({
    cfg,
    fileData,
    externalResources,
    ctx,
  }: QuartzComponentProps) => {
    const titleSuffix = cfg.pageTitleSuffix ?? ""
    const title =
      (fileData.frontmatter?.title ?? i18n(cfg.locale).propertyDefaults.title) + titleSuffix
    const description =
      fileData.frontmatter?.socialDescription ??
      fileData.frontmatter?.description ??
      unescapeHTML(fileData.description?.trim() ?? i18n(cfg.locale).propertyDefaults.description)

    const { css, js, additionalHead } = externalResources

    const url = new URL(`https://${cfg.baseUrl ?? "example.com"}`)
    const path = url.pathname as FullSlug
    const baseDir = fileData.slug === "404" ? path : pathToRoot(fileData.slug!)
    const iconPath = joinSegments(baseDir, "static/icon.png")

    // Url of current page — strip trailing /index for clean canonical URLs
    const rawUrl =
      fileData.slug === "404" ? url.toString() : joinSegments(url.toString(), fileData.slug!)
    const socialUrl = rawUrl.replace(/\/index$/, "/")

    // Canonical URL for the current page
    const canonicalUrl = socialUrl

    const usesCustomOgImage = ctx.cfg.plugins.emitters.some(
      (e) => e.name === CustomOgImagesEmitterName,
    )
    const ogImageDefaultPath = `https://${cfg.baseUrl}/static/og-image.png`

    // Determine if this is a content page (article) vs index/listing page
    const isHomePage = fileData.slug === "index"
    const is404 = fileData.slug === "404"
    const isTagPage = fileData.slug?.startsWith("tags/") ?? false
    const isFolderPage =
      !isHomePage && !is404 && !isTagPage && fileData.slug?.endsWith("/index")
    const isContentPage = !isHomePage && !is404 && !isTagPage && !isFolderPage
    const ogType = isContentPage ? "article" : "website"

    // Date metadata for article pages
    const createdDate = fileData.dates?.created
    const modifiedDate = fileData.dates?.modified ?? getDate(cfg, fileData)

    // Estimate word count for article schema
    const wordCount = fileData.text ? fileData.text.split(/\s+/).length : undefined

    // OG image URL for structured data
    const ogImageUrl = usesCustomOgImage
      ? `https://${joinSegments(cfg.baseUrl ?? "", fileData.slug + ".png")}`
      : ogImageDefaultPath

    // Build JSON-LD structured data
    let jsonLd: Record<string, unknown>

    if (isContentPage) {
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: fileData.frontmatter?.title ?? title,
        description: description,
        url: canonicalUrl,
        image: ogImageUrl,
        ...(wordCount && { wordCount }),
        ...(fileData.frontmatter?.tags?.length && { keywords: fileData.frontmatter.tags.join(", ") }),
        ...(createdDate && { datePublished: createdDate.toISOString() }),
        ...(modifiedDate && { dateModified: modifiedDate.toISOString() }),
        author: {
          "@type": "Person",
          name: "AI Study Note",
          url: `https://${cfg.baseUrl}`,
        },
        publisher: {
          "@type": "Organization",
          name: cfg.pageTitle,
          url: `https://${cfg.baseUrl}`,
          logo: {
            "@type": "ImageObject",
            url: `https://${joinSegments(cfg.baseUrl ?? "", "static/icon.png")}`,
          },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": canonicalUrl,
        },
      }
    } else if (isTagPage || isFolderPage) {
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: fileData.frontmatter?.title ?? title,
        description: description,
        url: canonicalUrl,
        isPartOf: {
          "@type": "WebSite",
          name: cfg.pageTitle,
          url: `https://${cfg.baseUrl}`,
        },
      }
    } else {
      // Homepage / WebSite schema with SearchAction
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: cfg.pageTitle,
        url: `https://${cfg.baseUrl}`,
        description: description,
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `https://${cfg.baseUrl}/?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      }
    }

    // Build BreadcrumbList structured data from slug path
    const breadcrumbItems: { "@type": string; position: number; name: string; item?: string }[] = []
    if (fileData.slug && !is404) {
      const slugParts = simplifySlug(fileData.slug).split("/").filter(Boolean)
      breadcrumbItems.push({
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `https://${cfg.baseUrl}`,
      })
      let currentPath = ""
      slugParts.forEach((part, idx) => {
        currentPath += `${part}/`
        const isLast = idx === slugParts.length - 1
        breadcrumbItems.push({
          "@type": "ListItem",
          position: idx + 2,
          name: part.replaceAll("-", " "),
          ...(isLast ? {} : { item: `https://${joinSegments(cfg.baseUrl ?? "", currentPath)}` }),
        })
      })
    }

    const breadcrumbJsonLd =
      breadcrumbItems.length > 1
        ? {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: breadcrumbItems,
          }
        : null

    return (
      <head>
        <title>{title}</title>
        <meta charSet="utf-8" />
        {cfg.theme.cdnCaching && cfg.theme.fontOrigin === "googleFonts" && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" />
            <link rel="stylesheet" href={googleFontHref(cfg.theme)} />
            {cfg.theme.typography.title && (
              <link rel="stylesheet" href={googleFontSubsetHref(cfg.theme, cfg.pageTitle)} />
            )}
          </>
        )}
        <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossOrigin="anonymous" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

        {/* Canonical URL */}
        <link rel="canonical" href={canonicalUrl} />

        {/* Robots directive */}
        {is404 ? (
          <meta name="robots" content="noindex, follow" />
        ) : (
          <meta name="robots" content="index, follow" />
        )}

        {/* Open Graph */}
        <meta property="og:site_name" content={cfg.pageTitle} />
        <meta property="og:title" content={title} />
        <meta property="og:type" content={ogType} />
        <meta property="og:description" content={description} />
        <meta property="og:image:alt" content={description} />

        {/* Article-specific OG meta tags */}
        {isContentPage && createdDate && (
          <meta property="article:published_time" content={createdDate.toISOString()} />
        )}
        {isContentPage && modifiedDate && (
          <meta property="article:modified_time" content={modifiedDate.toISOString()} />
        )}
        {isContentPage &&
          fileData.frontmatter?.tags?.map((tag: string) => (
            <meta property="article:tag" content={tag} />
          ))}

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />

        {!usesCustomOgImage && (
          <>
            <meta property="og:image" content={ogImageDefaultPath} />
            <meta property="og:image:url" content={ogImageDefaultPath} />
            <meta name="twitter:image" content={ogImageDefaultPath} />
            <meta
              property="og:image:type"
              content={`image/${getFileExtension(ogImageDefaultPath) ?? "png"}`}
            />
          </>
        )}

        {cfg.baseUrl && (
          <>
            <meta property="twitter:domain" content={cfg.baseUrl} />
            <meta property="og:url" content={socialUrl} />
            <meta property="twitter:url" content={socialUrl} />
          </>
        )}

        <link rel="icon" href={iconPath} />
        <link rel="apple-touch-icon" href={iconPath} />
        <meta name="theme-color" content="#050505" />
        <meta name="description" content={description} />
        <meta name="generator" content="Quartz" />

        {/* Structured Data: Article or WebSite */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Structured Data: BreadcrumbList */}
        {breadcrumbJsonLd && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
          />
        )}

        {css.map((resource) => CSSResourceToStyleElement(resource, true))}
        {js
          .filter((resource) => resource.loadTime === "beforeDOMReady")
          .map((res) => JSResourceToScriptElement(res, true))}
        {additionalHead.map((resource) => {
          if (typeof resource === "function") {
            return resource(fileData)
          } else {
            return resource
          }
        })}
      </head>
    )
  }

  return Head
}) satisfies QuartzComponentConstructor
