---
package: '@flighthq/texture'
status: solid
score: 58
updated: 2026-06-25
ingested:
  - status.md
  - reviews/depth/texture.md
  - source
  - changes.patch
  - charter.md
  - 'base=origin/main(eb73c3d74)'
  - 'evidence=integration-b2824e3d8 delta'
---

# texture — Review (merge gate: integration-b2824e3d8 → origin/main)

> Harsh merge-gate survey. Judges **only the delta** — `incoming/integration-b2824e3d8/head/packages/texture/` vs the approved `origin/main` base `eb73c3d74` (`.../base/packages/texture/`), plus the `packages/texture/` hunks of `incoming/integration-b2824e3d8/changes.patch` (the texture diff lands in `committed.patch`). The base is the blessed floor and is **not** under review. Findings cite `b2824e3d8:<path>` with a quoted snippet. This survey supersedes the prior depth review (`reviews/depth/texture.md`, 62/100) as the new baseline.

## Verdict

**REVISE — blocked. 58/100.** The delta is a large, well-shaped symmetry build (base: 9 exports across three files → head: 27 exports) with clean naming, tree-shaking, `out`-param alias-safety, and colocated tests. But it ships **broken as integrated**: the cube-texture surface consumes `CubeFace*` constants from `@flighthq/types` that the head bundle **never defines**, so `tsc -b` (which typechecks `src/*.test.ts`) fails to compile and `setCubeTextureFace`'s own doc-comment points users at non-existent symbols. This is a single, mechanical, cross-package blocker — not a design flaw — but it gates the merge.

## The blocker — references to undefined `@flighthq/types` symbols

`b2824e3d8:packages/texture/src/cubeTexture.test.ts:2` (an added line, `committed.patch:46380`):

```ts
import { CubeFaceNegativeX, CubeFacePositiveX, CubeFacePositiveY } from '@flighthq/types';
```

and `b2824e3d8:packages/texture/src/cubeTexture.test.ts:163`:

```ts
setCubeTextureFace(cube, CubeFacePositiveX, fakeFace);
expect(cube.faces[CubeFacePositiveX]).toBe(fakeFace);
```

None of `CubeFacePositiveX`, `CubeFaceNegativeX`, `CubeFacePositiveY` (nor the other three faces) exist anywhere in the head bundle. The `@flighthq/types` barrel (`head/packages/types/src/index.ts:47`) does only `export * from './CubeTexture'`, and `CubeTexture.ts` defines just the interface — no face-index constants. A whole-tree grep for `CubeFace` / `PositiveX` / `NegativeX` finds matches **only** inside `packages/texture/` (the import, the usages, and a doc-comment). The patch contains **no** file-add hunk for `packages/types/src/CubeFace.ts` and **no** `export const CubeFacePositiveX` definition; the only `CubeFace.ts` strings in `changes.patch` are inside the worker's own `status.md` / `review.md` _prose_ (`changes.patch:81779`, `:81711`) claiming the file was added.

Consequences, all delta-introduced (the base `cubeTexture.test.ts` had no such import):

- **Does not compile.** `tsc -b` typechecks colocated `*.test.ts`; three imported symbols are undefined. `npm run check` / `npm run exports:check` would fail on this package.
- **Dishonest docs.** `b2824e3d8:packages/texture/src/cubeTexture.ts:82-85` instructs users to "Use the CubeFace\* constants from @flighthq/types (CubeFacePositiveX = 0, …)" — a documented API contract that resolves to nothing. The worker `status.md` claims "All 54 tests pass" and `review.md` claims the consts "are exported from the types barrel (`index.ts:66`, `:439`)" — both false against the integrated tree.

The same class of defect blocks the sibling `@flighthq/resources` delta in this integration (impl referencing `@flighthq/types` fields the bundle never added), so this is an integration-wide ingest slippage, not a one-off. The fix is small (define the six `CubeFace*` constants in `@flighthq/types` — ideally a `CubeFace.ts` per the worker's intent — and barrel-export them), but it lands in a **different package**, so it is a merge directive, not a within-`texture` sweep.

## Axis-by-axis (the delta against the seven standards)

1. **Composition / bedrock — PASS.** Each new function is a bedrock primitive over the `Texture` / `CubeTexture` / `Sampler` value: per-field `equals*`, `get*Width/Height/FaceSize`, in-place `set*` mutators, and the `getTextureUvMatrix` compose. No config-gated branches, no fused subjects. The sampler presets (`createAnisotropicSampler`, `createClampLinearSampler`, `createPixelArtSampler`, `createTilingSampler`, `b2824e3d8:packages/texture/src/sampler.ts:31-65`) are thin named compositions over `createSampler` — assemblies that do not tax the primitive.

2. **Naming clarity — PASS.** Full unabbreviated type words throughout (`getTextureUvMatrix`, `getCubeTextureFaceSize`, `setCubeTextureFace`, `equalsCubeTexture`), correct `get*` / `is*` prefixes (`isCubeTextureComplete`, `isTextureReady`), and `equals*` matching the SDK's existing `equalsSampler` convention. `uvOffset/uvRotation/uvScale` are the KHR_texture_transform vocabulary a reader expects.

3. **Tree-shaking / bundle invariant — PASS.** `package.json` is **byte-identical** to base (no delta): `"sideEffects": false`, single root `.` export, no per-file subpaths. No top-level side effects; presets and equals helpers tree-shake independently. No new dependency was added by the delta.

4. **Registry vs closed union (fork B) — N/A / PASS.** `setCubeTextureFace` takes a numeric `faceIndex` (intended to be a named constant), not a closed `switch (kind)`. No handler family here.

5. **Subject triad + plurality guard — PASS.** No format/backend code mis-homed into `texture`. The worker correctly _deferred_ `@flighthq/texture-formats` (KTX2/Basis) behind the unresolved `ImageResource.compressed` slot rather than splitting prematurely (`status.md`).

6. **Contract hygiene — MOSTLY PASS, one cross-package crack.**
   - `out`-params are alias-safe: `copyTexture` (`texture.ts:24-34`) and `copyCubeTexture` (`cubeTexture.ts:20-37`) read every input into locals before writing — and both have explicit aliased-out tests (`texture.test.ts:67`, `cubeTexture.test.ts:59`). `getTextureUvMatrix` reads all texture fields into locals before writing `out.m` (`texture.ts:81-99`).
   - Sentinels correct: `-1` for unbound size (`getTextureHeight/Width`, `getCubeTextureFaceSize`), `false` for null operands in every `equals*`.
   - `Readonly<>` defaults are respected on inputs.
   - **Crack:** `CubeTexture.faces` is typed `readonly (ImageResource | null)[]`, yet the new mutators cast it away — `b2824e3d8:packages/texture/src/cubeTexture.ts:30` (`const faces = out.faces as (ImageResource | null)[]`) and `:87` (`(cube.faces as (ImageResource | null)[])[faceIndex] = image`). The cast is documented and runtime-correct (the array is always freshly `slice()`d), but a package that owns in-place face mutators writing through a `readonly` field is a types-shape question for the charter, not a clean final shape. Route to Open directions; not a merge blocker.

7. **Tests & honesty — FAIL (compile) / otherwise strong.** Tests are colocated, `describe` blocks alphabetized and mirroring exports across all three files, and cover the per-field `equals*` false-matrix, null/undefined operands, and both distinct-out and aliased-out `copy*` cases. But the suite **cannot compile** (the `CubeFace*` import), and the worker's `status.md` "54 tests pass" / "fields added to @flighthq/types" claims are unverifiable-to-false against the head tree. Honesty fails at the continuity-log level even though the test _intent_ is sound.

## Pre-existing, not delta (do not block)

- **`@flighthq/resources` is an unused dependency** in `package.json` — no `packages/texture/src/` file imports it. But `package.json` is **identical** between base and head (no hunk in `changes.patch`), so this is an `origin/main` carry-over, not a delta regression. The worker's own `assessment.md` wrongly elevates it to a "must-fix" for this change; that critiques the approved base. Note it as an optional post-merge cleanup only.

## Score rationale

Naming, composition, tree-shaking, and `out`-param hygiene are all merge-clean, and the new surface is the right symmetric build (create/clone/copy/equals quartets, size accessors, readiness gates, uv-matrix compose, sampler presets) — easily a 78-80 on shape alone. The hard compile blocker (undefined cross-package symbols, broken `tsc -b`, dishonest docs) caps it at **58 (REVISE-blocked)**: a one-line-of-types fix away from mergeable, but unmergeable until that fix lands.
