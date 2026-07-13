---
package: '@flighthq/font'
updated: 2026-07-13
basedOn: ./review.md
---

# font — Assessment

Based on the 2026-07-13 re-verified review (partial, 52/100). The 2026-07-09 deepening (commit 30d20a43) landed and is verified in source: the escaping bug is fixed via the shared `getFontShorthand`, `detectFontFormat(bytes)` sniffs the sfnt magic bytes, `isFontLoaded`/`whenFontsReady` cover load status, and `inferFontFormat` is renamed `inferFontFormatFromUrl` — four of the five previously Recommended items, all removed below.

The review's central finding is unchanged: the dual entity model (`Font` string handle vs `FontResource` FontFace holder, each with a parallel loader quartet) is the top gap — "nothing else is worth polishing until there is one font entity." That merge is charter Open direction #1 (undecided, needs the text/textlayout consumer perspective), so the entity-model work and everything sequenced behind it stays parked.

## Recommended

Sweep-safe: within `@flighthq/font`, no cross-package coupling, no open design decision, independent of the Font/FontResource merge.

1. **Strengthen the loader tests.** The loader tests still assert little beyond "returns a font with the given family name" against the jsdom `FontFace`, and `fontResourceFrom.test.ts` is markedly thinner than `fontFrom.test.ts`; cover the `document.fonts.add` registration, the multi-source `format()` hint composition, and failure paths. (Carried over — the only prior Recommended item not yet landed.)

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Merge `Font` and `FontResource` into one entity-backed font entity, with one loader family.** _Parked — charter Open direction #1 (design decision)._ The review's top gap: neither type holds the whole story, `createFontResource` builds a literal instead of `createEntity`, the `loadFontResourceFrom*` quartet misuses the `out` convention on an async allocating operation, and `name` vs `family` duplicates one value under two words (`family` is domain-correct). Needs the text/textlayout consumer perspective before any agent acts.
- **`FontFaceDescriptors` on the loaders (weight, style, stretch, `unicodeRange`, `display`, `featureSettings`).** _Parked — sequenced behind the merge._ Multi-weight families are unrepresentable today, but adding descriptors to eight loaders that the merge collapses to four is churn.
- **Teardown and lifecycle — `disposeFont` (`document.fonts.delete`).** _Parked — sequenced behind the merge._ The add-only lifecycle violates the SDK's dispose symmetry, but the API lands on whichever entity survives (only `FontResource` currently holds the `FontFace` handle).
- **Introspection layer — family-name extraction from bytes, `getFontVariationAxes`, glyph coverage, metrics.** _Parked — design decision / cross-package; candidate Open direction for the charter._ `@flighthq/types` ships `FontMetrics` / `FontVariation` / `FontVariationAxis` with no producer, and `loadFontFromBytes` requires a caller-supplied family precisely because the package cannot read the name table — but where binary parsing lives (here, textshaper, or a font-codec neighbor) is charter Open direction #3.
- **Backend seam for the `FontFace` / `document.fonts` path.** _Parked — cross-package design._ The Rust port's rustybuzz + ttf-parser stack and worker contexts have no `*Backend` slot to fill; cross-cutting with the platform-suite seam pattern.
- **Fallback-stack model and system-font enumeration (`queryLocalFonts`).** _Parked — design decision; candidate Open direction for the charter._ Scope questions from charter Open direction #2, with platform-suite overlap on enumeration.
- **`FontFormat` union in `@flighthq/types`; move `FontUrl` out of `Font.ts`.** _Parked — cross-package (`@flighthq/types`)._ `detectFontFormat` and `inferFontFormatFromUrl` both still return bare `string | null`; the header-layer type they should share has not been added, and `FontUrl` still violates one-concept-per-file.
- **Rust `flighthq-font` crate.** _Parked — global posture._ Already exists from the resources split; conformance follows parity passes.

## Approved

- [2026-07-02 · picked] Sweep items 1–2: DRY inferFontFormat, ArrayBuffer → Uint8Array rename
