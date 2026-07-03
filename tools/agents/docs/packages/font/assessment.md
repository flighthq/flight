---
package: '@flighthq/font'
updated: 2026-07-03
basedOn: ./review.md
---

# font — Assessment

Based on the 2026-07-03 review (partial, 33/100). Both previously approved sweep items have landed and are verified in source: `inferFontFormat` lives in a shared `fontFormat.ts`, and the byte loaders are `loadFontFromBytes` / `loadFontResourceFromBytes` over `Uint8Array`.

The review's central finding is that the dual entity model (`Font` string handle vs `FontResource` FontFace holder, each with a parallel loader quartet) is the top gap — "nothing else is worth polishing until there is one font entity." That merge is exactly charter Open direction #1 (undecided, needs the text/textlayout consumer perspective), so the entity-model work and everything sequenced behind it is parked; the Recommended list is confined to items independent of which entity survives.

## Recommended

Sweep-safe: within `@flighthq/font`, no cross-package coupling, no open design decision, independent of the Font/FontResource merge.

1. **Fix the `loadFontFromName` quote-escaping bug.** The name is interpolated unescaped into the `` `1em '${name}'` `` font shorthand, so a quote in the family name breaks `document.fonts.load`. Straight bug fix.

2. **Add magic-byte `detectFontFormat(bytes)`.** The sfnt signatures (`0x00010000`, `'OTTO'`, `'wOFF'`, `'wOF2'`, `'ttcf'`, `'true'`) are a four-byte sniff — the exact `detectImageMimeType` analog — and today `loadFontFromBytes` cannot even validate its input. Detection is not the binary *parsing* the charter routes to a codec neighbor, and it operates on bytes regardless of which entity survives the merge.

3. **Load-status queries — `isFontLoaded(family, style?)` (`document.fonts.check`) and a `document.fonts.ready` wrapper.** FontFaceObserver exists entirely because raw `load()` is not enough; these query the document font set, not either entity type.

4. **Rename `inferFontFormat` → `inferFontFormatFromUrl`.** It operates on a URL, not a `Font` — the same self-identification miss as image's `isImageResourceSameOrigin`. No consumers outside the package barrel. (The companion `FontFormat` union belongs in `@flighthq/types` — parked below.)

5. **Strengthen the loader tests.** The current tests assert little beyond "returns a font with the given family name" against the jsdom `FontFace`; cover the `document.fonts.add` registration, the multi-source `format()` hint composition, and failure paths.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Merge `Font` and `FontResource` into one entity-backed font entity, with one loader family.** _Parked — charter Open direction #1 (design decision)._ The review's top gap: neither type holds the whole story, `createFontResource` builds a literal instead of `createEntity`, the `loadFontResourceFrom*` quartet misuses the `out` convention on an async allocating operation, and `name` vs `family` duplicates one value under two words (`family` is domain-correct). Needs the text/textlayout consumer perspective before any agent acts.
- **`FontFaceDescriptors` on the loaders (weight, style, stretch, `unicodeRange`, `display`, `featureSettings`).** _Parked — sequenced behind the merge._ Multi-weight families are unrepresentable today, but adding descriptors to eight loaders that the merge collapses to four is churn; the review's own recommendation orders it after the entity resolution.
- **Teardown and lifecycle — `disposeFont` (`document.fonts.delete`).** _Parked — sequenced behind the merge._ The add-only lifecycle violates the SDK's dispose symmetry, but the API lands on whichever entity survives (only `FontResource` currently holds the `FontFace` handle).
- **Introspection layer — family-name extraction from bytes, `getFontVariationAxes`, glyph coverage, metrics.** _Parked — design decision / cross-package; candidate Open direction for the charter._ `@flighthq/types` ships `FontMetrics` / `FontVariation` / `FontVariationAxis` with no producer, and `loadFontFromBytes` requires a caller-supplied family precisely because the package cannot read the name table — but where binary parsing lives (here, textshaper, or a font-codec neighbor) is charter Open direction #3.
- **Backend seam for the `FontFace` / `document.fonts` path.** _Parked — cross-package design._ The Rust port's rustybuzz + ttf-parser stack and worker contexts have no `*Backend` slot to fill; cross-cutting with the platform-suite seam pattern.
- **Fallback-stack model and system-font enumeration (`queryLocalFonts`).** _Parked — design decision; candidate Open direction for the charter._ Scope questions from charter Open direction #2, with platform-suite overlap on enumeration.
- **Move `FontUrl` out of `Font.ts` and add a `FontFormat` union in `@flighthq/types`.** _Parked — cross-package (`@flighthq/types`)._ One-concept-per-file violation plus the header-layer type `inferFontFormatFromUrl`/`detectFontFormat` should return; a types-package edit.
- **Rust `flighthq-font` crate.** _Parked — global posture._ Already exists from the resources split; conformance follows parity passes.

## Approved

- [2026-07-02 · picked] Sweep items 1–2: DRY inferFontFormat, ArrayBuffer → Uint8Array rename
