---
package: '@flighthq/textshaper-canvas'
updated: 2026-08-08
by: principal
---

# textshaper-canvas — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/textshaper-canvas/src/` (and `packages/types/src/`) on
2026-08-08. A file:line here is a claim about this tree, not about a session.

- **The public `.` lane exports nothing.** `index.ts:1` is `export {} from './contract';`, an
  empty re-export, so `createCanvasTextShaperBackend` and `clearCanvasTextShaperBackendCache` are
  reachable only through `./contract`. `packages/sdk/src/index.ts:123` re-exports the `.` lane, so
  `@flighthq/sdk` carries neither name — and `@flighthq/textshaper` likewise withholds
  `setTextShaperBackend` from its `.` lane. An app on the blessed lanes cannot perform the setup step
  this package's own header documents (`canvasTextShaper.ts:14`).
- **The backend declares no `shapeRun`, and nothing marks it as advances-only.** A caller checking
  `backend.shapeRun` before choosing a shaping path sees `undefined` on both the real backend
  (`canvasTextShaper.ts:46`) and the sentinel (`:172`), with no positive signal that this is the
  advances-only tier rather than an incomplete implementation.
- **The advance cache is FIFO, described as LRU.** The header calls it a "per-backend LRU cache"
  (`canvasTextShaper.ts:24`) but eviction takes the oldest *inserted* key (`:123`) and a hit never
  reorders, so a hot string is evicted by 512 cold ones.
- **`getFontMetrics` is uncached and re-measures on every call** — three `measureText` probes per
  invocation (`canvasTextShaper.ts:56-61`) with no memo, unlike the advance path beside it.
- **`wordSpacing` is hardcoded to `0px` and `direction` to `'ltr'`** (`canvasTextShaper.ts:110`,
  `:116`) because `TextFormat` (`packages/types/src/TextFormat.ts`) carries neither field; it has only
  `kerning` and `letterSpacing`. Adding them is a header decision that touches every text consumer.
- **No per-cluster segmentation.** `measureText` returns a whole-string advance
  (`canvasTextShaper.ts:119`); there is no `Intl.Segmenter` grapheme pass, so caret placement across
  combining marks and ZWJ emoji has no source of truth at this tier.
- **Structural divider comments** at `canvasTextShaper.ts:133-135` violate the Source Style rule
  against them.
- **jsdom returns 0 for every `TextMetrics` bounding-box field**, so the colocated tests can only
  assert non-throw and call counts. Real metric coverage needs a functional scene comparing measured
  advances against the Canvas renderer's drawn extents; none exists.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The carried headline claim —
  "`getFontMetrics` returns `0` for `unitsPerEm`, documented as an unavailable sentinel, and a
  consumer following the `FontMetrics` doc divides by zero" — is **false**: `canvasTextShaper.ts:84`
  returns the identity `unitsPerEm: size`, making the documented inverse a safe no-op. Also dropped:
  the claim that `TextDirectionKind` / `TextFeature` / `TextShaperOptions` are missing from the types
  index (all three are exported), and the note that a parallel session's new textshaper files might
  need mirroring here (that package's shape has been stable since).
- **2026-06-25** — Advance-cache key gained `letterSpacing`; descent fallback probes `'g'` rather
  than `'H'`; `unitsPerEm` became the identity instead of `0`.
- **2026-06-24** — Backend widened past measure-only: `getFontMetrics`, `letterSpacing` plumbing,
  explicit `direction`, bounded advance cache, `OffscreenCanvas` path, and the no-DOM sentinel.
