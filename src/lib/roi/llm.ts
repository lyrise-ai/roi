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
// gpt-4o: calls web_search / fetch_page more aggressively than o4-mini — keeps
// rate/salary evidence flowing into the modeler so per-workflow rates are
// scraped rather than falling back to benchmark ranges.
export function getResearchModel() {
  return getOpenAIProvider()('gpt-4o')
}

// Used for: ROI Modeler (structured JSON, no complex reasoning needed)
export function getFastModel() {
  return getOpenAIProvider()('gpt-4o-mini')
}
