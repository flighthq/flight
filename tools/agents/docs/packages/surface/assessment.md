---
package: '@flighthq/surface'
updated: 2026-06-25
basedOn: ./review.md
---

# surface — Assessment (merge gate: integration-b2824e3d8)

Sorted from `review.md` (merge-gate score `solid — 72`, base `origin/main eb73c3d74`, evidence `integration-b2824e3d8` delta). This assessment covers only the incoming delta (`surfaceNoise` + `surfaceWarp`). The noise half is clean; the warp half carries the two blocking defects. `Recommended` holds only sweep-safe, within-`@flighthq/surface`, non-design-decision items. The edge-mode-types reconciliation and every structural fork are routed to the charter's Open directions. The actual merge-blocking directives (which require an out-of-package type addition) live in the dispatch brief at `outgoing/integration/surface.md`, not here — `assessment.md` is the within-package recommendation layer.

## Recommended

Strictly sweep-safe: within `@flighthq/surface`, no cross-package coupling, no breaking change, no open design decision.

- **Wire `surfaceWarp.ts` into the barrel — once it compiles.** `src/index.ts` has no `export * from './surfaceWarp'` (byte-identical base↔head), so `warpSurface`/`warpSurfaceQuad` are unreachable from the package root and emit no `dist/surfaceWarp.d.ts`. Add the one line alphabetically between `export * from './surfaceTransform';` and the trailing type block. **Blocked on** the `SurfaceEdgeMode` type fix (cross-package, see Backlog) — wiring a barrel line to a file that does not typecheck only changes the failure mode. Do both together. — review.md (Blocking defect 2).

- **Noise delta is approvable as-is.** `fillSurfaceTurbulence`, the `stitch`/`channelOptions` parameters on `fillSurfacePerlinNoise`, and the `SURFACE_NOISE_CHANNEL_*` constants are correctly decomposed (turbulence is a sibling primitive, not a `fractalNoise` flag), fully tested, and contract-clean. No within-package change needed beyond re-capturing any perlin-output fingerprint baselines that the new default channel-mask behavior shifts. — review.md (Clean in the delta; Minor).

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **Add `SurfaceEdgeMode` to `@flighthq/types` (unblocks warp).** `surfaceWarp.ts:2` imports `SurfaceEdgeMode` from `@flighthq/types`, where it does not exist on this base — a hard package-wide `tsc -b` failure. The fix is a type addition in the `@flighthq/types` package (`'clamp' | 'mirror' | 'transparent' | 'wrap'`). **Parked from Recommended:** it is a _cross-package_ change (touches `@flighthq/types`, not `@flighthq/surface`), so it is out of a within-package sweep — but it is the gating must-fix and is written as an imperative directive in `outgoing/integration/surface.md`. — review.md (Blocking defect 1).

- **Reconcile `SurfaceEdgeMode` with `SurfaceConvolutionEdge`.** `surfaceConvolution.ts` already defines `SurfaceConvolutionEdge = 'clamp' | 'fill' | 'wrap'`; warp wants `'clamp' | 'mirror' | 'transparent' | 'wrap'` (`'transparent'` and `'fill'` are the same intent under two names). When `SurfaceEdgeMode` lands in `@flighthq/types`, decide whether `surfaceConvolution` should consume it too and collapse the two spellings. **Parked:** cross-package (types + convolution callsite) and a naming/design call the charter should settle, not an autonomous sweep. — review.md (Should-fix 3).

- **Rust `warp.rs` mirror.** If TS warp ships (barrel + type fix), the 1:1 conformance goal needs a paired `flighthq-surface::warp` (`warp_surface`/`warp_surface_quad`). **Parked:** Rust crate work, separate environment/owner; bundle with the TS warp landing. — review.md (TS↔Rust mirror, implied by the conformance map).

## Approved

_None. Approval is the user's verbal gate; this assessment only proposes. Items move here, with a dated provenance stamp, only after the user blesses them._

## Notes for the charter's Open directions

The delta surfaces direction questions the stub charter (North star / Boundaries / Decisions all `TODO`) should settle:

- **Edge-mode model.** Is there one canonical `SurfaceEdgeMode` in `@flighthq/types` that every geometric/sampling op (warp, convolution, future resize/rotate unification) shares, or do ops keep local edge vocabularies? The warp delta forces this question by importing a type that should have been the shared one.
- **Noise breadth as a North-star target.** Turbulence + stitch + channel-options closes most of the OpenFL `perlinNoise` parity gap; the charter can now state whether Simplex/Worley/offsets are in-scope frontier or out.
- **Warp/affine sampling unification.** Warp introduces nearest/bilinear/bicubic + edge modes; older `resizeSurface`/`rotateSurface` still use implicit border handling. Whether cross-op border consistency is a goal worth the churn is a decision, not a sweep.
