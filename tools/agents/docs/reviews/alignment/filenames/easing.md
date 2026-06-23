# Filename Alignment: @flighthq/easing

**Verdict:** Clean — this is a single-implementation domain package (no backend variants, so no backend prefix applies); every `easeX.ts` file names an easing-curve family/domain that holds its In/Out/InOut (or related) variants, so the bare filename is self-describing and no file is named after a single function.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

All source files name an easing-curve family/domain and group its variants — none is a single-function file:

- `easeBack.ts` — `easeInBack` / `easeOutBack` / `easeInOutBack`
- `easeBounce.ts` — `easeInBounce` / `easeOutBounce` / `easeInOutBounce`
- `easeCircular.ts` — `easeInCircular` / `easeOutCircular` / `easeInOutCircular`
- `easeCubic.ts` — `easeInCubic` / `easeOutCubic` / `easeInOutCubic`
- `easeCubicBezier.ts` — `easeCubicBezier` (parametric curve factory; its own domain)
- `easeElastic.ts` — `easeInElastic` / `easeOutElastic` / `easeInOutElastic`
- `easeExponential.ts` — `easeInExponential` / `easeOutExponential` / `easeInOutExponential`
- `easeLinear.ts` — `easeLinear` (the linear curve; a legitimate named domain, not an arbitrary single-function split)
- `easeQuadratic.ts` — `easeInQuadratic` / `easeOutQuadratic` / `easeInOutQuadratic`
- `easeQuartic.ts` — `easeInQuartic` / `easeOutQuartic` / `easeInOutQuartic`
- `easeQuintic.ts` — `easeInQuintic` / `easeOutQuintic` / `easeInOutQuintic`
- `easeSine.ts` — `easeInSine` / `easeOutSine` / `easeInOutSine`
- `easeSmoothstep.ts` — `easeSmoothstep` / `easeSmootherstep` (Hermite + Perlin smoothstep family)
- `easeSteps.ts` — `easeSteps` (stepped easing factory; its own domain)
- `index.ts` — barrel re-export (legitimate index, not a dumping ground)

No generic names (`data.ts`, `utils.ts`, `math.ts`, etc.). Tests are colocated as `<source>.test.ts`, mirroring each source filename exactly.
