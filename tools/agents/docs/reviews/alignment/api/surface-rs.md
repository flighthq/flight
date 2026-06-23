# API Alignment: @flighthq/surface-rs

**Verdict:** Strongly aligned — as a signature-identical wasm drop-in for `@flighthq/surface`, the exported API faithfully mirrors upstream and follows the SDK conventions; the only notes are minor and inherited-from-upstream by design.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Info | `getSurfaceColorBoundsRectangle` | A `get*` accessor that allocates a fresh `{ x, y, width, height }` object literal on every successful call (line 531), rather than writing into an `out`/`target`. The SDK reserves allocation for `create*`/`clone*`/`acquire*`; hot-path `get*` helpers normally write into `out`. | None for surface-rs in isolation — it is a drop-in and **must** match upstream `@flighthq/surface`, which has the identical signature and allocation. Flag belongs to upstream `surface`, not here. If upstream ever adds an `out`-param overload, mirror it. |
| Info | `getSurfaceHistogram` | Returns a newly-allocated `SurfaceHistogram` with four 256-entry arrays via `Array.from` (lines 553-558) — allocation behind a `get*` name. | Same as above: dictated by upstream parity. Do not diverge unilaterally. |
| Info | `getSurfaceColorBoundsRectangle`, `getSurfaceHistogram` | Both read from module-level shared scratch (`SCRATCH_RECT`, `SCRATCH_HISTOGRAM`) populated by the wasm call, then copy out before returning. This is single-threaded-safe and the copy-out makes the shared scratch invisible to callers; no reentrancy hazard for synchronous wasm. | No change. Noted only so a future async wasm path does not expose the shared scratch. |
| Info | `initSurfaceRs` | Port-specific export with **no upstream `@flighthq/surface` counterpart** (upstream needs no wasm warm-up). Correctly verb-named (`init*`, an opt-in lifecycle function, not a top-level side effect) and clearly documented as an optional warm-up. | None. This is the right shape for the one capability surface-rs adds; just confirm it is recorded as an intentional addition over upstream if a parity manifest tracks export deltas. |

No abbreviated type words, no global-name collisions, no thrown errors for expected-missing cases, no teardown-verb misuse, no mutable-by-default object params, and no inline cross-package type definitions were found.

## Clean

- **Full, unabbreviated type words everywhere.** Every override spells `Surface` out in full: `applySurfaceColorTransform`, `blurSurfacePixelsHorizontalWeighted`, `getSurfaceColorBoundsRectangle`, `unpremultiplySurfacePixels`. No `getSfc*`/`DOBounds`-style abbreviation.
- **Signature-identical drop-in.** Each of the 50 overridden functions matches its `@flighthq/surface` counterpart parameter-for-parameter, including defaults (`copySource = false`, `blendMode = BlendMode.Normal`, `sigmaY = sigmaX`, `passes = 1`) and return types (`applySurfaceThreshold` → `number`, `dissolveSurfacePixels` → `number`, `getSurfaceColorBoundsRectangle` → `RectangleLike | null`). The barrel shadowing comment in `index.ts` makes the override/passthrough split explicit.
- **`Readonly<T>` discipline.** Source/input object params are uniformly `Readonly<>` (`Readonly<SurfaceRegion>`, `Readonly<ColorTransformLike>`, `Readonly<Uint8ClampedArray>`, `Readonly<SurfaceBevelOptions>`); only true outputs (`out`, `scratch`, `dest`) and the in-place-mutated `Surface` targets (`floodFillSurface`, `scrollSurface`) are mutable. Module-level lookup tables are `Readonly<Record<…>>`.
- **Allocation by verb.** The transform/filter/blur ops (`bevelSurface`, `gaussianBlurSurface`, `colorMatrixSurface`, `convolveSurface`, …) all write into caller-provided `out`/`scratch` buffers and allocate nothing on the hot path. The only allocations are the two upstream-mandated `get*` returns noted above.
- **Sentinels over throws.** `getSurfaceColorBoundsRectangle` returns `null` for the not-found case; no function throws. No validation of internal invariants that correct usage cannot reach.
- **Out-param ordering symmetry.** Consistent `(out, [scratch], source, …)` shape across all buffer-writing ops, and `(dest, source, …)` across the region-pair/in-place ops — matching upstream order exactly.
- **`get*`/boolean naming.** `get*` is used only for value accessors; no `get*` returns a boolean, and the package introduces no boolean accessors that would need `has*`/`is*` (the internal `isSameRegion` helper is correctly `is*`-named and not exported).
- **`import type {}` hygiene.** Type-only imports are on their own `import type { … }` lines (the `@flighthq/surface` option types and the `@flighthq/types` contracts); the one value import, `BlendMode`, is a separate plain `import` line. No mixed `import { type Foo, bar }`.
- **Cross-package types from `@flighthq/types`.** All shared contracts (`SurfaceRegion`, `Surface`, `ColorTransformLike`, `PixelOrder`, `ThresholdOperation`, `SurfaceHistogram`, …) come from `@flighthq/types`; surface-specific option types come from `@flighthq/surface`. Nothing is defined inline.
- **Alphabetized exports and colocated test.** Exports are alphabetized within `surfaceWasm.ts` (re-export list in `index.ts` matches), and `surfaceWasm.test.ts` is colocated; `npm run order:check` reports nothing for this package.
- **No top-level side effects.** wasm instantiation is deferred behind the lazy, idempotent `ensureSurfaceRs()` / explicit `initSurfaceRs()`; the package declares `"sideEffects": false` and registers nothing at import time.
