/**
 * OAuth 2.1 (authorization code + PKCE) helper for Collabis.
 *
 * Collabis uses **public clients** (`token_endpoint_auth_methods = "none"`), so
 * there is no client secret — security comes from PKCE (S256) plus the
 * `resource` indicator (RFC 8707) that binds the token's audience to
 * `https://api.collabis.ru`. The authorization server (issuer) is separate from
 * the API (resource server): tokens are minted at `collabis.ru`, then sent to
 * `api.collabis.ru`.
 *
 * Typical flow:
 * 1. `const { url, state, codeVerifier } = await oauth.createAuthorizationUrl()`
 *    — redirect the user to `url`; persist `state` + `codeVerifier`.
 * 2. On the redirect back, verify `state`, then
 *    `const tokens = await oauth.exchangeCode({ code, codeVerifier })`.
 * 3. Use `tokens.access_token` with `new Client({ auth })`, and
 *    `tokens.refresh_token` (requires the `offline_access` scope) to refresh.
 */

import type { SupportedFetch } from "./fetch-types"
import type { TokenProvider } from "./Client"

const DEFAULT_ISSUER = "https://collabis.ru"
const DEFAULT_RESOURCE = "https://api.collabis.ru"
const DEFAULT_SCOPES = ["pages:read", "pages:write", "offline_access"]

export interface OAuthEndpoints {
  authorization: string
  token: string
  registration: string
  revocation: string
  metadata: string
}

export interface OAuthClientOptions {
  /** Public client id (from dynamic registration or the developer console). */
  clientId: string
  /** Redirect URI registered for this client. HTTP is loopback-only (127.0.0.1). */
  redirectUri: string
  /** Authorization server. Defaults to `https://collabis.ru`. */
  issuer?: string
  /** Token audience (RFC 8707). Defaults to `https://api.collabis.ru`. Pass `""` to omit. */
  resource?: string
  /** Default scopes. Defaults to `pages:read pages:write offline_access`. */
  scopes?: string[]
  /** Override individual endpoints (otherwise derived from the issuer / discovery). */
  endpoints?: Partial<OAuthEndpoints>
  /** Custom fetch. Defaults to the global `fetch`. */
  fetch?: SupportedFetch
}

/** Token endpoint response (RFC 6749 §5.1). */
export interface OAuthTokens {
  access_token: string
  token_type: string
  expires_in?: number
  refresh_token?: string
  scope?: string
}

/** Dynamic client registration response (RFC 7591). */
export interface ClientRegistration {
  client_id: string
  client_id_issued_at?: number
  client_secret?: string
  redirect_uris?: string[]
  token_endpoint_auth_method?: string
  grant_types?: string[]
  response_types?: string[]
  scope?: string
  client_name?: string
  [key: string]: unknown
}

export interface AuthorizationServerMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint?: string
  revocation_endpoint?: string
  scopes_supported?: string[]
  code_challenge_methods_supported?: string[]
  token_endpoint_auth_methods_supported?: string[]
  [key: string]: unknown
}

/** An OAuth protocol error (`{ error, error_description }`) from the issuer. */
export class OAuthError extends Error {
  override readonly name = "OAuthError"
  readonly error: string
  readonly errorDescription: string | undefined
  readonly status: number

  constructor(args: { error: string; description?: string; status: number }) {
    super(args.description ? `${args.error}: ${args.description}` : args.error)
    this.error = args.error
    this.errorDescription = args.description
    this.status = args.status
  }
}

// ── PKCE / random ────────────────────────────────────────────────────────────

interface MinimalCrypto {
  getRandomValues<T extends ArrayBufferView>(array: T): T
  subtle: { digest(algorithm: string, data: ArrayBufferView): Promise<ArrayBuffer> }
}

function webCrypto(): MinimalCrypto {
  const c = (globalThis as { crypto?: MinimalCrypto }).crypto
  if (!c || !c.subtle) {
    throw new Error("Web Crypto is unavailable. Use Node 18+ or a browser for the PKCE helpers.")
  }
  return c
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** A high-entropy PKCE `code_verifier` (RFC 7636), 43–128 URL-safe chars. */
export function generateCodeVerifier(byteLength = 64): string {
  const bytes = new Uint8Array(byteLength)
  webCrypto().getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

/** The S256 `code_challenge` for a given `code_verifier`. */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const digest = await webCrypto().subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier))
  return base64UrlEncode(new Uint8Array(digest))
}

/** A random opaque `state` value for CSRF protection. */
export function generateState(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  webCrypto().getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

// ── Client ───────────────────────────────────────────────────────────────────

export class OAuthClient {
  readonly #clientId: string
  readonly #redirectUri: string
  readonly #resource: string
  readonly #scopes: string[]
  readonly #endpoints: OAuthEndpoints
  readonly #fetch: SupportedFetch

  constructor(options: OAuthClientOptions) {
    const issuer = (options.issuer ?? DEFAULT_ISSUER).replace(/\/+$/, "")
    this.#clientId = options.clientId
    this.#redirectUri = options.redirectUri
    this.#resource = options.resource ?? DEFAULT_RESOURCE
    this.#scopes = options.scopes ?? DEFAULT_SCOPES
    this.#endpoints = {
      authorization: `${issuer}/oauth/authorize`,
      token: `${issuer}/oauth/token`,
      registration: `${issuer}/oauth/register`,
      revocation: `${issuer}/oauth/revoke`,
      metadata: `${issuer}/.well-known/oauth-authorization-server`,
      ...options.endpoints,
    }

    const fetchImpl =
      options.fetch ??
      (typeof globalThis.fetch === "function"
        ? (globalThis.fetch.bind(globalThis) as unknown as SupportedFetch)
        : undefined)
    if (!fetchImpl) {
      throw new Error("No fetch implementation found. Use Node 18+, or pass a `fetch` option.")
    }
    this.#fetch = fetchImpl
  }

  get endpoints(): OAuthEndpoints {
    return { ...this.#endpoints }
  }

  /**
   * Build the authorization URL and the PKCE material to persist for the
   * callback. Redirect the user to `url`; keep `state` and `codeVerifier`.
   */
  async createAuthorizationUrl(opts?: {
    scopes?: string[]
    state?: string
    /** Extra authorization params (e.g. `prompt`). */
    extraParams?: Record<string, string>
  }): Promise<{ url: string; state: string; codeVerifier: string; codeChallenge: string }> {
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    const state = opts?.state ?? generateState()

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.#clientId,
      redirect_uri: this.#redirectUri,
      scope: (opts?.scopes ?? this.#scopes).join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    })
    if (this.#resource) params.set("resource", this.#resource)
    for (const [k, v] of Object.entries(opts?.extraParams ?? {})) params.set(k, v)

    return {
      url: `${this.#endpoints.authorization}?${params.toString()}`,
      state,
      codeVerifier,
      codeChallenge,
    }
  }

  /** Exchange an authorization `code` for tokens. */
  async exchangeCode(opts: {
    code: string
    codeVerifier: string
    redirectUri?: string
    resource?: string
  }): Promise<OAuthTokens> {
    return this.#postForm<OAuthTokens>(this.#endpoints.token, {
      grant_type: "authorization_code",
      code: opts.code,
      redirect_uri: opts.redirectUri ?? this.#redirectUri,
      client_id: this.#clientId,
      code_verifier: opts.codeVerifier,
      resource: opts.resource ?? (this.#resource || undefined),
    })
  }

  /** Exchange a `refresh_token` for a fresh access token (needs `offline_access`). */
  async refreshToken(opts: {
    refreshToken: string
    scopes?: string[]
    resource?: string
  }): Promise<OAuthTokens> {
    return this.#postForm<OAuthTokens>(this.#endpoints.token, {
      grant_type: "refresh_token",
      refresh_token: opts.refreshToken,
      client_id: this.#clientId,
      scope: opts.scopes ? opts.scopes.join(" ") : undefined,
      resource: opts.resource ?? (this.#resource || undefined),
    })
  }

  /** Dynamically register a public client (RFC 7591). Returns the `client_id`. */
  async register(metadata: {
    redirectUris: string[]
    clientName?: string
    scopes?: string[]
    grantTypes?: string[]
    responseTypes?: string[]
    extra?: Record<string, unknown>
  }): Promise<ClientRegistration> {
    return this.#postJson<ClientRegistration>(this.#endpoints.registration, {
      redirect_uris: metadata.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: metadata.grantTypes ?? ["authorization_code", "refresh_token"],
      response_types: metadata.responseTypes ?? ["code"],
      scope: (metadata.scopes ?? this.#scopes).join(" "),
      ...(metadata.clientName ? { client_name: metadata.clientName } : {}),
      ...metadata.extra,
    })
  }

  /** Revoke an access or refresh token (RFC 7009). */
  async revoke(opts: {
    token: string
    tokenTypeHint?: "access_token" | "refresh_token"
  }): Promise<void> {
    await this.#postForm(this.#endpoints.revocation, {
      token: opts.token,
      token_type_hint: opts.tokenTypeHint,
      client_id: this.#clientId,
    })
  }

  /** Fetch the authorization server metadata (RFC 8414). */
  async discover(): Promise<AuthorizationServerMetadata> {
    const response = await this.#fetch(this.#endpoints.metadata, {
      method: "GET",
      headers: { accept: "application/json" },
      body: undefined,
    })
    const text = await response.text()
    if (!response.ok) {
      throw new OAuthError({ error: "metadata_error", description: text, status: response.status })
    }
    return JSON.parse(text) as AuthorizationServerMetadata
  }

  async #postForm<T>(url: string, params: Record<string, string | undefined>): Promise<T> {
    const body = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) body.append(k, v)
    }
    const response = await this.#fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: body.toString(),
    })
    return this.#parse<T>(response)
  }

  async #postJson<T>(url: string, payload: unknown): Promise<T> {
    const response = await this.#fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
    })
    return this.#parse<T>(response)
  }

  async #parse<T>(response: { ok: boolean; status: number; text(): Promise<string> }): Promise<T> {
    const text = await response.text()
    let data: unknown
    try {
      data = text.length > 0 ? JSON.parse(text) : undefined
    } catch {
      data = undefined
    }
    if (!response.ok) {
      const err = (data ?? {}) as { error?: string; error_description?: string }
      throw new OAuthError({
        error: err.error ?? "oauth_error",
        description: err.error_description ?? (typeof data === "undefined" ? text : undefined),
        status: response.status,
      })
    }
    return data as T
  }
}

/**
 * A {@link TokenProvider} that keeps an access token fresh using a refresh
 * token, so a long-lived integration can pass it as `new Client({ auth })` and
 * never hand-manage expiry.
 *
 * ```ts
 * const collabis = new Client({
 *   auth: createTokenProvider({ oauth, refreshToken, onRefresh: persist }),
 * })
 * ```
 */
export function createTokenProvider(opts: {
  oauth: OAuthClient
  refreshToken: string
  initialAccessToken?: string
  /** Epoch ms when the initial access token expires. */
  expiresAt?: number
  scopes?: string[]
  /** Called after every refresh — persist the (possibly rotated) tokens. */
  onRefresh?: (tokens: OAuthTokens) => void
}): TokenProvider {
  let accessToken = opts.initialAccessToken
  let expiresAt = opts.expiresAt ?? 0
  let refreshToken = opts.refreshToken
  let inflight: Promise<string> | null = null
  const EXPIRY_SKEW_MS = 60_000

  return async () => {
    if (accessToken && Date.now() < expiresAt - EXPIRY_SKEW_MS) return accessToken
    if (inflight) return inflight

    inflight = (async () => {
      const tokens = await opts.oauth.refreshToken({ refreshToken, scopes: opts.scopes })
      accessToken = tokens.access_token
      expiresAt = Date.now() + (tokens.expires_in ? tokens.expires_in * 1000 : 3_600_000)
      if (tokens.refresh_token) refreshToken = tokens.refresh_token
      opts.onRefresh?.(tokens)
      return accessToken
    })()
    try {
      return await inflight
    } finally {
      inflight = null
    }
  }
}
