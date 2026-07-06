/**
 * Collabis API v1 object model.
 *
 * These types mirror the public REST contract (the same one published as
 * OpenAPI at `GET /v1/openapi.json`). They are hand-authored rather than
 * generated, and grouped by resource: rich text → blocks → parents/icon/cover
 * → property values (database rows) → database schema → views.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Rich text
// ─────────────────────────────────────────────────────────────────────────────

export interface Annotations {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  code?: boolean
  /** Collabis color name (experimental — palette names, not CSS colors). */
  color?: string
  /** Collabis background color name (experimental). */
  background_color?: string
}

/** One contiguous run of text sharing the same annotations / link. */
export interface RichTextItem {
  text: string
  annotations?: Annotations
  link?: { url: string }
}

export type RichText = RichTextItem[]

/** What builder helpers and property values accept where a string is enough. */
export type RichTextInput = string | RichTextItem | RichTextItem[]

// ─────────────────────────────────────────────────────────────────────────────
// Parents, icon, cover
// ─────────────────────────────────────────────────────────────────────────────

export type SectionId = "all" | "private" | "shared"

export type CreateParent =
  | { type: "page_id"; page_id: string }
  | { type: "database_id"; database_id: string }
  | { type: "section_id"; section_id: SectionId }

export type MoveParent =
  | { type: "page_id"; page_id: string }
  | { type: "section_id"; section_id: SectionId }
  | { type: "workspace" }

export type ParentResponse =
  | { type: "page_id"; page_id: string }
  | { type: "database_id"; database_id: string }
  | { type: "section_id"; section_id: string }
  | { type: "workspace" }

/** Icon on write: emoji (`🚀`), `:emoji_name:`, or an image URL. `null` clears. */
export type IconRequest = string | null

/** Library cover ids — mirror of the in-app cover gallery. */
export type LibraryCoverId =
  | "Gradient_1"
  | "Gradient_2"
  | "Gradient_3"
  | "Gradient_4"
  | "Gradient_5"
  | "Gradient_6"
  | "Gradient_7"
  | "Gradient_8"
  | "Color_1"
  | "Color_2"
  | "Color_3"
  | "Color_4"
  | "Abstract_1"
  | "Abstract_2"
  | "Abstract_3"
  | "Abstract_4"
  | "Abstract_5"
  | "Abstract_6"
  | "Abstract_7"
  | "Abstract_8"
  | "Nature_1"
  | "Nature_2"
  | "Nature_3"
  | "Nature_4"
  | "Nature_5"
  | "Nature_6"
  | "Nature_7"
  | "Nature_8"

/** Cover on write; `null` clears. `file` covers are read-only (uploaded assets). */
export type CoverRequest =
  { type: "external"; url: string } | { type: "library"; id: LibraryCoverId } | null

export type CoverResponse =
  | { type: "external"; url: string }
  | { type: "library"; id: string }
  | { type: "file"; file_id?: string }

// ─────────────────────────────────────────────────────────────────────────────
// Blocks — write model
// ─────────────────────────────────────────────────────────────────────────────

export interface ParagraphPayload {
  rich_text: RichText
}
export interface HeadingPayload {
  rich_text: RichText
  is_toggleable?: boolean
}
export interface ListItemPayload {
  rich_text: RichText
}
export interface NumberedListItemPayload {
  rich_text: RichText
  start?: number
}
export interface ToDoPayload {
  rich_text: RichText
  checked?: boolean
}
export interface CodePayload {
  rich_text: RichText
  language?: string
}
export interface EquationPayload {
  expression: string
}
export interface CalloutPayload {
  icon?: string
}
export interface ColumnPayload {
  width_ratio?: number
}
export interface TablePayload {
  table_width?: number
  has_column_header?: boolean
  has_row_header?: boolean
}
export interface TableRowPayload {
  /** One entry per cell; each cell is a rich-text array (empty for a blank cell). */
  cells: RichText[]
}
export interface BookmarkPayload {
  url: string
  title?: string
}

type EmptyPayload = Record<string, never>

interface BlockCommon {
  /** Optional client-supplied id — enables idempotent retries. */
  id?: string
  /** Nested children (only container block types accept these). */
  children?: BlockObjectRequest[]
}

/** A writable block. The payload lives under a key equal to `type`. */
export type BlockObjectRequest =
  | (BlockCommon & { type: "paragraph"; paragraph: ParagraphPayload })
  | (BlockCommon & { type: "heading_1"; heading_1: HeadingPayload })
  | (BlockCommon & { type: "heading_2"; heading_2: HeadingPayload })
  | (BlockCommon & { type: "heading_3"; heading_3: HeadingPayload })
  | (BlockCommon & { type: "bulleted_list_item"; bulleted_list_item: ListItemPayload })
  | (BlockCommon & { type: "numbered_list_item"; numbered_list_item: NumberedListItemPayload })
  | (BlockCommon & { type: "to_do"; to_do: ToDoPayload })
  | (BlockCommon & { type: "toggle"; toggle: ListItemPayload })
  | (BlockCommon & { type: "quote"; quote: ListItemPayload })
  | (BlockCommon & { type: "code"; code: CodePayload })
  | (BlockCommon & { type: "divider"; divider?: EmptyPayload })
  | (BlockCommon & { type: "equation"; equation: EquationPayload })
  | (BlockCommon & { type: "callout"; callout?: CalloutPayload })
  | (BlockCommon & { type: "column_list"; column_list?: EmptyPayload })
  | (BlockCommon & { type: "column"; column?: ColumnPayload })
  | (BlockCommon & { type: "table"; table?: TablePayload })
  | (BlockCommon & { type: "table_row"; table_row: TableRowPayload })
  | (BlockCommon & { type: "bookmark"; bookmark: BookmarkPayload })

export type BlockType = BlockObjectRequest["type"]

/** Additional block types that are read-only (returned but never created). */
export type ReadOnlyBlockType =
  "child_page" | "child_database" | "image" | "file" | "video" | "embed" | "unsupported"

// ─────────────────────────────────────────────────────────────────────────────
// Blocks — read model
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A block as returned by read endpoints. Payload keys are optional and the
 * object is intentionally open (`[key: string]: unknown`) for forward
 * compatibility; narrow on `type` and read the matching payload key.
 */
export interface BlockObjectResponse {
  id: string
  type: BlockType | ReadOnlyBlockType
  has_children?: boolean
  children?: BlockObjectResponse[]
  paragraph?: ParagraphPayload
  heading_1?: HeadingPayload
  heading_2?: HeadingPayload
  heading_3?: HeadingPayload
  bulleted_list_item?: ListItemPayload
  numbered_list_item?: NumberedListItemPayload
  to_do?: ToDoPayload
  toggle?: ListItemPayload
  quote?: ListItemPayload
  code?: CodePayload
  divider?: EmptyPayload
  equation?: EquationPayload
  callout?: CalloutPayload
  column_list?: EmptyPayload
  column?: ColumnPayload
  table?: TablePayload
  table_row?: TableRowPayload
  bookmark?: BookmarkPayload
  child_page?: { page_id: string; title?: string; icon?: string }
  child_database?: { database_id: string; title?: string }
  image?: { url: string }
  file?: { title?: string; file_id?: string }
  video?: { url: string }
  embed?: { url: string }
  unsupported?: { raw_type: string }
  [key: string]: unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// Property values (database rows)
// ─────────────────────────────────────────────────────────────────────────────

/** A select/multi-select option reference: at least one of `id` / `title`. */
export interface SelectRef {
  id?: string
  title?: string
}

export interface DateValue {
  start: string
  end?: string
  include_time?: boolean
}

/**
 * A typed property value on write. Exactly one type key must be present.
 * Scalar types accept `null` to clear the value. `title`/`text`/`rich_text`
 * accept a plain string as a shorthand for a single-run rich text.
 */
export type PropertyValueRequest =
  | { title: RichTextInput }
  | { text: RichTextInput }
  | { rich_text: RichTextInput }
  | { number: number | null }
  | { checkbox: boolean }
  | { select: SelectRef | null }
  | { multi_select: SelectRef[] }
  | { date: DateValue | null }
  | { user: Array<{ id: string }> }
  | { url: string | null }
  | { email: string | null }
  | { phone: string | null }

export type PropertiesRequest = Record<string, PropertyValueRequest>

/** A typed property value on read: `{ id, type, <type>: value }`. */
export interface PropertyValueResponse {
  id: string
  type: string
  [key: string]: unknown
}

export type PropertiesResponse = Record<string, PropertyValueResponse>

// ─────────────────────────────────────────────────────────────────────────────
// Database schema
// ─────────────────────────────────────────────────────────────────────────────

export type PropertyType =
  | "title"
  | "text"
  | "rich_text"
  | "number"
  | "checkbox"
  | "date"
  | "select"
  | "multi_select"
  | "user"
  | "url"
  | "email"
  | "phone"

export interface SelectOptionRequest {
  title: string
  color?: string
  /**
   * Existing option id. Pass it when updating a database to rename/recolor an
   * option without unlinking the rows that reference it. Omit on create.
   */
  id?: string
}

export interface PropertyDefinitionRequest {
  type: PropertyType
  /** For `select` / `multi_select`. */
  options?: SelectOptionRequest[]
  /** Number column format (internal Collabis names; experimental). */
  format?: string
  /** Column icon (emoji or `:name:`). */
  icon?: string
}

/** Schema map on database create: column name → definition. */
export type PropertiesSchemaRequest = Record<string, PropertyDefinitionRequest>

/**
 * Schema map on database update. `null` deletes a column; an unknown key adds
 * one; a known key updates it. The `title` column cannot be deleted.
 */
export type PropertiesSchemaUpdate = Record<string, PropertyDefinitionRequest | null>

export interface PropertyDefinitionResponse {
  id: string
  type: string
  options?: Array<{ id: string; title: string; color?: string }>
  format?: string
  icon?: string
}

export type PropertiesSchemaResponse = Record<string, PropertyDefinitionResponse>

// ─────────────────────────────────────────────────────────────────────────────
// Views
// ─────────────────────────────────────────────────────────────────────────────

export type ViewType = "table" | "board" | "calendar" | "gallery"
export type ViewTypeResponse = ViewType | "page"

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "less_than"
  | "greater_than_or_equal"
  | "less_than_or_equal"
  | "is_empty"
  | "is_not_empty"

export type FilterValue = string | number | boolean | string[]

export interface ViewFilter {
  property: string
  operator: FilterOperator
  value?: FilterValue
}

export interface ViewSort {
  property: string
  direction: "asc" | "desc"
}

export interface GroupBy {
  property: string
}

export interface CalendarBy {
  property: string
  as?: "week" | "month"
  show_weekends?: boolean
}

export interface CardConfig {
  size?: "small" | "medium" | "large"
  preview?: "none" | "cover"
  layout?: "compact" | "list"
}

/** View configuration on write. `null` clears the corresponding facet. */
export interface ViewConfig {
  filters?: ViewFilter[] | null
  sorts?: ViewSort[] | null
  group_by?: GroupBy | null
  sub_group_by?: GroupBy | null
  calendar_by?: CalendarBy | null
  visible_properties?: string[]
  wrap_cells?: boolean
  card?: CardConfig | null
}

export interface ViewResponse {
  id: string
  database_id: string
  name?: string
  type: ViewTypeResponse
  url: string
  filters?: Array<ViewFilter & { property_id: string }>
  sorts?: ViewSort[]
  group_by?: GroupBy | null
  sub_group_by?: GroupBy | null
  calendar_by?: CalendarBy | null
  visible_properties?: string[]
  card?: CardConfig | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Query filter grammar (POST /v1/databases/{id}/query)
// ─────────────────────────────────────────────────────────────────────────────

export interface QueryFilterLeaf {
  property: string
  operator: FilterOperator
  value?: FilterValue
}

/** A leaf condition, or a compound `and` / `or` of nested conditions. */
export type QueryFilter = QueryFilterLeaf | { and: QueryFilter[] } | { or: QueryFilter[] }
