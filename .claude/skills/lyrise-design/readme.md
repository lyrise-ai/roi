# LyRise Design System

The brand and interface system for **LyRise** (lyrise.ai) — an AI consultancy that maps a company's
business processes, quantifies the return, and then deploys custom AI agents into operations.

## Company & product context

LyRise began as a hiring platform. The 2021 Brand Manual describes it that way: _"the hiring platform
that guides both the employee and the employers"_, matching employers with AI/data engineers and
scientists while training and screening talent. That origin still shapes the brand assets — the
wordmark, the palette, the glass motif all date from that era.

The current business is different. lyrise.ai today sells an **AI adoption engagement**:

1. **Map Your Current Process** — a two-week workshop producing a BPMN-based process map with time,
   cost and role tagging.
2. **Identify Opportunities** — throughput and cost analysis, an ROI calculator, an AI + automation
   roadmap claiming 2–5x profit potential.
3. **Implement with AI Agents** — Finance, Legal, HR and Sales agents deployed into operations.

The commercial promise is unusually specific and gated: _"If we can't show you how to make $30K/month
or 3x your current profits, we won't work with you."_

### Surfaces represented here

| Surface                           | URL                             | Coverage                                              |
| --------------------------------- | ------------------------------- | ----------------------------------------------------- |
| Marketing website                 | https://www.lyrise.ai/          | Full home page recreation — `ui_kits/website/`        |
| ROI Reports app ("AI Profit Map") | https://roi.lyrise.ai/dashboard | Sign-in only; app is behind auth — `ui_kits/roi_app/` |

### Sources used

- `assets/LyRise-Brand-Guidelines.pdf` — _LyRise Brand Manual_, 30 pages, updated 07/2021. Colours,
  logo rules, typography, the glass recipe and the "Shining Reflections" motif all come from here.
  Text was extracted; **page images could not be rendered in this environment**, so layout examples in
  the manual (logo grid, iconography spread, application examples) were read as text only.
- `uploads/lyrise-logo-*.png` — five supplied logo files, copied into `assets/`.
- https://www.lyrise.ai/ — text extraction, August 2026. All marketing copy in the UI kit is verbatim.
  **Stylesheets, images and the site's own SVG icons were not fetchable.**
- https://roi.lyrise.ai/dashboard — redirects to the sign-in page; that page's copy is verbatim.
- `uploads/LyRise Deck (2)_compressed (1).pdf` (copied as `uploads/lyrise-deck.pdf`) — the 17-page
  sales/investor deck. Text extracted; **page images could not be rendered**, so the deck's own charts,
  diagrams and photography are not reproduced. All slide copy in `slides/` is verbatim from it.

No codebase, Figma file or slide deck was provided. There is therefore no source-defined component
inventory, so the component set below is the standard primitive set, sized to what these two surfaces
actually need.

---

## CONTENT FUNDAMENTALS

**Voice: consultative, numeric, and risk-reversing.** Almost every claim carries a figure. The brand
would rather say "3x", "$30K/month", "14 days", "90% accuracy", "cut hiring time 80%" than "faster" or
"better". When you write for LyRise and you do not have a number, the sentence is probably not ready.

**Person.** "We" for LyRise, "you/your" for the reader. Never "I", never third-person "LyRise offers".
Examples: _"We map your processes in 14 days"_, _"We'll model your existing business processes"_,
_"Let's map your process"_. The 2021 manual used third person for the founder story; product copy does
not.

**Casing.** Headlines use Title Case on the marketing site — _"How It Works"_, _"Map Your Current
Process"_, _"Our Guarantee"_, _"AI Agent Customization"_. Body copy is sentence case. Product UI is
sentence case throughout — _"Welcome back"_, _"Sign in to access your AI Profit Maps."_ Do not
uppercase whole words except in small eyebrow labels and `Badge` pills.

**Sentence shape.** Short declaratives, often a claim followed by its condition:
_"We map your processes in 14 days and deploy AI only when ROI ≥ $30K/month."_ Em dashes and
parentheticals are used sparingly; the em dash appears where a promise gets qualified:
_"No pressure, no commitment—just results."_ (Note: unspaced em dash is the house style on the site.)

**Structure.** Numbered steps (Step 1/2/3), checkmark lists of three, and "Includes:" bullet blocks.
Case studies follow a fixed shape: a titled intervention, then the measured outcome —
_"Debt Repayment Prediction / AI model predicting repayments with 90% accuracy, driving 5.2x ROI."_

**Emoji: essentially no.** None appear in the brand manual or on the website. The single exception is
the deck's final slide, which ends "✅🤖🙌🏼🚀". That is one slide out of 17 and it contradicts the
manual, so the slide kit does not carry it forward — flag it rather than copy it. The only glyph used as
punctuation in normal copy is a checkmark (✓) in benefit lists.

**Things to avoid.** Hedging ("could potentially help"), AI-vendor abstraction ("unlock synergies",
"transform your workflows" without a number), and exclamation-heavy hype — though note the real site
does use one exclamation in agent descriptions (_"AI to manage your financial statements and all your
company finances!"_) and in the CTA _"Let's Build It!"_. Keep exclamations to CTAs, not to claims.

**Verbatim copy is sacred.** Where the site or manual has wording, reuse it exactly. Some live copy has
typos (_"taylors messaging"_); the UI kit preserves them rather than silently editing the client's words.

---

## VISUAL FOUNDATIONS

### Colour

Three brand colours carry everything: **LyRise Purple `#6666ff`**, **Dark Blue `#000022`**, and a cool
**Grey `#dfe1df`**. The website additionally ships a more saturated **`#4200FF`** as its
`theme-color`; it lives here as `--lyrise-violet` and doubles as the purple hover/pressed step.

Six named secondary colours exist and are used as accents only, never as the primary surface: Remarkable
`#f04b54`, Power `#ee3124`, Trust `#5eaee0`, Sunny `#f7901e`, Pinky `#c196c5`, Grow `#00b8b0`. They map
onto status semantics — Grow = success, Power = danger, Sunny = warning, Trust = info.

Rules of thumb: at most two background colours per composition (white/`--surface-subtle`, plus one
dark-blue section). Purple is for action and emphasis, not for large fills — the exception is the
inverted logo lockup and short hero bands. Neutrals are cool-cast, derived from the Cool Gray and
Dark Blue anchors; never use pure `#000`.

### Type

The brand typeface is **Proxima Nova** in three weights only: Regular (400), Semibold (600), Extra Bold
(800). The manual describes the intended tone as "clean, modern, stylish, distinctive and legible".

> **Substitution flagged.** No Proxima Nova licence or font binaries were supplied. `tokens/fonts.css`
> loads **Figtree** from Google Fonts as the nearest free geometric-humanist match (similar x-height,
> single-storey-adjacent `a`, comparable widths). **Please send the Proxima Nova web fonts and this file
> becomes a two-line change.** The `--font-sans` stack already lists `"Proxima Nova"` as the second
> family, so licensed installs pick it up automatically.

Display and headings are Extra Bold with tight leading (1.05–1.2) and negative tracking (−0.02em to
−0.01em). Body is Regular at 16–18px with generous 1.65 leading. Labels and buttons are Semibold.
Eyebrows are Semibold 12px, uppercase, `+0.12em` tracking, usually purple. There is no serif and no
italic in the system.

### Spacing & layout

4px base scale (`--space-1` … `--space-32`). Marketing sections use 96px vertical padding
(`--section-y`); content is capped at 1200px (`--container-max`) with a 760px narrow measure for prose.
Card interiors are 24–32px. The sticky header is the only fixed element; it is 1px-bordered and
translucent, never a solid bar with a shadow.

Logo layout is governed by the manual: an exclusion zone equal to the mark's height on all sides,
minimum reproduction width 60px / 20mm, and a 32×32px favicon that uses the mark — the favicon is
explicitly _not_ a substitute for the logo.

### Backgrounds

Three treatments, no others:

1. **Flat** — white or `--surface-subtle` (`#f7f8f7`) for most content.
2. **Deep blue with Shining Reflections** — `--bg-deep` (radial dark-blue-to-indigo) overlaid with
   `--bg-reflections`: soft purple, teal and pink radial light washes. The manual introduces these as
   "shining reflection shapes to create a unique interactive abstract background", with the instruction
   _"There is no rules just be creative"_. Used for the hero, the guarantee band and app auth screens.
3. **Photography** — a key part of the identity. When the logo sits on an image, place it on a pale
   area; if the image is busy, add a purple background glow (`--glow-purple`). No photography was
   supplied, so nothing in this system ships with real imagery — drop real photos in and the glass
   panels are designed to sit on top of them.

Never use a bluish-purple _linear_ gradient as a page background; the brand's gradient language is
radial light, not diagonal wash.

### Transparency & blur — the signature

The manual states the core of the brand is transparency, expressed as a **glass container** used "for
every type case". The exact recipe, preserved in `tokens/effects.css`:

- Fill: white 60% → white 25% gradient
- Border: 1px, white at 40%
- Drop shadow: X 15, Y 15, Blur 15
- Background blur: 15px (optional)

Use glass only over imagery, reflections, or dark sections — on flat white it disappears. Radius on
glass is 24px. `GlassPanel` implements this; a dark variant (white 14% → 4%, 18% border) exists for
deep-blue sections.

### Corners

Fields 12px, cards 16px, glass 24px, large panels 32px, and **pill (999px) for every button and chip** —
the wordmark's stroke terminals are true capsules, and that is where the pill language comes from.
Nothing in the system is square-cornered except the 4px checkbox.

### Shadows

All shadows are tinted with the dark-blue brand colour (`rgba(0,0,34,…)`), never neutral black, and
stay soft: 6–10% opacity, large blur, no visible offset — except the brand's glass shadow, which keeps
its prescribed 15/15/15 offset. Inner shadows are used only as hairlines
(`--shadow-inset-hairline`) to give swatches an edge. Purple CTAs carry a coloured glow
(`--shadow-accent`) rather than a grey drop shadow.

Overlays and legibility: a dark scrim (`rgba(0,0,34,.55)` + 6px blur) behind dialogs; the purple radial
glow (`--glow-purple`) as the logo protection device over photography. Prefer the glow or a glass
capsule over a black protection gradient.

### Motion

Restrained and functional. 200ms `cubic-bezier(.22,.61,.36,1)` is the default for colour, border and
shadow changes; 120ms for hover tint and press; 400ms for panels and dialogs; 700ms for scroll-in
fades. Entrances fade and rise a few pixels — no bounce, no spring, no scale-up-from-zero, no
attention-seeking loops. Carousels cross-fade or slide once per interaction.

### States

- **Hover:** purple fills darken to `--purple-700`; outlined controls fill with `--purple-50`; ghost
  controls fill with `--neutral-100`; cards lift 2px and go from `--shadow-sm` to `--shadow-md`. Links
  darken and underline. Opacity is never used to express hover.
- **Press:** `scale(0.97)` (`--press-scale`), no colour change beyond the hover tint.
- **Focus:** 1px purple border plus a 3px `--focus-ring` (`rgba(102,102,255,.45)`). Always visible;
  never removed.
- **Disabled:** 40% opacity, `not-allowed` cursor, no colour substitution.
- **Selected:** purple fill for checkboxes/switches, purple 2px inset rule for underline tabs, white
  card on a neutral track for pill tabs.

### Borders

One hairline weight, `1px`, `--border-subtle` (`#dfe1df`) on light surfaces and `rgba(255,255,255,.12)`
on dark. Emphasis comes from surface and shadow, not from thicker rules. No coloured left-border accent
cards — that pattern is not part of this brand.

### Imagery vibe

Cool, high-key, purple-cast. Where photography is used it should read corporate-modern and slightly
cool-toned so the purple sits comfortably on it; no warm filters, no heavy grain, no duotone. There is
no illustration system in the supplied materials and none has been invented.

---

## ICONOGRAPHY

The Brand Manual has an "Iconography" section (pp. 18–19), but it is a full-page visual spread — no
icon names, no vector files, and the page images could not be rendered here. The website's icons are
inline SVGs that were not fetchable. **No icon assets exist in the supplied sources**, so:

> **Substitution flagged.** The system uses **Lucide** (`https://unpkg.com/lucide@0.454.0`) via CDN,
> at 20px default size, stroke-width 2, round caps and joins. It was chosen because its even monoline
> stroke and rounded terminals match the construction of the LyRise mark, which is drawn as a single
> pill-ended stroke. **Please send the brand's real icon set (or the manual's source file) and
> `components/core/Icon.jsx` swaps over cleanly.**

Usage rules as applied here:

- One stroke weight (2px) at one nominal size (20px; 16px inside dense UI, 24px in feature tiles).
- Icons inherit `currentColor`. Purple icons mark features; muted grey icons sit in fields and metadata.
- Feature icons sit in a 48px `--purple-50` rounded square, never in a coloured circle.
- **Emoji are never used.** The one Unicode glyph in brand use is the checkmark ✓ in benefit lists
  (the site uses it literally); the system renders those with Lucide `check` in purple/Grow.
- Custom directional glyphs (`▼` in `Select`, `×` on dismiss buttons) are plain text characters, kept
  for robustness.

### Logo assets in `assets/`

| File                                           | Use                                                             |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `logo-full-color.png`                          | Primary wordmark, purple on light                               |
| `logo-inverted.png`                            | White wordmark, for purple/dark-blue/photographic backgrounds   |
| `logo-mark-full-color.png`                     | The "R" mark alone — website, social avatars, 32px favicon only |
| `logo-one-color.png`, `logo-one-color-alt.png` | Monochrome versions, for specific printing requirements only    |
| `LyRise-Brand-Guidelines.pdf`                  | The source manual                                               |

Per the manual: never rotate, recolour to secondary colours, outline, crop, add effects to, or recreate
the logo. The mark may be used alone only where other elements already identify the brand.

---

## Index

### Root

| File             | What it is                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `styles.css`     | The single stylesheet consumers link. `@import` list only.                                             |
| `readme.md`      | This file.                                                                                             |
| `SKILL.md`       | Agent-skill front matter for use outside this project.                                                 |
| `thumbnail.html` | Project tile.                                                                                          |
| `tokens/`        | `fonts` · `colors` · `typography` · `spacing` · `radius` · `elevation` · `effects` · `motion` · `base` |
| `assets/`        | Logos and the source brand manual                                                                      |
| `guidelines/`    | 20 foundation specimen cards (Colors, Type, Spacing, Brand)                                            |

### Components

`window.LyRiseDesignSystem_8d4f13.<Name>` after loading `_ds_bundle.js`.

| Group                    | Components                                                           |
| ------------------------ | -------------------------------------------------------------------- |
| `components/core/`       | `Button`, `IconButton`, `Icon`, `Card`, `GlassPanel`, `Badge`, `Tag` |
| `components/forms/`      | `Input`, `Select`, `Checkbox`, `Radio`, `Switch`                     |
| `components/feedback/`   | `Dialog`, `Toast`, `Tooltip`                                         |
| `components/navigation/` | `Tabs`                                                               |

Each has a sibling `.d.ts` (props contract) and `.prompt.md` (what & when, usage example, variants).

**Intentional additions.** No source defined a component inventory, so this is the standard primitive
set. Two entries are brand-specific rather than standard: **`GlassPanel`**, which encodes the manual's
glass recipe as a first-class container, and **`Icon`**, a thin wrapper over the substituted Lucide set
so the swap to real brand icons happens in one file.

### UI kits

| Kit               | Entry                        | Status                                         |
| ----------------- | ---------------------------- | ---------------------------------------------- |
| Marketing website | `ui_kits/website/index.html` | Complete — 9 sections, booking dialog flow     |
| ROI Reports app   | `ui_kits/roi_app/index.html` | Sign-in only; app behind auth. See its README. |

### Slides

`slides/` — eleven 1280×720 layouts rebuilt from the supplied deck, with all copy verbatim:
`title`, `problem`, `solution`, `product-demo`, `comparison`, `traction`, `journey`, `testimonials`,
`case-study`, `pricing`, `closing`. Shell and helpers in `SlideFrame.jsx`; bodies in `SlidesA/B.jsx`.
See `slides/README.md` for the page-by-page mapping and the fidelity caveat.

Deck house style: dark reflection slides open and close the deck; content slides are white with cards.
Every slide carries the wordmark top-left with a purple uppercase eyebrow, and the URL/phone bottom via
the header rail. Metrics are Extra Bold 46–52px; supporting copy 15–18px.

### Not included

No photography, illustration or icon assets exist in the sources, so none ship here.

### Reference material (not LyRise-specific)

`skills-reference/` — five general-purpose Claude Code design skills (Anthropic's official
frontend-design plugin, Ilm-Alan's eight-anchor aesthetic system, jiji262's full design-workflow port,
Koomook's theme plugin, jezweb's design-review/design-loop) copied in for reference. See its own
README for what each does and how they differ from this project's `SKILL.md`.
