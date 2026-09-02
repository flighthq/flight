---
package: '@flighthq/velocity'
status: solid
score: 86
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - prior review.md (2026-07-13)
  - assessment.md (2026-07-13)
  - source + tests (live tree)
  - type surface (types/src/Velocity.ts)
  - consumers (scene2d-gl/src/glVelocity.ts, scene2d-wgpu/src/wgpuVelocity.ts)
  - functional scenes (effect-motion-blur, particle-motion-blur)
---

# velocity — Review (live tree, 2026-09-02)

Full re-survey of the live package. The prior review (2026-07-13, solid 82/100) identified five in-package Recommended items in the assessment; all five have landed in source. The live tree is 21 exports across three source files (`velocityField.ts`, `transformVelocity.ts`, `velocitySample.ts`), 56 tests in three colocated files, all describes alphabetized and mirroring exports. The new `explainVelocity` diagnostic query and the expanded walker/sample tests are the material additions since the prior review.

## Verdict

`solid -- 86/100`. Every assessment-Recommended item has been completed, bringing in-package hygiene to a strong state. The field/contributor/sample split matches the charter Boundaries, all five 2026-07-02 Decisions are honored, diagnostics now cover the silent-sentinel query side, and the walker and reprojection-vs-override semantics are pinned by test. What keeps the score below 90 is the same structural gap as before -- `getVelocitySampleAt` and `contributeTransformVelocity` remain unconsumed outside the package -- plus the absence of guard-layer diagnostics (`enableVelocityGuards`) and the still-unconsumed `VelocityContributor` type. All of these are cross-package or design-decision items, not in-package oversights.

## Assessment Recommended items -- all landed

1. **`VelocityContributor` doc comment fixed.** `@flighthq/types/src/Velocity.ts:36` now reads `contributeVelocity / suppressVelocity`, matching the actual function names. The stale `contributeNodeVelocity / suppressNodeVelocity` text is gone.
2. **`explainVelocity` added.** `velocityField.ts:89-106` returns a `VelocityExplanation` discriminated by `reason`: `'no-sample'`, `'stale'`, `'explicit-zero'`, `'derived-zero'`, `'ok'`. The `VelocityExplanation` type lives in `@flighthq/types/src/Velocity.ts:40-47`. Five tests in `velocityField.test.ts` cover all five reason variants. Exported through both lanes.
3. **Subtree-walk tests added.** `transformVelocity.test.ts` grew from 4 to 6 tests. Three new cases: "walks children and derives velocity for each node in the subtree" (parent+child both gain velocity from a parent move), "honors an explicit override on a child while the parent derives from transforms" (the explicit-override fence operates per-node within a subtree), and "still updates previousWorldTransform when an explicit override is in effect" (verifies the transform commit path is unconditional even when the velocity write is fenced). The recursion and child-cast paths are now exercised.
4. **Reprojection-vs-override semantics pinned.** `velocitySample.test.ts` added "reprojects transforms independently of contributeVelocity / suppressVelocity": after an explicit suppress, `getVelocitySampleAt` still reports the transform-derived delta. The two-truths seam is now documented by test.
5. **Mislabeled test case resolved.** The prior review's "alias-safe" label overpromise on the `velocitySample.test.ts` case is gone; the current test set names cases by what they verify (translation delta, affine reprojection, rotating transform, etc.).

## Present capabilities

**Field lifecycle** (`velocityField.ts`, 19 exported functions): `createVelocityField` (WeakMap samples + `frameId`), `beginVelocityFrame` (frame counter increment), `ensureVelocitySample` (get-or-create, contract-lane only), `contributeVelocity` (explicit set, stamps `explicitFrameId` so it wins over the baseline regardless of call order), `suppressVelocity` (teleport/cut = explicit zero, delegates to `contributeVelocity` with `(0, 0)`), `getVelocity` (stale-fenced: sentinel zero for missing or not-this-frame samples), `hasVelocity` (current-frame + nonzero check), `explainVelocity` (diagnostic query, discriminated by five `reason` values).

**Transform-delta baseline** (`transformVelocity.ts`, 1 exported function): `contributeTransformVelocity` walks a `Transform2DNode` subtree top-down, derives each node's velocity from the world-transform `tx/ty` delta, honors the explicit-override fence, and always commits the current world matrix into `sample.previousWorldTransform` (allocating via `createMatrix` once, then `copyMatrix`). First frame yields zero. The child-walk cast (`child as unknown as Transform2DNode`) carries a durable comment and is the charter's Open direction 3 (fix lives in `@flighthq/node`).

**Per-pixel affine sample** (`velocitySample.ts`, 1 exported function): `getVelocitySampleAt(sample, currentWorldTransform, pointX, pointY, out)` computes `current*p - previous*p` -- full rotation/scale reprojection at an arbitrary local point, sentinel zero when no previous transform is stored. Tested with identity, translation-only, non-origin point, 90-degree rotation, and paired translated transforms. Operates purely on the stored `previousWorldTransform`, independent of explicit contributions -- this semantic is now pinned by test.

**Value algebra** (`velocityField.ts`): `addVelocity`, `clampVelocity` (max-blur-length safety), `copyVelocity`, `dampVelocity` (EMA), `lerpVelocity`, `normalizeVelocity` (zero-safe), `scaleVelocity` (pixel-ratio conversion), `subtractVelocity`, `zeroVelocity`, plus predicates `isVelocityZero` (epsilon) and `lengthOfVelocity`. All out-param, locals-before-writes, alias-safe. Every algebra function has at least one alias-safe test case.

**Types-first**: `Velocity2D`, `VelocitySample`, `VelocityField`, `VelocityContributor`, and `VelocityExplanation` live in `@flighthq/types/src/Velocity.ts`. The per-instance-velocity ownership rule (instances live on the batch, not the field) is documented in the `VelocityField` doc comment.

**Export lanes**: Public lane (`index.ts`) re-exports 20 names from `contract.ts`. Contract lane (`contract.ts`) exports 21 names (adds `ensureVelocitySample`). Alphabetized in both files.

**Real consumption**: `scene2d-gl/src/glVelocity.ts` and `scene2d-wgpu/src/wgpuVelocity.ts` import `getVelocity` from the contract lane and build per-kind velocity-writer registries over `VelocityField`. `functional/scenes/effect-motion-blur.webgl.ts` and `particle-motion-blur.webgpu.ts` exercise the end-to-end path with `beginVelocityFrame`, `contributeVelocity`, and the velocity targets.

## Gaps

Measured against a mature per-object motion-vector/velocity-tracking layer:

- **Affine sample unadopted.** No file outside `packages/velocity` calls `getVelocitySampleAt`. The gl/wgpu writers read only the coarse per-node `getVelocity`, so a rotating or scaling node gets one origin vector across its whole bounds (or zero if its origin did not move). The function is correct and tested, but its value is unrealized until the writers adopt it. Cross-package.
- **Transform-delta baseline unadopted.** `contributeTransformVelocity` has no consumer outside its own tests; the functional scenes use `contributeVelocity` directly. The "any motion is velocity for free" North star has no in-tree proof beyond the package's own tests.
- **No guard-layer diagnostics.** `explainVelocity` covers the query side of the diagnostics convention (every silent sentinel gets an `explain*`). The guard side -- `enableVelocityGuards` emitting through `@flighthq/log` for classic misuse patterns (contributing without `beginVelocityFrame`, reading stale fields) -- does not exist. In-package scope but adds a dependency on `@flighthq/log`.
- **`explainVelocity` test coverage is one arm short.** All five tests use either `contributeVelocity` (explicit) or manual sample manipulation. The `reason: 'ok'` test path is exercised only with `explicit: true`; there is no test that produces a derived nonzero velocity (via `contributeTransformVelocity`) and then calls `explainVelocity` to verify `explicit: false` on the `'ok'` reason. Minor, but the `explicit` flag's false branch on a nonzero result is unchecked.
- **No time normalization.** Velocity is per-frame in node units with no `dt` / per-second view. A variable-timestep consumer must scale outside the package. Design decision, not an oversight.
- **No angular velocity.** `VelocitySample` has no angular field. Per-pixel rotation is recoverable via `getVelocitySampleAt`, so this may be deliberate bedrock. Design decision.
- **`VelocityContributor` type unconsumed.** Zero imports of `VelocityContributor` anywhere in `packages/`. The doc comment is now accurate, but the type itself has no consumer -- it documents an intended contributor contract that nothing uses. The remove-or-keep question is a one-line ruling.
- **No multi-frame history.** Single previous transform; TAA-style temporal reprojection or trails need N frames. Known, deferred by design (status log), and a real allocation-model decision.
- **Child-walk trait cast.** `child as unknown as Transform2DNode` in `transformVelocity.ts:51`. The fix lives in `@flighthq/node` (charter Open direction 3). Cross-package.

## Charter contradictions

**None.** All five 2026-07-02 Decisions are honored in source: `contributeAffineVelocity` removed (Decision 1), WeakMap keying with no iteration surface (Decision 2), `Readonly<Matrix>` parameter on `getVelocitySampleAt` (Decision 3), Package Map entry present (Decision 4), TS-leads posture (Decision 5). The Boundaries' in-scope function list matches the live export surface. The 2026-07-15 unified 2D+3D decision is not yet exercised (no 3D velocity exists), which is consistent with the charter's framing ("when 3D motion tracking is needed").

## Contract & docs fit

**Package manifest** -- clean. Two export lanes (`.` and `./contract`), `"sideEffects": false`, dependencies exactly `@flighthq/geometry`, `@flighthq/node`, `@flighthq/types` (no over-reaching). `devDependencies` carries `@flighthq/scene2d` (needed for `createDisplayObject` in tests) and `typescript`. No `@flighthq/sdk` import.

**Naming** -- all exported function names include the full unabbreviated type name (`getVelocitySampleAt`, `contributeTransformVelocity`, `explainVelocity`, `dampVelocity`, etc.). Boolean-returning functions use `has*` / `is*`. Accessor uses `get*`. Alphabetized in barrel, source, and test describes.

**Allocation & out-params** -- `createVelocityField` is the only allocator. `createMatrix` allocation in the walker is lazy (once per sample). All value-algebra functions write to `out` with locals-before-writes for alias safety. `ensureVelocitySample` allocates on first access per source object.

**Sentinels not throws** -- `getVelocity` returns zero for missing/stale samples. `getVelocitySampleAt` returns zero when `previousWorldTransform` is null. `explainVelocity` provides the diagnostic query for the multi-cause sentinel on `getVelocity`.

**Type home** -- all types (`Velocity2D`, `VelocitySample`, `VelocityField`, `VelocityContributor`, `VelocityExplanation`) live in `@flighthq/types/src/Velocity.ts`. The implementation package exports functions only.

**Docs side** (unchanged from prior review, user's gate):
1. `agents/render-backend-support.md` and `agents/render-architecture.md` carry zero mentions of the velocity pass, despite `renderGlVelocity`/`renderWgpuVelocity` being a shipped, backend-divergent capability with functional-scene coverage.
2. The Package Map entry is accurate but does not name the velocity-writer registration seam.

## Candidate open directions

- **Guard-layer diagnostics.** `enableVelocityGuards` would emit warnings for common misuse: contributing without calling `beginVelocityFrame`, reading from a field that has never been framed. In-package scope, adds `@flighthq/log` dependency, and could be the next in-package Recommended item.
- **Adoption sequencing for `getVelocitySampleAt`.** The affine sample is correct, tested, and semantically pinned, but consumed nowhere. Should the gl/wgpu writers upgrade to per-pixel velocity (cross-package session), or is coarse per-node velocity the accepted quality bar?
- **Time base.** Per-frame is the status quo. Whether `dt`/per-second normalization belongs in the package or is the consumer's job remains unruled -- charter Open direction 1.
- **Angular velocity.** In or out -- the charter should say so the decision is recorded, not inferred from absence.
- **`VelocityContributor` type.** Remove (zero consumers, unconsumed seam) or keep (documents the intended contributor contract for future use). A one-line ruling.
- **`explainVelocity` derived-nonzero coverage.** Add a test that produces nonzero velocity through `contributeTransformVelocity` and verifies `explainVelocity` reports `reason: 'ok'` with `explicit: false`. Minor, but closes the one unchecked branch.
