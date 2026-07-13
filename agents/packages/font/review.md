---
package: '@flighthq/font'
status: partial
score: 52
updated: 2026-07-13
ingested:
  - source
  - tests
---

# font — Review

_LIGHT re-verification 2026-07-13 of the 2026-07-03 depth review plus the 2026-07-09 deepening (commit 30d20a43: `detectFontFormat` magic-byte sniff, `isFontLoaded`/`whenFontsReady` status queries, `getFontShorthand` escaping fix, `inferFontFormat` → `inferFontFormatFromUrl`). Exports re-checked against source; verdict re-judged._

**Domain:** Font resource entity layer — font identity, loading/registration through the CSS Font Loading API (`FontFace`/`document.fonts`), format identification, and font introspection primitives (metrics, variation axes, name tables). Text shaping is explicitly out of scope (owned by `@flighthq/textshaper`), as is glyph layout (`@flighthq/textlayout`).

**Verdict:** partial — 52/100

Extracted from the dissolved `resources` package, and it still carries its extraction seams visibly: it ships **two competing entity models for the same subject** — `Font` (`{ name }`, extends `Entity`, built via `createEntity`) and `FontResource` (`{ family, face }`, a plain literal, does *not* extend `Entity`) — each with its own parallel loader quartet (`loadFontFrom*` returning a `Font`; `loadFontResourceFrom*` mutating a `FontResource` out-param). That duplication is unresolved design debt, not layering, and it caps the score regardless of the surrounding polish. The 2026-07-09 deepening closed the identification and status gaps (byte-level `detectFontFormat`, `isFontLoaded`/`whenFontsReady`, quote-safe shorthand), which lifts it well above the original 33 — but the layer is still missing font descriptors (weight/style/stretch — multi-weight families remain unrepresentable), any teardown (`document.fonts` add-only), and — measured against the register's own upstream oracle for this subject (`ttf-parser`) — all introspection, even though `@flighthq/types` defines `FontMetrics`, `FontVariation`, and `FontVariationAxis` with no producer here. Partial, not solid: the dual-core plus missing descriptor/teardown/introspection tiers are exactly the "unfinished work" band of the rubric. (The previous front matter said solid/58 while the body still read 33; this pass reconciles both.)

## Present capabilities

- **Identity:** `createFont(name)` → `Font { name }`; `createFontResource(family)` → `FontResource { family, face: null }`.
- **Loading (Font family):** `loadFontFromBytes(bytes, family)` (correct `byteOffset` slicing into a fresh `ArrayBuffer`), `loadFontFromName` (`document.fonts.load`), `loadFontFromUrl`, `loadFontFromUrls` (multi-source `src` string with `format()` hints). All add the face to `document.fonts` and resolve after `face.load()`.
- **Loading (FontResource family):** the same four entry points as `loadFontResourceFrom*`, mutating `out.face` and returning `out`. `loadFontResourceFromName` correctly captures the first resolved `FontFace`.
- **Identification:** `inferFontFormatFromUrl(url)` — extension → CSS `format()` keyword (`woff`/`woff2`/`truetype`/`opentype`/`embedded-opentype`/`svg`), query-string-safe, `null` sentinel — and `detectFontFormat(bytes)` — sfnt magic-byte sniffing (both landed 2026-07-09; both still return bare `string | null` rather than a `FontFormat` union).
- **Status queries:** `isFontLoaded(family, style?)` over `document.fonts.check` via the shared `getFontShorthand` (which backslash-escapes quotes/backslashes in the family name — the old injection bug is fixed), and `whenFontsReady()` wrapping `document.fonts.ready`.

Every export has a colocated test, though the loader tests still assert little beyond "returns a font with the given family name" against the jsdom `FontFace` (fontResourceFrom.test.ts is notably thinner than fontFrom.test.ts). Package is `sideEffects: false`, depends only on `entity` + `types`.

## Gaps vs an authoritative font-resource library

Compare the CSS Font Loading API surface itself, webfontloader/FontFaceObserver, and — per `register.md`, which names `ttf-parser` as this subject's upstream oracle — a font-introspection primitive:

- **The dual entity model is itself the top gap.** `Font` vs `FontResource` split one subject into two half-libraries; neither holds the whole story (`Font` has no `FontFace` handle and cannot be unloaded; `FontResource` has no entity identity). An authoritative layer has one font entity with identity *and* the loaded-face handle.
- **No `FontFaceDescriptors`.** None of the eight loaders accept weight, style, stretch, `unicodeRange`, `display`, or `featureSettings` — so you cannot register `Roboto Bold Italic` as a variant of the `Roboto` family, cannot subset by unicode range, and cannot control FOUT behavior. This makes multi-weight families — the normal case — unrepresentable.
- **No teardown.** Loaders call `document.fonts.add(face)` but nothing calls `delete`: no `disposeFontResource`/`unloadFont`. The lifecycle is add-only, violating the SDK's own dispose symmetry. (Verified still true 2026-07-13.)
- ~~No status queries~~ — **closed 2026-07-09**: `isFontLoaded` (`document.fonts.check`) and `whenFontsReady` (`document.fonts.ready`) landed. Still no loading-error signal.
- ~~No byte-level format detection~~ — **closed 2026-07-09**: `detectFontFormat(bytes)` sniffs the sfnt magic bytes.
- **No introspection (the ttf-parser layer):** `@flighthq/types` ships `FontMetrics`, `FontVariation` (+ the five registered axis tags), and `FontVariationAxis`, and this package produces none of them. Missing: name-table parsing (`getFontFamilyNameFromBytes` — note `loadFontFromBytes` *requires the caller to supply the family* precisely because the package cannot read it), variable-axis enumeration (`getFontVariationAxes`), glyph coverage (`hasFontGlyph`/`getFontCharacterSet`), and units-per-em/metrics extraction. Even if heavyweight parsing lands in a `font-formats` sibling, the entity layer needs the seam and the producers.
- **No variable-font application:** no way to set `font-variation-settings` on a loaded face despite `FontVariation` existing in the header layer.
- **No fallback-stack model** (ordered family list with per-script fallbacks) and **no system-font enumeration** (`queryLocalFonts` — arguably a platform-suite capability, but the seam belongs to this subject).
- **No backend seam.** Everything hard-references `FontFace` and `document.fonts`; the Rust port's canonical stack (rustybuzz + ttf-parser) and worker contexts have no `*Backend` to fill.
- ~~Unescaped shorthand interpolation~~ — **closed 2026-07-09**: `getFontShorthand` backslash-escapes quotes and backslashes; all callsites route through it.

## Naming / API-shape notes

- `createFontResource` builds a plain object literal instead of `createEntity`, and `FontResource` does not extend `Entity` — inconsistent with `Font`, with `ImageResource`, and with the "constructors over literals for SDK entity types" rule. Whichever entity survives the merge must be entity-backed.
- The `loadFontResourceFrom*` quartet mutates an `out` parameter *and* returns it, from an `async` allocating operation. The SDK's `out` convention exists for allocation-free hot-path writes; an async loader is neither. These should be plain `load* → Promise<Font>` producers (or take the entity as a non-`out`-named target if in-place loading is truly the design).
- ~~`inferFontFormat` self-identification~~ — **closed 2026-07-09**: renamed `inferFontFormatFromUrl`, with `detectFontFormat` as the byte-sniffing sibling. Still open: both return a bare `string | null`; the `FontFormat` union in `@flighthq/types` (header-layer-first) has not been added.
- `FontUrl` is defined inside `Font.ts` in `@flighthq/types`, violating the one-concept-per-file / filename-equals-type rule from the types-layout conventions.
- `Font.name` vs `FontResource.family`: the same value under two names across the two models. `family` is the domain-correct word (CSS, `FontFace`); `name` should not survive the merge.

## Recommendation

Resolve the entity duplication first — nothing else is worth polishing until there is one font entity. Merge `Font` and `FontResource` into a single entity-backed `Font { family, face: FontFace | null, … }` with one loader family (`loadFontFromBytes/Name/Url/Urls` as plain async producers), and delete the `out`-mutating quartet. Then bring the layer to its own bar: (1) accept `FontFaceDescriptors` (weight/style/stretch/unicodeRange/display) on every loader; (2) add `disposeFont` (`document.fonts.delete`); (3) add a `FontFormat` type in `@flighthq/types` for the two sniffers to return (moving `FontUrl` to its own file while there); (4) grow the introspection layer the header already promises — family-name extraction from bytes (removing the caller-supplied-family wart), variation-axis enumeration, and glyph coverage — either in-package or as the seam a `font-formats` sibling fills; (5) put the web `FontFace` path behind a backend seam so the Rust ttf-parser stack has a slot. As it stands the package is a competent, now well-hardened `FontFace` shim with a duplicated core, short of an authoritative font-resource library.
