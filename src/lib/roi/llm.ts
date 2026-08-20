// ─────────────────────────────────────────────────────────────────────────────
// LLM provider configuration
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

// Used for: Research Agent (tool use + synthesis) and Report Writer (prose)
// Terra, the balanced tier, is *cheaper on input than the gpt-4o it replaces*
// ($2.00 vs $2.50, and $0.20 vs $1.25 cached) for a materially better model.
// Sol is the obvious upgrade if report quality turns out to be the constraint
// — one line, $5/$30 per MTok — but it costs 2.5x and that has to be earned.
export function getResearchModel() {
  return getOpenAIProvider()('gpt-5.6-terra')
}

/* Used for: the research analyst, which reasons once per company over
   everything the scouts found, with structured output. The same tier as the
   research agent above today — the helpers are separate because they answer
   different questions, not because they happen to differ. This one runs once
   per scout that adds sources rather than once per posting, so it is not
   latency-critical the way extraction is, and it needs the 1.05M context
   because a firm with thirty postings must never be truncated. */
export function getAnalystModel() {
  return getOpenAIProvider()('gpt-5.6-terra')
}

// Used for: ROI Modeler and job-posting extraction (structured JSON, no
// complex reasoning needed) — the highest-volume calls in the app, one per
// posting. Luna is the cost-sensitive tier at $0.20/$1.20 per MTok.
export function getFastModel() {
  return getOpenAIProvider()('gpt-5.6-luna')
}
