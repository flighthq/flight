---
package: '@flighthq/motionpath'
status: solid
score: 68
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# motionpath — Review

## Verdict

solid — 68/100. Every function the charter's decisions name exists and behaves as decided — arc-length drive, the three end behaviors (with a genuinely careful ping-pong closed form), position/tangent/heading sampling, progress and seek. The main weaknesses are performance (every per-frame sample re-flattens the path — a limitation the charter itself flags) and the absence of any completion/at-end signal a caller can act on.

## Present capabilities

- **Types** (`packages/types/src/MotionPath.ts`): `MotionPathLoopMode = 'clamp' | 'loop' | 'pingpong'` and `MotionPath { direction: 1 | -1, distance, length, loopMode, path, speed }`; `speed` documented as a magnitude with the travel sign in `direction`, and *why* direction is stored (ping-pong must remember its leg across frames) is documented at the type.
- **Create** — `createMotionPath(path, speed?, loopMode?, tolerance?)` (`createMotionPath.ts`): measures arc length once via `getPathLength(path, tolerance)` and caches it in `length`; the only allocating function (documented).
- **Advance** — `updateMotionPath(mp, deltaTime)` (`updateMotionPath.ts`): `speed·deltaTime` along `direction`, then `applyMotionPathLoopMode` resolves ends — clamp stops; loop wraps modulo with negative correction; ping-pong maps onto a `2·length` phase line whose triangle fold bounces correctly even when one large move crosses the path several times (documented derivation). `deltaTime <= 0` and zero-length paths are no-ops; alias-safe reads-then-writes.
- **Sampling** — `getMotionPathPosition(mp, pointOut, tangentOut): boolean` delegating to path's `getPathPositionAtDistance` (false sentinel for degenerate paths, outputs untouched); `getMotionPathHeading(mp)` via `getPathTangentAtDistance` + `atan2` through a module scratch vector (degenerate fallback heading 0 — documented).
- **Progress/seek** — `getMotionPathProgress` (0 for zero-length), `setMotionPathDistance` (clamped to `[0, length]`), `setMotionPathProgress` (clamped `t·length`); both seeks leave `direction`/`speed` untouched (documented).
- **Hygiene** — deps `path` + `geometry` + `types` exactly per Boundaries; `sideEffects: false`; 26 tests across 7 files.

## Gaps

- **Per-frame re-flattening** — `getPathPositionAtDistance`/`getPathTangentAtDistance` re-flatten the path on every call (confirmed: `getPathLength` calls `flattenPath` per invocation; the distance samplers are the same family). A marker sampled for position *and* heading pays two flattenings per frame. Charter Open direction 1 names the fix (cached polyline + cumulative-length table at create) and explicitly deferred it.
- **No completion/at-end query or event** — with `clamp`, a caller cannot cheaply learn the marker arrived (it must compare `distance` against `length` itself); loop/ping-pong wraps are likewise silent. Mature path-followers expose at least an at-end predicate, commonly completion/loop callbacks or signals.
- **No orient-along-path matrix helper** — writing position + heading into a `Matrix` for direct application to a display object (charter Open direction 2).
- **No eased / variable speed** — speed-over-distance or easing-driven traversal (charter Open direction 3).
- **No offset sampling** — sampling a point *ahead of* the marker (look-ahead for steering/chase cameras) requires the caller to fake a second `MotionPath`.
- **`direction` has no mutator** — reversing traversal means assigning the field directly; consistent with plain-data fields, but the asymmetry with `setMotionPathDistance`/`setMotionPathProgress` is worth noting.

## Charter contradictions

None. All three 2026-07-10 decisions are implemented as written (arc-length parameterization and state shape, the three end behaviors with the named seek/progress helpers, types in the header layer). The no-dash naming ruling and the dependency boundary both hold.

## Contract & docs fit

- **Contract**: good — full `MotionPath` names, `out` params with boolean sentinel, no throws, allocation confined to `create*`. One nit: the parameter is abbreviated `mp` throughout signatures; parameter names are not covered by the unabbreviated-name rule (which governs function names), but sibling packages mostly spell entity parameters out (`camera`, `spring`, `stack`, `clock`).
- **Docs**: the Package Map line matches the built surface, including the arc-length rationale and the pathToward `@flighthq/path` split.

## Candidate open directions

- **Completion semantics** — predicate only (`isMotionPathAtEnd`), or events (an opt-in `enableMotionPathSignals` with complete/loop/bounce)? The signals rule (multiple listeners → signals) suggests the latter eventually; the charter is silent.
- **Cached arc-length table placement** — inside `MotionPath` (charter's sketch) vs a reusable sampler primitive in `@flighthq/path` that motionpath and others (text-on-path, dash animation) share. The second home would benefit more consumers; cross-package, needs direction.
- **Look-ahead/offset sampling** — in scope here, or a caller pattern to document?
