---
package: '@flighthq/textshaper'
updated: 2026-06-24
basedOn: ./review.md
---

# textshaper — Assessment

Sorted from `review.md` (score `partial — 62`). The prior `reviews/depth/textshaper.md` and `reviews/maturation/depth/textshaper.md` (Bronze/Silver/Gold roadmap) are absorbed here and noted for removal once this lands — the review confirms the Bronze seam work and much of Silver/Gold's _type and delegate surface_ already shipped in the `builder-67dc46d64` pass, so the roadmap's remaining weight is the one backend it always deferred (harfbuzz) plus correctness tiers that depend on it. The charter is an empty stub (every section `TODO`), so "what good means here" is undecided; that keeps `Recommended` small and within-package. The genuinely sweep-safe set is three in-source items: a dead-branch fix, the four missing introspection wrappers, and the hand-rolled-signal cleanup. Every scope/design fork (the harfbuzz backend, `shapeText` naming, UBA/itemization ownership, font fallback, the textlayout migration) is a charter decision or crosses a package boundary and is routed to Open directions, not into `Recommended`.

## Recommended

Strictly sweep-safe: within `@flighthq/textshaper`, no cross-package coupling, no breaking change, no open design decision.

- **Fix the dead branch in `getIndexRangeForCluster`.** `let found = false` (`textShaperCluster.ts:61`) is set to `true` and immediately returned inside the match, so the trailing `return found ? null : null` (`:82`) is unreachable-as-written and always yields `null`. Resolve it: if `found` is vestigial, delete the flag and return a bare `null`; if a "cluster present but zero-width range" case was intended, restore it and add a colocated test. A within-file bug fix, no signature change. — review.md (Contract & docs fit, defect 1).

- **Add the four missing font-introspection free functions (or trim the backend methods).** `TextShaperBackend` declares `getFontFeatures`/`getFontScripts`/`getFontLanguages`/ `getFontVariationAxes` but the package exposes no wrapper for any of them, while every sibling (`getGlyphName`, `getCodePointForGlyph`, `getFontMetrics`, …) has one. The sweep-safe resolution is to add the four thin null-guarded delegates in the same shape as their siblings (sentinel `[]` / `readonly …[]`), with colocated tests — restoring seam/surface symmetry. (If the user would rather the seam _track_ the wrappers, dropping the four unused backend methods is the alternative, but that edits `@flighthq/types` and is the Open-directions call routed below; adding the wrappers is the within-package move.) — review.md (Gaps; Contract & docs fit, defect 2).

- **Replace the hand-rolled `onBackendChanged` signal with a real `@flighthq/signals` construction.** `enableTextShaperSignals` builds the signal as a literal `{ data: null, emit }` with a private `_listeners` array, providing none of the priority/cancellation/connection semantics the codebase-map says signals are for (`SignalData` is `null`). Use the signals package's constructor so this package's one signal group behaves like every other opt-in group, then keep the existing `enable*/dispose*/getTextShaperSignals` surface. Within-package given `@flighthq/signals` is already available transitively; confirm it is a declared dependency as part of the change (if it is not, this shifts to Backlog as a manifest/dep decision). — review.md (Contract & docs fit, defect 3).

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **Land `@flighthq/textshaper-harfbuzz`** (harfbuzz-wasm backend, `createHarfBuzzTextShaperBackend(wasm)`, implementing `measureText` + `shapeRun` + metrics/extents/lookup). **Parked:** a new neighbor package (the subject triad's `-backend` layer, plurality met once it joins `textshaper-canvas`), and it needs an asset/loading-strategy decision (inject the ~1MB wasm, do not bundle) and a ttf-parser-equivalent font-access choice — cross-package + design. The single highest-value step, and the gate that makes the whole `shapeRun` surface functional rather than inert. Routed to Open directions.

- **Full Unicode Bidirectional Algorithm + complex-script correctness.** `itemizeText` is a simplified single-level LTR/RTL fallback; correct mixed-direction order, Arabic joining, Indic/Thai reordering, and mark placement need the UBA and a GSUB/GPOS backend. **Parked:** depends on the harfbuzz backend and/or a `unicode-bidi`-equivalent dependency (a `textshaper-icu` neighbor is one option) — a cross-package/dependency decision, and correctness falls out of `shapeRun` once it exists rather than from new in-package API. Routed to Open directions.

- **Font fallback seam (`FontFallbackBackend`, `.notdef`/`isNotdefGlyph`, fallback-chain config).** **Parked:** a second backend seam and cross-package (device/platform may enumerate system fonts; the web backend may not resolve to system fonts at all). Needs an ownership/config decision. Routed to Open directions.

- **textlayout measure-provider → `ShapedRun` migration, and richTextQuery selection → real clusters.** **Parked:** explicitly cross-package and flagged "do not perform autonomously" in the status; a coordinated API migration with `textlayout`, `textinput`, and `richTextQuery` once a real backend exists. Routed to Open directions.

- **Vertical-text pipeline.** `yAdvance`/`'TopToBottom'` exist in the types but nothing emits or consumes them (`getCaretPositionsForRun` sums only `xAdvance`; itemization never emits `TopToBottom`; no vertical metrics on `FontMetrics`). **Parked:** larger than a sweep, depends on the backend, and a `FontMetrics.verticalMetrics` addition touches `@flighthq/types`.

- **Incremental reshape (`reshapeTextRun(prevRun, edit, out)`).** **Parked:** Gold-tier, high complexity (cluster-level diffing), and depends on the harfbuzz backend first.

- **Cross-backend conformance fixtures + a functional text scene.** A shared spec proving `textshaper-canvas`, `textshaper-harfbuzz`, and the Rust crate produce structurally-matching `ShapedRun`s, plus a `tests/functional/text-shaping` scene. **Parked:** spans packages and the parity/conformance instruments, and is meaningless until a glyph-producing backend exists.

- **`flighthq-textshaper` Rust crate parity.** `shape_text_run`, `ShapedRun`/`ShapedGlyph`, metrics, options, and the `flighthq-textshaper-harfbuzz` (rustybuzz) sibling. **Parked:** a Rust-session task in the other worktree; the TS seam is now complete enough to mirror 1:1.

- **Brand `TextShaperCache._entries` opaque.** **Parked:** minor; the underscore convention is acceptable today and a branded-opaque type is a small future cleanup, not a current need.

- **Package Map entry rewrite (`@flighthq/text-shaping` → `@flighthq/textshaper`).** The codebase map still lists the seam as "designed, not yet built" under the old name and `registerTextShaper` vocabulary. **Parked:** this edits `tools/agents/docs/index.md`, owned by the Package-Map owner, not a `@flighthq/textshaper` source change. Surface as a candidate revision.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The charter is an empty stub, so these are the questions a first direction session should settle — the review enumerates them; the assessment confirms they are the forks keeping the bulk of the backlog parked:

1. **North star** — confirm `textshaper` as the canonical home of the **shape** layer (itemize/bidi → shape → layout → rasterize): runs → positioned glyphs + metrics, heavy backend an opt-in neighbor.
2. **`shapeText` naming/role** — keep it as the advances-only fast path beside `shapeTextRun`, or rename to `measureText` (the "shape returns a number" overreach).
3. **harfbuzz backend** — approve `@flighthq/textshaper-harfbuzz` and settle the wasm asset/loading strategy and font-access path (the gate that makes the seam functional).
4. **Itemization/UBA ownership** — does `itemizeText`/`TextItem` stay here (its only consumer is shaping), and does full UBA arrive via the backend, a `unicode-bidi` dep, or a `textshaper-icu` neighbor.
5. **Font fallback** — where the `FontFallbackBackend` chain is configured, and whether a web backend resolves to system fonts.
6. **textlayout/richTextQuery migration** — the coordinated move from per-character advances to `ShapedRun`/real clusters, once a real backend exists.
7. **Enumeration-wrapper scope** — does the seam lead the package surface (add the four wrappers) or track it (trim the four backend methods until a backend needs them); the within-package default is to add the wrappers (Recommended), the seam-trim alternative edits `@flighthq/types`.
