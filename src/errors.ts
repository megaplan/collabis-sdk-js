/**
 * Error model for the Collabis client.
 *
 * Two families of errors, both narrowable via {@link isCollabisClientError}:
 *   - {@link RequestTimeoutError} / {@link UnknownHTTPResponseError} — the
 *     request never produced a well-formed API error envelope (timeout, network
 *     failure, non-JSON body);
 *   - {@link APIResponseError} — the API returned the standard error envelope
 *     `{ error: { code, message, details?, request_id? } }`. Its `code` is one
 *     of {@link APIErrorCode}.
 */

/** Client-side failure codes (no valid API error envelope was received). */
export enum ClientErrorCode {
  RequestTimeout = "collabis_client_request_timeout",
  ResponseError = "collabis_client_response_error",
}

/** Server-side `error.code` values returned by the Collabis API. */
export enum APIErrorCode {
  InvalidRequest = "invalid_request",
  Unauthorized = "unauthorized",
  InsufficientScope = "insufficient_scope",
  NotFound = "not_found",
  PayloadTooLarge = "payload_too_large",
  Unprocessable = "unprocessable",
  RateLimited = "rate_limited",
  UpstreamError = "upstream_error",
  UpstreamTimeout = "upstream_timeout",
  UpstreamRejected = "upstream_rejected",
  PartialWrite = "partial_write",
  InternalError = "internal_error",
}

export type CollabisErrorCode = ClientErrorCode | APIErrorCode | string

/** Base class for every error thrown by this library. */
export abstract class CollabisClientErrorBase<Code extends CollabisErrorCode> extends Error {
  abstract code: Code
}

export type CollabisClientError = RequestTimeoutError | UnknownHTTPResponseError | APIResponseError

/** True for any error originating from this library. */
export function isCollabisClientError(error: unknown): error is CollabisClientError {
  return error instanceof CollabisClientErrorBase
}

function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null
}

/** The request exceeded the configured timeout (or a provided AbortSignal fired). */
export class RequestTimeoutError extends CollabisClientErrorBase<ClientErrorCode.RequestTimeout> {
  readonly code = ClientErrorCode.RequestTimeout
  override readonly name = "RequestTimeoutError"

  constructor(message = "Request to Collabis API has timed out") {
    super(message)
  }

  static isRequestTimeoutError(error: unknown): error is RequestTimeoutError {
    return error instanceof RequestTimeoutError
  }
}

type HTTPResponseErrorArgs = {
  code: CollabisErrorCode
  status: number
  message: string
  headers: Record<string, string>
  rawBodyText: string
}

/**
 * A non-2xx response whose body could not be parsed as the API error envelope
 * (proxy/gateway error page, empty body, malformed JSON, …).
 */
export class UnknownHTTPResponseError extends CollabisClientErrorBase<ClientErrorCode.ResponseError> {
  readonly code = ClientErrorCode.ResponseError
  override readonly name = "UnknownHTTPResponseError"
  readonly status: number
  readonly headers: Record<string, string>
  readonly body: string

  constructor(args: Omit<HTTPResponseErrorArgs, "code">) {
    super(args.message)
    this.status = args.status
    this.headers = args.headers
    this.body = args.rawBodyText
  }

  static isUnknownHTTPResponseError(error: unknown): error is UnknownHTTPResponseError {
    return error instanceof UnknownHTTPResponseError
  }
}

/** A structured API error: the response carried the standard error envelope. */
export class APIResponseError extends CollabisClientErrorBase<APIErrorCode | string> {
  override readonly name = "APIResponseError"
  readonly code: APIErrorCode | string
  readonly status: number
  readonly headers: Record<string, string>
  /** Opaque per-request id echoed by the API — quote it in bug reports. */
  readonly requestId: string | undefined
  /** Machine-readable extra context (validation issues, upstream_status, …). */
  readonly details: Record<string, unknown> | undefined

  constructor(args: {
    code: APIErrorCode | string
    status: number
    message: string
    headers: Record<string, string>
    requestId?: string
    details?: Record<string, unknown>
  }) {
    super(args.message)
    this.code = args.code
    this.status = args.status
    this.headers = args.headers
    this.requestId = args.requestId
    this.details = args.details
  }

  static isAPIResponseError(error: unknown): error is APIResponseError {
    return error instanceof APIResponseError
  }
}

/**
 * Attempt to build an {@link APIResponseError} from a parsed response body.
 * Returns undefined when `body` is not a recognizable error envelope, so the
 * caller can fall back to {@link UnknownHTTPResponseError}.
 */
export function parseAPIErrorResponse(args: {
  status: number
  headers: Record<string, string>
  body: unknown
}): APIResponseError | undefined {
  const { status, headers, body } = args
  if (typeof body !== "object" || body === null) return undefined
  const envelope = (body as { error?: unknown }).error
  if (typeof envelope !== "object" || envelope === null) return undefined
  const { code, message, request_id, details } = envelope as {
    code?: unknown
    message?: unknown
    request_id?: unknown
    details?: unknown
  }
  if (typeof code !== "string") return undefined
  return new APIResponseError({
    code,
    status,
    message: typeof message === "string" ? message : code,
    headers,
    requestId: typeof request_id === "string" ? request_id : undefined,
    details:
      isDefined(details) && typeof details === "object"
        ? (details as Record<string, unknown>)
        : undefined,
  })
}
