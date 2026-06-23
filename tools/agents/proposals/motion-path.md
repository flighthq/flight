---
id: motion-path
title: '@flighthq/motion-path'
type: new-package
target: motion-path
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/motion-path.md
  - tools/agents/docs/reviews/breadth/animation-motion.md
depends_on: []
updated: 2026-06-23
---

## Summary

Animate a `Transform2DNode` along an authored `Path` with orient-to-tangent and arc-length (constant-speed) parameterization — the bridge between `@flighthq/path` geometry and `@flighthq/tween` time control.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable version: build an arc-length table from a `Path`, sample point + tangent at a normalized `0→1` progress, and drive a node along it with orient-to-tangent. This is the 80% — "tween an object along a curve and face the direction of travel."

- **Types in `@flighthq/types`:**
  - `MotionPath` — the sampler-ready descriptor: `{ points: number[]; lengths: number[]; totalLength: number; closed: boolean }`. A flattened polyline (flat `x,y` stream) plus a prefix-sum arc-length table and the total. Plain data, not entity-backed; built from a `Path`. (`closed` decides wrap-vs-clamp at the ends.)
  - `MotionPathSample` — `{ x: number; y: number; tangentX: number; tangentY: number; angle: number }` (the resolved position, the unit tangent, and its `atan2` angle — the value an orient-to-tangent write consumes).
  - `MotionPathOrientKind` — string `*Kind` identifier for the rotation policy: Bronze ships `'None'` (position only) and `'Tangent'` (face direction of travel).
  - `MotionPathOptions` — `{ orient: MotionPathOrientKind; angleOffset: number; flatnessTolerance: number }` (`angleOffset` lets art whose "forward" is up rather than +x correct itself; `flatnessTolerance` feeds `flattenPath`).
- **`@flighthq/motion-path`:**
  - `createMotionPathOptions(obj?: Readonly<Partial<MotionPathOptions>>): MotionPathOptions` — constructor with sane defaults (`orient: 'Tangent'`, `angleOffset: 0`, `flatnessTolerance: 0.25`), per the "constructors over literals" rule.
  - `createMotionPathFromPath(path: Readonly<Path>, options?: Readonly<MotionPathOptions>): MotionPath` — flatten (`flattenPath`) then build the arc-length table. The one allocation entry point.
  - `getMotionPathLength(motionPath: Readonly<MotionPath>): number` — total arc length (cheap accessor; `get*` prefix).
  - `sampleMotionPath(out: MotionPathSample, motionPath: Readonly<MotionPath>, progress: number): void` — write the sample at normalized `progress` (`0→1`), arc-length parameterized so equal `progress` steps cover equal distance (constant speed). `out`-param, alias-safe, hot-loop-safe, no allocation. Clamps (or wraps when `closed`) out-of-range `progress`.
  - `sampleMotionPathAtDistance(out: MotionPathSample, motionPath: Readonly<MotionPath>, distance: number): void` — same, keyed by absolute arc length instead of normalized progress.
  - `applyMotionPathSampleToNode(node: Transform2DNode, sample: Readonly<MotionPathSample>, options: Readonly<MotionPathOptions>): void` — write `sample.x`/`sample.y` into the node, and (when `orient !== 'None'`) `sample.angle + angleOffset` into `node.rotation`, then invalidate the local transform. The single node-binding primitive; everything higher composes it.
  - `MotionPathOrientNoneKind` / `MotionPathOrientTangentKind` — the two orient constants, registered in a string-keyed map so Silver adds siblings without changing the call shape.
- **Effort:** one `flattenPath` call + a prefix-sum table + a binary search in `sampleMotionPath`. The node write reuses existing `node` transform writers. Small, value-typed, immediately useful.

### Silver

Competitive with a well-regarded motion-path tool (GSAP MotionPathPlugin, Animate motion guides, anime.js path): a stateful follower bound to a node, tween/timeline driving, alignment modes, sub-path selection, distance/progress queries, and a curvature-aware (not just linear-segment) tangent.

- **Types in `@flighthq/types`:**
  - `MotionPathFollow` (Entity) + `MotionPathFollowRuntime` — a stateful follower binding one `Transform2DNode` to one `MotionPath`: holds current `distance`, `direction` (+1/−1), and a scratch `MotionPathSample` so per-frame following is allocation-free. Runtime carries cached segment-search state for monotonic forward stepping (skip the binary search when advancing linearly).
  - `MotionPathFollowOptions` — extends the bind: `{ orient; angleOffset; loop: MotionPathLoopKind; speed: number; startDistance: number; alignNodeAxis: MotionPathAxisKind }`.
  - `MotionPathLoopKind` — `'Clamp'` (stop at the end), `'Wrap'` (jump to start), `'PingPong'` (reverse at the ends) as string kinds.
  - `MotionPathAxisKind` — which local node axis is treated as "forward" for orientation (`'PositiveX' | 'NegativeX' | 'PositiveY' | 'NegativeY'`), a higher-level alternative to a raw `angleOffset`.
  - Extend `MotionPathOrientKind` with `'FixedAngle'` (lock to a constant), `'PerpendicularLeft'` / `'PerpendicularRight'` (normal-facing, for ribbons/labels), and `'Reverse'` (face away from travel).
  - `MotionPathBuildOptions` — extends `MotionPathOptions` with sub-path/range control: `{ samplesPerCurve: number; subPathIndex: number; rangeStart: number; rangeEnd: number }` (animate only part of a multi-contour or trimmed curve).
- **`@flighthq/motion-path`:**
  - `createMotionPathFollow(node: Transform2DNode, motionPath: Readonly<MotionPath>, options?: Readonly<MotionPathFollowOptions>): MotionPathFollow` — bind a node to a path.
  - `updateMotionPathFollow(follow: MotionPathFollow, deltaTime: number): boolean` — advance by `speed * deltaTime` (units/sec) honoring `loop`; write the node; return `false` once a `'Clamp'` follow has finished (sentinel, no throw). The tween-free driver.
  - `setMotionPathFollowProgress(follow: MotionPathFollow, progress: number): void` / `setMotionPathFollowDistance(follow, distance): void` — scrub the follower (timeline/slider control) and rewrite the node immediately.
  - `getMotionPathFollowProgress(follow: Readonly<MotionPathFollow>): number` / `getMotionPathFollowDistance(...)` — query for UI/debug.
  - `disposeMotionPathFollow(follow: MotionPathFollow): void` — detach the node reference and clear runtime caches (release-to-GC; `destroy*` not needed — no non-GC resource owned).
  - **Tween driver (composes `@flighthq/tween`):**
    - `createMotionPathTween(manager: TweenManager, node: Transform2DNode, motionPath: Readonly<MotionPath>, duration: number, options?: Readonly<MotionPathTweenOptions>): Tween<MotionPathFollow>` — a `Tween` whose tweened scalar is `progress`, driving `applyMotionPathSampleToNode` each step. Inherits all `TweenOptions` (delay, ease, repeat, yoyo/`reflect`, callbacks), so easing along the curve and ping-pong come for free from the existing engine. This is the headline Silver feature: "animate along a path" using the same manager/clock as every other tween.
  - **Multi-contour / trimming:**
    - `getMotionPathSubPathCount(motionPath: Readonly<MotionPath>): number` and `createMotionPathSubPath(path, subPathIndex, options): MotionPath` — pick one contour of a multi-move `Path`.
    - `createMotionPathRange(motionPath, rangeStart, rangeEnd): MotionPath` — a trimmed `[start,end]` slice (path-trim animation: reveal a stroke along the curve).
  - **Higher-fidelity tangent:** sample tangents from the curve's analytic derivative at curve vertices rather than only finite-differencing the flattened polyline, so orientation is smooth on tight curves (configurable via `samplesPerCurve`).
  - **Alias-safety & out-params:** every sampler and the node write read all inputs into locals before writing; `updateMotionPathFollow` reuses the runtime scratch sample — zero per-frame allocation in steady state.
- **Cross-backend consistency:** purely CPU geometry/math; the follower only writes scene-graph transform fields, which every renderer already consumes — no per-backend variant, identical results across Canvas/DOM/GL/wgpu.
- **Effort:** the stateful follower + loop modes + the tween bridge is the bulk; sub-path/trim and the analytic tangent are bounded geometry. This is the tier that makes it production motion-design.

### Gold

Authoritative reference: signals, pooling/allocation discipline, banking/look-ahead orientation, fixed-spacing distribution along a path (the stagger primitive for paths), full edge-case and error handling, exhaustive tests, docs, and 1:1 Rust parity.

- **Types in `@flighthq/types`:**
  - `MotionPathWaypoint` — `{ distance: number; id: number }` named/indexed marks along the path so a follow can fire `onMotionPathWaypoint` and a sequencer can branch (the path analogue of a timeline label).
  - `MotionPathDistribution` — `{ count: number; spacing: MotionPathSpacingKind; startDistance: number; endDistance: number }` for laying many nodes along one path.
  - `MotionPathSpacingKind` — `'Even' | 'ByLength' | 'Packed'` (even arc-length, proportional, or end-to-end packed).
  - `MotionPathStats` — `{ totalLength; segmentCount; contourCount; cachedLookups; recomputedLookups }` for profiling the lookup cache.
  - Extend `MotionPathOrientKind` with `'TangentBanked'` (roll/lean into the turn, using curvature) and `MotionPathFollowOptions` with `bankFactor`, `bankSmoothing`, and `lookAhead` (orient toward a point ahead on the curve, for vehicle-like motion).
- **`@flighthq/motion-path`:**
  - **Signals:** `enableMotionPathSignals(follow)` exposing `onMotionPathComplete`, `onMotionPathLoop`, and `onMotionPathWaypoint` (opt-in cost via the owning package, per the signals rule). Sequencing/state-machine layers subscribe instead of polling `getMotionPathFollowProgress`.
  - **Distribution (path stagger):** `distributeNodesAlongMotionPath(nodes: Readonly<Transform2DNode[]>, motionPath, distribution, options): void` — place/orient a set of nodes along one path with even/by-length/packed spacing. The path counterpart to tween stagger.
  - **Curvature & geometry queries:** `getMotionPathCurvatureAtDistance(motionPath, distance): number`, `getMotionPathNormalAtDistance(out: Vector2Like, motionPath, distance): void`, `getMotionPathClosestDistance(motionPath, point: Readonly<Vector2Like>): number` (project a point onto the curve — snap-to-path / nearest-progress).
  - **Banking & look-ahead orientation:** honored inside `applyMotionPathSampleToNode`/`updateMotionPathFollow` via the new orient kinds — smoothed roll into turns and forward-looking heading.
  - **Pooling / allocation discipline:** `acquireMotionPathSample()` / `releaseMotionPathSample(sample)` and `acquireMotionPathFollow()` / `releaseMotionPathFollow(follow)` paired pool brackets; all hot-path geometry through `out`-params and `@flighthq/geometry` pools — provably zero per-frame allocation.
  - **Rebind / live edit:** `setMotionPathFollowPath(follow, motionPath): void` (swap the curve under a running follow, preserving normalized progress) and `getMotionPathStats(follow, out): void`.
  - **Full edge cases:** zero-length paths (single point → degenerate sample, never NaN), single-segment paths, coincident/duplicate vertices (skipped in the length table), `progress`/`distance` far out of range under each `loop` mode, `closed` paths whose first≠last point (auto-close segment), tangent at an exact vertex (averaged), and `'PingPong'` direction flips landing exactly on an endpoint. Sentinels for expected misses (`getMotionPathClosestDistance` on an empty path → `-1`); `throw` only on programmer error (negative `samplesPerCurve`).
- **Tests:** colocated `*.test.ts` per source file; `describe` blocks alphabetized mirroring exports; `out`-aliasing test for every `out`-param fn; arc-length monotonicity and constant-speed assertions; loop-mode boundary fingerprints; a functional test (`tests/functional/motion-path-follow`) rendering a node tracing a curve across Canvas/DOM/GL with a screenshot baseline.
- **Rust parity:** `flighthq-motion-path` — the sampler/table half is a 1:1 conformant value-typed leaf (same flatten tolerance, same arc-length table, bit-deterministic `MotionPathSample`s), on the parity-differ path and mixable as a `motion-path-rs` candidate. The follow/node-binding half mirrors the Rust `flighthq-node` arena (`&mut NodeArena<T>`, `NodeId`); `Signal<T>` from `flighthq-signals` backs the enable-group.
- **Docs:** the orientation-policy guide (tangent vs banked vs look-ahead, `angleOffset` vs `alignNodeAxis`), the constant-speed/arc-length rationale, sub-path/trim usage, and the follow-vs-tween-vs-timeline decision.

## Boundaries

- **Outline construction stays in `@flighthq/path`.** This package consumes a `Path` (and `flattenPath`); it does not add path-building verbs. `appendPath*`/`createPath` remain the authoring surface.
- **Generic scalar tweening stays in `@flighthq/tween`.** `motion-path` only contributes the path-specific driver (`createMotionPathTween`); easing, repeat, yoyo, the manager, and the clock are the tween package's job. Tween sequencing/stagger of _non-path_ properties is a `tween` enrichment, not here.
- **Easing functions stay in `@flighthq/easing`.** The follower takes an `EasingFunction` via `TweenOptions`; it defines none.
- **Transform application stays in `@flighthq/node`.** `motion-path` writes through `node`'s existing transform writers and invalidation; it does not reimplement matrix/transform composition.
- **3D path following stays out (for now).** Bronze–Gold are `Transform2DNode` only. A `Transform3DNode` path follow (with a frame/up-vector orientation) is a deliberate future extension, not folded into the 2D API silently — surfaced as an open question.
- **Spring/inertia motion stays in the requested `@flighthq/spring`.** Driving `progress` with a spring instead of an ease is a _composition_ (feed a spring's output into `setMotionPathFollowProgress`), not a feature this package owns.
- **Skeletal/bone motion stays in the requested `@flighthq/skeleton`.** Bones following paths compose the two; no bone concepts live here.
- **Authored-guide parsing stays in a future `@flighthq/motion-path-formats`.** Flash/AE/SVG motion-guide importers are the `-formats` neighbor's job, never inline parsers in the core.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **Tween coupling direction.** Should `createMotionPathTween` live in `motion-path` (depending on `tween`) or in `tween` (depending on `motion-path`), or behind a thin importable bridge so a geometry-only user never pulls the tween engine? Recommendation: keep the core sampler/follow tween-free and put `createMotionPathTween` in `motion-path` so the dependency points one way (`motion-path → tween`), preserving the mixable value-typed leaf for users who only sample.
- **`MotionPath` cache vs. live `Path`.** `MotionPath` is a baked snapshot (flattened + arc-length table). If the source `Path` is edited, the follow uses stale geometry until rebuilt. Should there be a revision/invalidation link to the `Path`, or is explicit `createMotionPathFromPath` re-bake the right (simpler, more predictable) contract? Lean explicit; add `setMotionPathFollowPath` (Gold) for live swaps rather than implicit tracking.
- **Orientation offset model.** Two ways to express "my art faces up, not right": a raw `angleOffset` (Bronze) and a semantic `alignNodeAxis` (Silver). Keep both, or collapse to one? Recommendation: keep both — `alignNodeAxis` for the common 4-way case, `angleOffset` for arbitrary correction — but document the order they combine.
- **2D vs 3D scope.** Should the type names hard-encode 2D (`MotionPath2D`/`MotionPathSample2D`) to leave room for a future 3D sibling, or stay unqualified (`MotionPath`) and add `MotionPath3D` later? Decide before Bronze ships, since renaming the header is cheap now and not post-release.
- **Flatten tolerance as the parameterization knob.** Arc-length accuracy is bounded by `flattenPath` tolerance / `samplesPerCurve`. Is a single global tolerance enough, or do high-curvature segments need adaptive sampling for smooth banking? Surface as a Silver/Gold tuning decision tied to the analytic-tangent work.
- **`-formats` neighbor necessity.** Is there real demand for importing Flash/AE/SVG motion guides, justifying `@flighthq/motion-path-formats`? Defer until a concrete consumer asks; the core sampler works on any `Path` regardless of origin.

## Agent brief

> Create `@flighthq/motion-path` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
