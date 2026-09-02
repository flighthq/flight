---
package: '@flighthq/bitmaptext'
status: solid
score: 80
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# bitmaptext — Review

## Verdict

solid — 80/100. The charter's North star coverage list is delivered: a `GlyphSource`-driven display node with per-page quad batching, word wrap, all four alignments (including justify), kerning, letter-spacing, line-height overrides, and cached bounds. Since the prior review the package was substantially refactored to own its per-page quads directly as `BitmapTextPage` structures rather than delegating to `@flighthq/sprite` QuadBatch children, and gained a robust layout-convergence mechanism with versioned glyph placement and a guard module. Remaining gaps are text-stack maturity: whitespace beyond U+0020, truncation/ellipsis, and the charter's deferred open directions (per-run styling, SDF, textinput).

## Present capabilities

- **Node layer** (`bitmapText.ts`, 161 lines) — `createBitmapText(glyphSource, options?)` allocates the node with an eager page-0 `BitmapTextPage`; `reserveBitmapText(target, glyphCapacity)` pre-sizes per-page id/transform arrays. `createBitmapTextData` / `createBitmapTextRuntime` exposed for the contract lane. Six `set*` field mutators (`setBitmapTextAlign`, `setBitmapTextGlyphSource`, `setBitmapTextLetterSpacing`, `setBitmapTextLineHeight`, `setBitmapTextText`, `setBitmapTextWrapWidth`) follow the explicit-update model: mutate data, then call `updateBitmapText`. `getBitmapTextBounds` (allocating) and `computeBitmapTextLocalBoundsRectangle` (out-param, alias-safe, tested aliased) read cached local bounds. `getBitmapTextPages` returns the owned page array. `isBitmapTextGlyphLayoutStale` compares the stamped layout version against the source's current version.

- **Layout** (`updateBitmapText.ts`, 353 lines) — paragraphs split on `\n` (CR filtered), words measured with intra-word kerning + letter-spacing (`buildBitmapTextWords`; kerning does not cross spaces; zero-ink glyphs advance without quads), greedy word-wrap at boundaries (over-wide words overflow on their own line), left/center/right alignment against `wrapWidth ?? maxLineWidth`, justify distributing gap slack on non-paragraph-final lines, baseline stacking by `(ascent + descent + lineGap) * lineHeight`. Each layout rebuilds the atlas regions per page from scratch (codepoint-deduplicated), clearing instance counts and refilling. Bounds are the glyph-extent envelope across all pages.

- **Layout convergence** — `updateBitmapText` runs a version-checked loop (up to 3 passes): it reads the glyph source's placement version before and after a layout pass and retries when the version moves (a repack during layout relocated or dropped a glyph, orphaning a baked rect). `refreshBitmapTextGlyphLayout` wraps the version check and re-layout into a single per-frame call for nodes bound to a dynamic `@flighthq/glyphatlas` source. The convergence guard (`setBitmapTextLayoutGuard` seam, fed by `enableBitmapTextGuards`) warns once when a layout runs out of passes, meaning the atlas is too small for the string.

- **Per-page batching** — glyphs partition by `GlyphEntry.page` into page-indexed `BitmapTextPage` objects in `BitmapTextRuntime.pages`. Each page holds its own `TextureAtlas` (bound to `getGlyphAtlasImage(page)`), a `Uint16Array` of region ids, a `Float32Array` of vector2 (translation-only) transforms, and an `instanceCount`. A single-page source produces one page; multi-page sources grow pages on demand (`ensureBitmapTextPage`). Null-image pages are skipped.

- **Guard module** (`enableBitmapTextGuards.ts`, 44 lines) — `enableBitmapTextGuards()` / `disableBitmapTextGuards()`, separately importable, emitting through `@flighthq/log` via `logOnce`. Reports when a layout cannot converge. Production code that does not import it pays nothing.

- **Renderers** (in other packages) — Canvas (`canvasBitmapText.ts` in `scene2d-canvas`), WebGL (`glBitmapText.ts` in `scene2d-gl`), and WebGPU (`wgpuBitmapText.ts` in `scene2d-wgpu`) all register a `BitmapTextKind` renderer that draws one batched pass per page. No DOM renderer exists (BitmapText is a GPU/canvas-quad concept, not a DOM element).

- **Tests** (~803 lines across three test files) are thorough: deterministic glyph sources with controllable kerning and multi-page sources; kerning placement, region reuse, wrap/align/justify, lineHeight scaling, letterSpacing, missing-glyph omission, empty string, bounds across pages, multi-page partition; real `@flighthq/glyphatlas` integration with a codepoint-as-red-channel oracle rasterizer proving repack correctness; mid-layout relocation via a seam-driven source; convergence guard via a tiny atlas that overflows; fan-out repair (multiple nodes sharing an atlas).

## Gaps

- **Whitespace = U+0020 only.** Tab, NBSP, ideographic space, thin/em spaces are unrecognized. No CJK break opportunities. The wrap model is Latin-space-separated text only. Charter Open direction 1 names the shared advance-driven line-breaker as the extraction candidate.

- **No truncation.** `maxLines` / max-height and ellipsis re-fit are standard bitmap-text features for game HUDs and UI labels, and are absent.

- **Missing glyphs vanish silently** (no quad, no advance) with no guard or `explain*` query. A wrong-font string renders shorter with no diagnostic. Pairs with `bitmapfont`'s `.notdef` question.

- **No per-run styling, SDF material hookup, or textinput binding** — charter Open directions 2--4, correctly deferred until the single-source path is mature.

- **`setBitmapTextGlyphSource` does not detect a rebind at the same version.** Version numbering is per-source, so swapping to a new source at the same version (e.g., version 0) leaves `isBitmapTextGlyphLayoutStale` returning false. The test file documents this explicitly and asserts it as a known gap, noting that `setBitmapTextGlyphSource` requires an explicit `updateBitmapText` afterward. Adequate for now; a monotonic node-level generation counter would close it if silent rebind becomes a footgun.

## Charter contradictions

The charter's "What it is" says the node "emits the result as a `@flighthq/sprite` **QuadBatch** of glyph quads," and the Boundaries section lists `@flighthq/sprite` as a dependency for "QuadBatch construction/append." The Decision [2026-07-10] says "Glyphs are emitted as batched `sprite` QuadBatches." **None of this is accurate today.** Commit `f2a7814f5` refactored the package to own its per-page quads directly as `BitmapTextPage` structures (ids/transforms/instanceCount + a TextureAtlas), and the `@flighthq/sprite` dependency was removed. The current dependency set is `geometry`, `log`, `node`, `scene2d`, `texture`, `textureatlas`, `types` — no `sprite`, no `adjustments`, no `materials`.

The data model is still QuadBatch-shaped (it uses the same ids + vector2 transforms pattern), and the renderers draw one batched pass per page the same way QuadBatch renderers do, so the *substrate concept* survives. But the charter's claim of a literal dependency on `@flighthq/sprite` and its QuadBatch type is factually stale.

The charter's description of tint as a BitmapText concern ("per-node tint/color" in the North star) is partially stale as well. The old `color` field and `applyBitmapTextColor` no longer exist in this package. Tint is now the node's generic color-adjustment stack (`setNodeColorAdjustmentsTint`), handled externally at the render level. The type comment in `BitmapText.ts` says as much. The charter should note that tint is not a bitmaptext-layer concern.

## Contract & docs fit

### Package against contract

- **Types in `@flighthq/types`**: Yes. `BitmapText`, `BitmapTextData`, `BitmapTextRuntime`, `BitmapTextPage`, `BitmapTextOptions`, `BitmapTextAlign`, `BitmapTextKind` all live in `packages/types/src/BitmapText.ts`. No exported types defined inline.
- **Full unabbreviated names**: Yes. `computeBitmapTextLocalBoundsRectangle`, `refreshBitmapTextGlyphLayout`, `isBitmapTextGlyphLayoutStale`, etc.
- **`sideEffects: false`**: Yes, declared in `package.json`.
- **Two blessed lanes**: Yes. `.` (index.ts) is the curated public API; `./contract` (contract.ts) is the full surface. `index.ts` selectively re-exports from contract.
- **Out-param with alias safety**: `computeBitmapTextLocalBoundsRectangle` is documented and tested alias-safe (the test passes the cached runtime rectangle as `out`).
- **Sentinels not throws**: Null glyph source produces an empty layout; null-image pages are skipped; missing glyphs omit with no quad and no advance.
- **Entity pattern**: `createBitmapText` returns `BitmapText extends Node2D`, which extends `Entity`.
- **Guard module**: `enableBitmapTextGuards` / `disableBitmapTextGuards` are separately importable and tree-shakeable. `setBitmapTextLayoutGuard` is the seam, keeping the `@flighthq/log` dependency in the guard module only.
- **No side-effect imports**: `@flighthq/log` is a declared dependency (for the guard module) but no module-level side effects occur.

### Candidate contract/docs revisions

- The Package Map line in `AGENTS.md` groups `bitmaptext` under "Input and text" as "`bitmapfont` / `bitmapfont-formats`, `bitmaptext`." This is accurate.
- `crate: null` in the charter is consistent with the display-node tier and the package's nature (Canvas/WebGL/WebGPU rendering not portable to Rust).
- The charter's dependency list needs updating to match reality (see Charter contradictions above).

## Candidate open directions

- **Charter dependency and substrate revision.** The charter says `@flighthq/sprite` and "QuadBatch"; the code owns its own quad data. The charter should be revised to reflect the current architecture: owned `BitmapTextPage` quads, no sprite dependency, tint handled externally.
- **Break-class model.** Should wrapping learn whitespace/break classes locally (a small character-class table), route through `@flighthq/textsegment`, or await the extracted shared line-breaker (Open direction 1)? Three shapes, one decision.
- **Truncation semantics.** Is ellipsis / `maxLines` in scope for this node, or a caller-side measure-and-cut convention?
- **Missing-glyph policy.** Silent omission (today), replacement glyph from the source, or guard-only? Interlocks with `bitmapfont`'s `.notdef` open direction.
