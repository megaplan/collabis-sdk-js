/**
 * Pagination helpers for cursor-based list endpoints
 * (`search`, `blocks.children.list`, `databases.query`).
 */

export interface PaginatedListArgs {
  cursor?: string
}

export interface PaginatedListResponse<Item> {
  results: Item[]
  next_cursor?: string
}

/**
 * Lazily iterate every item across all pages, fetching the next page only when
 * the current one is exhausted.
 *
 * ```ts
 * for await (const row of iteratePaginatedAPI(collabis.databases.query, {
 *   database_id: id,
 * })) {
 *   console.log(row.title)
 * }
 * ```
 */
export async function* iteratePaginatedAPI<Args extends PaginatedListArgs, Item>(
  listFn: (args: Args) => Promise<PaginatedListResponse<Item>>,
  firstPageArgs: Args,
): AsyncGenerator<Item, void, void> {
  let cursor: string | undefined = firstPageArgs.cursor
  do {
    const response = await listFn({ ...firstPageArgs, cursor })
    yield* response.results
    cursor = response.next_cursor
  } while (cursor)
}

/** Collect every item across all pages into a single array. */
export async function collectPaginatedAPI<Args extends PaginatedListArgs, Item>(
  listFn: (args: Args) => Promise<PaginatedListResponse<Item>>,
  firstPageArgs: Args,
): Promise<Item[]> {
  const results: Item[] = []
  for await (const item of iteratePaginatedAPI(listFn, firstPageArgs)) {
    results.push(item)
  }
  return results
}
