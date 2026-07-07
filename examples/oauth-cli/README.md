# Пример oauth-cli

Получает токен доступа Collabis через **флоу OAuth 2.1 + PKCE (loopback)** — стандартный
способ входа для CLI или десктоп-интеграции. Отсюда и берётся `COLLABIS_TOKEN`, который
использует [пример meeting-sync](../meeting-sync).

```sh
npm install
npm run login
```

Что он делает:

1. Динамически регистрирует публичного клиента (DCR), если не задан `COLLABIS_CLIENT_ID`.
2. Генерирует PKCE (`code_verifier` / S256 `code_challenge`) и `state`.
3. Открывает браузер на `https://collabis.ru/oauth/authorize` (вы выбираете воркспейс и даёте согласие).
4. Ловит редирект на `http://127.0.0.1:8765/callback`, проверяет `state`.
5. Обменивает код на токены с помощью PKCE-верификатора и печатает **токен доступа** и
   **refresh-токен**.

Затем:

```sh
export COLLABIS_TOKEN=<напечатанный токен доступа>
```

Collabis — **публичный клиент** (без client secret): безопасность обеспечивают PKCE и привязка
audience через `resource=https://api.collabis.ru`. Для стейджа задайте
`COLLABIS_ISSUER=https://collabis.ru` и `COLLABIS_RESOURCE=https://api.collabis.ru`.

## Долгоживущие интеграции

Токены доступа истекают. Со скоупом `offline_access` вы также получаете refresh-токен —
передайте его в `createTokenProvider`, чтобы клиент обновлялся прозрачно:

```ts
import { Client, OAuthClient, createTokenProvider } from "@collabis/client"

const oauth = new OAuthClient({ clientId, redirectUri })
const collabis = new Client({
  auth: createTokenProvider({
    oauth,
    refreshToken, // сохранён на шаге входа
    onRefresh: (tokens) => saveRefreshToken(tokens.refresh_token),
  }),
})
```
