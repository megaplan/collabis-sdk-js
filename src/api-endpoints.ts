/**
 * Per-endpoint parameter and response types for the Collabis API v1.
 *
 * Each `*Parameters` type is the argument object accepted by the corresponding
 * {@link ../Client!Client} method; path ids (`page_id`, `block_id`, …) travel
 * in the same object and are peeled off into the URL by the client.
 */

import type {
  BlockObjectRequest,
  BlockObjectResponse,
  CoverRequest,
  CoverResponse,
  CreateParent,
  IconRequest,
  MoveParent,
  ParentResponse,
  PropertiesRequest,
  PropertiesResponse,
  PropertiesSchemaRequest,
  PropertiesSchemaResponse,
  PropertiesSchemaUpdate,
  QueryFilter,
  ViewConfig,
  ViewResponse,
  ViewSort,
  ViewType,
} from "./api-types"

// ── Shared ───────────────────────────────────────────────────────────────────

export interface IgnoredItem {
  name: string
  reason: string
}

/** A page-shaped list result (search hits, query rows) share `next_cursor`. */
export interface Paginated<T> {
  results: T[]
  next_cursor?: string
}

// ── Search ─────────────────────────────────────────────────────────────────

export interface SearchParameters {
  /** Keyword search across the workspace. Mutually exclusive with the below. */
  query?: string
  /** Enumerate the rows of a database. */
  database_id?: string
  /** Enumerate the child pages of a page. */
  parent_page_id?: string
  /** Enumerate a sidebar section. */
  section?: "all" | "private" | "shared"
  cursor?: string
}

export interface SearchResult {
  id: string
  url: string
  title: string
  matched_in: "page" | "block" | "database" | "row"
  breadcrumb?: string
  snippet?: string
  block_id?: string
}

export type SearchResponse = Paginated<SearchResult>

// ── Pages ──────────────────────────────────────────────────────────────────

export interface CreatePageParameters {
  parent: CreateParent
  title?: string
  properties?: PropertiesRequest
  icon?: IconRequest
  cover?: CoverRequest
  children?: BlockObjectRequest[]
  /** Duplicate a template page's body into the new page. */
  template_id?: string
}

export interface CreatePageResponse {
  id: string
  url: string
  title?: string
  parent: CreateParent
  ignored?: IgnoredItem[]
}

export interface GetPageParameters {
  page_id: string
}

export interface GetPageResponse {
  id: string
  url: string
  title?: string
  icon?: string
  cover?: CoverResponse
  in_trash?: boolean
  children_count?: number
  parent: ParentResponse
  ancestors?: Array<{ id: string; title: string }>
  /** Present when the page is a database row. */
  properties?: PropertiesResponse
  /** Set when the page is a database row: the owning database id. */
  database_id?: string
}

export type UpdatedField = "title" | "icon" | "cover" | "values" | "in_trash"

export interface UpdatePageParameters {
  page_id: string
  title?: string
  icon?: IconRequest
  cover?: CoverRequest
  properties?: PropertiesRequest
  in_trash?: boolean
}

export interface UpdatePageResponse {
  id: string
  url: string
  updated: UpdatedField[]
  ignored?: IgnoredItem[]
}

export interface MovePageParameters {
  page_id: string
  parent: MoveParent
}

export interface MovePageResponse {
  id: string
  url: string
  parent: MoveParent
}

export interface DuplicatePageParameters {
  page_id: string
}

export interface DuplicatePageResponse {
  id: string
  url: string
  parent_id?: string
}

// ── Blocks ─────────────────────────────────────────────────────────────────

export interface GetBlockParameters {
  block_id: string
}

export type GetBlockResponse = BlockObjectResponse

/** A full block object plus the target id (the payload equals `type`'s key). */
export type UpdateBlockParameters = { block_id: string } & BlockObjectRequest

export type UpdateBlockResponse = BlockObjectResponse

export interface DeleteBlockParameters {
  block_id: string
}

export interface ListBlockChildrenParameters {
  block_id: string
  cursor?: string
  /** `"all"` (default) returns the whole subtree; `"1"` only the top level. */
  depth?: "1" | "all"
  page_size?: number
}

export type ListBlockChildrenResponse = Paginated<BlockObjectResponse>

export interface AppendBlockChildrenParameters {
  block_id: string
  children: BlockObjectRequest[]
  /** Insert after this existing child id (append at the end when omitted). */
  after?: string
}

export interface AppendBlockChildrenResponse {
  results: BlockObjectResponse[]
}

export interface ReplaceBlockChildrenParameters {
  block_id: string
  children: BlockObjectRequest[]
}

export interface ReplaceBlockChildrenResponse {
  results: BlockObjectResponse[]
}

// ── Databases ────────────────────────────────────────────────────────────────

export interface CreateDatabaseParameters {
  parent: { type: "page_id"; page_id: string }
  title?: string
  description?: string
  properties: PropertiesSchemaRequest
}

export interface CreateDatabaseResponse {
  id: string
  url: string
  title?: string
  parent: { type: "page_id"; page_id: string }
  properties: PropertiesSchemaResponse
}

export interface GetDatabaseParameters {
  database_id: string
}

export interface GetDatabaseResponse {
  id: string
  url: string
  title?: string
  icon?: string
  parent?: ParentResponse
  properties: PropertiesSchemaResponse
  views: ViewResponse[]
}

export interface UpdateDatabaseParameters {
  database_id: string
  title?: string
  description?: string
  in_trash?: boolean
  properties?: PropertiesSchemaUpdate
}

export interface UpdateDatabaseResponse {
  id: string
  url: string
  updated: string[]
  properties: PropertiesSchemaResponse
}

export interface QueryDatabaseParameters {
  database_id: string
  filter?: QueryFilter
  sorts?: ViewSort[]
  cursor?: string
  page_size?: number
}

export interface QueryDatabaseRow {
  id: string
  url: string
  title?: string
  properties: PropertiesResponse
}

export interface QueryDatabaseResponse {
  results: QueryDatabaseRow[]
  next_cursor?: string
  /** True when the database is larger than the scan window (result may be partial). */
  truncated?: boolean
}

// ── Views ──────────────────────────────────────────────────────────────────

export interface ListViewsParameters {
  database_id: string
}

export interface ListViewsResponse {
  results: ViewResponse[]
}

export interface CreateViewParameters {
  database_id: string
  name: string
  type: ViewType
  config?: ViewConfig
}

export type CreateViewResponse = ViewResponse

/** Update a view: flat facets plus optional `name`. `null` clears a facet. */
export type UpdateViewParameters = {
  database_id: string
  view_id: string
  name?: string
} & ViewConfig

export type UpdateViewResponse = ViewResponse
