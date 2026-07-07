import { describe, expect, it } from "vitest"
import { Client } from "../src/Client"
import {
  createTokenProvider,
  generateCodeChallenge,
  generateCodeVerifier,
  OAuthClient,
  OAuthError,
} from "../src/oauth"
import { makeMockFetch, mockResponse } from "./helpers/mock-fetch"

describe("PKCE", () => {
  it("computes the S256 challenge (RFC 7636 test vector)", async () => {
    // From RFC 7636 Appendix B.
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    expect(await generateCodeChallenge(verifier)).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    )
  })

  it("generates URL-safe verifiers within the 43–128 char range", () => {
    const v = generateCodeVerifier()
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(v.length).toBeGreaterThanOrEqual(43)
    expect(v.length).toBeLessThanOrEqual(128)
  })
})

const opts = {
  clientId: "client-123",
  redirectUri: "http://127.0.0.1:8765/callback",
}

describe("OAuthClient.createAuthorizationUrl", () => {
  it("builds a PKCE + resource authorization URL", async () => {
    const oauth = new OAuthClient(opts)
    const { url, state, codeVerifier, codeChallenge } = await oauth.createAuthorizationUrl()

    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe("https://collabis.ru/oauth/authorize")
    expect(parsed.searchParams.get("response_type")).toBe("code")
    expect(parsed.searchParams.get("client_id")).toBe("client-123")
    expect(parsed.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:8765/callback")
    expect(parsed.searchParams.get("scope")).toBe("pages:read pages:write offline_access")
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256")
    expect(parsed.searchParams.get("resource")).toBe("https://api.collabis.ru")
    expect(parsed.searchParams.get("state")).toBe(state)
    expect(parsed.searchParams.get("code_challenge")).toBe(codeChallenge)
    expect(await generateCodeChallenge(codeVerifier)).toBe(codeChallenge)
  })

  it("honors a custom issuer, scopes and state", async () => {
    const oauth = new OAuthClient({
      ...opts,
      issuer: "https://collabis.ru",
      scopes: ["pages:read"],
    })
    const { url } = await oauth.createAuthorizationUrl({ scopes: ["pages:read"], state: "fixed" })
    const parsed = new URL(url)
    expect(parsed.origin).toBe("https://collabis.ru")
    expect(parsed.searchParams.get("scope")).toBe("pages:read")
    expect(parsed.searchParams.get("state")).toBe("fixed")
  })
})

describe("OAuthClient.exchangeCode / refreshToken", () => {
  it("posts the authorization_code grant as form-encoded", async () => {
    const { fetch, calls } = makeMockFetch([
      mockResponse(200, {
        access_token: "at",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "rt",
        scope: "pages:read pages:write",
      }),
    ])
    const oauth = new OAuthClient({ ...opts, fetch })

    const tokens = await oauth.exchangeCode({ code: "abc", codeVerifier: "ver" })
    expect(tokens.access_token).toBe("at")
    expect(tokens.refresh_token).toBe("rt")

    const call = calls[0]!
    expect(call.url).toBe("https://collabis.ru/oauth/token")
    expect(call.init.method).toBe("POST")
    expect(call.init.headers["content-type"]).toBe("application/x-www-form-urlencoded")
    const body = new URLSearchParams(call.init.body!)
    expect(body.get("grant_type")).toBe("authorization_code")
    expect(body.get("code")).toBe("abc")
    expect(body.get("code_verifier")).toBe("ver")
    expect(body.get("client_id")).toBe("client-123")
    expect(body.get("redirect_uri")).toBe("http://127.0.0.1:8765/callback")
    expect(body.get("resource")).toBe("https://api.collabis.ru")
  })

  it("posts the refresh_token grant", async () => {
    const { fetch, calls } = makeMockFetch([
      mockResponse(200, { access_token: "at2", token_type: "Bearer", expires_in: 3600 }),
    ])
    const oauth = new OAuthClient({ ...opts, fetch })

    await oauth.refreshToken({ refreshToken: "rt" })
    const body = new URLSearchParams(calls[0]!.init.body!)
    expect(body.get("grant_type")).toBe("refresh_token")
    expect(body.get("refresh_token")).toBe("rt")
  })

  it("throws OAuthError on an error response", async () => {
    const { fetch } = makeMockFetch([
      mockResponse(400, { error: "invalid_grant", error_description: "code expired" }),
    ])
    const oauth = new OAuthClient({ ...opts, fetch })

    const err = await oauth.exchangeCode({ code: "x", codeVerifier: "y" }).catch((e) => e)
    expect(err).toBeInstanceOf(OAuthError)
    expect(err.error).toBe("invalid_grant")
    expect(err.errorDescription).toBe("code expired")
    expect(err.status).toBe(400)
  })
})

describe("OAuthClient.register", () => {
  it("registers a public client as JSON", async () => {
    const { fetch, calls } = makeMockFetch([mockResponse(201, { client_id: "new-client" })])
    const oauth = new OAuthClient({ ...opts, fetch })

    const reg = await oauth.register({
      redirectUris: ["http://127.0.0.1:8765/callback"],
      clientName: "CLI",
    })
    expect(reg.client_id).toBe("new-client")

    const call = calls[0]!
    expect(call.url).toBe("https://collabis.ru/oauth/register")
    expect(call.init.headers["content-type"]).toBe("application/json")
    const payload = JSON.parse(call.init.body!)
    expect(payload.token_endpoint_auth_method).toBe("none")
    expect(payload.redirect_uris).toEqual(["http://127.0.0.1:8765/callback"])
    expect(payload.grant_types).toContain("authorization_code")
  })
})

describe("createTokenProvider", () => {
  it("refreshes once when expired and reuses the cached token", async () => {
    const { fetch } = makeMockFetch([
      mockResponse(200, { access_token: "fresh", token_type: "Bearer", expires_in: 3600 }),
    ])
    const oauth = new OAuthClient({ ...opts, fetch })
    let persisted: string | undefined
    const provider = createTokenProvider({
      oauth,
      refreshToken: "rt",
      onRefresh: (t) => (persisted = t.access_token),
    })

    expect(await provider()).toBe("fresh")
    expect(await provider()).toBe("fresh") // cached, no second refresh (only one queued response)
    expect(persisted).toBe("fresh")
  })

  it("plugs into Client as the auth source", async () => {
    const { fetch: authFetch } = makeMockFetch([
      mockResponse(200, { access_token: "provided-token", token_type: "Bearer", expires_in: 3600 }),
    ])
    const oauth = new OAuthClient({ ...opts, fetch: authFetch })
    const provider = createTokenProvider({ oauth, refreshToken: "rt" })

    const { fetch: apiFetch, calls } = makeMockFetch([mockResponse(200, { results: [] })])
    const client = new Client({
      auth: provider,
      baseUrl: "https://api.test",
      fetch: apiFetch,
      retry: false,
    })

    await client.search({ query: "x" })
    expect(calls[0]!.init.headers.authorization).toBe("Bearer provided-token")
  })
})
