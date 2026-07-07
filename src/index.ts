/**
 * `@collabis/client` — official JavaScript / TypeScript client for the Collabis
 * API.
 *
 * ```ts
 * import { Client, block } from "@collabis/client"
 *
 * const collabis = new Client({ auth: process.env.COLLABIS_TOKEN })
 * await collabis.pages.create({
 *   parent: { type: "page_id", page_id: "…" },
 *   title: "Meeting notes",
 *   children: [block.heading2("Summary"), block.paragraph("…")],
 * })
 * ```
 */

export { Client } from "./Client"
export type { ClientOptions, RetryOptions, RequestParameters, TokenProvider } from "./Client"

export * from "./oauth"
export * from "./errors"
export * from "./logging"
export * from "./helpers"
export * from "./build"
export * from "./api-types"
export * from "./api-endpoints"

export type { SupportedFetch, SupportedResponse, SupportedRequestInfo } from "./fetch-types"
export { PACKAGE_VERSION } from "./version"
