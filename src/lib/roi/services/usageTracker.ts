/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// usageTracker — adds up the tokens and cost of one request's model calls
//
// How to use it:
//   const tracker = new UsageTracker({ company: 'Acme', mode: 'generate' })
//   tracker.record({ call: 'modeler', model: m.modelId, ...result.usage })
//   tracker.record({ call: 'main_agent', model: m.modelId, ...await result.usage })
//   tracker.flush()   // logs to console + appends to logs/roi-usage.ndjson
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs'
import path from 'path'

import { EVENTS } from '@/src/lib/analytics'
import { captureServer } from '@/src/lib/posthog-server'

// -- Prices, in US dollars per million tokens --------------------------------
// Text the model has seen before is about 10 times cheaper than new text on the
// 5.6 family. A tracker that ignores that overstates the cost of every repeated
// prompt tenfold. Checked against OpenAI's pricing page on 2026-08-20.
const MODEL_PRICING: Record<
  string,
  { input: number; cachedInput: number; output: number }
> = {
  'gpt-5.6-sol': { input: 5.0, cachedInput: 0.5, output: 30.0 },
  'gpt-5.6-terra': { input: 2.0, cachedInput: 0.2, output: 12.0 },
  'gpt-5.6-luna': { input: 0.2, cachedInput: 0.02, output: 1.2 },
  // Kept so old runs, and any call pinned to this model, still price correctly.
  'gpt-4o': { input: 2.5, cachedInput: 1.25, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, cachedInput: 0.075, output: 0.6 },
  'gpt-4o-2024-11-20': { input: 2.5, cachedInput: 1.25, output: 10.0 },
  'gpt-4o-mini-2024-07-18': { input: 0.15, cachedInput: 0.075, output: 0.6 },
  // Claude models, if we ever switch
  'claude-sonnet-4-6': { input: 3.0, cachedInput: 0.3, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 0.8, cachedInput: 0.08, output: 4.0 },
}

function pricingFor(model: string) {
  // Look for the exact model name first, then for one that starts the same
  if (MODEL_PRICING[model]) return MODEL_PRICING[model]
  const key = Object.keys(MODEL_PRICING).find(
    (k) => model.startsWith(k) || k.startsWith(model),
  )
  return key ? MODEL_PRICING[key] : { input: 0, cachedInput: 0, output: 0 }
}

function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0,
): number {
  const p = pricingFor(model)
  // OpenAI counts the cheaper repeated tokens inside the input total, so the
  // full-price part is whatever is left after taking them out.
  const cached = Math.min(Math.max(cachedInputTokens, 0), inputTokens)
  return (
    ((inputTokens - cached) / 1_000_000) * p.input +
    (cached / 1_000_000) * p.cachedInput +
    (outputTokens / 1_000_000) * p.output
  )
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface UsageEntry {
  call: string
  model: string
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
}

export interface UsageSummary {
  ts: string
  company: string
  mode: 'generate' | 'chat'
  durationMs: number
  calls: UsageEntry[]
  totals: {
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    totalTokens: number
    costUsd: number
  }
}

// ── Tracker ──────────────────────────────────────────────────────────────────

export class UsageTracker {
  private company: string

  private mode: 'generate' | 'chat'

  private startMs: number

  private entries: UsageEntry[] = []

  constructor(opts: { company: string; mode: 'generate' | 'chat' }) {
    this.company = opts.company
    this.mode = opts.mode
    this.startMs = Date.now()
  }

  record(opts: {
    call: string
    model: string
    inputTokens: number
    outputTokens: number
    totalTokens?: number
    cachedInputTokens?: number
  }) {
    const total = opts.totalTokens ?? opts.inputTokens + opts.outputTokens
    const cached = opts.cachedInputTokens ?? 0
    this.entries.push({
      call: opts.call,
      model: opts.model,
      inputTokens: opts.inputTokens,
      cachedInputTokens: cached,
      outputTokens: opts.outputTokens,
      totalTokens: total,
      costUsd: costUsd(opts.model, opts.inputTokens, opts.outputTokens, cached),
    })
  }

  flush(): UsageSummary {
    const durationMs = Date.now() - this.startMs

    const totals = this.entries.reduce(
      (acc, e) => ({
        inputTokens: acc.inputTokens + e.inputTokens,
        cachedInputTokens: acc.cachedInputTokens + e.cachedInputTokens,
        outputTokens: acc.outputTokens + e.outputTokens,
        totalTokens: acc.totalTokens + e.totalTokens,
        costUsd: acc.costUsd + e.costUsd,
      }),
      {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
      },
    )

    const summary: UsageSummary = {
      ts: new Date().toISOString(),
      company: this.company,
      mode: this.mode,
      durationMs,
      calls: this.entries,
      totals,
    }

    // Print it to the console
    console.log(
      `[roi-usage] ${this.mode} | ${this.company} | ` +
        `${totals.totalTokens.toLocaleString()} tokens | ` +
        `$${totals.costUsd.toFixed(4)} | ` +
        `${(durationMs / 1000).toFixed(1)}s`,
      summary.calls
        .map(
          (c) =>
            `${c.call}(${c.model}):${c.totalTokens}tok/$${c.costUsd.toFixed(
              4,
            )}`,
        )
        .join(' | '),
    )

    // Add a line to the log file
    try {
      const logsDir = path.join(process.cwd(), 'logs')
      if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true })
      fs.appendFileSync(
        path.join(logsDir, 'roi-usage.ndjson'),
        JSON.stringify(summary) + '\n',
        'utf-8',
      )
    } catch (err) {
      console.warn('[roi-usage] Could not write log file:', err)
    }

    // The same summary goes to PostHog. The log file above lives and dies with
    // one server run; this is the copy you can actually ask questions of, like
    // "what did last week's reports cost" or "which model is eating the
    // budget".
    captureServer(EVENTS.LLM_USAGE, {
      company: summary.company,
      mode: summary.mode,
      duration_ms: summary.durationMs,
      cost_usd: Number(totals.costUsd.toFixed(6)),
      total_tokens: totals.totalTokens,
      input_tokens: totals.inputTokens,
      output_tokens: totals.outputTokens,
      call_count: this.entries.length,
      models: [...new Set(this.entries.map((e) => e.model))],
      // A line per call, so a run that went wrong shows WHERE the tokens went
      // instead of only a total.
      calls: this.entries.map((e) => ({
        call: e.call,
        model: e.model,
        tokens: e.totalTokens,
        cost_usd: Number(e.costUsd.toFixed(6)),
      })),
    })

    return summary
  }
}
