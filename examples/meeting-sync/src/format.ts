import { block, text, type BlockObjectRequest, type Client } from "@collabis/client"
import type { MeetingTranscript } from "./meeting"

const MAX_BLOCKS_PER_REQUEST = 100

/** Meeting title, optionally suffixed with the date (like Fireflies' title option). */
export function meetingTitle(m: MeetingTranscript, opts?: { includeDate?: boolean }): string {
  if (!opts?.includeDate) return m.title
  const day = m.date.slice(0, 10)
  return `${m.title} — ${day}`
}

/**
 * The summary section of the page body (everything except the raw transcript).
 * Bounded in size, so it fits comfortably under the 100-block-per-request cap.
 */
export function meetingSummaryBlocks(m: MeetingTranscript): BlockObjectRequest[] {
  const blocks: BlockObjectRequest[] = [
    block.callout(m.summary, { icon: "📝" }),
    block.heading2("Details"),
    block.bulletedListItem([text("Date: ", { bold: true }), text(formatDateTime(m.date))]),
    block.bulletedListItem([text("Duration: ", { bold: true }), text(`${m.durationMinutes} min`)]),
    block.bulletedListItem([text("Attendees: ", { bold: true }), text(m.attendees.join(", "))]),
  ]

  if (m.keyPoints.length > 0) {
    blocks.push(block.heading2("Key points"))
    for (const point of m.keyPoints) blocks.push(block.bulletedListItem(point))
  }

  if (m.actionItems.length > 0) {
    blocks.push(block.heading2("Action items"))
    for (const item of m.actionItems) {
      const content = item.assignee
        ? [text(item.text), text(`  — ${item.assignee}`, { italic: true })]
        : item.text
      blocks.push(block.toDo(content, { checked: item.done ?? false }))
    }
  }

  blocks.push(block.heading2("Recording"))
  blocks.push(block.bookmark(m.transcriptUrl, { title: "Open transcript & audio" }))
  blocks.push(block.heading2("Transcript"))
  return blocks
}

/** One paragraph per transcript segment — potentially long, hence appended in chunks. */
export function transcriptParagraphs(m: MeetingTranscript): BlockObjectRequest[] {
  return m.segments.map((s) =>
    block.paragraph([text(`${s.speaker}: `, { bold: true }), text(s.text)]),
  )
}

/**
 * Append blocks respecting the API's 100-blocks-per-request limit. This is the
 * pattern any integration needs for long transcripts: writes are not one giant
 * batch, so append in chunks and let the caller handle a mid-way failure.
 */
export async function appendInChunks(
  collabis: Client,
  blockId: string,
  blocks: BlockObjectRequest[],
): Promise<void> {
  for (let i = 0; i < blocks.length; i += MAX_BLOCKS_PER_REQUEST) {
    const chunk = blocks.slice(i, i + MAX_BLOCKS_PER_REQUEST)
    await collabis.blocks.children.append({ block_id: blockId, children: chunk })
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toUTCString()
}
