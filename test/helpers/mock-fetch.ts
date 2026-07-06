import type { SupportedFetch, SupportedRequestInfo, SupportedResponse } from "../../src/fetch-types"

export interface RecordedCall {
  url: string
  init: SupportedRequestInfo
}

/** Build a fake Response matching the structural `SupportedResponse` shape. */
export function mockResponse(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): SupportedResponse {
  const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      forEach(cb: (value: string, key: string) => void) {
        for (const [k, v] of Object.entries(headers)) cb(v, k)
      },
    },
    text: async () => text,
  }
}

/** A fetch double that returns queued responses and records every call. */
export function makeMockFetch(responses: SupportedResponse[]): {
  fetch: SupportedFetch
  calls: RecordedCall[]
} {
  const queue = [...responses]
  const calls: RecordedCall[] = []
  const fetch: SupportedFetch = async (url, init) => {
    calls.push({ url, init })
    const next = queue.shift()
    if (!next) throw new Error(`mock fetch: no response queued for ${init.method} ${url}`)
    return next
  }
  return { fetch, calls }
}
