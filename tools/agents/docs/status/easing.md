# @flighthq/easing — status

## 2026-06-25 — builder R2-4 lost-source recovery

The integration curation pruned several modules out of `packages/easing/src/`, but the gitignored `dist/` build output proved fuller source existed and compiled. Reconstructed the original `.ts` per the camera pattern: implementation + verbatim `//` comments from `dist/<m>.js`, types restored from `dist/<m>.d.ts`, tests reconstructed from `dist/<m>.test.js` (vitest globals, no imports).

### Recovered (4 modules, 13 exported functions)

- `createEasingSamples.ts` — `createEasingSamples(ease, count, out?)` bakes a curve to a `Float32Array` lookup table (endpoints clamped exact; count=1 samples the midpoint; throws on count < 1 / non-finite).
- `easeCombinators.ts` — `easeClamp`, `easeClampOutput`, `easeInvert`, `easeMirror`, `easeReverse`, `easeScaleOutput`: combinators that take EasingFunction(s) and return a new EasingFunction.
- `easePower.ts` — `easeInOutPower`, `easeInPower`, `easeOutPower`: arbitrary-exponent power curves generalizing the quadratic..quintic family.
- `getEasingDerivative.ts` — `getEasingDerivative(ease, t, epsilon?)`: numerical (finite-difference) slope of an easing curve, with forward/backward differences at the boundaries.

Each module's test file recovered alongside it. `src/index.ts` extended with the four `export *` lines, kept alphabetized.

### Parked (1 module)

- `easePiecewise.ts` (`easePiecewise(segments)`) — needs type `EasingSegment` in `@flighthq/types`. No `EasingSegment.ts` file exists in `packages/types/src/` and no definition is reachable there. Recovering this module would require editing `@flighthq/types`, which is outside this task's hard boundary. Implementation and tests are intact in `dist/easePiecewise.js` / `.test.js` for a future pass that first adds `EasingSegment` to the types header.

### Fossils skipped

None. All five dist-only modules are genuine easing math; none implements a deliberately-dropped concept.

### Test result

`npm run test --workspace=packages/easing` — 18 files, 133 tests, all passing.

## 2026-06-25 — builder R2-4 second-pass recovery

### Recovered (1 module, 1 exported function)

- `easePiecewise.ts` — `easePiecewise(segments)`: splices multiple `EasingFunction`s across the [0,1] input range with relative per-segment weights (default 1, normalized). This was parked last pass for "needs type `EasingSegment`"; the parallel types-recovery pass restored both `EasingSegment.ts` and `EasingFunction.ts` in `packages/types/src/`, so the module is now recoverable. Merged `dist/easePiecewise.js` (impl + verbatim comments) with `dist/easePiecewise.d.ts` (`Readonly<ReadonlyArray<Readonly<EasingSegment>>>` param, `EasingFunction` return). Test file recovered from `dist/easePiecewise.test.js`. `src/index.ts` extended with `export * from './easePiecewise'`, kept alphabetized (between `easeLinear` and `easePower`).

Note: `easePiecewise` throws on an empty segments array or zero total weight. The dist comment marks these as programmer errors ("An empty or weight-zero segments array is a programmer error and throws"), and the recovered tests assert the throw — consistent with the throw-on-misuse rule, not an expected-failure case.

### Skipped fossil

None. The only remaining dist-only module was `easePiecewise`, which is genuine easing math.

### Parked

None.

### Test result

`npm run test --workspace=packages/easing` — 19 files, 141 tests, all passing.
