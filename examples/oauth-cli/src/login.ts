/**
 * Obtain a Collabis access token via the OAuth 2.1 + PKCE loopback flow — the
 * canonical "how do I get COLLABIS_TOKEN" for a CLI or desktop integration.
 *
 *   npm run login
 *
 * Steps: (optionally) dynamically register a public client → open the browser to
 * the authorization URL → catch the redirect on 127.0.0.1 → exchange the code
 * for tokens using the PKCE verifier. Prints the access + refresh tokens.
 *
 * For a server-side web app, do the same but persist `state` + `codeVerifier`
 * in the user's session between the redirect out and the callback, instead of
 * holding them in memory as we do here.
 */
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { OAuthClient } from "@collabis/client"

const PORT = Number(process.env.OAUTH_PORT ?? 8765)
// DCR requires loopback IP (127.0.0.1), not "localhost", for an http redirect.
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`
const ISSUER = process.env.COLLABIS_ISSUER ?? "https://collabis.ru"
const RESOURCE = process.env.COLLABIS_RESOURCE ?? "https://api.collabis.ru"

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
  spawn(cmd, [url], {
    stdio: "ignore",
    detached: true,
    shell: process.platform === "win32",
  }).unref()
}

async function main(): Promise<void> {
  // 1. A client id — reuse one, or register a public client on the fly.
  let clientId = process.env.COLLABIS_CLIENT_ID
  const bootstrap = new OAuthClient({
    clientId: clientId ?? "pending",
    redirectUri: REDIRECT_URI,
    issuer: ISSUER,
    resource: RESOURCE,
  })
  if (!clientId) {
    console.log("No COLLABIS_CLIENT_ID set — registering a public client…")
    const reg = await bootstrap.register({
      redirectUris: [REDIRECT_URI],
      clientName: "Collabis CLI example",
    })
    clientId = reg.client_id
    console.log(`Registered client_id: ${clientId} (set COLLABIS_CLIENT_ID to reuse it)\n`)
  }

  const oauth = new OAuthClient({
    clientId,
    redirectUri: REDIRECT_URI,
    issuer: ISSUER,
    resource: RESOURCE,
  })
  const { url, state, codeVerifier } = await oauth.createAuthorizationUrl()

  // 2. Wait for the redirect on the loopback server.
  const tokens = await new Promise<Awaited<ReturnType<typeof oauth.exchangeCode>>>(
    (resolve, reject) => {
      const server = createServer(async (req, res) => {
        if (!req.url?.startsWith("/callback")) {
          res.writeHead(404).end()
          return
        }
        const params = new URL(req.url, REDIRECT_URI).searchParams
        const finish = (message: string) => {
          res
            .writeHead(200, { "content-type": "text/html" })
            .end(`<html><body><h3>${message}</h3>You can close this tab.</body></html>`)
          server.close()
        }
        if (params.get("error")) {
          finish(`Authorization failed: ${params.get("error")}`)
          reject(new Error(params.get("error_description") ?? params.get("error")!))
          return
        }
        if (params.get("state") !== state) {
          finish("State mismatch — aborting.")
          reject(new Error("state mismatch (possible CSRF)"))
          return
        }
        try {
          const result = await oauth.exchangeCode({ code: params.get("code")!, codeVerifier })
          finish("Signed in to Collabis ✓")
          resolve(result)
        } catch (error) {
          finish("Token exchange failed.")
          reject(error)
        }
      })
      server.listen(PORT, "127.0.0.1", () => {
        console.log(`Opening browser to authorize…\nIf it doesn't open, visit:\n${url}\n`)
        openBrowser(url)
      })
    },
  )

  console.log("\n✅ Access token (use as COLLABIS_TOKEN):\n")
  console.log(tokens.access_token)
  if (tokens.refresh_token) {
    console.log("\n🔄 Refresh token (store securely; feed it to createTokenProvider):\n")
    console.log(tokens.refresh_token)
  }
  console.log(`\nExpires in ~${tokens.expires_in ?? "?"}s. Scope: ${tokens.scope ?? "(default)"}`)
}

main().catch((error) => {
  console.error("❌", error instanceof Error ? error.message : error)
  process.exit(1)
})
