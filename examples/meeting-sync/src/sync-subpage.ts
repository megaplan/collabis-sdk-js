/**
 * Fireflies-style sync: each meeting becomes a subpage under a chosen parent
 * page. Title carries the date, the body holds the summary, key points, action
 * items (as checkboxes), a link to the recording, and the full transcript.
 *
 *   npm run sync:subpage
 */
import { APIResponseError, type Client } from "@collabis/client"
import { makeClient, parentPageId } from "./client"
import { sampleMeeting, type MeetingTranscript } from "./meeting"
import { appendInChunks, meetingSummaryBlocks, meetingTitle, transcriptParagraphs } from "./format"

export async function syncMeetingToSubpage(
  collabis: Client,
  parent_page_id: string,
  meeting: MeetingTranscript,
): Promise<{ id: string; url: string }> {
  // Create the page with the (bounded) summary section...
  const page = await collabis.pages.create({
    parent: { type: "page_id", page_id: parent_page_id },
    title: meetingTitle(meeting, { includeDate: true }),
    icon: "🎙️",
    children: meetingSummaryBlocks(meeting),
  })

  // ...then stream the transcript in, chunked to the 100-block limit.
  await appendInChunks(collabis, page.id, transcriptParagraphs(meeting))

  return { id: page.id, url: page.url }
}

async function main(): Promise<void> {
  const collabis = makeClient()
  try {
    const page = await syncMeetingToSubpage(collabis, parentPageId(), sampleMeeting)
    console.log(`✅ Synced "${sampleMeeting.title}" → ${page.url}`)
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
