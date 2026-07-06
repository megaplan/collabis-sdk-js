import type {
  AppendBlockChildrenParameters,
  AppendBlockChildrenResponse,
  CreateDatabaseParameters,
  CreateDatabaseResponse,
  CreatePageParameters,
  CreatePageResponse,
  CreateViewParameters,
  CreateViewResponse,
  DeleteBlockParameters,
  DuplicatePageParameters,
  DuplicatePageResponse,
  GetBlockParameters,
  GetBlockResponse,
  GetDatabaseParameters,
  GetDatabaseResponse,
  GetPageParameters,
  GetPageResponse,
  ListBlockChildrenParameters,
  ListBlockChildrenResponse,
  ListViewsParameters,
  ListViewsResponse,
  MovePageParameters,
  MovePageResponse,
  QueryDatabaseParameters,
  QueryDatabaseResponse,
  ReplaceBlockChildrenParameters,
  ReplaceBlockChildrenResponse,
  SearchParameters,
  SearchResponse,
  UpdateBlockParameters,
  UpdateBlockResponse,
  UpdateDatabaseParameters,
  UpdateDatabaseResponse,
  UpdatePageParameters,
  UpdatePageResponse,
  UpdateViewParameters,
  UpdateViewResponse,
} from "./api-endpoints"
import {
  APIResponseError,
  parseAPIErrorResponse,
  RequestTimeoutError,
  UnknownHTTPResponseError,
} from "./errors"
import type { SupportedFetch, SupportedResponse } from "./fetch-types"
import { LogLevel, logLevelSatisfies, makeConsoleLogger } from "./logging"
import type { Logger } from "./logging"
import { PACKAGE_NAME, PACKAGE_VERSION } from "./version"

const DEFAULT_BASE_URL = "https://api.collabis.ru"
const DEFAULT_TIMEOUT_MS = 60_000

/** HTTP status codes worth retrying (transient / rate limiting). */
const RETRIABLE_STATUS = new Set([429, 502, 503, 504])

export interface RetryOptions {
  /** Max additional attempts after the first (default 3). */
  maxRetries?: number
  /** Base backoff before the first retry, in ms (default 500). */
  initialDelayMs?: number
  /** Upper bound on a single backoff, in ms (default 8000). */
  maxDelayMs?: number
}

export interface ClientOptions {
  /**
   * OAuth 2.1 bearer access token for `api.collabis.ru`. Optional here so the
   * token can also be passed per request via `request({ auth })`; most callers
   * set it once on the client.
   */
  auth?: string
  /** API origin. Defaults to `https://api.collabis.ru`. */
  baseUrl?: string
  /** Per-request timeout in ms (default 60000). */
  timeoutMs?: number
  /** Minimum level emitted by the logger (default `LogLevel.WARN`). */
  logLevel?: LogLevel
  /** Custom logger; defaults to a `console`-based one. */
  logger?: Logger
  /** Custom `fetch`. Defaults to the global `fetch` (Node 18+ / browsers). */
  fetch?: SupportedFetch
  /** Retry policy for transient failures. Pass `false` to disable retries. */
  retry?: RetryOptions | false
  /** Extra headers merged into every request. */
  headers?: Record<string, string>
}

type Method = "get" | "post" | "patch" | "put" | "delete"

export interface RequestParameters {
  path: string
  method: Method
  /** Query params; `undefined` values are dropped, others are stringified. */
  query?: object
  body?: object
  /** Overrides the client-level token for this call. */
  auth?: string
  /** Caller-controlled cancellation, in addition to the timeout. */
  signal?: AbortSignal
}

const encodeId = (id: string): string => encodeURIComponent(id)

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Client for the Collabis API.
 *
 * ```ts
 * const collabis = new Client({ auth: process.env.COLLABIS_TOKEN })
 * const page = await collabis.pages.create({
 *   parent: { type: "page_id", page_id: "…" },
 *   title: "Hello",
 * })
 * ```
 */
export class Client {
  readonly #auth: string | undefined
  readonly #baseUrl: string
  readonly #timeoutMs: number
  readonly #logLevel: LogLevel
  readonly #logger: Logger
  readonly #fetch: SupportedFetch
  readonly #retry: Required<RetryOptions> | null
  readonly #headers: Record<string, string>

  constructor(options: ClientOptions = {}) {
    this.#auth = options.auth
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "")
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.#logLevel = options.logLevel ?? LogLevel.WARN
    this.#logger = options.logger ?? makeConsoleLogger(PACKAGE_NAME)
    this.#headers = options.headers ?? {}

    const fetchImpl =
      options.fetch ??
      (typeof globalThis.fetch === "function"
        ? (globalThis.fetch.bind(globalThis) as unknown as SupportedFetch)
        : undefined)
    if (!fetchImpl) {
      throw new Error(
        "No fetch implementation found. Use Node 18+, or pass a `fetch` option to the Client.",
      )
    }
    this.#fetch = fetchImpl

    this.#retry =
      options.retry === false
        ? null
        : {
            maxRetries: options.retry?.maxRetries ?? 3,
            initialDelayMs: options.retry?.initialDelayMs ?? 500,
            maxDelayMs: options.retry?.maxDelayMs ?? 8_000,
          }
  }

  // ── Low-level request (also usable for endpoints not yet wrapped below) ────

  async request<Response = unknown>(params: RequestParameters): Promise<Response> {
    const { path, method, query, body, auth, signal } = params
    const url = this.#buildUrl(path, query)
    const token = auth ?? this.#auth

    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": `${PACKAGE_NAME}/${PACKAGE_VERSION}`,
      ...this.#headers,
    }
    if (token) headers.authorization = `Bearer ${token}`
    const serializedBody = body === undefined ? undefined : JSON.stringify(body)
    if (serializedBody !== undefined) headers["content-type"] = "application/json"

    const maxAttempts = (this.#retry?.maxRetries ?? 0) + 1
    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.#log(LogLevel.DEBUG, "request", { method, url, attempt })
      try {
        const response = await this.#fetchWithTimeout(url, {
          method: method.toUpperCase(),
          headers,
          body: serializedBody,
          signal,
        })
        const responseHeaders = collectHeaders(response)
        const text = await response.text()

        if (response.ok) {
          return (text.length > 0 ? JSON.parse(text) : undefined) as Response
        }

        const apiError = safeParseError(response.status, responseHeaders, text)
        if (this.#shouldRetry(attempt, maxAttempts, response.status)) {
          lastError = apiError
          await sleep(this.#backoff(attempt, responseHeaders["retry-after"]))
          continue
        }
        throw apiError
      } catch (error) {
        if (error instanceof APIResponseError || error instanceof UnknownHTTPResponseError) {
          throw error
        }
        // Network error or timeout — retriable within the attempt budget.
        const normalized = normalizeRequestError(error)
        if (attempt < maxAttempts) {
          lastError = normalized
          this.#log(LogLevel.WARN, "request failed, retrying", {
            attempt,
            error: normalized.message,
          })
          await sleep(this.#backoff(attempt))
          continue
        }
        throw normalized
      }
    }
    // Exhausted retries on a transient HTTP status (loop `continue`d out).
    throw lastError
  }

  #buildUrl(path: string, query: RequestParameters["query"]): string {
    const url = `${this.#baseUrl}${path.startsWith("/") ? path : `/${path}`}`
    if (!query) return url
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
      if (value !== undefined && value !== null) search.append(key, String(value))
    }
    const qs = search.toString()
    return qs.length > 0 ? `${url}?${qs}` : url
  }

  async #fetchWithTimeout(
    url: string,
    init: {
      method: string
      headers: Record<string, string>
      body: string | undefined
      signal?: AbortSignal
    },
  ): Promise<SupportedResponse> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new RequestTimeoutError()), this.#timeoutMs)
    const onExternalAbort = () => controller.abort(init.signal?.reason)
    if (init.signal) {
      if (init.signal.aborted) controller.abort(init.signal.reason)
      else init.signal.addEventListener("abort", onExternalAbort, { once: true })
    }
    try {
      return await this.#fetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
      init.signal?.removeEventListener("abort", onExternalAbort)
    }
  }

  #shouldRetry(attempt: number, maxAttempts: number, status: number): boolean {
    return this.#retry !== null && attempt < maxAttempts && RETRIABLE_STATUS.has(status)
  }

  /** Exponential backoff with jitter; honors an integer `Retry-After` (seconds). */
  #backoff(attempt: number, retryAfter?: string): number {
    const retry = this.#retry
    const base = retry?.initialDelayMs ?? 500
    const cap = retry?.maxDelayMs ?? 8_000
    if (retryAfter) {
      const seconds = Number(retryAfter)
      if (Number.isFinite(seconds) && seconds >= 0) return Math.min(cap, seconds * 1000)
    }
    const exponential = Math.min(cap, base * 2 ** (attempt - 1))
    return exponential + Math.random() * exponential * 0.3
  }

  #log(level: LogLevel, message: string, extra: Record<string, unknown>): void {
    if (logLevelSatisfies(level, this.#logLevel)) this.#logger(level, message, extra)
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  search = (args: SearchParameters = {}): Promise<SearchResponse> =>
    this.request({ method: "get", path: "/v1/search", query: args })

  // ── Pages ──────────────────────────────────────────────────────────────────

  readonly pages = {
    create: (args: CreatePageParameters): Promise<CreatePageResponse> =>
      this.request({ method: "post", path: "/v1/pages", body: args }),
    retrieve: (args: GetPageParameters): Promise<GetPageResponse> =>
      this.request({ method: "get", path: `/v1/pages/${encodeId(args.page_id)}` }),
    update: ({ page_id, ...body }: UpdatePageParameters): Promise<UpdatePageResponse> =>
      this.request({ method: "patch", path: `/v1/pages/${encodeId(page_id)}`, body }),
    move: ({ page_id, ...body }: MovePageParameters): Promise<MovePageResponse> =>
      this.request({ method: "post", path: `/v1/pages/${encodeId(page_id)}/move`, body }),
    duplicate: ({ page_id }: DuplicatePageParameters): Promise<DuplicatePageResponse> =>
      this.request({ method: "post", path: `/v1/pages/${encodeId(page_id)}/duplicate` }),
  }

  // ── Blocks ─────────────────────────────────────────────────────────────────

  readonly blocks = {
    retrieve: ({ block_id }: GetBlockParameters): Promise<GetBlockResponse> =>
      this.request({ method: "get", path: `/v1/blocks/${encodeId(block_id)}` }),
    update: ({ block_id, ...body }: UpdateBlockParameters): Promise<UpdateBlockResponse> =>
      this.request({ method: "patch", path: `/v1/blocks/${encodeId(block_id)}`, body }),
    delete: ({ block_id }: DeleteBlockParameters): Promise<void> =>
      this.request({ method: "delete", path: `/v1/blocks/${encodeId(block_id)}` }),
    children: {
      list: ({
        block_id,
        ...query
      }: ListBlockChildrenParameters): Promise<ListBlockChildrenResponse> =>
        this.request({ method: "get", path: `/v1/blocks/${encodeId(block_id)}/children`, query }),
      append: ({
        block_id,
        ...body
      }: AppendBlockChildrenParameters): Promise<AppendBlockChildrenResponse> =>
        this.request({ method: "patch", path: `/v1/blocks/${encodeId(block_id)}/children`, body }),
      replace: ({
        block_id,
        ...body
      }: ReplaceBlockChildrenParameters): Promise<ReplaceBlockChildrenResponse> =>
        this.request({ method: "put", path: `/v1/blocks/${encodeId(block_id)}/children`, body }),
    },
  }

  // ── Databases ────────────────────────────────────────────────────────────────

  readonly databases = {
    create: (args: CreateDatabaseParameters): Promise<CreateDatabaseResponse> =>
      this.request({ method: "post", path: "/v1/databases", body: args }),
    retrieve: ({ database_id }: GetDatabaseParameters): Promise<GetDatabaseResponse> =>
      this.request({ method: "get", path: `/v1/databases/${encodeId(database_id)}` }),
    update: ({ database_id, ...body }: UpdateDatabaseParameters): Promise<UpdateDatabaseResponse> =>
      this.request({ method: "patch", path: `/v1/databases/${encodeId(database_id)}`, body }),
    query: ({ database_id, ...body }: QueryDatabaseParameters): Promise<QueryDatabaseResponse> =>
      this.request({ method: "post", path: `/v1/databases/${encodeId(database_id)}/query`, body }),
    views: {
      list: ({ database_id }: ListViewsParameters): Promise<ListViewsResponse> =>
        this.request({ method: "get", path: `/v1/databases/${encodeId(database_id)}/views` }),
      create: ({ database_id, ...body }: CreateViewParameters): Promise<CreateViewResponse> =>
        this.request({
          method: "post",
          path: `/v1/databases/${encodeId(database_id)}/views`,
          body,
        }),
      update: ({
        database_id,
        view_id,
        ...body
      }: UpdateViewParameters): Promise<UpdateViewResponse> =>
        this.request({
          method: "patch",
          path: `/v1/databases/${encodeId(database_id)}/views/${encodeId(view_id)}`,
          body,
        }),
    },
  }
}

// ── Response helpers ─────────────────────────────────────────────────────────

function collectHeaders(response: SupportedResponse): Record<string, string> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })
  return headers
}

/** Map a non-2xx body to a structured error, falling back to Unknown. */
function safeParseError(
  status: number,
  headers: Record<string, string>,
  text: string,
): APIResponseError | UnknownHTTPResponseError {
  let body: unknown
  try {
    body = text.length > 0 ? JSON.parse(text) : undefined
  } catch {
    body = undefined
  }
  const apiError = parseAPIErrorResponse({ status, headers, body })
  if (apiError) return apiError
  return new UnknownHTTPResponseError({
    status,
    headers,
    message: `Request failed with status ${status}`,
    rawBodyText: text,
  })
}

function normalizeRequestError(error: unknown): RequestTimeoutError | Error {
  if (error instanceof RequestTimeoutError) return error
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return new RequestTimeoutError()
    }
    return error
  }
  return new Error(String(error))
}
