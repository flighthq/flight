# Filename Alignment: @flighthq/filters-gl

**Verdict:** Backend-variant package (`-gl`): every source file must be `gl`-prefix-first. Strong overall — all 18 filter/shader/ramp modules follow `glXxx.ts` correctly; the single offender is the test helper `glTestHelper.ts`, which carries a generic `Helper` name instead of a domain/object word.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `glTestHelper.ts` | Generic `Helper` name carries no domain — it does not say what object it builds. It exports `makeFilterState` / `makeRenderTarget` / `makeScratch`, i.e. GL filter-test fixtures. Keeps the correct `gl` prefix but the suffix is in the helper/util family the convention flags. (Also note: no colocated `*.test.ts` — expected, as this is itself a shared test fixture, not a tested source module.) | `glFilterTestFixtures.ts` (or `glFilterTestState.ts`) — names the object it constructs (GL filter test fixtures/state) |

## Clean

All filter, shader, and gradient modules are `gl`-prefix-first and name a real filter/shader domain or object, each with a mirrored `*.test.ts`:

- `glBevelFilter.ts` / `.test.ts`
- `glBlitShader.ts` / `.test.ts`
- `glBlurFilter.ts` / `.test.ts`
- `glColorMatrixFilter.ts` / `.test.ts`
- `glConvolutionFilter.ts` / `.test.ts`
- `glDisplacementMapFilter.ts` / `.test.ts`
- `glDropShadowFilter.ts` / `.test.ts`
- `glGradientBevelFilter.ts` / `.test.ts`
- `glGradientGlowFilter.ts` / `.test.ts`
- `glGradientRamp.ts` / `.test.ts`
- `glInnerGlowFilter.ts` / `.test.ts`
- `glInnerShadowFilter.ts` / `.test.ts`
- `glMedianFilter.ts` / `.test.ts`
- `glOuterGlowFilter.ts` / `.test.ts`
- `glPixelateFilter.ts` / `.test.ts`
- `glSharpenFilter.ts` / `.test.ts`
- `glTintShader.ts` / `.test.ts`
- `index.ts` / `index.test.ts` — barrel, exempt from the prefix rule.
