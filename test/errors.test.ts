import { describe, expect, it } from "vitest"
import {
  APIResponseError,
  isCollabisClientError,
  parseAPIErrorResponse,
  RequestTimeoutError,
  UnknownHTTPResponseError,
} from "../src/errors"

describe("parseAPIErrorResponse", () => {
  it("builds an APIResponseError from a valid envelope", () => {
    const err = parseAPIErrorResponse({
      status: 400,
      headers: {},
      body: {
        error: { code: "invalid_request", message: "bad", request_id: "r", details: { a: 1 } },
      },
    })
    expect(err).toBeInstanceOf(APIResponseError)
    expect(err?.code).toBe("invalid_request")
    expect(err?.requestId).toBe("r")
    expect(err?.details).toEqual({ a: 1 })
  })

  it("returns undefined when the body is not an error envelope", () => {
    expect(parseAPIErrorResponse({ status: 500, headers: {}, body: "<html/>" })).toBeUndefined()
    expect(
      parseAPIErrorResponse({ status: 500, headers: {}, body: { nope: true } }),
    ).toBeUndefined()
    expect(parseAPIErrorResponse({ status: 500, headers: {}, body: undefined })).toBeUndefined()
  })
})

describe("isCollabisClientError", () => {
  it("is true for library errors, false otherwise", () => {
    expect(isCollabisClientError(new RequestTimeoutError())).toBe(true)
    expect(
      isCollabisClientError(
        new APIResponseError({ code: "not_found", status: 404, message: "x", headers: {} }),
      ),
    ).toBe(true)
    expect(
      isCollabisClientError(
        new UnknownHTTPResponseError({ status: 502, message: "x", headers: {}, rawBodyText: "" }),
      ),
    ).toBe(true)
    expect(isCollabisClientError(new Error("plain"))).toBe(false)
    expect(isCollabisClientError("nope")).toBe(false)
  })

  it("static guards narrow correctly", () => {
    const api = new APIResponseError({ code: "not_found", status: 404, message: "x", headers: {} })
    expect(APIResponseError.isAPIResponseError(api)).toBe(true)
    expect(RequestTimeoutError.isRequestTimeoutError(api)).toBe(false)
  })
})
