import { describe, expect, it } from "vitest"
import { Client } from "../src/Client"
import {
  APIErrorCode,
  APIResponseError,
  RequestTimeoutError,
  UnknownHTTPResponseError,
} from "../src/errors"
import type { SupportedFetch } from "../src/fetch-types"
import { makeMockFetch, mockResponse } from "./helpers/mock-fetch"

const base = "https://api.test"

describe("Client request building", () => {
  it("POSTs pages.create to the right URL with auth + JSON body", async () => {
    const { fetch, calls } = makeMockFetch([
      mockResponse(201, {
        id: "p1",
        url: "u",
        title: "t",
        parent: { type: "page_id", page_id: "abc" },
      }),
    ])
    const client = new Client({ auth: "tok", baseUrl: base, fetch, retry: false })

    const page = await client.pages.create({
      parent: { type: "page_id", page_id: "abc" },
      title: "t",
    })

    expect(page.id).toBe("p1")
    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.url).toBe(`${base}/v1/pages`)
    expect(call.init.method).toBe("POST")
    expect(call.init.headers.authorization).toBe("Bearer tok")
    expect(call.init.headers["content-type"]).toBe("application/json")
    expect(JSON.parse(call.init.body!)).toEqual({
      parent: { type: "page_id", page_id: "abc" },
      title: "t",
    })
  })

  it("URL-encodes path ids", async () => {
    const { fetch, calls } = makeMockFetch([mockResponse(200, { id: "a b", type: "paragraph" })])
    const client = new Client({ auth: "tok", baseUrl: base, fetch, retry: false })

    await client.blocks.retrieve({ block_id: "a b/c" })

    expect(calls[0]!.url).toBe(`${base}/v1/blocks/a%20b%2Fc`)
    expect(calls[0]!.init.method).toBe("GET")
    expect(calls[0]!.init.body).toBeUndefined()
  })

  it("serializes query params and drops undefined", async () => {
    const { fetch, calls } = makeMockFetch([mockResponse(200, { results: [] })])
    const client = new Client({ auth: "tok", baseUrl: base, fetch, retry: false })

    await client.search({ query: "hello world", cursor: "c1", database_id: undefined })

    const url = new URL(calls[0]!.url)
    expect(url.pathname).toBe("/v1/search")
    expect(url.searchParams.get("query")).toBe("hello world")
    expect(url.searchParams.get("cursor")).toBe("c1")
    expect(url.searchParams.has("database_id")).toBe(false)
  })

  it("returns undefined for 204 No Content (blocks.delete)", async () => {
    const { fetch } = makeMockFetch([mockResponse(204)])
    const client = new Client({ auth: "tok", baseUrl: base, fetch, retry: false })

    await expect(client.blocks.delete({ block_id: "b1" })).resolves.toBeUndefined()
  })

  it("lets a per-request token override the client token", async () => {
    const { fetch, calls } = makeMockFetch([mockResponse(200, {})])
    const client = new Client({ auth: "tok", baseUrl: base, fetch, retry: false })

    await client.request({ method: "get", path: "/v1/x", auth: "other" })

    expect(calls[0]!.init.headers.authorization).toBe("Bearer other")
  })
})

describe("Client error mapping", () => {
  it("maps the error envelope to APIResponseError", async () => {
    const { fetch } = makeMockFetch([
      mockResponse(404, { error: { code: "not_found", message: "nope", request_id: "r1" } }),
    ])
    const client = new Client({ auth: "tok", baseUrl: base, fetch, retry: false })

    const err = await client.pages.retrieve({ page_id: "x" }).catch((e) => e)
    expect(err).toBeInstanceOf(APIResponseError)
    expect(err.code).toBe(APIErrorCode.NotFound)
    expect(err.status).toBe(404)
    expect(err.requestId).toBe("r1")
    expect(err.message).toBe("nope")
  })

  it("carries details (e.g. validation issues, insufficient_scope)", async () => {
    const { fetch } = makeMockFetch([
      mockResponse(403, {
        error: {
          code: "insufficient_scope",
          message: "need write",
          details: { scope: "pages:write" },
        },
      }),
    ])
    const client = new Client({ auth: "tok", baseUrl: base, fetch, retry: false })

    const err = (await client.pages
      .update({ page_id: "x", title: "t" })
      .catch((e) => e)) as APIResponseError
    expect(err.code).toBe("insufficient_scope")
    expect(err.details).toEqual({ scope: "pages:write" })
  })

  it("falls back to UnknownHTTPResponseError on a non-envelope body", async () => {
    const { fetch } = makeMockFetch([mockResponse(502, "<html>bad gateway</html>")])
    const client = new Client({ auth: "tok", baseUrl: base, fetch, retry: false })

    const err = await client.search({ query: "x" }).catch((e) => e)
    expect(err).toBeInstanceOf(UnknownHTTPResponseError)
    expect(err.status).toBe(502)
    expect(err.body).toContain("bad gateway")
  })
})

describe("Client retries", () => {
  it("retries a 429 honoring Retry-After, then succeeds", async () => {
    const { fetch, calls } = makeMockFetch([
      mockResponse(
        429,
        { error: { code: "rate_limited", message: "slow down" } },
        { "retry-after": "0" },
      ),
      mockResponse(200, { results: [], ok: true }),
    ])
    const client = new Client({
      auth: "tok",
      baseUrl: base,
      fetch,
      retry: { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 5 },
    })

    await client.search({ query: "x" })
    expect(calls).toHaveLength(2)
  })

  it("gives up after exhausting retries and throws the last API error", async () => {
    const { fetch, calls } = makeMockFetch([
      mockResponse(503, { error: { code: "upstream_error", message: "down" } }),
      mockResponse(503, { error: { code: "upstream_error", message: "down" } }),
    ])
    const client = new Client({
      auth: "tok",
      baseUrl: base,
      fetch,
      retry: { maxRetries: 1, initialDelayMs: 1, maxDelayMs: 5 },
    })

    const err = await client.search({ query: "x" }).catch((e) => e)
    expect(err).toBeInstanceOf(APIResponseError)
    expect(calls).toHaveLength(2)
  })

  it("does not retry a 4xx like 422", async () => {
    const { fetch, calls } = makeMockFetch([
      mockResponse(422, { error: { code: "unprocessable", message: "bad" } }),
    ])
    const client = new Client({ auth: "tok", baseUrl: base, fetch, retry: { maxRetries: 3 } })

    await client.search({ query: "x" }).catch(() => {})
    expect(calls).toHaveLength(1)
  })
})

describe("Client timeout", () => {
  it("aborts and throws RequestTimeoutError", async () => {
    const neverFetch: SupportedFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason ?? new Error("aborted")),
        )
      })
    const client = new Client({
      auth: "tok",
      baseUrl: base,
      fetch: neverFetch,
      timeoutMs: 10,
      retry: false,
    })

    await expect(client.search({ query: "x" })).rejects.toBeInstanceOf(RequestTimeoutError)
  })
})
