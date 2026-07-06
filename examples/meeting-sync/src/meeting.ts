/**
 * The shape a voice-transcription provider (Fireflies-style) hands off after a
 * meeting ends. Adapt your provider's webhook payload into this before syncing.
 */
export interface MeetingTranscript {
  id: string
  title: string
  /** ISO 8601 start time. */
  date: string
  durationMinutes: number
  attendees: string[]
  summary: string
  keyPoints: string[]
  actionItems: Array<{ text: string; assignee?: string; done?: boolean }>
  /** Link back to the recording / full transcript in the provider. */
  transcriptUrl: string
  segments: Array<{ speaker: string; text: string }>
}

/** A ready-made sample so the scripts run without a real provider. */
export const sampleMeeting: MeetingTranscript = {
  id: "mtg_2026_07_07_launch_sync",
  title: "Public API launch sync",
  date: "2026-07-07T10:00:00Z",
  durationMinutes: 32,
  attendees: ["Igor S.", "Maria K.", "Alex D."],
  summary:
    "The team confirmed the public REST API is ready for partner integrations and agreed " +
    "to ship the JavaScript SDK alongside it. Voice-transcription partners will write meeting " +
    "notes into Collabis, mirroring the Fireflies → Notion flow.",
  keyPoints: [
    "API is validated on stage end-to-end.",
    "SDK ships with a meeting-sync reference integration.",
    "Partners can target either a subpage or a database row.",
  ],
  actionItems: [
    { text: "Publish @collabis/client to npm", assignee: "Igor S." },
    { text: "Write partner onboarding docs", assignee: "Maria K." },
    { text: "Reach out to the first transcription partner", assignee: "Alex D.", done: true },
  ],
  transcriptUrl: "https://app.example-transcriber.com/meetings/mtg_2026_07_07_launch_sync",
  segments: [
    { speaker: "Igor S.", text: "The API passed the full e2e run on stage, so we're green to go." },
    { speaker: "Maria K.", text: "Great. I'll get the onboarding guide ready for partners." },
    {
      speaker: "Alex D.",
      text: "I already pinged our first transcription partner — they're keen.",
    },
    {
      speaker: "Igor S.",
      text: "Let's ship the SDK with a meeting-sync example so they can copy it.",
    },
  ],
}
