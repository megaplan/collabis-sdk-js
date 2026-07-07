# Collabis SDK для JavaScript

Официальный клиент на JavaScript / TypeScript для API [Collabis](https://collabis.ru) —
чистого REST API для страниц, блоков, баз данных и представлений. Строгие типы, удобные
билдеры блоков, хелперы курсорной пагинации, автоматические повторы и структурированная
модель ошибок.

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

## Установка

```sh
npm install @collabis/client
```

Требуется **Node.js 18+** (используется глобальный `fetch`). Работает в любой среде с
`fetch` по стандарту WHATWG; иначе передайте свой через опцию `fetch`.

## Аутентификация

API использует **OAuth 2.1** (authorization code + PKCE). SDK принимает уже полученный
**bearer-токен доступа** — сам он OAuth-флоу за вас не выполняет.

1. Зарегистрируйте клиента и пройдите OAuth-флоу на issuer, чтобы получить токен доступа,
   у которого audience (`resource`) равен `https://api.collabis.ru`.
2. Передайте токен в `auth`:

```ts
const collabis = new Client({ auth: accessToken })
```

Интерактивная документация и полная OpenAPI-спека доступны здесь:

- Swagger UI: `https://api.collabis.ru/v1/docs`
- OpenAPI JSON: `https://api.collabis.ru/v1/openapi.json`
- Метаданные защищённого ресурса (RFC 9728): `https://api.collabis.ru/.well-known/oauth-protected-resource`

Скоупы: операции чтения требуют `pages:read`, записи — `pages:write`. Ответ 403 несёт
заголовок `WWW-Authenticate` с описанием недостающего скоупа — по нему можно запросить
дополнительную авторизацию (step-up).

### Получение токена через SDK

Collabis — **публичный клиент** (PKCE, без client secret). В SDK есть `OAuthClient`, который
выполняет флоу authorization code + PKCE и обменивает/обновляет токены:

```ts
import { OAuthClient } from "@collabis/client"

const oauth = new OAuthClient({
  clientId, // из динамической регистрации или консоли разработчика
  redirectUri: "http://127.0.0.1:8765/callback",
})

// 1. Отправьте пользователя сюда; сохраните `state` + `codeVerifier`.
const { url, state, codeVerifier } = await oauth.createAuthorizationUrl()

// 2. На редиректе обратно проверьте `state`, затем обменяйте код:
const tokens = await oauth.exchangeCode({ code, codeVerifier })
const collabis = new Client({ auth: tokens.access_token })
```

У `OAuthClient` также есть `.register()` (динамическая регистрация клиента),
`.refreshToken()`, `.revoke()` и `.discover()`. Готовый CLI, который открывает браузер и
печатает токен, — в [примере oauth-cli](./examples/oauth-cli).

Для долгоживущих интеграций держите токены свежими автоматически — передайте в `auth`
провайдер токена (со скоупом `offline_access`, чтобы получить refresh-токен):

```ts
import { createTokenProvider } from "@collabis/client"

const collabis = new Client({
  auth: createTokenProvider({ oauth, refreshToken, onRefresh: saveTokens }),
})
```

### Мультитенант: подключение аккаунтов ваших пользователей

Если вы — сервис (например, расшифровка встреч) и хотите, чтобы **каждый ваш пользователь
подключил свой Collabis** по кнопке «Подключить Collabis» — это штатный сценарий. `Client` и
`OAuthClient` намеренно развязаны: `Client` знает только про токен, `OAuthClient` только
выдаёт токены. Ничего «однопользовательского» в клиент не зашито.

Один `OAuthClient` (конфиг вашего приложения) обслуживает всех пользователей; разделение —
только в токенах, которые вы храните per-user.

```ts
import { Client, OAuthClient, createTokenProvider } from "@collabis/client"

// Один раз на всё приложение: ваш публичный клиент и ваш https-redirect.
const oauth = new OAuthClient({
  clientId: process.env.COLLABIS_CLIENT_ID!,
  redirectUri: "https://app.example.com/collabis/callback",
})

// Кнопка «Подключить Collabis»: строим ссылку и сохраняем state+codeVerifier
// в серверной сессии ИМЕННО этого пользователя.
app.get("/collabis/connect", async (req, res) => {
  const { url, state, codeVerifier } = await oauth.createAuthorizationUrl()
  req.session.collabis = { state, codeVerifier }
  res.redirect(url)
})

// Колбэк: проверяем state, обмениваем код, сохраняем токены пользователя у себя.
app.get("/collabis/callback", async (req, res) => {
  const { state, codeVerifier } = req.session.collabis
  if (req.query.state !== state) throw new Error("state mismatch")
  const tokens = await oauth.exchangeCode({ code: req.query.code, codeVerifier })
  await db.saveCollabisTokens(req.user.id, tokens) // access_token + refresh_token
  res.redirect("/settings")
})

// Позже, когда пользователь запускает расшифровку — берём ЕГО токены и заливаем.
async function uploadMeetingForUser(userId: string, meeting: MeetingTranscript) {
  const stored = await db.getCollabisTokens(userId)
  const collabis = new Client({
    auth: createTokenProvider({
      oauth,
      refreshToken: stored.refresh_token,
      initialAccessToken: stored.access_token,
      onRefresh: (t) => db.saveCollabisTokens(userId, t), // токены могут ротироваться
    }),
  })
  await collabis.pages.create(/* … встреча пользователя … */)
}
```

Пояснения:

- Схема: ваш сервис формирует ссылку, пользователь жмёт «Подключить Collabis» и
  авторизуется в Collabis, вы получаете его `access_token` и `refresh_token`. При каждой
  последующей расшифровке они используются автоматически.
- Для серверного веб-приложения `redirect_uri` — ваш `https`-адрес (loopback `127.0.0.1`
  нужен только для локального CLI). `state` и `codeVerifier` храните в сессии пользователя
  между переходом и колбэком.
- Токен и OAuth разделяемы: можно не использовать `OAuthClient` в рантайме и создавать
  `Client` со строкой токена, полученной где угодно; либо, наоборот, выдавать токены через
  `OAuthClient` независимо от `Client`.

## Быстрый старт

```ts
import { Client } from "@collabis/client"

const collabis = new Client({ auth: process.env.COLLABIS_TOKEN })

// Создать страницу
const { id } = await collabis.pages.create({
  parent: { type: "section_id", section_id: "private" },
  title: "Roadmap",
})

// Прочитать её содержимое (всё поддерево одним вызовом — без N+1)
const { results } = await collabis.blocks.children.list({ block_id: id, depth: "all" })

// Поиск по воркспейсу
const hits = await collabis.search({ query: "roadmap" })
```

## Использование

### Страницы

```ts
await collabis.pages.create({ parent, title, properties, icon, cover, children })
await collabis.pages.retrieve({ page_id })
await collabis.pages.update({ page_id, title, icon, cover, properties, in_trash })
await collabis.pages.move({ page_id, parent: { type: "workspace" } })
await collabis.pages.duplicate({ page_id })
```

`parent` — один из `{ type: "page_id", page_id }`, `{ type: "database_id", database_id }`
(создать строку базы) или `{ type: "section_id", section_id: "all" | "private" | "shared" }`.

### Блоки

```ts
await collabis.blocks.retrieve({ block_id })
await collabis.blocks.update({ block_id, type: "paragraph", paragraph: { rich_text: [...] } })
await collabis.blocks.delete({ block_id })

// depth: "all" (по умолчанию) отдаёт всё поддерево в документном порядке; "1" — только верхний уровень.
await collabis.blocks.children.list({ block_id, depth: "all" })

// Добавить (≤100 блоков за вызов)
await collabis.blocks.children.append({ block_id, children: [...] })

// Заменить всех детей (перезапись снапшотом)
await collabis.blocks.children.replace({ block_id, children: [...] })
```

Запись ограничена **100 блоками на запрос**. Чтобы записать больше — добавляйте частями
(чанками); готовый хелпер есть в [примере meeting-sync](./examples/meeting-sync).

### Базы данных

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

// Строка — это страница, у которой родитель — база данных:
await collabis.pages.create({
  parent: { type: "database_id", database_id: db.id },
  title: "Write docs",
  properties: {
    Status: { select: { title: "Todo" } },
    Due: { date: { start: "2026-07-10" } },
    Priority: { number: 1 },
  },
})

// Запрос с фильтрами и сортировками (поддерживаются вложенные and/or):
const open = await collabis.databases.query({
  database_id: db.id,
  filter: { property: "Status", operator: "equals", value: "Todo" },
  sorts: [{ property: "Due", direction: "asc" }],
})
```

Значения свойств типизированы (`{ <type>: value }`); `title` / `text` / `rich_text` также
принимают обычную строку. Изменение схемы декларативно: в `databases.update` значение `null`
удаляет колонку, неизвестный ключ добавляет её, известный — обновляет.

### Представления

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

### Поиск

```ts
await collabis.search({ query: "keyword" }) // поиск по ключевым словам в воркспейсе
await collabis.search({ database_id }) // перечислить строки базы
await collabis.search({ parent_page_id }) // перечислить дочерние страницы
await collabis.search({ section: "shared" }) // перечислить раздел сайдбара
```

## Билдеры блоков и форматированного текста

`block.*` возвращает полностью типизированные значения `BlockObjectRequest`, чтобы не писать
громоздкий JSON руками:

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

Доступны: `paragraph`, `heading1/2/3`, `bulletedListItem`, `numberedListItem`, `toDo`,
`toggle`, `quote`, `code`, `divider`, `equation`, `callout`, `bookmark`, `table`, `tableRow`,
`column`, `columnList`. Контейнерные билдеры принимают `{ children }`.

## Пагинация

`search`, `blocks.children.list` и `databases.query` используют курсорную пагинацию. Можно
итерироваться или собрать всё, не управляя курсорами вручную:

```ts
import { iteratePaginatedAPI, collectPaginatedAPI } from "@collabis/client"

for await (const row of iteratePaginatedAPI(collabis.databases.query, { database_id })) {
  console.log(row.title)
}

const allHits = await collectPaginatedAPI(collabis.search, { query: "onboarding" })
```

## Обработка ошибок

Любой сбой бросает типизированную ошибку. Сужайте тип через гварды:

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
    // RequestTimeoutError или UnknownHTTPResponseError (таймаут / ответ не в JSON)
  }
}
```

Значения `APIErrorCode`: `invalid_request`, `unauthorized`, `insufficient_scope`, `not_found`,
`payload_too_large`, `unprocessable`, `rate_limited`, `upstream_error`, `upstream_timeout`,
`upstream_rejected`, `partial_write`, `internal_error`.

## Опции клиента

```ts
new Client({
  auth: "…", // OAuth bearer-токен доступа
  baseUrl: "https://api.collabis.ru", // по умолчанию
  timeoutMs: 60_000, // таймаут на запрос
  logLevel: LogLevel.WARN, // DEBUG | INFO | WARN | ERROR
  logger: (level, msg, extra) => {}, // свой логгер
  fetch: myFetch, // своя реализация fetch
  retry: { maxRetries: 3, initialDelayMs: 500, maxDelayMs: 8_000 }, // или `false`
  headers: { "x-trace-id": "…" }, // доп. заголовки в каждый запрос
})
```

Повторы применяются к `429`, `502`, `503`, `504` и сетевым/таймаут-ошибкам, с экспоненциальным
backoff + jitter и поддержкой `Retry-After`.

Для эндпоинтов, ещё не обёрнутых методами, есть низкоуровневый
`client.request<T>({ method, path, query, body })`.

## Примеры

- [**meeting-sync**](./examples/meeting-sync) — выгрузка расшифровки голосовой встречи в
  Collabis: и как **подстраница** под родительской страницей, и как **строка базы данных** с
  типизированными свойствами. Референс для интеграций заметок / расшифровок.
- [**oauth-cli**](./examples/oauth-cli) — получение токена доступа через флоу OAuth 2.1 + PKCE
  (loopback), с динамической регистрацией клиента.

## Покрытие API

| Метод                     | Эндпоинт                                   |
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

## Лицензия

[MIT](./LICENSE)
