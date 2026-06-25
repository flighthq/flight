---
package: '@flighthq/surface'
status: solid
score: 72
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - incoming/integration-b2824e3d8/changes.patch (packages/surface slice)
  - head + base source (surfaceNoise, surfaceWarp)
  - charter.md
  - prior review.md (67dc46d64-based)
---

# surface — Review (merge gate: integration-b2824e3d8 → origin/main)

This is a **merge-gate** review of the incoming delta only, judged against the approved baseline `origin/main` (`eb73c3d74`). The baseline `incoming/integration-b2824e3d8/base/packages/surface/` is the blessed floor and is **not** under review. Findings cite `b2824e3d8:<path>` against the head state and the `packages/surface/` hunks of `incoming/integration-b2824e3d8/changes.patch`.

**Important framing note vs the prior `review.md`.** The previous surface review (score 90, `authoritative`) read a _different_ bundle (`67dc46d64`) whose base already contained `surfaceAffine.ts` and a `SurfaceEdgeMode` type in `@flighthq/types`. This integration branch is built on a **different, earlier base** (`eb73c3d74`) where neither exists. The delta here adds `surfaceWarp.ts` on top of that base **without** its type dependency — so a defect that was a one-line barrel omission in the old bundle is, in _this_ bundle, a hard compile failure. The 90 score does not carry over; this review re-scores the package _as the delta leaves it_.

## The delta

Four files, two source units:

- **`surfaceNoise.ts`** (modified): `fillSurfacePerlinNoise` gains `stitch` and `channelOptions` parameters and OpenFL-parity channel masking; a new exported `fillSurfaceTurbulence`; four new exported constants `SURFACE_NOISE_CHANNEL_{R,G,B,A}`; internal `stitchedCoord` and `turbulenceNoise` helpers. Plus `surfaceNoise.test.ts` (6 new `it`s).
- **`surfaceWarp.ts`** (new): `warpSurface` (3×3 projective/homography, inverse-mapped, nearest/bilinear/bicubic sampling, edge modes) and `warpSurfaceQuad` (4-corner DLT homography → invert → delegate), plus `surfaceWarp.test.ts` (10 `it`s).

## Verdict

`REVISE — 72/100, NOT mergeable as-is.` The noise half of the delta is clean, well-tested, and a genuine OpenFL-parity improvement that I would merge on its own. The warp half is **not fit to merge**: it imports a type that does not exist on this base (a hard `tsc -b` failure for the whole package) and is not wired into the barrel (dead public API even if it compiled). One of those two is independently blocking; together they mean the candidate, as delivered, does not build and ships no reachable warp API. Fix both (or split warp out of this merge) and the delta is mergeable.

## Blocking defects (must fix before merge)

### 1. `surfaceWarp.ts` imports a type that does not exist on this base — package will not typecheck

`b2824e3d8:packages/surface/src/surfaceWarp.ts:2`:

```ts
import type { SurfaceEdgeMode, SurfaceRegion, SurfaceResizeMode } from '@flighthq/types';
```

`SurfaceRegion` and `SurfaceResizeMode` exist (`@flighthq/types` `index.ts:271-272`), but `SurfaceEdgeMode` **does not exist anywhere in `@flighthq/types`** on this branch — confirmed by grep over both `head/packages/types/src/` and `base/packages/types/src/` (zero hits) and over the whole head tree (the only match is `surfaceWarp.ts` itself). This is the supporting Bronze type the prior maturation roadmap assumed was "now done" (`status.md:106`, `134`) — but on base `eb73c3d74` it was never landed. `tsc -b` typechecks `src/*.test.ts` too, so this is a hard, package-wide compile failure, not a soft warning. `npm run check`/CI go red. The delta as delivered does not build.

This is squarely a **delta** defect: `surfaceWarp.ts` is a net-new file in this change set, and it depends on a type the change set did not bring with it.

### 2. `surfaceWarp.ts` is dead public API — never wired into the barrel

`b2824e3d8:packages/surface/src/index.ts` is **byte-identical** between base and head (verified by diff: "NO DIFF"). It ends at `export * from './surfaceTransform';` with no `export * from './surfaceWarp';`. So even if defect 1 were fixed, `warpSurface`/`warpSurfaceQuad` are unreachable from `@flighthq/surface` and emit no `dist/surfaceWarp.d.ts` — invisible to consumers and to `npm run api`. The colocated test still imports the file directly, so `exports:check` does not catch it ("tested" but not "exported from the package"). Either wire the barrel line in (alphabetically between `./surfaceTransform` and the type block) or remove `surfaceWarp.ts` + its test from this merge.

## Should-fix (contract hygiene, grounded in the delta)

### 3. Edge-mode is fragmented and not types-first

The warp file invents an edge-mode vocabulary that (a) is undefined and (b) diverges from the one already in the package. `warpResolveEdge` (`b2824e3d8:packages/surface/src/surfaceWarp.ts:670-685`) switches over `'clamp' | 'wrap' | 'mirror'` with a `'transparent'` default, i.e. `SurfaceEdgeMode = 'clamp' | 'mirror' | 'transparent' | 'wrap'`. But `surfaceConvolution.ts` on this base already defines `export type SurfaceConvolutionEdge = 'clamp' | 'fill' | 'wrap';`. Two overlapping-but-different edge-mode spellings, one of them undefined, both living in package source rather than `@flighthq/types`. The codebase map is explicit: cross-cutting types are defined in `@flighthq/types` _first_, then implemented against. The correct fix for defect 1 is therefore not "inline a `type SurfaceEdgeMode` in `surfaceWarp.ts`" but "add `SurfaceEdgeMode` to `@flighthq/types`" — and while there, reconcile it with `SurfaceConvolutionEdge` (`'transparent'` vs `'fill'` are the same intent under two names). That reconciliation is a types-package change and a small design call, so it is flagged here and routed to Open directions, not asserted as a within-package sweep.

## Clean in the delta (passes the standard)

- **Composition / bedrock (noise).** `fillSurfaceTurbulence` is a sibling primitive to `fillSurfacePerlinNoise`, not a config-gated branch bolted onto it: the two share the `valueNoise`/`stitchedCoord` lattice helpers but each owns its accumulation (`fractalValueNoise` smooth sum vs `turbulenceNoise` abs-fBm) — `b2824e3d8:packages/surface/src/surfaceNoise.ts:200-211` vs `:242-254`. Turbulence is sold as its own importable function rather than a `fractalNoise: boolean` flag on perlin (`:185-189` documents exactly this choice). That is the "extract the primitive, don't manage the complexity" rule applied correctly. No decomposition smell.
- **Composition (warp).** `warpSurfaceQuad` is a thin composition over `warpSurface` (`:540-545`: compute homography → invert → delegate), and the homography/solver/invert helpers are extracted free functions (`computeHomography`, `solveLinear8`, `invertMatrix3x3`). Decomposed to bedrock, not over-split.
- **Naming.** Full unabbreviated `Surface` type word on every export — `fillSurfaceTurbulence`, `SURFACE_NOISE_CHANNEL_R`, `warpSurface`, `warpSurfaceQuad`. Self-identifying; the word a reader reaches for. The constants are screaming-snake, matching the project's `GL_*` constant convention.
- **Tree-shaking / bundle invariant.** No new module-top-level side effects; the new constants are plain values; turbulence does not add a branch to the perlin hot loop (separate function). `sideEffects: false` is unchanged. The _one_ tree-shaking failure is defect 2 (warp not in the barrel) — but that is an under-shipping, not a per-item tax.
- **Registry vs closed union.** Channel selection is a bitmask (`channelOptions & SURFACE_NOISE_CHANNEL_R`), not a growing `switch (kind)`; appropriate for a fixed 4-channel RGBA model (bedrock, closed by nature). No fork-B violation.
- **Subject triad.** Nothing in the delta is mis-homed format/backend code; no premature split. N/A.
- **Out-params / alias-safety.** Noise and warp are destination-filling region ops; `warpSurface` documents `dest must not alias source when their regions overlap` (`:446`), which is the honest contract for an inverse-mapped resample (not safe to alias, and it says so). Sentinel discipline holds: `computeHomography`/`invertMatrix3x3`/`solveLinear8` return `null` on degenerate/singular input (`:723`, `:744`, `:777`) and the callers bail (`:541-544`) rather than throwing — correct "sentinel for expected failure" usage. The `w ≈ 0` projective edge case writes transparent black instead of dividing by zero (`:477-483`). `Readonly<>` is applied to the matrix/quad tuple params and the `SurfaceRegion` inputs.
- **Tests & honesty.** Both test files are colocated, `describe` blocks alphabetized and mirroring exports (`fillSurfaceNoise` < `fillSurfacePerlinNoise` < `fillSurfaceTurbulence`; `warpSurface` < `warpSurfaceQuad`). Noise tests assert determinism, range, grayscale R=G=B, alpha-channel selection, turbulence ≠ fractal-sum, and sub-region containment. Warp tests cover identity, translation, all edge modes, zero-size no-op, the `w ≈ 0` path, and degenerate quads. Claims match code. The warp tests _pass in isolation_ only because they import the file directly — they do **not** prove the package compiles or that the API is reachable (defects 1 and 2).

## Minor (non-blocking)

- The four `SURFACE_NOISE_CHANNEL_*` constants are exported but have no dedicated test `describe`; they are exercised inside the function describes (`fillSurfacePerlinNoise`/`fillSurfaceTurbulence` use `SURFACE_NOISE_CHANNEL_R`/`_A`). `exports:check` binds _functions_ to colocated tests, so this is unlikely to fail the gate, but if the checker is extended to constants it would. Acceptable as-is.
- `fillSurfacePerlinNoise`'s default behavior changes (independent-channel default → `channelOptions = 0x7` RGB mask, alpha forced opaque unless A selected). Pre-release, no back-compat duty, and the new params are additive with OpenFL-matching defaults — **not** an objection, recorded only so the noise-determinism baselines (if any fingerprint tests pin perlin output) are re-captured.

## Score rationale

72, `solid`. The noise delta alone is `authoritative`-grade. The warp delta drags the merge-gate score down hard because, as delivered, it makes the package fail to compile (defect 1) and ships no reachable API (defect 2). Neither is a deep design flaw — the warp implementation itself is correct and well-tested — but a candidate that does not build is not mergeable, and the score reflects the _delta's merge-readiness_, not the quality of the algorithm. Land the two fixes (or split warp out) and this returns to the 90 band.
