# Breadth Review: Current-Domain Deepening

_2026-07-13. Raw breadth analysis — what new bedrock primitives are missing within domains Flight already covers, especially one layer below gameplay._

## Pre-Verified (already blessed or chartered)

- Noise already blessed into `math` (2026-07-02 decision, parked builder task).
- Collision charter anticipates a physics composer.
- `session` name reserved.
- `devtools` / `testing` / `compute-wgpu` already queued.
- Rive state-machine runtime already flagged as a separate future cell.

## Candidate Primitives

### Now (largest gaps)

- **`physics2d`** — the single largest gap in the SDK. Rigid-body dynamics, constraints, joints over `collision` + `spatial`. Oracle: Box2D / planck.js. TS-feasible core; constraint solver is rust-intended-optional. Prereq: collision's chartered swept/TOI + contact phases (phases 2-3).

### Soon

- **`pathfinding`** — A*/Dijkstra/JPS/flow fields. Charter must draw the path ≠ pathfinding line (path = vector geometry, pathfinding = graph traversal).
- **`steering`** — Reynolds seek/flee/arrive/flocking. Distinct from `motionpath` (authored curves) and `spring` (smoothing). A force-integration leaf.
- **`behaviortree`** — plain-data behavior trees, open node-kind registry, explicit tick, caller-owned blackboard. The gameplay AI primitive.
- **`statechart`** — hierarchical FSM. Doubly motivated: gameplay state machines + Rive SM runtime substrate. Distinct from `flow` (app screen stack).
- **`localization`** + **`localization-formats`** — string catalogs, ICU MessageFormat plural/select, locale fallback. PO/XLIFF/FTL/ARB codecs. `intl` = value formatting; `localization` = string catalogs. A triad: subject + formats.

### Later

- **`dialogue`** + **`dialogue-formats`** — Yarn/Ink/Twine runtime + codecs. Fork I extended from visual artifacts to content artifacts.
- **`navmesh`** — bake is rust-intended, query is TS. Recast/Detour split precedent.

### Reserve

- **`physics`** (3D) — reserve name only. Rust-intended. After `physics2d` proves the seam.
- **`replay`** — reserve name only. The primitives exist (`snapshot` + `clock` + `input`); do stressed work first + a determinism functional example.
- **WFC** (wave function collapse) — reserve.

### Reject

- **L-systems** — reject as a package. A path recipe (assembly), not bedrock.
- **inventory / economy** — reject. App-domain logic, not SDK bedrock. Record in register.
- **ECS** — **reject → anti-goals.md entry.** Flight's entity/runtime model + SoA batching is the deliberate alternative. The entity/runtime split is documented and intentional; ECS would contradict it. Spell out the entity/runtime + SoA alternative as the explicit path.

## Stressed Packages

- **`math`** — noise tier is the single highest-leverage deepening item.
- **`collision`** — phases 2-3 (swept/TOI, contact points) are prerequisites for `physics2d`.
- **`media` / `audio`** — per-bus inserts, analyser node, spatial audio, AudioContext singleton decision to execute.
- **`snapshot`** — delta (convergence with cloud breadth).
- **`input`** — timestamped event-stream capture hook for replay.
- **`application` + `clock`** — documented + functionally-tested determinism.
- **`debug`** — profiler depth before a `devtools` package.
- **`intl`** — redirect catalog pressure to `localization` (intl = values, localization = catalogs).
- **`flow`** — keep as app screen stack; route FSM pressure to `statechart`.

## Strategic Notes

- Flight stopped one layer below gameplay exactly where upstream oracles are strongest. The next game tier is: **physics2d → pathfinding/steering → statechart/behaviortree**.
- Fork I generalizes from visual artifacts to content artifacts: dialogue and localization catalogs follow the same `-formats` pattern as svg/lottie/rive.
- The rust-intended lane is the pressure valve for every heavy solver (physics constraint, navmesh bake, audio DSP).
- Three "missing features" are actually ONE design call: versioned serialization/migration (scene-save, app saves, replays).
- Two loud asks deserve recorded rejections: **ECS → anti-goals.md** entry; **inventory/economy → register** rejection.
