/**
 * Database sync: each meeting becomes a row in a "Meetings" database with typed
 * properties (Date, Duration, Attendees, Recording, Status). The page body of
 * the row holds the same summary + transcript. Queryable and more structured
 * than subpages — a good fit for partners that want reporting.
 *
 *   npm run sync:database
 */
import { APIResponseError, collectPaginatedAPI, type Client } from "@collabis/client"
import { makeClient, parentPageId } from "./client"
import { sampleMeeting, type MeetingTranscript } from "./meeting"
import { appendInChunks, meetingSummaryBlocks, transcriptParagraphs } from "./format"

/** Create the Meetings database with a typed schema. */
export async function createMeetingsDatabase(
  collabis: Client,
  parent_page_id: string,
): Promise<string> {
  const db = await collabis.databases.create({
    parent: { type: "page_id", page_id: parent_page_id },
    title: "Meetings",
    properties: {
      Name: { type: "title" },
      Date: { type: "date" },
      Duration: { type: "number" },
      Attendees: { type: "text" },
      Recording: { type: "url" },
      Status: { type: "select", options: [{ title: "Synced" }] },
    },
  })
  return db.id
}

/** Insert one meeting as a row (a page whose parent is the database). */
export async function syncMeetingToDatabase(
  collabis: Client,
  database_id: string,
  meeting: MeetingTranscript,
): Promise<{ id: string; url: string }> {
  const row = await collabis.pages.create({
    parent: { type: "database_id", database_id },
    title: meeting.title,
    properties: {
      Date: { date: { start: meeting.date, include_time: true } },
      Duration: { number: meeting.durationMinutes },
      Attendees: { text: meeting.attendees.join(", ") },
      Recording: { url: meeting.transcriptUrl },
      Status: { select: { title: "Synced" } },
    },
    children: meetingSummaryBlocks(meeting),
  })
  await appendInChunks(collabis, row.id, transcriptParagraphs(meeting))
  return { id: row.id, url: row.url }
}

async function main(): Promise<void> {
  const collabis = makeClient()
  try {
    const databaseId =
      process.env.COLLABIS_DATABASE_ID ?? (await createMeetingsDatabase(collabis, parentPageId()))
    const row = await syncMeetingToDatabase(collabis, databaseId, sampleMeeting)
    console.log(`✅ Synced "${sampleMeeting.title}" → row ${row.url}`)

    // Show it back: query the rows synced by this integration, newest first.
    const rows = await collectPaginatedAPI(collabis.databases.query, {
      database_id: databaseId,
      filter: { property: "Status", operator: "equals", value: "Synced" },
      sorts: [{ property: "Date", direction: "desc" }],
    })
    console.log(`📊 ${rows.length} meeting(s) in the database:`)
    for (const r of rows) console.log(`   • ${r.title}`)
  } catch (error) {
    if (APIResponseError.isAPIResponseError(error)) {
      console.error(
        `❌ ${error.status} ${error.code}: ${error.message} (request ${error.requestId})`,
      )
    } else {
      console.error("❌ Unexpected error:", error)
    }
    process.exit(1)
  }
}

main()
