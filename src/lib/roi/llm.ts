// ─────────────────────────────────────────────────────────────────────────────
// Which models we use, and where they come from.
//
// TO SWITCH TO CLAUDE:
//   1. npm install @ai-sdk/anthropic
//   2. Replace the two lines below with:
//        import { anthropic } from '@ai-sdk/anthropic'
//        export const getResearchModel = () => anthropic('claude-sonnet-4-6')
//        export const getFastModel = () => anthropic('claude-haiku-4-5-20251001')
//   3. Remove @ai-sdk/openai from package.json
//   That's it. Nothing else changes.
// ─────────────────────────────────────────────────────────────────────────────

import { createOpenAI } from '@ai-sdk/openai'

let openaiProvider: ReturnType<typeof createOpenAI> | null = null

function getOpenAIProvider() {
  if (!openaiProvider) {
    openaiProvider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiProvider
}

// Used by: the research agent (which uses tools and pulls findings together)
// and the report writer (which writes the prose).
// Terra, the middle tier, is CHEAPER on input than the gpt-4o it replaced
// ($2.00 against $2.50, and $0.20 against $1.25 for repeated text) and is a
// clearly better model. Sol is the obvious upgrade if report quality turns out
// to be what is holding us back — a one-line change, $5 in and $30 out per
// million tokens — but it costs 2.5 times as much, so it has to earn that.
export function getResearchModel() {
  return getOpenAIProvider()('gpt-5.6-terra')
}

/* Used by: the research analyst, which thinks once per company about everything
   the scouts found and answers in a fixed shape. It is the same tier as the
   research agent above today. They are separate functions because they answer
   different questions, not because they currently differ.
   This one runs once per scout that added sources, not once per job posting, so
   speed matters less here than it does for reading adverts. It needs the very
   large context window, because a firm with thirty postings must never be cut
   short. */
export function getAnalystModel() {
  return getOpenAIProvider()('gpt-5.6-terra')
}

// Used by: the ROI modeller and job-posting reading. Both answer in a fixed
// shape and need no deep reasoning, and they are the most frequent calls in the
// app — one per posting. Luna is the cheap tier, $0.20 in and $1.20 out per
// million tokens.
export function getFastModel() {
  return getOpenAIProvider()('gpt-5.6-luna')
}
