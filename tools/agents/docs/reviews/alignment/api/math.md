# API Alignment: @flighthq/math

**Verdict:** Clean — the two-function surface (`createRandomSource`, `nextPowerOfTwo`) obeys every API convention; the only notes are advisory naming/symmetry observations, no required fixes.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Info | `nextPowerOfTwo` | The function operates on a plain `number`, not a named SDK type, so the "full unabbreviated type word" rule doesn't strictly bind. Name reads as a free numeric helper; that's fine, but it sits in a `math` package whose name the filename-dimension checklist flags as generic. No rename warranted given the math-utility scope, but watch for scope creep — if this package grows vector/matrix helpers, those belong in `@flighthq/geometry`, keeping `math` to scalar utilities. | None required; keep `math` to scalar/number utilities. |
| Info | `createRandomSource` | Aligns with the established `create*Source` family (`createTimelineSource`, `createSpritesheetTimelineSource`, `createSurfaceFromImageSource`). The returned `RandomSource` is a bare `() => number` closure rather than an entity/runtime pair; acceptable for a value-typed leaf, but means there is no `disposeRandomSource` (correctly — nothing to release). Consider whether a future `out`-style fill (e.g. `nextRandomInt(source, min, max)`) helpers should live here so call sites don't reimplement ranging. | Optional: add ranged helpers (`nextRandomInt`, `nextRandomInRange`) if consumers start reimplementing them; flag to user as scope decision. |

## Clean

- **Full, unabbreviated names.** `createRandomSource` and `nextPowerOfTwo` spell out every word; no abbreviation of a type term. `Random`/`Source` and `PowerOfTwo` are fully written.
- **Globally unique exports.** Both names are unique across all `packages/*/src` — no collision from the root barrel.
- **Allocation discipline by verb.** `createRandomSource` is a `create*` and legitimately allocates (a closure capturing 32-bit state). `nextPowerOfTwo` is allocation-free, returning a primitive — correct for a hot-path math helper. Neither needs an `out` parameter (both return primitives/a value), so the alias-safety rule is N/A.
- **No teardown-verb misuse.** No `dispose*`/`destroy*`/`acquire*`/`release*` present; correctly omitted since `RandomSource` is a GC-managed closure with nothing to free.
- **`Readonly<T>` rule satisfied vacuously.** Both parameters are primitive `number` (exempt). No object params that would need `Readonly<>`.
- **Sentinels over throws.** Neither function throws. `createRandomSource` defensively coerces a non-finite seed to `0` (`Number.isFinite(seed) ? seed >>> 0 : 0`) rather than throwing — appropriate, since a bad seed is recoverable input, not programmer error. `nextPowerOfTwo` clamps `n <= 1` to `1` instead of throwing.
- **No `get*`/`is*`/`has*` mismatch.** No accessors or boolean returns to misname.
- **Verb consistency.** `create*Source` matches the SDK-wide `create*` constructor verb and the `*Source` suffix family; `next*` matches `nextFrameMovieClip` / `nextFrameTimeline`.
- **Cross-package types from `@flighthq/types`.** `RandomSource` is defined in `packages/types/src/RandomSource.ts` and imported via `import type { RandomSource }` (its own line), then re-exported — not redefined inline. The type is consumed by `ParticleEmitterState`/`ParticleObjectsState` in types, confirming it's a genuine cross-package contract belonging in the header layer.
- **`import type` on its own line.** `import type { RandomSource } from '@flighthq/types';` is isolated; no mixed value/type import.
- **Tests colocated and ordered.** `nextPowerOfTwo.test.ts` and `random.test.ts` sit beside their sources; exports are trivially alphabetized across two single-function files.
- **Package hygiene.** `"sideEffects": false`, single `.` export, no eager top-level side effects, only `@flighthq/types` as a runtime dep.
