---
package: '@flighthq/sprite'
updated: 2026-07-02
basedOn: ./review.md
---

# sprite — Assessment

Sorted from `review.md` (partial, 62/100 — against a broken integration head), the depth review (solid, 70/100), and the direction session (2026-07-02). Five Decisions blessed. The builder landed substantially more than the status.md records — the live tree has 83 exports across 4 files with full per-instance/tile/particle surfaces, clone for all kinds, signals for 3 of 4, exact hit test, transform-type switching, and tilemap navigation.

## Recommended

Strictly sweep-safe: within `@flighthq/sprite`, no open design decision.

- **Add `@flighthq/signals` to `packages/sprite/package.json` dependencies.** Three source files import `createSignal` from `@flighthq/signals`, but the manifest does not declare the dependency. Compiles via hoisting; `npm run packages:check` fails. One-line manifest fix. _(Was merge blocker B2.)_
- **Replace inline `{ x: number; y: number }` out-params with `Vector2Like`.** Per Decision #4: `getTilemapColumnRowAtPoint` and `getParticleEmitterParticleVelocity` use an inline structural type instead of `Vector2Like`. Add `import type { Vector2Like } from '@flighthq/types'` and swap the parameter annotations.
- **Add a named constant for the deletion sentinel.** Per Decision #1: the `0xffff` compact sentinel is a blessed user-facing API. Add a named export (`DELETED_INSTANCE_ID = 0xffff` or similar) so users don't write a magic number. Reference it in `compactQuadBatch` and `compactParticleEmitter`.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Tile flags API surface.** _Parked — cross-package._ Per Decision #5: widen `TilemapData.tiles` to `Int32Array` in `@flighthq/types`, then add `TilemapTileFlags` constants, `packTilemapTileId`, `getTilemapTileFlags`, `getTilemapTileBaseId` helpers in sprite. Needs coordinated `types` + `sprite` + renderer changes.
- **Tilemap capacity symmetry.** _Parked — unsettled._ Charter Open direction #1.
- **Bounds caching / dirty slot.** _Parked — borders render pipeline._ Charter Open direction #2.
- **Edge-case hardening.** _Parked — Gold-tier, undefined behavior._ Charter Open direction #3.
- **Pooling brackets / tilemap-formats.** _Parked — profiling-gated / plurality-gated._ Charter Open direction #4.
- **Rust `flighthq-sprite` conformance.** _Parked — cross-worktree._ Charter Open direction #5.

## Approved

- [2026-07-02 · picked] Add `@flighthq/signals` to sprite package.json — merge blocker B2
- [2026-07-02 · picked] Replace inline `{ x; y }` out-params with `Vector2Like` — charter Decision #4
- [2026-07-02 · picked] Add named constant for `0xffff` deletion sentinel — charter Decision #1
