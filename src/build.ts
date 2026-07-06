/**
 * Ergonomic builders for rich text and blocks.
 *
 * The API accepts verbose JSON (`{ type: "paragraph", paragraph: { rich_text:
 * [{ text: "hi" }] } }`); these helpers let you write `block.paragraph("hi")`
 * instead, while still returning fully-typed {@link BlockObjectRequest} values.
 */

import type {
  Annotations,
  BlockObjectRequest,
  RichText,
  RichTextInput,
  RichTextItem,
} from "./api-types"

/** Normalize a string / single item / array into a rich-text array. */
export function richText(input: RichTextInput): RichText {
  if (typeof input === "string") return input.length === 0 ? [] : [{ text: input }]
  return Array.isArray(input) ? input : [input]
}

/** Plain-text run, optionally annotated (bold, italic, color, …). */
export function text(content: string, annotations?: Annotations): RichTextItem {
  return annotations ? { text: content, annotations } : { text: content }
}

/** Hyperlinked text run. */
export function link(content: string, url: string, annotations?: Annotations): RichTextItem {
  const item: RichTextItem = { text: content, link: { url } }
  if (annotations) item.annotations = annotations
  return item
}

interface WithChildren {
  children?: BlockObjectRequest[]
}

const withChildren = <T extends BlockObjectRequest>(block: T, opts?: WithChildren): T =>
  opts?.children && opts.children.length > 0 ? { ...block, children: opts.children } : block

function paragraph(content: RichTextInput, opts?: WithChildren): BlockObjectRequest {
  return withChildren({ type: "paragraph", paragraph: { rich_text: richText(content) } }, opts)
}

function heading1(
  content: RichTextInput,
  opts?: WithChildren & { is_toggleable?: boolean },
): BlockObjectRequest {
  return withChildren(
    { type: "heading_1", heading_1: { rich_text: richText(content), ...toggleable(opts) } },
    opts,
  )
}

function heading2(
  content: RichTextInput,
  opts?: WithChildren & { is_toggleable?: boolean },
): BlockObjectRequest {
  return withChildren(
    { type: "heading_2", heading_2: { rich_text: richText(content), ...toggleable(opts) } },
    opts,
  )
}

function heading3(
  content: RichTextInput,
  opts?: WithChildren & { is_toggleable?: boolean },
): BlockObjectRequest {
  return withChildren(
    { type: "heading_3", heading_3: { rich_text: richText(content), ...toggleable(opts) } },
    opts,
  )
}

const toggleable = (opts?: { is_toggleable?: boolean }): { is_toggleable?: boolean } =>
  opts?.is_toggleable ? { is_toggleable: true } : {}

function bulletedListItem(content: RichTextInput, opts?: WithChildren): BlockObjectRequest {
  return withChildren(
    { type: "bulleted_list_item", bulleted_list_item: { rich_text: richText(content) } },
    opts,
  )
}

function numberedListItem(
  content: RichTextInput,
  opts?: WithChildren & { start?: number },
): BlockObjectRequest {
  const payload = { rich_text: richText(content), ...(opts?.start ? { start: opts.start } : {}) }
  return withChildren({ type: "numbered_list_item", numbered_list_item: payload }, opts)
}

function toDo(
  content: RichTextInput,
  opts?: WithChildren & { checked?: boolean },
): BlockObjectRequest {
  const payload = { rich_text: richText(content), ...(opts?.checked ? { checked: true } : {}) }
  return withChildren({ type: "to_do", to_do: payload }, opts)
}

function toggle(content: RichTextInput, opts?: WithChildren): BlockObjectRequest {
  return withChildren({ type: "toggle", toggle: { rich_text: richText(content) } }, opts)
}

function quote(content: RichTextInput, opts?: WithChildren): BlockObjectRequest {
  return withChildren({ type: "quote", quote: { rich_text: richText(content) } }, opts)
}

function code(content: RichTextInput, opts?: { language?: string }): BlockObjectRequest {
  const payload = {
    rich_text: richText(content),
    ...(opts?.language ? { language: opts.language } : {}),
  }
  return { type: "code", code: payload }
}

function divider(): BlockObjectRequest {
  return { type: "divider", divider: {} }
}

function equation(expression: string): BlockObjectRequest {
  return { type: "equation", equation: { expression } }
}

/** A callout. The text becomes the callout's body paragraph. */
function callout(content: RichTextInput, opts?: { icon?: string }): BlockObjectRequest {
  return {
    type: "callout",
    ...(opts?.icon ? { callout: { icon: opts.icon } } : {}),
    children: [paragraph(content)],
  }
}

function bookmark(url: string, opts?: { title?: string }): BlockObjectRequest {
  return { type: "bookmark", bookmark: { url, ...(opts?.title ? { title: opts.title } : {}) } }
}

/** A single table row; each entry is one cell. */
function tableRow(cells: RichTextInput[]): BlockObjectRequest {
  return { type: "table_row", table_row: { cells: cells.map(richText) } }
}

/** A table from a matrix of cells (row-major). */
function table(
  rows: RichTextInput[][],
  opts?: { has_column_header?: boolean; has_row_header?: boolean; table_width?: number },
): BlockObjectRequest {
  const width = opts?.table_width ?? rows.reduce((max, r) => Math.max(max, r.length), 0)
  return {
    type: "table",
    table: {
      ...(width ? { table_width: width } : {}),
      ...(opts?.has_column_header ? { has_column_header: true } : {}),
      ...(opts?.has_row_header ? { has_row_header: true } : {}),
    },
    children: rows.map(tableRow),
  }
}

/** A single column with its child blocks. */
function column(
  children: BlockObjectRequest[],
  opts?: { width_ratio?: number },
): BlockObjectRequest {
  return {
    type: "column",
    ...(opts?.width_ratio ? { column: { width_ratio: opts.width_ratio } } : {}),
    children,
  }
}

/** A column layout. Pass two or more columns (each an array of blocks). */
function columnList(...columns: BlockObjectRequest[][]): BlockObjectRequest {
  return { type: "column_list", children: columns.map((c) => column(c)) }
}

/** All block builders, grouped for `import { block } from "@collabis/client"`. */
export const block = {
  paragraph,
  heading1,
  heading2,
  heading3,
  bulletedListItem,
  numberedListItem,
  toDo,
  toggle,
  quote,
  code,
  divider,
  equation,
  callout,
  bookmark,
  table,
  tableRow,
  column,
  columnList,
}
