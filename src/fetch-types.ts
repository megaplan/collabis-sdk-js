/**
 * Minimal structural typing for the `fetch` implementation the client depends
 * on. Node 20+ and all modern browsers ship a compatible global `fetch`; a
 * custom one (undici, node-fetch, a test double) can be injected via the
 * `fetch` client option as long as it matches this shape.
 */

export interface SupportedResponse {
  ok: boolean
  status: number
  headers: { forEach(cb: (value: string, key: string) => void): void }
  text(): Promise<string>
}

export interface SupportedRequestInfo {
  method: string
  body: string | undefined
  headers: Record<string, string>
  signal?: AbortSignal
}

export type SupportedFetch = (url: string, init: SupportedRequestInfo) => Promise<SupportedResponse>
