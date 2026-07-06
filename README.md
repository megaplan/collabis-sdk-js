# Collabis SDK for JavaScript

Official JavaScript / TypeScript client for the [Collabis](https://collabis.ru) API — a
clean REST API for pages, blocks, databases, and views. First-class types, ergonomic block
builders, cursor pagination helpers, automatic retries, and a structured error model.

```ts
import { Client, block } from "@collabis/client"

const collabis = new Client({ auth: process.env.COLLABIS_TOKEN })

await collabis.pages.create({
  parent: { type: "page_id", page_id: "8a1f…" },
  title: "Meeting notes",
  icon: "🎙️",
  children: [
    block.heading2("Summary"),
    block.paragraph("We agreed to ship the public API next week."),
    block.toDo("Draft the changelog", { checked: false }),
  ],
})
```

## Installation

```sh
npm install @collabis/client
```

Requires **Node.js 18+** (uses the global `fetch`). Works in any runtime with a
WHATWG-compatible `fetch`; pass your own via the `fetch` option otherwise.

## Authentication

The API uses **OAuth 2.1** (authorization code + PKCE). The SDK takes the resulting
**bearer access token** — it does not run the OAuth flow for you.

1. Register a client and complete the OAuth flow against the issuer to obtain an access
   token whose audience (`resource`) is `https://api.collabis.ru`.
2. Pass the token as `auth`:

```ts
const collabis = new Client({ auth: accessToken })
```

Interactive docs and the full OpenAPI spec live at:

- Swagger UI: `https://api.collabis.ru/v1/docs`
- OpenAPI JSON: `https://api.collabis.ru/v1/openapi.json`
- Protected-resource metadata (RFC 9728): `https://api.collabis.ru/.well-known/oauth-protected-resource`

Scopes: read operations need `pages:read`, writes need `pages:write`. A 403 carries a
`WWW-Authenticate` header describing the missing scope so you can step-up authorization.

## Quick start

```ts
import { Client } from "@collabis/client"

const collabis = new Client({ auth: process.env.COLLABIS_TOKEN })

// Create a page
const { id } = await collabis.pages.create({
  parent: { type: "section_id", section_id: "private" },
  title: "Roadmap",
})

// Read its content (whole subtree in one call — no N+1)
const { results } = await collabis.blocks.children.list({ block_id: id, depth: "all" })

// Search the workspace
const hits = await collabis.search({ query: "roadmap" })
```

## Usage

### Pages

```ts
await collabis.pages.create({ parent, title, properties, icon, cover, children })
await collabis.pages.retrieve({ page_id })
await collabis.pages.update({ page_id, title, icon, cover, properties, in_trash })
await collabis.pages.move({ page_id, parent: { type: "workspace" } })
await collabis.pages.duplicate({ page_id })
```

`parent` is one of `{ type: "page_id", page_id }`, `{ type: "database_id", database_id }`
(create a database row), or `{ type: "section_id", section_id: "all" | "private" | "shared" }`.

### Blocks

```ts
await collabis.blocks.retrieve({ block_id })
await collabis.blocks.update({ block_id, type: "paragraph", paragraph: { rich_text: [...] } })
await collabis.blocks.delete({ block_id })

// depth: "all" (default) returns the full subtree in document order; "1" is top-level only.
await collabis.blocks.children.list({ block_id, depth: "all" })

// Append (≤100 blocks per call)
await collabis.blocks.children.append({ block_id, children: [...] })

// Replace all children (snapshot overwrite)
await collabis.blocks.children.replace({ block_id, children: [...] })
```

Writes are capped at **100 blocks per request**. To write more, append in chunks — see the
[meeting-sync example](./examples/meeting-sync) for a ready-made helper.

### Databases

```ts
const db = await collabis.databases.create({
  parent: { type: "page_id", page_id },
  title: "Tasks",
  properties: {
    Name: { type: "title" },
    Status: { type: "select", options: [{ title: "Todo" }, { title: "Done" }] },
    Due: { type: "date" },
    Priority: { type: "number" },
  },
})

// A row is a page whose parent is the database:
await collabis.pages.create({
  parent: { type: "database_id", database_id: db.id },
  title: "Write docs",
  properties: {
    Status: { select: { title: "Todo" } },
    Due: { date: { start: "2026-07-10" } },
    Priority: { number: 1 },
  },
})

// Query with filters + sorts (compound and/or supported):
const open = await collabis.databases.query({
  database_id: db.id,
  filter: { property: "Status", operator: "equals", value: "Todo" },
  sorts: [{ property: "Due", direction: "asc" }],
})
```

Property values are typed (`{ <type>: value }`); `title` / `text` / `rich_text` also accept
a plain string. Schema updates are declarative: in `databases.update`, a `null` value deletes
a column, an unknown key adds one, a known key updates it.

### Views

```ts
await collabis.databases.views.list({ database_id })
await collabis.databases.views.create({
  database_id,
  name: "By status",
  type: "board",
  config: { group_by: { property: "Status" } },
})
await collabis.databases.views.update({
  database_id,
  view_id,
  filters: [{ property: "Status", operator: "not_equals", value: "Done" }],
})
```

### Search

```ts
await collabis.search({ query: "keyword" }) // workspace keyword search
await collabis.search({ database_id }) // enumerate database rows
await collabis.search({ parent_page_id }) // enumerate child pages
await collabis.search({ section: "shared" }) // enumerate a sidebar section
```

## Block & rich-text builders

`block.*` returns fully-typed `BlockObjectRequest` values so you don't hand-write the verbose
JSON:

```ts
import { block, text, link } from "@collabis/client"

const body = [
  block.heading1("Release notes"),
  block.paragraph([text("Shipped "), text("v1", { bold: true }), text("!")]),
  block.bulletedListItem("Public REST API"),
  block.toDo("Announce on the blog", { checked: false }),
  block.callout("Breaking changes below", { icon: "⚠️" }),
  block.code("npm i @collabis/client", { language: "shell" }),
  block.bookmark("https://api.collabis.ru/v1/docs", { title: "API docs" }),
  block.table(
    [
      ["Name", "Type"],
      ["Status", "select"],
    ],
    { has_column_header: true },
  ),
]
```

Available: `paragraph`, `heading1/2/3`, `bulletedListItem`, `numberedListItem`, `toDo`,
`toggle`, `quote`, `code`, `divider`, `equation`, `callout`, `bookmark`, `table`, `tableRow`,
`column`, `columnList`. Container builders accept `{ children }`.

## Pagination

`search`, `blocks.children.list`, and `databases.query` are cursor-paginated. Iterate or
collect them without managing cursors yourself:

```ts
import { iteratePaginatedAPI, collectPaginatedAPI } from "@collabis/client"

for await (const row of iteratePaginatedAPI(collabis.databases.query, { database_id })) {
  console.log(row.title)
}

const allHits = await collectPaginatedAPI(collabis.search, { query: "onboarding" })
```

## Error handling

Every failure throws a typed error. Narrow with the guards:

```ts
import { APIResponseError, APIErrorCode, isCollabisClientError } from "@collabis/client"

try {
  await collabis.pages.retrieve({ page_id })
} catch (error) {
  if (APIResponseError.isAPIResponseError(error)) {
    console.error(error.code, error.status, error.requestId, error.details)
    if (error.code === APIErrorCode.NotFound) {
      /* … */
    }
  } else if (isCollabisClientError(error)) {
    // RequestTimeoutError or UnknownHTTPResponseError (timeout / non-JSON response)
  }
}
```

`APIErrorCode` values: `invalid_request`, `unauthorized`, `insufficient_scope`, `not_found`,
`payload_too_large`, `unprocessable`, `rate_limited`, `upstream_error`, `upstream_timeout`,
`upstream_rejected`, `partial_write`, `internal_error`.

## Client options

```ts
new Client({
  auth: "…", // OAuth bearer access token
  baseUrl: "https://api.collabis.ru", // default
  timeoutMs: 60_000, // per-request timeout
  logLevel: LogLevel.WARN, // DEBUG | INFO | WARN | ERROR
  logger: (level, msg, extra) => {}, // custom logger
  fetch: myFetch, // custom fetch implementation
  retry: { maxRetries: 3, initialDelayMs: 500, maxDelayMs: 8_000 }, // or `false`
  headers: { "x-trace-id": "…" }, // extra headers on every request
})
```

Retries apply to `429`, `502`, `503`, `504` and network/timeout errors, with exponential
backoff + jitter and `Retry-After` support.

For endpoints not yet wrapped, call the low-level `client.request<T>({ method, path, query, body })`.

## Examples

- [**meeting-sync**](./examples/meeting-sync) — push a voice-meeting transcript into Collabis,
  both as a **subpage** under a parent page and as a **database row** with typed properties.
  This is the reference for note-taking / transcription integrations.

## API coverage

| Method                    | Endpoint                                   |
| ------------------------- | ------------------------------------------ |
| `search`                  | `GET /v1/search`                           |
| `pages.create`            | `POST /v1/pages`                           |
| `pages.retrieve`          | `GET /v1/pages/{id}`                       |
| `pages.update`            | `PATCH /v1/pages/{id}`                     |
| `pages.move`              | `POST /v1/pages/{id}/move`                 |
| `pages.duplicate`         | `POST /v1/pages/{id}/duplicate`            |
| `blocks.retrieve`         | `GET /v1/blocks/{id}`                      |
| `blocks.update`           | `PATCH /v1/blocks/{id}`                    |
| `blocks.delete`           | `DELETE /v1/blocks/{id}`                   |
| `blocks.children.list`    | `GET /v1/blocks/{id}/children`             |
| `blocks.children.append`  | `PATCH /v1/blocks/{id}/children`           |
| `blocks.children.replace` | `PUT /v1/blocks/{id}/children`             |
| `databases.create`        | `POST /v1/databases`                       |
| `databases.retrieve`      | `GET /v1/databases/{id}`                   |
| `databases.update`        | `PATCH /v1/databases/{id}`                 |
| `databases.query`         | `POST /v1/databases/{id}/query`            |
| `databases.views.list`    | `GET /v1/databases/{id}/views`             |
| `databases.views.create`  | `POST /v1/databases/{id}/views`            |
| `databases.views.update`  | `PATCH /v1/databases/{id}/views/{view_id}` |

## License

[MIT](./LICENSE)
