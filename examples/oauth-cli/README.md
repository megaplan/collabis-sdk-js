# OAuth CLI example

Gets a Collabis access token via the **OAuth 2.1 + PKCE loopback flow** — the standard way a
CLI or desktop integration signs in. This is where the `COLLABIS_TOKEN` used by the
[meeting-sync example](../meeting-sync) comes from.

```sh
npm install
npm run login
```

What it does:

1. Registers a public client dynamically (DCR) if you didn't set `COLLABIS_CLIENT_ID`.
2. Generates PKCE (`code_verifier` / S256 `code_challenge`) and a `state`.
3. Opens your browser to `https://collabis.ru/oauth/authorize` (you pick a workspace and consent).
4. Catches the redirect on `http://127.0.0.1:8765/callback`, verifies `state`.
5. Exchanges the code for tokens with the PKCE verifier and prints the **access token** and
   **refresh token**.

Then:

```sh
export COLLABIS_TOKEN=<printed access token>
```

Collabis is a **public client** (no client secret) — security comes from PKCE and the
`resource=https://api.collabis.ru` audience binding. Target stage with
`COLLABIS_ISSUER=https://collabis.ru` and `COLLABIS_RESOURCE=https://api.collabis.ru`.

## Long-running integrations

Access tokens expire. With the `offline_access` scope you also get a refresh token; feed it to
`createTokenProvider` so the client refreshes transparently:

```ts
import { Client, OAuthClient, createTokenProvider } from "@collabis/client"

const oauth = new OAuthClient({ clientId, redirectUri })
const collabis = new Client({
  auth: createTokenProvider({
    oauth,
    refreshToken, // persisted from the login step
    onRefresh: (tokens) => saveRefreshToken(tokens.refresh_token),
  }),
})
```
