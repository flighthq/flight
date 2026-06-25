---
package: '@flighthq/types'
status: solid
score: 89
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - changes.patch (packages/types/ slice)
  - source (head + base)
---

# types — Review (merge gate: integration-b2824e3d8 → origin/main)

This is a **merge-gate** review of the incoming delta only. Baseline is the approved `origin/main` (`eb73c3d74`), captured under `incoming/integration-b2824e3d8/base/packages/types/`; it is the blessed floor and is **not** under review. The candidate is `…/head/packages/types/`. Findings cite `b2824e3d8:<path>`. The charter is a **stub** (What it is / North star / Boundaries / Decisions all `TODO`), so the delta is judged against the codebase-map header-layer bar and the [types-layout convention](../../conventions/types-layout.md).

## The delta

Eight source files (`comm` against base confirms five are net-new, three are in-place edits):

- **New:** `FontMetrics.ts`, `GlyphExtents.ts`, `RenderViewport2D.ts`, `ShapedRun.ts` (carrying `ShapedRun` + its satellite `ShapedGlyph`), `SpritesheetFormat.ts`.
- **Edited:** `TextShaper.ts` (adds `ShapeRunOptions` and six optional `TextShaperBackend` methods — `getCodePointForGlyph`, `getFontMetrics`, `getGlyphExtents`, `getGlyphIndexForCodePoint`, `getGlyphName`, `shapeRun`), `Notification.ts` (adds `updateNotification`), `index.ts` (five barrel re-exports, all correctly placed under the repo's case-insensitive ordering).

All five new files are re-exported, every new type is wired into a real consumer (`textshaper`/`textshaper-canvas` consume the shaping surface; `spritesheet-formats` consumes `SpritesheetFormatKind` via `Map<SpritesheetFormatKind, FormatEntry>`; `render` consumes `RenderViewport2D`), and the package keeps zero runtime dependencies, `sideEffects: false`, and a single `.` export. Nothing in the delta erodes the header-layer shape the base already had.

## Verdict

`solid — 89/100`. **Mergeable with one grounded fix.** This is a clean, types-first delta: the text-shaping seam is extended exactly as the header layer should grow — new concepts in their own files, a richer `TextShaperBackend` whose new capabilities are **all optional** so the advances-only canvas backend pays nothing (the bundle invariant honored at the interface), and an open `SpritesheetFormatKind = string` alias with a vendor-prefix doc that is the textbook fork-B registry shape. The +1 over the standing 88 is for the delta itself landing cleanly against the approved floor with real consumers behind every addition. The one thing standing between this and "clean" is a seam inconsistency in `Notification.ts`: `updateNotification` keys on an `id` the typed notification model never exposes.

## Axis-by-axis (delta vs the 7 standards)

1. **Composition / bedrock — PASS.** Every new file is one concept; no config-gated branch, no fused subjects. `ShapedRun.ts` holds `ShapedRun` plus the satellite `ShapedGlyph` (referenced only as `glyphs: ShapedGlyph[]`) — this is the convention's explicit "concept, not a single type" allowance, not a one-concept-per-file violation. The six new `TextShaperBackend` methods are added as **optional** (`getFontMetrics?: …`, `shapeRun?: …`), so a richer HarfBuzz backend composes capability onto the base without taxing advances-only callers — composition done right at the seam.

2. **Naming clarity — PASS.** `FontMetrics`, `GlyphExtents`, `RenderViewport2D`, `ShapedRun`, `ShapedGlyph`, `ShapeRunOptions`, `SpritesheetFormatKind` are all full unabbreviated words and globally self-identifying. New methods are correctly `get*`/`shape*` (`getGlyphExtents`, `getCodePointForGlyph`, `shapeRun`). Field names carry their semantics (`xBearing`/`yBearing`, `xAdvance`/`yOffset`, `unitsPerEm`), and the doc comments encode the design-unit / pixel / origin conventions a header must carry — `b2824e3d8:packages/types/src/FontMetrics.ts` ("All values are in the font's design units… Callers divide by unitsPerEm to scale").

3. **Tree-shaking / bundle invariant — PASS.** Pure type + erasable-const additions; `sideEffects: false` and the single `.` export are untouched. The five `SpritesheetFormatKind*` string consts in `b2824e3d8:packages/types/src/SpritesheetFormat.ts` are top-level value declarations but are dead-code- eliminable string literals with no side effect, registered nowhere at module top level. No new hot-loop branch or shared switch was introduced; the optional-method pattern means no importer pays for shaping it does not use.

4. **Registry vs closed union — PASS (exemplary).** `SpritesheetFormat.ts` is the correct fork-B shape: an **open** `export type SpritesheetFormatKind = string` alias with five built-in PascalCase consts and the vendor-prefix escape spelled out in the doc — `b2824e3d8:packages/types/src/SpritesheetFormat.ts` ("Use a vendor-prefixed value (e.g. `'acme.MyAtlas'`) for custom formats to avoid colliding with built-in kind strings"). The consumer keys it through `Map<SpritesheetFormatKind, FormatEntry>` (registry dispatch), not a closed `switch`. No closed union was added over a growing family.

5. **Subject triad + plurality guard — PASS.** `SpritesheetFormatKind` is the codec-vocabulary layer of the spritesheet subject, correctly homed in `@flighthq/types` (cross-package type) and consumed by a real `spritesheet-formats` cell that already carries **five** formats (Aseprite, CocosPlist, LibgdxAtlas, Starling, TexturePacker) — well past the ≥2 plurality guard. No premature or mis-homed format split.

6. **Contract hygiene — ONE FAIL, otherwise PASS.**
   - **FAIL — `Notification` id/tag seam gap.** `b2824e3d8:packages/types/src/Notification.ts` adds `updateNotification(id: string, update: Readonly<Partial<NotificationRequest>>): Promise<boolean>`, but the typed model exposes **no `id`**: `NotificationRequest` carries `tag?`, not `id`; `notify(...)` returns `Promise<boolean>` (no handle); and `subscribeClick`/`subscribeAction` deliver `tag`, not `id`. A caller cannot obtain the `id` `updateNotification` demands through any typed surface in this seam — the whole rest of the seam keys on `tag`. The richer impl in `@flighthq/notification` (out of scope here) does have a Flight `id` model, which is the tell: the **types** seam is behind its own implementation. The header must either lift the impl's id model (so `notify` returns an id and `NotificationRequest` carries `id`) or key `updateNotification` on `tag` for consistency.
   - **PASS** elsewhere: `Readonly<>` is applied where it belongs — `getFontMetrics?: (format: Readonly<TextFormat>)…`, `shapeRun?: (text, format: Readonly<TextFormat>, options?: Readonly<ShapeRunOptions>)`, and `updateNotification(…, update: Readonly<Partial<NotificationRequest>>)`. Sentinels not throws: every richer-backend method returns `… | null` or `-1`/`''` for the unsupported case (`getGlyphExtents?: (glyphId) => GlyphExtents | null`, `getGlyphIndexForCodePoint?: … => number` with the doc "or -1"). The mutable `glyphs: ShapedGlyph[]` and `glyphCount` fields on `ShapedRun` match the package's established norm for result/scratch buffers (`TextLayout.ts` uses `number[]`, `TextLayoutGroup[]`), so the lack of `Readonly`/`ReadonlyArray` here is consistent, not a defect.

7. **Tests & honesty — PASS.** `@flighthq/types` is a declaration-only header (333 non-test source files, one meta test); per-file `*.test.ts` is not its model and the delta is pure type surface with no behavior to assert. Crucially, the delta is **honest**: nothing is dead. Every new type and method has a wired consumer in the same integration cut (`textshaper/src/textShaperRun.ts` imports `FontMetrics`, `GlyphExtents`, `ShapedRun`, `ShapeRunOptions` and implements `getFontMetrics`/`getGlyphExtents`/ `shapeTextRun` as sentinel-returning free functions; `render/src/renderViewport.ts` imports `RenderViewport2D`; `spritesheet-formats/src/spritesheetDetect.ts` imports `SpritesheetFormatKind`). The barrel is complete and ordered.

## Soft findings (not merge-blocking)

- **`RenderViewport2D` vs `RectangleLike`.** `b2824e3d8:packages/types/src/RenderViewport2D.ts` repeats the exact `{x, y, width, height}` shape of `Rectangle`/`RectangleLike`, and its sole consumer (`render/src/renderViewport.ts`) already imports a `Rectangle` for scratch bounds in the same file. This reads at first like duplication — but the package already has a long line of domain-named region types with this shape (`SurfaceRegion`, `TextSelectionRectangle`, `TextureAtlasRegion`, `Screen`, …), so a domain-specific screen-space viewport type is consistent with the package's own established pattern, not a delta regression. Whether the SDK should unify these on a shared `Region2D`/`RectangleLike` is a charter question, not a merge fix.
- **`direction` literal repeated inline.** `'LeftToRight' | 'RightToLeft'` appears verbatim in both `ShapedRun.direction` and `ShapeRunOptions.direction` (`b2824e3d8:packages/types/src/ShapedRun.ts` and `…/TextShaper.ts`). A shared `TextDirection` alias would be the header-layer move; minor.
- **`glyphCount` duplicates `glyphs.length`.** `ShapedRun` carries both; defensible for an SoA-ish result buffer where `glyphs` may be over-allocated, but undocumented. A one-line comment would carry the intent.

## Charter contradictions

**None — the charter is a stub.** No blessed rule exists for the delta to violate. The id/tag gap is judged against the codebase-map contract-hygiene bar, not blessed intent. The thin charter remains the highest-leverage thing to fix for this package; this merge does not change that.
