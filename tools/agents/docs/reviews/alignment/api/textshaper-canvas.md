# API Alignment: @flighthq/textshaper-canvas

**Verdict:** Essentially clean — a single, correctly-named `create*` backend factory that follows the SDK backend-seam pattern; the one real gap (`measureText` taking a non-`Readonly` `TextFormat`) lives in the upstream `@flighthq/types` contract, not in this package.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `createCanvasTextShaperBackend` (returned `measureText`) | The backend closure types its parameter `format: TextFormat` (mutable), inconsistent with the sibling `@flighthq/textshaper`'s `shapeText(text, format: Readonly<TextFormat>)`. The map requires `Readonly<T>` on parameters not intended to mutate. However, this package faithfully implements `TextShaperBackend.measureText`, whose type alias `TextMeasureFunction = (text: string, format: TextFormat) => number` is defined without `Readonly` in `@flighthq/types/TextLayout.ts`. Fixing it here alone would diverge from the seam. | Raise as a cross-package suggestion: change `TextMeasureFunction` in `@flighthq/types/src/TextLayout.ts` to `(text: string, format: Readonly<TextFormat>) => number`. `TextShaperBackend.measureText` and this implementation then inherit the const-correctness with no local edit. |
| Info | `createCanvasTextShaperBackend` | `canvas.getContext('2d')!` uses a non-null assertion; when a 2D context is unavailable the first `measureText` call dereferences `null` and throws a runtime `TypeError`. This is an environment failure (not API misuse), but unlike the platform-suite web backends it neither guards nor returns a sentinel. Text-shaper is not a platform-suite capability, so the guard convention does not strictly apply; a missing 2D context in a DOM environment is effectively unreachable in correct usage. | Acceptable as-is. If hardening is wanted, no behavior change is needed since a non-DOM environment already fails earlier at `document.createElement`. |

## Clean

- **Full type word, no abbreviation.** `createCanvasTextShaperBackend` spells out `TextShaperBackend` in full; the `Canvas` token identifies the backend variant (matching the package name `textshaper-canvas`), exactly as the design constraints require.
- **Globally unique export.** The single root export collides with nothing; it slots cleanly beside `createWeb*Backend` / `createElectron*Backend` / `createCanvas*Backend` siblings, so verb (`create`) and the `*Backend` suffix are consistent with the whole platform/backend family.
- **Correct allocation verb.** `create*` is right — the function allocates a private offscreen `<canvas>` and a fresh backend object; it is not a hot-path or out-param helper, so no `out` discipline applies.
- **Backend-seam pattern.** Returns a `TextShaperBackend` for the caller to install via `setTextShaperBackend(...)`; no eager registration, no module-top-level side effects (`"sideEffects": false` holds — the factory only allocates when called). Matches the opt-in `create*Backend` + `set*Backend` convention.
- **Cross-package type from `@flighthq/types`.** `TextFormat` and `TextShaperBackend` are imported from `@flighthq/types`, not redefined inline.
- **`import type {}` on its own line.** `import type { TextFormat, TextShaperBackend } from '@flighthq/types'` is a dedicated type-only import, separate from the value import of `computeTextFormatFontString`.
- **No teardown/sentinel/accessor misuse.** No `dispose*`/`destroy*`/`get*`/`is*` surface exists to misuse; nothing throws for an expected-missing case.
- **Colocated test, mirrored describe.** `canvasTextShaper.test.ts` sits beside the source with a single `describe('createCanvasTextShaperBackend')` mirroring the export, and exercises both the returned shape and installation into the seam.
