---
name: lyrise-design
description: The LyRise brand and interface system — voice, colors, type, logo rules, glass and reflection motifs. Use when building or reviewing any LyRise UI, marketing surface, report layout, or throwaway mock, and whenever a visual choice needs a brand-backed answer rather than a guess.
user-invocable: true
---

Read `readme.md` in this directory first — it is the full system: content voice, the
palette and its provenance, type scale, logo rules, the glass recipe, and the
"Shining Reflections" motif.

## Where things live in this repo

- **Tokens (the source of truth):** `styles/tokens/*.css`, loaded by `styles/global.css`.
  Every value is a CSS custom property. Never restate a token value — reference it.
- **Tailwind mapping:** `tailwind.config.js` maps tokens to utility names by `var()`
  reference (`bg-surface-card`, `text-ink-muted`, `rounded-card`, `shadow-glass`,
  `bg-reflections`, `ease-brand`). Prefer these over arbitrary values.
- **Logos:** `src/assets/brand/` — full colour, one colour (+ alt), inverted, mark only.
- **Guidelines:** `guidelines/*.html` in this directory — 20 rendered reference cards
  (colors, type, spacing, radius, elevation, glass, reflections, motion, logo usage).
  Open them when you need to _see_ the rule, not just read it.
- **Brand manual:** `LyRise-Brand-Guidelines.pdf` — the 2021 source document.

## Rules that bite

- One typeface: Figtree, via `--font-sans`. Three weights only — 400, 600, 800.
  Figtree is a documented substitution for licensed Proxima Nova; if the real
  binaries ever arrive, swap `styles/tokens/fonts.css` and nothing else changes.
- Shadows are dark-blue tinted (`rgba(0,0,34,…)`), never neutral black.
- The token type and radius ramps are deliberately _not_ wired into Tailwind's
  numeric scales — they are one step off Tailwind's defaults. See the comment at the
  top of `tailwind.config.js` before changing that.
- Voice is consultative and numeric. If a claim has no figure in it, it is probably
  not ready.

If invoked with no other guidance, ask what is being built, then act as the brand's
designer — production code in this repo, or standalone HTML for a throwaway mock.
