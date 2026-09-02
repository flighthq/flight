---
package: '@flighthq/motionpath'
status: solid
score: 68
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# motionpath — Review

## Verdict

solid -- 68/100. Every function the charter's decisions name exists and behaves as decided: arc-length drive, the three end behaviors (with a genuinely careful ping-pong closed form), position/tangent/heading sampling, progress and seek. Since the prior review (2026-07-13), source has been consolidated from per-verb files into a single concept file (`motionPath.ts`) and routed through the contract-lane pattern, but the implementation and type surface are unchanged. The score holds at the same level because the same two weaknesses persist: every per-frame sample re-flattens the path (a known deferral the charter itself names), and there is no completion/at-end signal a caller can act on.

## Present capabilities

### Types (`packages/types/src/MotionPath.ts`)

- `MotionPathLoopMode = 'clamp' | 'loop' | 'pingpong'` -- string literal union for end behavior.
- `MotionPath { direction: 1 | -1, distance, length, loopMode, path, speed }` -- `distance` is the arc-length position in `[0, length]`; `speed` is a magnitude with the travel sign in `direction`; the interface comment explains _why_ direction is stored (ping-pong must remember its leg across frames).

All types live in `@flighthq/types`, exported through both `.` and `./contract` lanes. The implementation package exports functions only.

### Source (`motionPath.ts`, single concept file)

- **Create** -- `createMotionPath(path, speed?, loopMode?, tolerance?)`: measures arc length once via `getPathLength(path, tolerance)` and caches it in `length`. The only allocating function (documented). Defaults: `speed = 0`, `loopMode = 'clamp'`, `direction = 1`, `distance = 0`.
- **Advance** -- `updateMotionPath(mp, deltaTime)`: moves the marker `speed * deltaTime` path units along `direction`, then resolves end behavior via the private `applyMotionPathLoopMode`. Three branches:
  - **clamp**: stops at `0` or `length`.
  - **loop**: wraps modulo `length` with negative correction for backward travel.
  - **pingpong**: maps onto a `2 * length` phase line whose triangle-wave fold bounces correctly even when one large move crosses the path several times (closed-form derivation documented in-line).
  `deltaTime <= 0` and zero-length paths are no-ops. All inputs read into locals before any write (alias-safe).
- **Sampling** -- `getMotionPathPosition(mp, pointOut, tangentOut): boolean`: delegates to `@flighthq/path`'s `getPathPositionAtDistance`; returns `false` sentinel for degenerate paths, outputs left unchanged. `getMotionPathHeading(mp): number`: `atan2(tangentY, tangentX)` via `getPathTangentAtDistance` through a module-scoped scratch vector (degenerate fallback heading 0, documented).
- **Progress/seek** -- `getMotionPathProgress(mp)`: `distance / length`, 0 for zero-length. `setMotionPathDistance(mp, distance)`: clamped to `[0, length]`. `setMotionPathProgress(mp, t)`: clamped `t * length`. Both seeks leave `direction`/`speed` untouched (documented).

### Package shape

- Dependencies: `@flighthq/path` + `@flighthq/geometry` + `@flighthq/types` -- exactly per the charter's Boundaries section. No display object, no renderer, no scene graph.
- `"sideEffects": false`; two-lane exports (`.` re-exports from `./contract`; `contract.ts` re-exports from `motionPath.ts`).
- Exported through `@flighthq/sdk` via `animation.ts`.
- 1 source file, 1 colocated test file, 7 describe blocks (one per export), 26 test cases.

### Testing

Test file mirrors source alphabetically. Coverage includes:
- `createMotionPath`: defaults, speed/loopMode carry, arc-length caching.
- `getMotionPathHeading`: rightward line (0 radians), heading change at corner.
- `getMotionPathPosition`: mid-path sampling, empty-path false sentinel with untouched outputs.
- `getMotionPathProgress`: ratio calculation, zero-length sentinel.
- `setMotionPathDistance`: valid seek, over-length clamp, negative clamp.
- `setMotionPathProgress`: normalized seek, over-1 clamp, negative clamp.
- `updateMotionPath`: basic advance, clamp end-stop with continued stepping, loop forward/backward wrap, loop multi-pass, pingpong end-reflect with direction flip, pingpong start-reflect, pingpong multi-pass, `deltaTime <= 0` no-op, zero-length no-op.

Test helpers (`line`, `corner`, `empty`) construct paths via `@flighthq/path`'s imperative API -- no structural literals for entity types.

## Gaps

### Performance

- **Per-frame re-flattening** -- `getPathPositionAtDistance` and `getPathTangentAtDistance` re-flatten the path on every call. A marker sampled for both position and heading pays two flattenings per frame. Charter Open direction 1 names the fix (cached polyline + cumulative-length table at create) and explicitly deferred it.

### Missing features

- **No completion/at-end query or event** -- with `clamp`, a caller cannot cheaply learn the marker has arrived (it must compare `distance` against `length` itself); loop/ping-pong wraps are likewise silent. Mature path-followers expose at least an at-end predicate, commonly completion/loop callbacks or signals.
- **No orient-along-path matrix helper** -- writing position + heading into a `Matrix` for direct application to a display object (charter Open direction 2).
- **No eased / variable speed** -- speed-over-distance or easing-driven traversal (charter Open direction 3).
- **No offset/look-ahead sampling** -- sampling a point ahead of the marker (for steering/chase cameras) requires the caller to fake a second `MotionPath`.

### Style

- **Scratch vector placement** -- `const scratchTangent = createVector2()` sits at line 37, between `getMotionPathHeading` and `getMotionPathPosition`. Convention places loose module variables at the bottom of the file, after exported functions.

### API symmetry

- **`direction` has no mutator** -- reversing traversal means assigning the field directly. Consistent with plain-data fields, but asymmetric with `setMotionPathDistance` / `setMotionPathProgress`. Not necessarily wrong (the set helpers clamp, which raw assignment cannot), but worth noting.

## Charter contradictions

None. All three 2026-07-10 decisions are implemented as written:

- **Arc-length parameterization and state shape**: `MotionPath = { path, length, distance, speed, loopMode, direction }` with distance as arc-length position, speed as magnitude, direction as sign. Confirmed.
- **End behaviors**: `clamp` / `loop` / `pingpong` with the named seek/progress helpers. Confirmed.
- **Types in header layer**: `MotionPath` and `MotionPathLoopMode` in `@flighthq/types`; functions carry the `MotionPath` name prefix. Confirmed.

The no-dash naming ruling (`motionpath`, not `motion-path`) and the dependency boundary (`path` + `geometry` + `types` only) both hold.

## Contract & docs fit

### Contract compliance

Good:

- Full `MotionPath` name in every function name (`createMotionPath`, `updateMotionPath`, `getMotionPathPosition`, `getMotionPathHeading`, `getMotionPathProgress`, `setMotionPathDistance`, `setMotionPathProgress`) -- globally self-identifying.
- Allocation only in `create*`; `update*` and `set*` mutate in place.
- Boolean sentinel for `getMotionPathPosition` on degenerate paths (no throws for expected failure).
- `Readonly<MotionPath>` on all read-only parameters (`getMotionPathHeading`, `getMotionPathPosition`, `getMotionPathProgress`); mutable parameters on mutators (`updateMotionPath`, `setMotionPathDistance`, `setMotionPathProgress`) are correctly bare.
- `out` parameters (`pointOut`, `tangentOut`) with `Vector2Like` type.
- Exports alphabetized; describe blocks alphabetized, mirroring exports.
- No classes, no hidden state, no side effects -- portable to C/C++ idioms.

One nit: parameter is abbreviated `mp` throughout signatures. Parameter names are not covered by the unabbreviated-name rule (which governs function names), but sibling packages mostly spell entity parameters out (`camera`, `spring`, `stack`, `clock`).

### Package Map accuracy

The Package Map groups `motionpath` under "Animation and simulation", which is correct. The package description in `package.json` accurately describes the feature set, including the arc-length rationale and the `@flighthq/path` boundary split.

## Candidate open directions

These are questions the charter does not answer that this review observed:

- **Completion semantics** -- predicate only (`isMotionPathAtEnd`), or events (an opt-in `enableMotionPathSignals` with complete/loop/bounce)? The signals rule (multiple listeners requiring priority ordering or cancellation) suggests the latter eventually; the charter is silent.
- **Cached arc-length table placement** -- inside `MotionPath` (charter's sketch) vs a reusable sampler primitive in `@flighthq/path` that motionpath and others (text-on-path, dash animation) share. The second home would benefit more consumers; cross-package, needs direction.
- **Look-ahead / offset sampling** -- in scope here, or a caller pattern to document?
- **`mp` parameter naming** -- whether to expand to `motionPath` to match sibling packages' practice of spelling entity parameters in full.
