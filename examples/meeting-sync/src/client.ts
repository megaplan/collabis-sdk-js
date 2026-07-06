import { Client } from "@collabis/client"

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`)
    process.exit(1)
  }
  return value
}

/** Build a Client from the environment (token + optional stage base URL). */
export function makeClient(): Client {
  return new Client({
    auth: required("COLLABIS_TOKEN"),
    baseUrl: process.env.COLLABIS_BASE_URL ?? "https://api.collabis.ru",
  })
}

export const parentPageId = (): string => required("COLLABIS_PARENT_PAGE_ID")
