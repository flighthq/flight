---
package: '@flighthq/sprite'
updated: 2026-06-25
basedOn: ./review.md
---

# sprite — Assessment

> Recommendation layer for the **merge-gate** review of the `integration-b2824e3d8` delta against the approved floor `origin/main` (`eb73c3d74`). Sorts the delta's findings in [review.md](./review.md) into sweep-safe **Recommended** (within-package, no design decision, safe under "do all recommended") and parked **Backlog**. Design forks and cross-package items route to the charter's Open directions (listed at the end), not into Recommended. **Approved** is empty until the user's verbal gate.

## Recommended

Sweep-safe: within `@flighthq/sprite` (or the package's own header file in `@flighthq/types`), no open design decision, no breaking change. These are the two merge blockers plus their direct hygiene follow-ups — all mechanical wiring, not design.

1. **Land the `*Signals` types in `@flighthq/types` (clears B1 — blocking).** Define `QuadBatchSignals`, `SpriteSignals`, and `TilemapSignals` in their respective header files (`types/src/QuadBatch.ts`, `Sprite.ts`, `Tilemap.ts`) with the exact member shape the source already constructs: `SpriteSignals { onFrameChanged }`; `QuadBatchSignals { onCleared, onInstanceAppended, onInstanceRemoved }`; `TilemapSignals { onCleared, onTileChanged, onTilesChanged }`. The source in `sprite.ts`/`quadBatch.ts`/`tilemap.ts` already imports them and the `create*Signals` constructors already match — this is the missing header half of work that is otherwise done. Types-first per the contract; until it lands the package does not compile.

2. **Declare `@flighthq/signals` in `packages/sprite/package.json` (clears B2 — blocking).** Add `"@flighthq/signals": "*"` to the `dependencies` block. The source now value-imports `createSignal` in three files; the manifest must declare it or `npm run packages:check` fails. One line.

3. **Run `npm run check` (and `tsc -b`) on the package after items 1-2.** The delta was bundled without the header and manifest wiring, so the standard gate was not green at merge-candidate time. Confirm `packages:check`, `typecheck`, and `exports:check` all pass before the gate clears. Mechanical verification of items 1-2, no new code.

4. **Pin the shipped sentinel/out-of-range contract with tests (already partly present; confirm and close gaps).** The delta's readers/mutators already return `-1`/`false`/no-op out of range and the bounds loops `continue` past region-ids ≥ `atlas.regions.length`; the test files cover the new exports. Confirm each sentinel path has an explicit assertion (out-of-range reader → `-1`/`false`, out-of-range mutator → no-op, region-id-past-end → skipped in bounds/hit-test) so the shipped contract is locked. Within-package, no new behavior defined.

## Backlog

Parked: needs a design decision, crosses a package boundary, is profiling-gated, or is larger scope. Each carries its reason.

1. **`transformType` enforcement in the vector2-only mutators.** `appendQuadBatchInstance` / `setQuadBatchInstance` write a stride-2 layout regardless of `transformType`, silently corrupting a `matrix3x2` batch. Whether to hard-guard (no-op/sentinel) or stay documented-precondition-only is a policy call the charter parks (Open direction #3). _Reason: open design decision; the package's main silent-corruption surface._

2. **The `0xffff` compact sentinel.** `compactQuadBatch` / `compactParticleEmitter` filter on a `0xffff` deleted-id sentinel that nothing in the package writes — no-ops for every supported workflow. Either bless a named `markDeleted → compact` seam or remove the compact functions. _Reason: open design decision (charter Open direction #1), borders structural-fork A (who owns the deletion/lifetime convention — `sprite` or `particles`)._

3. **`compactParticleEmitter` test follows the resolution of Backlog 2.** It currently has a colocated test, but the test can only exercise a sentinel the package never produces. _Reason: depends on the Backlog 2 ruling; re-spec the test once the deletion model is decided._

4. **Narrow inline `{ x: number; y: number }` out-params → `Vector2Like`.** `getTilemapColumnRowAtPoint` and `getParticleEmitterParticleVelocity` use a third spelling of the Vector2 shape. _Reason: borders an SDK-wide convention ruling (charter Open direction #6), not a sprite-only call._

5. **ParticleEmitter signals-group symmetry.** Sprite/QuadBatch/Tilemap got opt-in signals; the emitter did not. _Reason: deliberate-asymmetry-vs-gap decision the charter parks (Open direction #2)._

6. **Tilemap capacity symmetry (`reserveTilemap`/`getTilemapCapacity`).** _Reason: quartet-symmetry decision the charter parks (Open direction #5); not introduced or regressed by this delta._

7. **Edge-case hardening posture (NaN transforms, negative/oversized `reserve*`, empty-atlas).** _Reason: undefined behavior needing a Gold-tier ruling (charter Open direction #8); out of scope for a wiring gate._

8. **Rust `flighthq-sprite` conformance of the new buffer math.** _Reason: cross-worktree; the Rust side is not in this bundle (charter Open direction #10)._

## Approved

_None. Approval is the user's verbal gate; nothing is moved here until then._

## Notes for the charter's Open directions

The delta touches, but does not settle, several already-open charter questions. None should be folded into Recommended; they are the user's calls:

- **Open direction #1 (`0xffff` sentinel-deletion model)** — the delta ships the compact functions against a sentinel it never writes. Bless a named seam or remove. (Backlog 2.)
- **Open direction #2 (signals symmetry)** — the delta gives three kinds a signals group and the emitter none. Confirm deliberate. (Backlog 5.)
- **Open direction #3 (`transformType` enforcement)** — the delta's vector2-only mutators can corrupt a matrix3x2 batch silently. Hard-guard or documented-precondition? (Backlog 1.)
- **Open direction #6 (narrow out-param spelling)** — the delta adds two more inline `{ x; y }` out-params. (Backlog 4.)
- **Header-layer discipline (charter North star #4)** — the delta's gate failure (B1) shows the `*Signals` header surface was never written. The charter prose claims the head upholds this; it does not in `b2824e3d8`. Worth a charter note that the types-first half is a precondition of merge, not an optional follow-up.
