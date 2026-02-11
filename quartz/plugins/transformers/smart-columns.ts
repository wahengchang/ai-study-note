import { QuartzTransformerPlugin } from "../types"
import remarkDirective from "remark-directive"
import { Parent, Root } from "mdast"

type DirectiveData = {
  hName?: string
  hProperties?: Record<string, unknown>
}

type ContainerDirective = Parent & {
  type: "containerDirective"
  name: string
  data?: DirectiveData
}

const isParent = (node: unknown): node is Parent =>
  typeof node === "object" &&
  node !== null &&
  "children" in node &&
  Array.isArray((node as Parent).children)

const isColDirective = (node: unknown): node is ContainerDirective =>
  isParent(node) && node.type === "containerDirective" && (node as ContainerDirective).name === "col"

const normalizeClassName = (value: unknown): string[] => {
  if (!value) return []
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean)
  return [String(value)]
}

const ensureClassName = (data: DirectiveData | undefined, className: string): DirectiveData => {
  const hProperties = { ...(data?.hProperties ?? {}) }
  const classNames = normalizeClassName(hProperties.className)
  if (!classNames.includes(className)) {
    classNames.push(className)
  }
  hProperties.className = classNames
  return { ...(data ?? {}), hProperties }
}

const isSmartColumnsWrapper = (node: Parent): boolean => {
  const data = (node as { data?: DirectiveData }).data
  const hProperties = data?.hProperties ?? {}
  return hProperties["data-smart-columns"] === "true"
}

const wrapColumns = (parent: Parent) => {
  if (!parent.children || parent.children.length === 0) return

  if (isSmartColumnsWrapper(parent)) {
    for (const child of parent.children) {
      if (isParent(child)) {
        wrapColumns(child)
      }
    }
    return
  }

  const originalChildren = parent.children
  const newChildren: Parent["children"] = []
  let currentRow: ContainerDirective | null = null

  for (const node of originalChildren) {
    if (isColDirective(node)) {
      if (!currentRow) {
        currentRow = {
          type: "containerDirective",
          name: "col-group",
          data: {
            hName: "div",
            hProperties: { className: ["split-container"], "data-smart-columns": "true" },
          },
          children: [],
        }
        newChildren.push(currentRow)
      }

      node.data = {
        ...ensureClassName(node.data, "column-content"),
        hName: "div",
      }
      currentRow.children.push(node)
    } else {
      currentRow = null
      newChildren.push(node)
    }
  }

  parent.children = newChildren

  for (const child of parent.children) {
    if (isParent(child)) {
      wrapColumns(child)
    }
  }
}

export const SmartColumns: QuartzTransformerPlugin = () => {
  return {
    name: "SmartColumns",
    markdownPlugins() {
      return [
        remarkDirective,
        () => {
          return (tree: Root) => {
            wrapColumns(tree)
          }
        },
      ]
    },
  }
}
