# Chat screen — layout, motion, and honest labels

The chat screen follows the interaction pattern of the reference video (character stage,
overlapping route cards, suggestion chips, one composer with a Private toggle). The *data*
is VETTO's own: only pools that actually answered a quote appear, and every label restates
a measured value.

Screenshots: `docs/screens/app-chat-thinking.png` (mid-request), `docs/screens/app-chat-deck.png`
(quoted), `docs/screens/app-mobile.png`.

## Anatomy

| Region | What it shows | Source of truth |
| --- | --- | --- |
| Left column | Latest exchange (one card: `You · <parsed intent>` + Vetto's reply), chat history, signed transactions | `/api/intent`, `/api/history`, `/api/executions` |
| Stage | Vetto (SVG, cursor-tracking eyes), a speech bubble, the fanned route deck | quote response |
| Right column | Route review for the selected card | `/api/quotes` → `/api/execute/prepare` |
| Composer | Live "I read this as…" preview, Private toggle (disabled), round send | `parseIntent()` locally before send |

The left column keeps the newest exchange in view; older ones collapse behind
"+ N earlier messages" so the character stage keeps its vertical space.

## Route deck rules

- One card per pool that returned a quote. Three pools answered → three cards. Never padded.
- Cards fan out shoulder-to-shoulder (`spread` in card widths, ±6° rotation); the selected
  card lifts, straightens, brightens and rises in z-order.
- Badges are limited to facts:
  - **Best output** — this card's `expectedOutBaseUnits` is the highest of the returned quotes.
  - **<fee>% pool** — the pool's own `venueFeeBps`.
  - No "fastest", "recommended", or "private" badge exists, because none of those are
    verified for these pools.
- Sub-row shows price impact and the gas cost in ETH (8 decimal places, trimmed), both from
  the quote.

## Character poses

`idle`, `clasp`, `think` and `live` use the sleeve shapes that already attach correctly at
the shoulder. `wave` draws **one** dedicated raised arm (`.pose-wave-arm`, shoulder → elbow →
wrist → glove) and fades the hanging right sleeve (`.arm-r`) out completely, so no second
sleeve or glove is left over at the hip.

The raised arm is emitted **before** the shirt/vest/lapels in the SVG, so the jacket front
covers its shoulder end and the limb reads as coming out of the body instead of lying on top
of it. It is built from the shared `JointedArm` (one stroked shoulder→elbow→wrist path, round joins,
so the elbow has no seam); the cuff and glove are rotated from the real forearm angle so the
hand continues the arm instead of sitting at a crooked angle, and the widths match the hanging
sleeves so a raised arm never looks thinner than `idle`. Its sway (`wave-sway`) rotates the whole group around the shoulder point
(`transform-box: view-box`, `transform-origin: 352px 398px`).

Why not rotate the hanging sleeve instead: rotating `.arm-r` left the idle sleeve and its
bottom glove visible next to the raised arm, so the figure looked duplicated.

| Pose | How it is built | Notes |
| --- | --- | --- |
| `idle` | hanging sleeves, unchanged | default everywhere |
| `wave` | `.pose-wave-arm` rendered with the same `JointedArm` geometry as `think` (66u upper arm, cuff + glove rotated from the forearm angle) so the hand follows the arm; `.arm-r` hidden; `wave-sway` (1.9 s loop) | used on the landing stage and the agent-task row |
| `think` | `JointedArm`, 62u wide with a 0.82 glove (same proportions as `wave`) | hand beside the head while a quote loads |
| `clasp` | both forearms folded, gloves together | swap/showcase row |
| `live` | headset overlay | live-browser row |

There is **no `point` pose**. Its arm only read as correct when it reached past the right edge
of the 736-unit viewBox, where the glove was clipped; the one feature that used it (agent
tasks) is not implemented, so the showcase uses `wave` there instead.

Rule of thumb for edits: keep the shoulder inside the jacket silhouette, keep the wrist far
enough from the elbow that the glove does not cover the head, and animate with the longhand
`rotate` / `translate` when a pose already writes `transform`.

## Motion

| Element | Motion | Timing |
| --- | --- | --- |
| Route cards | `deck-in`: fade + 34 px rise + scale 0.9→1, staggered 80 ms per card | 620 ms, `cubic-bezier(.16,1,.3,1)` |
| Card hover | `scale: 1.035` (longhand `scale`, keeps the fan transform intact) | 280 ms |
| Selected card | lift 22 px, rotate to 0°, brightness 1 | 420 ms |
| Exchange card | `cluster-in`: fade + rise + 3 px blur-out | 500 ms |
| Speech bubble | `bubble-in` with a small overshoot, light panel + rotated-square tail | 420 ms |
| Character | `stage-breathe` (7 s loop); pose switches to `think` while a request is in flight | 7 s |
| Typing | three dots with a stagger of 160 ms while the quote loads | 1.15 s loop |
| Chips | staggered fade-up, 60 ms apart | 450 ms |
| Composer | border + 3 px ring on `:focus-within` | 250 ms |

All of it collapses under `prefers-reduced-motion: reduce` (global rule sets animation and
transition durations to ~0).

Entrance animations use the longhand `translate` / `scale` properties, never `transform`,
because each card's fan position is written to inline `transform`. That keeps animation,
fan position and hover from overwriting one another.

## Copy rules

- The speech bubble only says what was measured: pool count, best output, or the parser's
  clarification question. While loading it shows dots, never a number.
- The Private toggle is `aria-disabled` and explains that no verified privacy relay is
  connected on Robinhood Chain. It never implies privacy.
- Execution buttons stay disabled until the server has simulated the exact payload
  (`VETTO_SWAP_EXECUTION` gate) — styling never implies that signing is available.
