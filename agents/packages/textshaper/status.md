---
package: '@flighthq/textshaper'
updated: 2026-08-08
by: principal
---

# textshaper — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/textshaper/src/` (and `packages/types/src/`) on
2026-08-08. A file:line here is a claim about this tree, not about a session.

- **Nothing in the repo implements `shapeRun`, so the whole glyph tier is dead.** The optional
  backend method is declared at `packages/types/src/TextShaper.ts:47`, and the only backend that
  exists — `@flighthq/textshaper-canvas` — does not provide it. `shapeTextRun` (`textShaperRun.ts:107`)
  therefore always returns `null`, and `shapeTextRuns`, `shapeTextRunCached`, the cluster helpers, and
  the pool have **zero callers** anywhere in `packages/`, `examples/`, or `functional/`.
- **The public lane cannot install a backend.** `getTextShaperBackend` / `setTextShaperBackend`
  (`textShaper.ts:12`, `:27`) are in `contract.ts:2` but absent from `index.ts`, and
  `packages/sdk/src/index.ts:122` re-exports the `.` lane — so `@flighthq/sdk` has no way to do the
  setup step `packages/textshaper-canvas/src/canvasTextShaper.ts:14` documents. Only `measureText`
  reaches the app boundary.
- **`getCaretPositionsForRun` contradicts its own contract.** The comment (`textShaperCluster.ts:8-10`)
  says it respects per-glyph `xOffset` for mark attachment and kerning corrections; the loop
  (`:17-20`) sums `xAdvance` alone and never reads `xOffset`.
- **Font introspection is absent on both sides of the seam.** No `getFontFeatures` / `getFontScripts` /
  `getFontLanguages` / `getFontVariationAxes` wrapper here, and `TextShaperBackend`
  (`packages/types/src/TextShaper.ts:29-48`) declares no matching method. The `FontVariationAxis` type
  exists with no producer.
- **`itemizeText` carries its own simplified bidi-class table** (`textShaperItemize.ts:103-132`) while
  `@flighthq/textbidi` owns the real one; `package.json` does not depend on it. Whether itemization
  should consume that cell or keep a self-contained fallback is undecided.
- **No incremental reshape and no font-fallback seam.** There is no `reshapeTextRun` for
  typing-into-a-paragraph, and no `FontFallbackBackend` for resolving `.notdef` against a system chain
  — the latter needs a ruling on where the chain is configured before it can be built.
- **`TextShaperCache._entries` is a public field named as internal**
  (`packages/types/src/TextShaperCache.ts:4`); callers are meant to treat the cache as opaque.
- **`index.ts` is not alphabetized**: `disposeTextShaperSignals` precedes `disableTextShaperGuards`
  (`index.ts:7-9`).

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Three carried claims checked out
  **false**: "no `enableTextShaperGuards` module exists" (it does, `enableTextShaperGuards.ts:21`,
  with the pool seam at `textShaperPool.ts:39`); "`setTextShaperBackendWithSignals` is a separate
  verbose setter needing a hook-slot refactor" (the refactor landed — `_textShaperHooks.ts` holds the
  slot and `textShaperSignals.ts:18` installs it, the `WithSignals` name is gone); and
  "`getGlyphExtentsBatch` is deferred until a real backend exists" (it is at `textShaperRun.ts:65`).
  The 2026-06-25 sweep's premise — that `textShaperCluster`/`Itemize`/`Cache`/`Pool`/`Signals` exist
  only as stale `dist/` artifacts — is also false: all five are live source with colocated tests.
- **2026-07-30** — `releaseShapedRun` ignores a re-release via a `WeakSet` membership mirror, so a
  double release can no longer alias two acquires onto one buffer.
- **2026-06-25** — Recommended sweep found all three items targeting source that had moved; no edits.
- **2026-06-24** — Shaped-run tier built out: `ShapedRun`/`ShapedGlyph` types, `textShaperRun`,
  `textShaperItemize`, `textShaperCluster`, `textShaperPool`, `textShaperCache`, `textShaperSignals`.
