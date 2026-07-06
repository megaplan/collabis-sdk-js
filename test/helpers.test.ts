import { describe, expect, it } from "vitest"
import { collectPaginatedAPI, iteratePaginatedAPI } from "../src/helpers"
import type { PaginatedListResponse } from "../src/helpers"

describe("pagination helpers", () => {
  const makeListFn = () => {
    const seenCursors: Array<string | undefined> = []
    const pages: Record<string, PaginatedListResponse<number>> = {
      start: { results: [1, 2], next_cursor: "c1" },
      c1: { results: [3, 4], next_cursor: "c2" },
      c2: { results: [5], next_cursor: undefined },
    }
    const listFn = async (args: { cursor?: string }): Promise<PaginatedListResponse<number>> => {
      seenCursors.push(args.cursor)
      return pages[args.cursor ?? "start"]!
    }
    return { listFn, seenCursors }
  }

  it("collectPaginatedAPI walks every page in order", async () => {
    const { listFn, seenCursors } = makeListFn()
    const all = await collectPaginatedAPI(listFn, {})
    expect(all).toEqual([1, 2, 3, 4, 5])
    expect(seenCursors).toEqual([undefined, "c1", "c2"])
  })

  it("iteratePaginatedAPI yields lazily and can stop early", async () => {
    const { listFn, seenCursors } = makeListFn()
    const collected: number[] = []
    for await (const item of iteratePaginatedAPI(listFn, {})) {
      collected.push(item)
      if (collected.length === 3) break
    }
    expect(collected).toEqual([1, 2, 3])
    // Stopped after the second page fetch — the third page was never requested.
    expect(seenCursors).toEqual([undefined, "c1"])
  })

  it("honors a starting cursor", async () => {
    const { listFn, seenCursors } = makeListFn()
    const all = await collectPaginatedAPI(listFn, { cursor: "c1" })
    expect(all).toEqual([3, 4, 5])
    expect(seenCursors).toEqual(["c1", "c2"])
  })
})
