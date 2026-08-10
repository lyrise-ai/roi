# LyRise motion tokens — binding for the motion/animation skills below

This project already defines its own motion tokens in `tokens/motion.css` (durations, easing) and its
own reflection/glass/elevation tokens in `tokens/effects.css` / `tokens/elevation.css`. When any
skill in this folder (gsap-\*, motion-design, motion-react, lenis-scroll) would otherwise hardcode a
duration or easing curve, use LyRise's tokens instead:

| Generic value the skill suggests                                                | Use instead                                                                                                                                  |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `150ms` / `0.15s` (micro-interaction)                                           | `var(--duration-fast)` (120ms)                                                                                                               |
| `200–250ms` (standard transition)                                               | `var(--duration-base)` (200ms)                                                                                                               |
| `300–450ms` (panel/dialog)                                                      | `var(--duration-slow)` (400ms)                                                                                                               |
| `600–800ms` (scroll reveal / hero entrance)                                     | `var(--duration-reveal)` (700ms)                                                                                                             |
| `ease-out` / `cubic-bezier(0.16, 1, 0.3, 1)`-style "smooth deceleration" curves | `var(--ease-out)` → `cubic-bezier(.22,.61,.36,1)`                                                                                            |
| `ease-in-out` for symmetric transitions                                         | `var(--ease-in-out)` → `cubic-bezier(.45,.05,.55,.95)`                                                                                       |
| a spring/bounce preset for a press or tap state                                 | `transform: scale(var(--press-scale))` (0.97), no bounce — LyRise motion has no spring/bounce, see `readme.md` → VISUAL FOUNDATIONS → Motion |

For GSAP specifically: read the token values at runtime rather than duplicating the numbers —
`getComputedStyle(document.documentElement).getPropertyValue('--duration-base')` — so a token edit in
`tokens/motion.css` propagates to every animation without touching JS.

LyRise's motion is restrained: no bounce/spring easing, no continuous ambient loops, no scroll-jacking.
Entrances fade and rise a few pixels; nothing more elaborate. When a skill below defaults to a bouncier
or more elaborate pattern, prefer the plainer one and cite this file as the reason.
