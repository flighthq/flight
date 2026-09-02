---
package: '@flighthq/font'
status: partial
score: 58
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# font — Review

**Verdict:** partial — 58/100

The package has matured noticeably since the last review (2026-07-13): it now has a proper backend seam
(`FontLoadingBackend` with host/custom/sentinel layering and `explainFontLoadingBackend`), a shared
internal `_fontFaceLoad.ts` that eliminates the earlier code duplication between the two loader
families, a portable glyph-outline rasterizer
(`createGlyphRasterizerBackendFromGlyphOutlineSource`) with a real producer in `@flighthq/font-formats`,
and rasterizer backends are entities. The score rises from 52 to 58 on the strength of the backend
seam and the outline composition layer, which together close two of the prior review's top gaps. The
dual entity model (`Font` vs `FontResource`), the missing font descriptors, and the absence of
teardown still cap it firmly in "partial."

## Present capabilities

### Identity

- `createFont(name)` (`font.ts:4`) returns `Font { name }` extending `Entity` via `createEntity`.
- `createFontResource(family)` (`fontResource.ts:3`) returns `FontResource { family, face: null }` as a
  plain object literal -- **not** entity-backed.

### Loading -- Font family (returns `Promise<Font>`)

- `loadFontFromBytes(bytes, family)` (`fontFrom.ts:15`) -- slices the `Uint8Array` view into a fresh
  `ArrayBuffer` via `_loadFontFaceFromBytes`, constructs a `FontFace`, calls `face.load()`, adds to
  the backend, returns `createFont(family)`.
- `loadFontFromName(name)` (`fontFrom.ts:21`) -- delegates to `FontLoadingBackend.loadFontFaces` via
  `getFontShorthand`.
- `loadFontFromUrl(url, family)` (`fontFrom.ts:30`) -- wraps URL in `url()` CSS source.
- `loadFontFromUrls(sources, family)` (`fontFrom.ts:39`) -- composes comma-joined `src` with
  `format()` hints inferred by `inferFontFormatFromUrl` or supplied explicitly via `FontUrl.format`.

### Loading -- FontResource family (mutates `out: FontResource`, returns `Promise<FontResource>`)

- `loadFontResourceFromBytes`, `loadFontResourceFromName`, `loadFontResourceFromUrl`,
  `loadFontResourceFromUrls` (`fontResourceFrom.ts`) -- the same four loading paths, each mutating
  `out.face` and returning `out`. On failure, `out.face` retains its previous value (documented and
  tested).

### Shared internals

- `_fontFaceLoad.ts` -- the `_loadFontFaceFromBytes`, `_loadFontFaceFromUrl`, `_loadFontFaceFromUrls`,
  and `_loadFontFacesFromName` helpers are shared by both loader families, eliminating the
  `inferFontFormat` duplication flagged in the charter's Decision [2026-07-02].

### Backend seam (contract-only)

- `fontLoading.ts` provides `getFontLoadingBackend`, `setFontLoadingBackend`,
  `installFontLoadingHostBackend`, `hasFontLoadingHostBackend`, `resetFontLoadingBackendForTest`,
  and `explainFontLoadingBackend`. The host/custom/sentinel three-tier layering matches the SDK's
  explicit-dependency model: the sentinel is a no-op fallback, the host backend is installed by
  `enableHostWebFontLoading` in `@flighthq/host-web`, and a custom backend can override it.
- `FontLoadingBackend` (`@flighthq/types/contract`) defines `addFontFace`, `checkFontFace`,
  `loadFontFaces`, and `whenReady` -- the full `document.fonts` surface abstracted.

### Format identification

- `detectFontFormat(bytes)` (`fontFormat.ts:1`) -- magic-byte sniffing for TrueType (0x00010000),
  OpenType (OTTO), WOFF, WOFF2, collection (ttcf), and legacy Apple TrueType (true). Returns
  `string | null`.
- `inferFontFormatFromUrl(url)` (`fontFormat.ts:26`) -- extension-based mapping (woff, woff2, ttf,
  otf, eot, svg). Query-string-safe, case-insensitive. Returns `string | null`.

### Status queries

- `isFontLoaded(family, style?)` (`fontStatus.ts:4`) -- delegates to `FontLoadingBackend.checkFontFace`
  via `getFontShorthand`.
- `whenFontsReady()` (`fontStatus.ts:8`) -- delegates to `FontLoadingBackend.whenReady`.

### Shorthand construction

- `getFontShorthand(family, style?)` (`fontShorthand.ts:1`) -- builds a CSS `font` shorthand with
  backslash-escaped single quotes and backslashes, optional style prefix.

### Glyph outline composition

- `createGlyphRasterizerBackendFromGlyphOutlineSource(source)` (`glyphOutlineSource.ts:18`) -- adapts
  an index-keyed `GlyphOutlineSource` into a `GlyphRasterizerBackend & Entity` for `glyphatlas`. Uses
  `@flighthq/path` for outline flattening and bounds, then a portable 4x4 supersampled coverage scan
  (no DOM/canvas dependency). Provides both `rasterize` (per-codepoint) and `measureMetrics` (scaled
  ascent/descent/lineGap). The only production producer is
  `createGlyphOutlineSourceFromOpenTypeFont` in `@flighthq/font-formats`.

### Package shape

- `sideEffects: false` declared.
- Dependencies: `@flighthq/entity`, `@flighthq/path`, `@flighthq/types`.
- Two export lanes: public (`.`, `index.ts`) exposes 17 named exports; contract (`./contract`,
  `contract.ts`) re-exports all modules including the backend seam functions.
- Every source file has a colocated test file. 10 source files, 10 test files.

### Test coverage

Tests are thorough for the existing surface. Loader tests use a `MockFontFace` class and a mock
`FontLoadingBackend` injected via `setFontLoadingBackend`. The `fontFrom.test.ts` and
`fontResourceFrom.test.ts` suites cover success paths, failure propagation, byte-slicing, format-hint
composition, and (for FontResource) the "failed reload preserves previous face" contract. The
`fontLoading.test.ts` suite covers the three-tier backend layering, conflict detection, and sentinel
behavior. The `glyphOutlineSource.test.ts` suite covers entity identity, rasterization, metrics
scaling, empty-glyph handling, and sentinel returns.

## Gaps vs an authoritative font-resource library

### Structural

- **Dual entity model remains the top gap.** `Font` (`Entity` with `name`) and `FontResource` (plain
  object with `family` and `face`) continue to split one subject into two parallel libraries. The
  charter's Open direction #1 asks whether to unify; this is still unresolved.
- **No `FontFaceDescriptors`.** None of the eight loaders accept weight, style, stretch,
  `unicodeRange`, `display`, or `featureSettings`. Multi-weight/style families -- the normal case --
  remain unrepresentable.
- **No teardown.** The backend's `addFontFace` is called but there is no `deleteFontFace` or
  equivalent. No `disposeFontResource`/`unloadFont`. The lifecycle is add-only.

### Introspection

- **No font metrics extraction.** `@flighthq/types` defines `FontMetrics` (ascent, capHeight,
  descent, lineGap, underlinePosition, underlineThickness, unitsPerEm, xHeight) but this package
  produces none of it. The `GlyphOutlineMetrics` from the outline source are a subset
  (ascent/descent/lineGap/unitsPerEm) used internally by the rasterizer but not exposed as a public
  font query.
- **No family-name extraction from bytes.** `loadFontFromBytes` requires the caller to supply the
  family name; the package cannot read the name table.
- **No variation-axis enumeration.** `FontVariation` and `FontVariationAxis` exist in
  `@flighthq/types` with no producer here. No way to query or apply `font-variation-settings`.
- **No glyph coverage query.** No `hasFontGlyph` / `getFontCharacterSet`.

### Advanced loading

- **No fallback-stack model.** No ordered family list with per-script fallbacks.
- **No system-font enumeration.** `queryLocalFonts` (arguably platform-suite) has no seam.
- **No loading-error signal.** Load failures propagate as rejections but there is no loading-state
  observable or event.

### Type gaps

- `detectFontFormat` and `inferFontFormatFromUrl` return bare `string | null` rather than a
  `FontFormat` union type in `@flighthq/types`.
- `FontUrl` is defined inside `Font.ts` in `@flighthq/types`, violating the one-concept-per-file
  naming convention.

## Charter contradictions

- **None found.** The code aligns with the charter's three North-star principles: it stays within
  resource lifecycle (no rendering or layout), its async APIs are honestly async (loading failures
  propagate as rejections, not swallowed), and `loadFontFromBytes` accepts `Uint8Array` (the
  `ArrayBuffer` naming is gone, matching Decision [2026-07-02]).
- The Decision [2026-07-02] to DRY `inferFontFormat` is satisfied: `_fontFaceLoad.ts` shares the
  loading internals and `inferFontFormatFromUrl` lives in a single `fontFormat.ts`.
- The Decision [2026-08-01] on outline sources as a sibling seam is faithfully implemented:
  `GlyphOutlineSource` lives in `@flighthq/types`, the adapter is in this package, and it does not
  widen the raster `GlyphSource`.

## Contract and docs fit

### Package vs contract

- **Export lanes:** correct. Public lane is a curated named-export list from `index.ts`; contract
  lane re-exports all modules. Backend seam functions (`installFontLoadingHostBackend`, etc.) are
  contract-only, which is appropriate -- `host-web` imports from `@flighthq/font/contract`.
- **Types in `@flighthq/types`:** yes. `Font`, `FontResource`, `FontUrl`, `FontLoadingBackend`,
  `GlyphOutlineSource`, `GlyphOutlineMetrics`, `GlyphRasterizerBackend`, `GlyphRasterizeOptions`,
  `GlyphRasterizedBitmap`, `GlyphMetrics`, `BackendExplanation` are all in `types`.
- **`sideEffects: false`:** declared and honored. No top-level side effects.
- **Full unabbreviated names:** `createGlyphRasterizerBackendFromGlyphOutlineSource` is maximally
  specific. `loadFontFromBytes`, `loadFontResourceFromUrl` -- all fully qualified. Passes.
- **Sentinels not throws:** `detectFontFormat` returns `null`, `inferFontFormatFromUrl` returns
  `null`, `rasterize` returns `null`, `resolveGlyphOutlineScale` returns `null`. Passes.
- **`createFontResource` violates entity convention.** It returns a plain object literal rather than
  using `createEntity`, and `FontResource` does not extend `Entity`. This is inconsistent with
  `createFont` and the SDK's "constructors over literals for SDK entity types" rule.
- **Module-scoped mutable state in `fontLoading.ts`.** The `_custom`, `_host`, and `_hostConflict`
  variables are module-level mutable state. This is a backend seam following the SDK's backend
  pattern (same as image loading, glyph atlas, etc.), so it is a known, patterned exception to the
  "no module-scoped mutable state" constraint. The `resetFontLoadingBackendForTest` function exists
  for test cleanup.

### Candidate doc revisions

- The AGENTS.md Package Map lists `font` under "Resources" which is correct.
- The charter's "Boundaries > Non-goals" lists "Font binary parsing -- future `@flighthq/font-codec`
  or part of textshaper." Since the last direction, `@flighthq/font-formats` has been built
  (`openTypeGlyphOutlineSource.ts`) and is the actual binary parsing package. The charter's
  reference to a hypothetical `font-codec` is stale -- it should acknowledge `font-formats` as
  the actual neighbor.

## Candidate open directions

These are questions the charter does not answer that this review had to assume on:

1. **Should the rasterizer adapter stay in `font` or move to a sibling?** The
   `createGlyphRasterizerBackendFromGlyphOutlineSource` function pulls in `@flighthq/path` as a
   dependency (for `createPath`, `flattenPath`, `getPathBounds`). This is the only consumer of
   `@flighthq/path` in this package. It makes `font` depend on the path geometry subsystem, which is
   a cross-domain dependency for what is otherwise a resource-lifecycle package. The charter's
   Decision [2026-08-01] says `@flighthq/font` owns the adapter, so this is settled by direction --
   but whether that dependency weight is appropriate as the adapter grows is unstated.

2. **What is the contract for `BackendExplanation.viability`?** `explainFontLoadingBackend` always
   returns `viability: 'unobserved'`. The `BackendExplanation` type allows `'available'` and
   `'runtime-api-unavailable'` as well. The font backend never probes whether `document.fonts` is
   actually available -- unlike image loading, which checks `createImageBitmap`. Whether the font
   seam should probe runtime availability is unspecified.

3. **Should `FontLoadingBackend` support `deleteFontFace`?** The backend abstraction covers add,
   check, load, and whenReady -- but not delete. If teardown is to be supported, the backend
   interface needs the method, and `createWebFontLoadingBackend` in `host-web` needs to implement
   `document.fonts.delete`. This is a cross-package type change (`@flighthq/types`).
