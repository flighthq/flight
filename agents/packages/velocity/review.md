---
package: '@flighthq/velocity'
status: solid
score: 82
updated: 2026-07-13
ingested:
  - charter.md
  - status.md
  - prior review.md
  - source + tests (live tree)
  - agents/render-architecture.md + render-backend-support.md
---

# velocity — Review (live tree, 2026-07-13)

Full re-survey of the live package. The prior review (2026-06-25) was a merge gate on the `integration-b2824e3d8` delta and predates the 2026-07-02 direction session; it is superseded here. The live tree is the **lean lineage plus the blessed cleanup**: no `affineVelocity.ts`, no angular velocity, no `dt` — 20 exports across three source files (`velocityField.ts`, `transformVelocity.ts`, `velocitySample.ts`), 48 tests in three colocated files, all describes mirroring exports.

## Verdict

`solid — 82/100`. Small, focused, and architecturally clean: every 2026-07-02 charter Decision has landed in source, the field/contributor/sample split matches the charter's Boundaries exactly, and the package is genuinely consumed end-to-end (gl/wgpu velocity passes → motion-blur effect → functional scenes). What holds it below high-solid is unrealized surface — `getVelocitySampleAt` and `contributeTransformVelocity` have zero consumers outside the package — plus a stale header-layer doc comment, no `explain*` diagnostics for its silent sentinels, and a semantic seam (stored velocity vs. transform reprojection) the package neither documents by test nor rules on.

## Prior Approved items — all landed

1. **`contributeAffineVelocity` removed.** No `affineVelocity.ts` exists; the only sample-side export is `getVelocitySampleAt`, now in its own `velocitySample.ts`, re-exported from the barrel (`src/index.ts:22`). The duplicate walker is gone. Per charter Decision 1.
2. **`getVelocitySampleAt` matrix param tightened.** `currentWorldTransform: Readonly<Matrix>` imported from `@flighthq/types` (`src/velocitySample.ts:1,11`) — the inline structural literal is gone. Per charter Decision 3.
3. **Package Map entry added.** `agents/index.md` Rendering section carries `@flighthq/velocity` ("per-frame per-object 2D motion tracking for velocity-buffer writers"). Per charter Decision 4.

## Present capabilities

**Field lifecycle** (`velocityField.ts`): `createVelocityField` (WeakMap samples + `frameId`), `beginVelocityFrame` (frame counter), `ensureVelocitySample` (get-or-create), `contributeVelocity` (explicit set, stamps `explicitFrameId` so it wins over the baseline regardless of call order), `suppressVelocity` (teleport/cut = explicit zero), `getVelocity` (stale-fenced: sentinel zero for missing or not-this-frame samples), `hasVelocity`.

**Transform-delta baseline** (`transformVelocity.ts`): `contributeTransformVelocity` walks a `Transform2DNode` subtree top-down, derives each node's velocity from the world-transform `tx/ty` delta, honors the explicit-override fence, and always commits the current world matrix into `sample.previousWorldTransform` (allocating via `createMatrix` once, then `copyMatrix`) — so the per-pixel sample path stays available even under explicit overrides. First frame yields zero (tested). The known `child as unknown as Transform2DNode` cast carries a durable comment and is the charter's Open direction 3.

**Per-pixel affine sample** (`velocitySample.ts`): `getVelocitySampleAt(sample, currentWorldTransform, pointX, pointY, out)` computes `current·p − previous·p` — full rotation/scale reprojection at an arbitrary local point, sentinel zero when no previous transform is stored. The 90°-rotation test verifies `(-1, 1)` at `p=(1,0)`.

**Value algebra** (`velocityField.ts`): `addVelocity`, `clampVelocity` (max-blur-length safety), `copyVelocity`, `dampVelocity` (EMA), `lerpVelocity`, `normalizeVelocity` (zero-safe), `scaleVelocity` (pixel-ratio conversion), `subtractVelocity`, `zeroVelocity`, plus predicates `isVelocityZero` (epsilon) and `lengthOfVelocity`. All out-param, locals-before-writes, alias-safe, tested with aliased cases.

**Types-first**: `Velocity2D` / `VelocitySample` / `VelocityField` / `VelocityContributor` live in `@flighthq/types/Velocity.ts` with the per-instance-velocity ownership rule documented there (instances live on the batch, not the field).

**Real consumption**: `displayobject-gl/src/glVelocity.ts` and `displayobject-wgpu/src/wgpuVelocity.ts` build the per-kind velocity-writer registries and rgba16f velocity passes over `VelocityField` + `getVelocity`; `effects-gl`/`effects-wgpu` motion blur reads the resulting buffer; `functional/scenes/effect-motion-blur.*` and `particle-motion-blur.*` exercise the whole path with `beginVelocityFrame`/`contributeVelocity`. (Neither render-backend doc mentions the velocity pass — see Contract & docs fit.)

## Gaps

Measured against a mature per-object motion-vector/velocity-tracking layer for motion blur/TAA:

- **Affine sample unadopted (the headline).** No file outside `packages/velocity` calls `getVelocitySampleAt`; the gl/wgpu writers read only the coarse per-node `getVelocity`, so a rotating or scaling node gets one origin vector across its whole bounds (or zero, if its origin didn't move). The function that justifies `previousWorldTransform` retention is dead weight until the writers adopt it. Cross-package — already parked in the assessment's Backlog.
- **Transform-delta baseline also unadopted.** `contributeTransformVelocity` has no consumer outside its own tests; the functional scenes contribute explicitly. Not wrong — the seam is there — but "any motion is velocity for free" (North star 2) has no in-tree proof.
- **Two velocity truths can disagree, unruled and untested.** `contributeVelocity`/`suppressVelocity` set the *stored* velocity, but `getVelocitySampleAt` reprojects transforms and ignores explicit contributions entirely — an explicitly suppressed node still reports nonzero per-pixel velocity if its transform moved. Consistent with the design (the sample is a transform reprojection), but nothing documents or pins the behavior.
- **No time normalization.** Velocity is per-frame in node units; there is no `dt`/per-second view. The removed builder lineage had one; the charter's Boundaries are silent. A fixed-timestep or variable-rate consumer must scale by hand.
- **No angular velocity.** Removed with the builder lineage; charter silent. Per-pixel rotation is recoverable via `getVelocitySampleAt`, so this may be deliberate bedrock — but it is undecided, not decided.
- **No diagnostics.** `getVelocity`'s silent zero has three distinct causes (no sample / stale sample / explicit zero) and no shakeable `explain*` query; no `enableVelocityGuards` for the classic misuse (contributing without `beginVelocityFrame`, so every frame is frame 0). The diagnostics convention says every silent sentinel gets an `explain*`.
- **Test thinness at the walker.** `transformVelocity.test.ts` (4 tests) never walks a subtree — no parent+child case, so the recursion and the trait-cast path are untested. The `velocitySample.test.ts` case labeled "alias-safe" is a plain correctness check (out cannot alias a `Matrix` input); the label overpromises.
- **No multi-frame history.** Single previous transform; TAA-style temporal reprojection or trails need N frames. Known, deferred by design (status log), and a real allocation-model decision.

## Charter contradictions

**None.** All five 2026-07-02 Decisions are honored in source (removal, WeakMap keying with no iteration surface, `Readonly<Matrix>`, Package Map entry, TS-leads posture). The Boundaries' in-scope function list matches the live 20-export surface one-for-one. This is the good-empty result.

## Contract & docs fit

**Package side — clean.** Single `.` export, `sideEffects: false`, deps exactly `geometry` + `node` + `types`, full unabbreviated names (`getVelocitySampleAt`, `contributeTransformVelocity`), out-params with locals-before-writes, sentinels not throws, types-first, exports alphabetized in the barrel and mirrored by alphabetized describes. One defect: the **`VelocityContributor` doc comment in `@flighthq/types/Velocity.ts:36` is stale** — it names `contributeNodeVelocity / suppressNodeVelocity`, functions that do not exist (actual: `contributeVelocity` / `suppressVelocity`). The builder lineage claimed this fix; it never landed in the live tree. Also note `VelocityContributor` itself has zero consumers anywhere — an unconsumed seam type (fork B's "don't build the dispatcher before the consumer" applies at the type level too).

**Docs side — two candidate revisions** (user's gate, not acted on):

1. `agents/render-backend-support.md` and `agents/render-architecture.md` contain **zero** mentions of the velocity pass, despite `renderGlVelocity`/`renderWgpuVelocity` being a real, shipped, backend-divergent capability (gl+wgpu only; canvas/dom have none) with functional-scene coverage. The backend gap matrix should carry a velocity-buffer row.
2. The Package Map entry is accurate but could name the writer seam (`registerGlVelocityWriter`/`registerWgpuVelocityWriter`) as the consumer path; minor.

## Candidate open directions

- **Adoption sequencing for `getVelocitySampleAt`.** The affine sample is built and blessed but consumed nowhere. Should the gl/wgpu writers' upgrade be scheduled (cross-package session), or is coarse per-node velocity the accepted quality bar for now? Until ruled, the package carries a deliberately dormant export.
- **Time base.** Per-frame is the blessed-by-silence status quo. Rule on whether `dt`/per-second normalization is in scope (the removed lineage's `beginVelocityFrame(field, dt?)` shape) or the consumer's job — feeds charter Open direction 1 (velocity's broader role).
- **Explicit-override vs. reprojection semantics.** Should `getVelocitySampleAt` respect `explicitFrameId` (an explicitly suppressed node samples zero), or is the reprojection deliberately transform-only? One sentence in the charter settles it; a pinning test follows either way.
- **Angular velocity.** In or out — the charter should say, so the next builder lineage doesn't re-add it speculatively.
