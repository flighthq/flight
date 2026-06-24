---
package: '@flighthq/scene-gl'
updated: 2026-06-24
basedOn: ./review.md
---

# scene-gl — Assessment

> Recommendation layer over [review.md](./review.md), absorbing the prior `reviews/maturation/depth/scene-gl.md` roadmap. `Recommended` is strictly sweep-safe (within `@flighthq/scene-gl`, no cross-package coupling, no breaking change, no open design decision). `Backlog` is everything else, each with its parking reason. `Approved` is empty — approval is the user's verbal gate.
>
> The charter is still a stub (North star / Boundaries / Decisions / Open directions all `TODO`), so the review's six candidate open directions and every cross-package roadmap item are routed to the charter's **Open directions**, not into `Recommended`. They are listed under "Routed to the charter" below for the next direction session; this skill does not edit the charter.

## Recommended

Sweep-safe, within-package, no design decision required. Safe for a blanket "do all recommended."

- **Capture the `mesh-blend-transparency` baseline.** The functional test (`tests/functional/mesh-blend-transparency/`, WebGL-only) exists and renders, but its screenshot + fingerprint baseline was never committed — the one open action item the status doc and review both flag (review.md#status-doc-verification). Run the capture→baseline loop and commit the baseline so the two-pass transparency sort has a regression gate. Local to the test; no source change. — review.md#status-doc-verification

- **Wire `hasGlMeshGeometryUv1` into the standard-PBR `bind()` so the define key and bound attributes cannot disagree (gap 8).** The helper now exists but is unwired; `hasUv1` is decided at material time while `uv1` presence is geometry-time, so the cache key and the actually-bound attributes can diverge (safe today only because an unbound attribute reads zero). Thread the geometry's `hasGlMeshGeometryUv1` result into `buildGlPbrStandardDefineKey`'s `hasUv1` param at the point geometry is available, removing the latent define/attribute mismatch. Within scene-gl (`glMeshUpload.ts` + `standardPbrGlMeshMaterialRenderer.bind()`); no type or render-layer change, no API break. — review.md#gaps (8)

## Backlog

Parked: each needs cross-package coordination, a larger GPU subsystem, or an Open-direction decision the charter has not yet made.

- **Multi-light forward path (highest leverage).** _Parked: cross-package design fork._ Replacing the one-directional+one-ambient cap with an N-light loop (point/spot/hemisphere + attenuation) rewrites the authoritative `SceneLights`/`SceneLightBlock` std140 seam in `@flighthq/types`, the pack step in `@flighthq/render`, and lands in `scene-wgpu` and the Rust port in lockstep. The std140 layout and `MAX_FORWARD_LIGHTS` must be settled once with all four in the room — not landable in scene-gl unilaterally. Surfaced as Open direction #1. — review.md#gaps (1)

- **`destroy*` teardown for GPU programs / VAOs / buffers (gap 2).** _Parked: open ownership decision._ The package allocates non-GC GPU resources but exposes no `destroy*`, violating the codebase-map teardown rule. Where it lives (per-family in scene-gl, a single `destroyGlScene*` over `GlSceneRuntime`, or delegated to `render-gl`'s state destroy) is an unmade charter decision, so this is not sweep-safe. Surfaced as Open direction #2. — review.md#gaps (2)

- **Pool semantics — make the draw-entry "pool" recycle, or drop it (gap 3).** _Parked: design decision._ `acquireOpaqueEntry`/`acquireBlendedEntry` have no matching `release`, so after frame 1 every frame allocates fresh entries — the name implies a contract the code does not honor. Adding a `release*` bracket vs. replacing the pool with plain per-frame arrays is a genuine either/or the charter should rule, not a mechanical sweep. Surfaced as Open direction #3. — review.md#gaps (3)

- **Image-based lighting (IBL) — irradiance, prefiltered specular, BRDF LUT, skybox (gap 4).** _Parked: large GPU subsystem + cross-package._ Needs new `EnvironmentResources` types and `samplerCube` upload in `render-gl` (GPU plumbing belongs to the core, not scene-gl); the bake functions then cache on the runtime. Most visible PBR shortfall but multi-package and a fork-G sequencing call. — review.md#gaps (4)

- **Shadow mapping — depth pre-pass, CSM/spot/point, PCF (gap 5).** _Parked: largest single item, cross-package design fork._ New `ShadowMap`/`ShadowSettings` types, a `@flighthq/render` depth pre-pass, render-gl depth-target pooling, and a scene-wgpu mirror. Shadow descriptor + atlas strategy must be agreed with wgpu and Rust up front. Depends on the multi-light block. — review.md#gaps (5)

- **GPU skinning / morph targets / instancing (gap 6).** _Parked: cross-package, new vertex semantics._ `joints0`/`weights0` locations are reserved but there is no `SKINNED`/`INSTANCED` define, joint-palette UBO, or per-instance path. Semantics must be coordinated with `@flighthq/mesh` (layouts) and `@flighthq/scene` (`SkinnedMesh`). Larger than a sweep. — review.md#gaps (6)

- **Transmission's real refractive path (gap 7).** _Parked: depends on a scene-color capture target._ Completing the `Phase 5` TODO needs an opaque-scene-color capture pass for screen-space refraction — new render-target plumbing (render-gl), not a local edit. Sequenced after the transparency pass and the capture target exist. — review.md#gaps (7)

- **UBO for the light / per-object block (gap 9).** _Parked: architectural refactor._ Lights upload as individual `uniform*` calls today; moving the camera/light/material blocks to std140 UBOs is a performance refactor entangled with the multi-light block layout (item 1) and the normal-matrix packing question. Schedule as a deliberate pass, not an opportunistic edit. — review.md#gaps (9)

- **Extension-map flags in the define-key cache.** _Parked: open direction._ Extension lobe maps (clearcoat/sheen/etc.) are bound-when-present but not part of the define key; whether the uniform-fallback is the intended end state or per-extension map flags should enter the key is an unmade decision. Surfaced as Open direction #5. — review.md#candidate-open-directions (5)

- **Contract/admin doc revisions.** _Parked: edits outside this package's source, user's gate._ The reviewer flagged that the codebase-map Package Map has no `scene-<backend>` entry and still describes `scene` as "a doorway" despite fork-G promoting 3D to first-class, and that `render-backend-support.md` does not yet record scene-gl's single-directional+ambient lighting cap or the GL-only transparency sort (wgpu unsorted). These are doc edits in `tools/agents/docs/`, not scene-gl work. — review.md#contract--docs-fit

## Routed to the charter (Open directions — for the next direction session; not edited here)

The charter is a stub; these are the review's candidate open directions plus the structural forks they map to. Note them when the charter is authored — do not action them in a sweep.

1. **Lighting-model bound** — is one-directional+one-ambient a temporary state or a deliberate tier-1 boundary? (structural fork B/D + the cross-package seam; review.md#candidate-open-directions 1)
2. **GPU teardown ownership** — scene-gl per family vs. one `destroyGlScene*` vs. delegated to `render-gl`. (review.md#candidate-open-directions 2)
3. **Pool semantics** — recycle with a `release*` bracket, or drop the pool for per-frame arrays. (review.md#candidate-open-directions 3)
4. **scene-wgpu parity as a stated boundary** — is "scene-gl leads, scene-wgpu follows" blessed, or do new features land in both backends together? (the standing roadmap cross-package constraint; review.md#candidate-open-directions 4)
5. **Extension-map flags in the cache key** — uniform-fallback as the end state, or per-extension map flags in the key. (review.md#candidate-open-directions 5)
6. **IBL / shadow / skinning scope and sequencing** — fork G accepts full 3D as in-scope; which of these is scene-gl's responsibility and in what order. (structural fork G; review.md#candidate-open-directions 6)

## Approved

_None yet — approval is the user's verbal gate._
