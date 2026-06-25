---
package: '@flighthq/velocity'
status: solid
score: 70
updated: 2026-06-25
ingested:
  - status.md
  - source
  - changes.patch
  - charter.md
  - 'base=origin/main(eb73c3d74)'
  - 'evidence=integration-b2824e3d8 delta'
---

# velocity — Review (merge gate: integration b2824e3d8 → approved origin/main eb73c3d74)

This is a **merge-gate** review of the incoming delta only. Baseline = `incoming/integration-b2824e3d8/base/packages/velocity/` (`origin/main`, `eb73c3d74`) — the approved floor, not under review. Candidate = `incoming/integration-b2824e3d8/head/packages/velocity/`. The delta is exactly two NEW files; findings cite `b2824e3d8:<path>`.

> Lineage note. The prior `review.md`/`assessment.md`/`status.md` in this folder were written against a **different** worker lineage (`builder-67dc46d64`) whose `velocity` had grown to ~21 `velocityField` exports (full `Velocity2D` value algebra, angular velocity, `dt`/per-second normalization) **and** a barrel that re-exported `affineVelocity`. The integration branch under gate here is the **leaner** lineage: `velocityField.ts` has only 8 exports (no value algebra, no angular, no `dt`), and `Velocity.ts` in `@flighthq/types` has **no** `angularVelocity`/`dt`. Conclusions from the old docs that presume the richer surface or the re-exporting barrel do **not** transfer. This review supersedes them for the b2824e3d8 gate.

## The delta

`changes.patch` touches exactly two files under `packages/velocity/`:

- `b2824e3d8:src/affineVelocity.ts` — NEW. Exports `contributeAffineVelocity` and `getVelocitySampleAt`.
- `b2824e3d8:src/affineVelocity.test.ts` — NEW. 9 tests across the two functions.

`src/index.ts` (the package barrel) is **byte-identical to base** — it still re-exports only the 8 `velocityField` functions plus `contributeTransformVelocity`, and mentions nothing from `affineVelocity`. `@flighthq/types/Velocity.ts`, `package.json`, `transformVelocity.ts`, and `velocityField.ts` are unchanged by the delta.

## Verdict

`REVISE — 70/100` as a merge gate. The math the delta adds is correct and tested — `getVelocitySampleAt` computes a genuine per-pixel affine reprojection `current·p − previous·p` and the rotation test verifies `(-1, 1)` for a 90° turn at `p=(1,0)`. But the change ships **unfinished**: both new functions are **dead exports** (unreachable from the package root), the contributor's name over-promises the value it actually stores, and the new file leaks an inline structural matrix type and a near-duplicate subtree walker. None of these critique the approved base; all are introduced by the two new files. The package's contract hygiene elsewhere (single `.` export, `sideEffects: false`, sentinels, alias-safe out-params, types-first) remains the clean baseline — the score is the distance the _delta_ sits from a final-shape, mergeable change, not a grade on the package as a whole.

## Standard-by-standard (delta only)

**1. Composition / bedrock — PASS (with a smell).** The two additions are flat free functions over the existing `VelocityField`/`VelocitySample` value types — no config-gated mega-function, no fused subject. `getVelocitySampleAt` is a clean bedrock primitive (point-in → reprojected-velocity-out). The smell is duplication, not bundling: `visitAffineVelocity` (`b2824e3d8:src/affineVelocity.ts:63-99`) is the same walk-and-retain body as base `visitTransformVelocity`, with an affine branch that collapses to the same origin delta (see standard 2). That is dead duplication tied to the naming defect, not a decomposition failure of the primitive.

**2. Naming clarity — FAIL.** `contributeAffineVelocity` does **not** contribute affine velocity. Its inner `visitAffineVelocity` derives the stored per-node velocity from `cx = world.tx … px = sample.previousWorldTransform.tx` (`b2824e3d8:src/affineVelocity.ts:77-80`) — i.e. `current·p − previous·p` evaluated at the **origin** `p=(0,0)`, where the linear part `a,b,c,d` drops out. For an origin-anchored node this is **numerically identical** to base `contributeTransformVelocity`. The file comment concedes it: "For purely translating nodes the result is equivalent to contributeTransformVelocity" (`b2824e3d8:src/affineVelocity.ts:15`), but the honesty does not rescue the name — an agent reading the export would expect `getVelocity` after `contributeAffineVelocity` to differ from `contributeTransformVelocity` for a _rotating_ node; it does not. The genuine affine result lives only in `getVelocitySampleAt`, which the contributor never folds into `sample.velocity`. `getVelocitySampleAt` itself is well named (`get*`, full type words, alias-safe).

**3. Tree-shaking / bundle invariant — FAIL (the hard blocker).** Both new exports are unreachable from the package root: `src/index.ts` is unchanged and re-exports nothing from `./affineVelocity`. The package is `sideEffects: false` and single-`.`-export, so an importer of `@flighthq/velocity` cannot reach `contributeAffineVelocity` or `getVelocitySampleAt` at all, and the SDK barrel / any consumer package is blind to them. The colocated test imports `from './affineVelocity'` directly (`b2824e3d8:src/affineVelocity.test.ts:5`), so the suite is green while the **public surface is dead** — implemented-but-unexported code, the exact dishonesty standard 7 forbids. This is a merge blocker: a delta that adds API the package cannot expose is not the final shape.

**4. Registry vs closed union (fork B) — N/A.** No `kind`/handler family in the delta; no closed switch introduced.

**5. Subject triad + plurality guard — PASS.** No format codec or backend code; nothing mis-homed; no premature split. `affineVelocity.ts` correctly sits inside `velocity`, not a spurious neighbor.

**6. Contract hygiene — PARTIAL.** Good: `getVelocitySampleAt` is an `out`-param function returning a sentinel zero when `sample.previousWorldTransform === null` (`b2824e3d8:src/affineVelocity.ts:40-44`), reads inputs into locals before writing `out`, and never throws; `VelocitySample`/`Velocity2D` are types-first in `@flighthq/types` (unchanged by the delta). Defect: the `currentWorldTransform` parameter is typed as an inline structural literal `Readonly<{ a: number; b: number; c: number; d: number; tx: number; ty: number }>` (`b2824e3d8:src/affineVelocity.ts:35`) rather than `Readonly<Matrix>` (or `Readonly<MatrixLike>`) from `@flighthq/types`. `getNodeWorldTransformMatrix` already returns a real `Matrix`, so the ad-hoc shape is a structural-type leak the types-layout convention discourages. The `crate: flighthq-velocity` mirror is named in the charter front matter; the two new TS functions are not yet mirrored (Rust-worktree scope, not a TS-merge blocker).

**7. Tests & honesty — PARTIAL.** The new `affineVelocity.test.ts` is colocated, has two `describe` blocks (`contributeAffineVelocity`, `getVelocitySampleAt`) that mirror and alphabetize against the exports, and the math assertions are correct (origin delta, non-origin reprojection, 90° rotation, explicit-override fencing). But the suite passes **because** it imports the source file directly while the barrel omits the exports — so the tests certify behavior that no public consumer can invoke. Claims vs code otherwise check out: the functions exist and do what the comments say, modulo the `contributeAffineVelocity` name (standard 2).

## What must change before merge

1. **Re-export the new functions from the barrel** (or drop them). `src/index.ts` must add `export { contributeAffineVelocity, getVelocitySampleAt } from './affineVelocity';` — otherwise the delta adds dead, unreachable code. Hard blocker.
2. **Resolve the `contributeAffineVelocity` name/semantics mismatch** — a naming decision, routed to the charter's Open directions (do not sweep). Either make the contributor store per-pixel/anchor velocity, or rename/redescribe it to promise only "retains the world transform so `getVelocitySampleAt` is available." The duplicate `visitAffineVelocity` walker resolves with whichever way this lands.
3. **Tighten `getVelocitySampleAt`'s matrix parameter** to `Readonly<Matrix>` (sweep-safe), unless structural input is deliberately sanctioned (then `Readonly<MatrixLike>` + a durable comment).

## Charter contradictions

The charter is a stub — North star, Boundaries, Decisions, Open directions are all `TODO`. No blessed rule exists for the delta to contradict, so **no charter contradiction** in the strict sense. The one tension to surface: the charter does not yet say whether a _contributor_ is obliged to store per-pixel-correct (affine) velocity or only anchor velocity — which is exactly the ambiguity `contributeAffineVelocity`'s name exposes. The charter should rule on it; the code should not guess.

## Notes for the charter's Open directions

- **Affine contributor semantics (headline).** Is anchor/origin velocity the right per-node scalar with per-pixel reprojection strictly a `getVelocitySampleAt` consumer concern, or must `contributeAffineVelocity` store per-pixel/anchor velocity (honoring a pivot)? This single ruling decides the rename-vs-rework-vs-merge question and dissolves the duplicate walker.
- **`getVelocitySampleAt` matrix parameter.** `Readonly<Matrix>` (entity-backed, the default) vs. `Readonly<MatrixLike>` (structural input as a sanctioned convenience).
- **Rust parity.** Mirror `contributeAffineVelocity` / `getVelocitySampleAt` in `flighthq-velocity` (scoped to the `rust` worktree, not this TS merge).
