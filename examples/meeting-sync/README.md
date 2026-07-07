# Meeting sync example

Reference integration for **voice-transcription partners** — the Collabis equivalent of the
Fireflies → Notion flow. After a meeting ends, its transcript and summary are written into
Collabis in one of two shapes:

| Script          | Result                                                   | Analogy                         |
| --------------- | -------------------------------------------------------- | ------------------------------- |
| `sync:subpage`  | A **subpage** under a chosen parent page                 | What Fireflies does with Notion |
| `sync:database` | A **row** in a "Meetings" database with typed properties | More structured / queryable     |

Both write the same body: a summary callout, meeting details, key points, action items as
checkboxes, a bookmark to the recording, and the full transcript (appended in ≤100-block
chunks so long transcripts don't hit the per-request limit).

## What a synced meeting looks like

```
🎙️  Public API launch sync — 2026-07-07
┌────────────────────────────────────────────┐
│ 📝  The team confirmed the public REST API… │  ← callout (summary)
└────────────────────────────────────────────┘
Details
 • Date: Tue, 07 Jul 2026 10:00:00 GMT
 • Duration: 32 min
 • Attendees: Igor S., Maria K., Alex D.
Key points
 • API is validated on stage end-to-end.
 • …
Action items
 ☐ Publish @collabis/client to npm  — Igor S.
 ☑ Reach out to the first transcription partner  — Alex D.
Recording
 🔖 Open transcript & audio
Transcript
 Igor S.: The API passed the full e2e run on stage…
 …
```

## Run it

```sh
cp .env.example .env      # fill in COLLABIS_TOKEN and COLLABIS_PARENT_PAGE_ID
npm install
npm run sync:subpage      # or: npm run sync:database
```

`COLLABIS_TOKEN` is an OAuth 2.1 bearer access token whose audience is `https://api.collabis.ru`
(use `COLLABIS_BASE_URL=https://api.collabis.ru` to target stage). `COLLABIS_PARENT_PAGE_ID`
is the page that will receive the subpage (or hold the Meetings database).

Don't have a token yet? Get one with the [oauth-cli example](../oauth-cli) (`npm run login`),
which runs the OAuth 2.1 + PKCE flow and prints an access token. A production integration would
instead store the refresh token and pass `createTokenProvider(...)` as the client's `auth` so it
refreshes on its own.

## Wiring your provider

Map your provider's post-meeting webhook payload into the [`MeetingTranscript`](./src/meeting.ts)
shape, then call `syncMeetingToSubpage(...)` or `syncMeetingToDatabase(...)`. The
[`format.ts`](./src/format.ts) module turns a `MeetingTranscript` into Collabis blocks — that's
the only piece you'd customize for your layout.
