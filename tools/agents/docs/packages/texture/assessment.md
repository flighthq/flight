---
package: '@flighthq/texture'
updated: 2026-06-25
basedOn: ./review.md
---

# texture — Assessment (merge gate: integration-b2824e3d8)

> Recommendation layer over `review.md`. Reasoned over the **delta** (head vs the approved `origin/main` base `eb73c3d74`). Sorts the merge-gate findings into sweep-safe `Recommended` (within `@flighthq/texture` only) and parked `Backlog`. `Approved` is the user's verbal gate — left empty. Design / cross-package forks route to the charter's Open directions, not into Recommended. See ../CONTRACT.md.
>
> Governing context: the merge is **blocked** by one defect — the cube-texture surface references `CubeFace*` constants that the head bundle never added to `@flighthq/types`, so the delta does not typecheck. The fix crosses into `@flighthq/types`, so it is **not** a within-`texture` sweep; it is a merge directive carried in `outgoing/integration/texture.md` and tracked in Backlog here.

## Recommended (sweep-safe, within-package, non-design)

Deliberately narrow. The blocker's fix lives in `@flighthq/types` (cross-package), so it is not listed here — only items that are correct and self-contained within `@flighthq/texture` under any resolution of the type gap:

- **Correct the `status.md` honesty claims when the blocker is resolved.** The pass-1 continuity log asserts "All 54 tests pass" and that `CubeFace.ts` / `TextureKind.ts` "were added to `@flighthq/types`" — both false against the integrated tree. Once the types land (or instead of, if the constants move), rewrite the claim to match reality. Administrative; touches only `tools/agents/docs/packages/texture/status.md`.
- **(After types land) confirm `setCubeTextureFace`'s doc-comment matches the real constants.** The comment at `cubeTexture.ts:82-85` hard-codes the index values `CubeFacePositiveX = 0 … CubeFaceNegativeZ = 5`; if the landed constants differ in value or name, reconcile the comment. Within `texture` only.

## Backlog (parked, with blocking reason)

- **Define the six `CubeFace*` constants in `@flighthq/types` (BLOCKER).** Add `CubeFacePositiveX = 0`, `CubeFaceNegativeX = 1`, `CubeFacePositiveY = 2`, `CubeFaceNegativeY = 3`, `CubeFacePositiveZ = 4`, `CubeFaceNegativeZ = 5` (the worker's intended `CubeFace.ts`) and barrel-export them. _Why parked here:_ the edit is in a different package (`@flighthq/types`), so it is a cross-package merge directive (see `outgoing/integration/texture.md`), not a `texture` sweep. Until it lands the whole delta is uncompilable.
- **Land the `TextureKind` / `SamplerKind` / `CubeTextureKind` string-kind constants.** The worker `status.md` claims these were added to `@flighthq/types`; they are not in the head tree and are not consumed by any code yet. _Why parked:_ cross-package (`@flighthq/types`), and not on the compile path of this delta (no source imports them) — so it is a follow-up to round out the kind-identity model, not a merge gate. Only land if the charter wants texture entities renderer-registerable now.
- **Rust conformance mirror.** `flighthq-texture` must gain `equals_texture`, `get_texture_uv_matrix`, `get_texture_height/width`, `set_texture_uv_offset/rotation/scale`, `copy_cube_texture`, `equals_cube_texture`, `get_cube_texture_face_size`, `is_cube_texture_complete`, `set_cube_texture_face`, the `CUBE_FACE_*` consts, and the preset samplers, plus a conformance-map entry. _Why parked:_ owned by the Rust worktree, cross-package, gated on the TS types landing first.
- **`@flighthq/resources` unused-dependency cleanup (pre-existing).** `package.json` declares `@flighthq/resources` but no `src/` file imports it. _Why parked:_ `package.json` is byte-identical in base and head — this is an `origin/main` carry-over, **not** part of this delta. It is not a merge gate for this change; it is an optional standalone cleanup the user may schedule separately.

## Approved

_None. Approval is the user's verbal gate; this stage never fills it._

## Notes for the charter's Open directions

- **`CubeTexture.faces` readonly vs in-place mutation.** The delta adds `setCubeTextureFace` and `copyCubeTexture`, both of which write through `faces` after an `as (ImageResource | null)[]` cast (`cubeTexture.ts:30`, `:87`) because the type is `readonly`. The package now owns mutators that defeat the `readonly` contract. The charter should rule the durable shape: keep `readonly` + documented internal casts, or make `faces` a mutable `(ImageResource | null)[]` since the package's own API mutates it.
- **Where do `CubeFace*` index constants live, and are they an enum or bare consts?** The worker put them in a standalone `CubeFace.ts`. Confirm that home and the string-vs-number identity (the SDK kind model is string-based; these are numeric _array indices_, a different axis). A blessed ruling here also fixes the blocker.
- **Texture descriptor completeness (deferred, cross-package).** `format`/`mipPolicy`, per-binding `version`/`invalidate*` dirty tracking, `Texture2DArray`/`Texture3D`/`TextureUsage`, and `@flighthq/texture-formats` (KTX2/Basis) are all gated on the `render-gl`/`render-wgpu` upload contract and the `ImageResource.compressed` slot. Surface to the user as joint design decisions; none belong in this merge.
