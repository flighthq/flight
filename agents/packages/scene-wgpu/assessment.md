---
package: '@flighthq/scene-wgpu'
updated: 2026-07-21
basedOn: ./review.md
---

# Assessment: @flighthq/scene-wgpu

This package is a per-backend **leaf renderer** in a deliberate twin set (`scene-gl` ↔ `scene-wgpu`) over a shared header (`@flighthq/types`) and shared packing (`@flighthq/render`). The review and the absorbed roadmap both establish the governing fact: **every renderer-envelope feature here is a four-surface change** — `@flighthq/types` first, then `@flighthq/render`, then this backend _and_ its `scene-gl` twin in lockstep, then the Rust `flighthq-scene-wgpu` mirror. That makes nearly the entire roadmap cross-package by construction, so it lands in Backlog rather than Recommended. The headline feature — multi-light forward — is additionally gated on an unresolved design decision (Open direction #1), so it cannot be swept.

The result is a near-empty Recommended set. That is the honest read: the package is already deep where it owns its own surface (the material/shader catalogue is authoritative), and the remaining work is exactly the coordinated, charter-gated kind the gate is designed to hold back. The charter is still a stub, so the substantive questions are routed to its Open directions below.

## Directed

1. **Defer PBR-extension parity until the GL contracts and raster evidence settle.** Do not independently evolve the old WGPU per-extension material lane. After `StandardPbrMaterial`/`ExtendedPbrMaterial`/open `PbrExtension`, attachment inputs, diagnostics, and transmission passes are proven in GL, migrate this backend deliberately against those contracts.

## Recommended

Sweep-safe: within `@flighthq/scene-wgpu` only, no cross-package coupling, no breaking change, no open design decision.

- **Mark the dormant `HAS_UV1` key field as inert in-source.** `hasUv1` is threaded through the define key and emits a `HAS_UV1` const, but `vs_main` carries no second UV and `VERTEX_BUFFER_LAYOUTS` is unchanged — a declared-but-inert field (review › Gaps). _Wiring_ uv1 is a cross-package vertex-layout change (Backlog / Open direction #5), but adding a colocated comment at the key field and the const emission noting it is reserved-and-inert keeps the next reader from assuming it works. Pure in-file documentation of an already-shipped state; touches no other surface. (review.md#gaps)

> Recommended is intentionally minimal. The forward-light wiring, transparency parity scenes, shadows, IBL, instancing/skinning/morph, real transmission, MSAA/tonemap ownership, and the barrel-surface narrowing are all either cross-package, breaking, or gated on a charter decision — they are in Backlog with a reason each, and their underlying questions are surfaced to the charter's Open directions. A blanket "do all recommended" must remain safe, so none of them appear here.

## Backlog

Parked: cross-package coordination, larger scope, breaking change, or waiting on an Open direction.

**Gated on a design decision (charter Open directions):**

- **Wire forward-light counts into the define key (the headline dark feature).** The multi-light WGSL, the GPU `LightBlock` buffer, and the per-frame upload are all built and tested, but every renderer hardcodes `pointLightCount: 0` / `spotLightCount: 0` / `hemisphereEnabled: false`, so the WGSL loops fold to nothing and no point/spot/hemisphere light renders. Flowing the live `SceneLightBlock` counts into the key turns on a **fork in pipeline strategy** — specialize-per-count-bucket vs. always-compile-8-and-runtime-guard — that the status doc and review explicitly defer to the user. **Parked on Open direction #1.** (review.md#gaps, review.md#candidate-open-directions)

- **Narrow the root barrel / decide prelude-internal visibility.** The barrel re-exports every prelude key-builder, module-source getter, and pipeline compiler — a wide public surface for a leaf renderer. Whether prelude internals are public API or implementation detail is a **surface-shape decision** the review flags for the charter, and it must stay symmetric with `scene-gl` (`npm run api`). Not a contract violation; not sweep-safe. **Parked on Open direction #6.** (review.md#contract--docs-fit)

- **Decide whether shipping dormant shader paths is intended discipline.** The forward loops and `HAS_UV1` ship reachable-only-after-a-deferred-decision. Whether built-yet-dark shader paths are an "infrastructure-first" posture or a smell to close is a charter-level bar. **Parked on Open direction #2.** (review.md#charter-contradictions)

**Cross-package (four-surface) — Bronze envelope:**

- **Transparency parity coverage** (`scene-transparent-sort`, and the multi-light scene once #1 lands): functional scenes captured and blessed across raster backends + the Rust mirror. The transparent pipeline + back-to-front sort already work in-package; the parity scenes span `tests/functional/` and both twins. (review.md#present-capabilities, roadmap Bronze)

**Cross-package (four-surface) — Silver envelope:**

- **Shadow mapping** — depth-only pass, shadow prelude (`SHADOW` define, PCF), directional → spot → point, then cascades. Needs `ShadowMap`/`LightShadowSettings` in `@flighthq/types`, a shadow-atlas runtime slot, and a decision on whether the depth-only pass is hoisted into `@flighthq/render` for `scene-gl` reuse. The single largest item. (review.md#gaps, roadmap Silver)
- **Image-based lighting (IBL)** — `EnvironmentLight` descriptor in `@flighthq/types`; cubemap + prefiltered-env + BRDF LUT binds; `wgpuIblPrelude` behind an `IBL` define replacing flat ambient; prefiltering utilities (home TBD: here vs. a shared `scene` math). Highest visual-quality-per-effort for the existing PBR + extension lobes. (review.md#gaps, roadmap Silver)
- **GPU instancing → skinning → morph targets** — each gated on `@flighthq/mesh` + `@flighthq/types` first gaining `InstancedMesh` / `Skin` joint-palette / morph-attribute concepts. scene-wgpu can only consume what the mesh layer defines; **raise as `@flighthq/mesh` additions before scoping here.** (review.md#gaps, roadmap Silver, Open direction #5)
- **Real transmission** — depends on the transparent pass (done) plus an opaque-scene-color capture (`rgba16float` mip pyramid) that does not exist; replaces the current coverage/tint stand-in. (review.md#gaps, roadmap Silver)
- **MSAA + tonemap ownership** — a layering decision between this package and the effect pipeline over who produces a finished frame; surface as a design question before building. (review.md#gaps, roadmap Silver)

**Cross-package (four-surface) — Gold / frontier:**

- Clustered / tiled forward+ (compute light-culling; supersedes the Bronze fixed-count loop), area lights (LTC), advanced shadow tiers (PCSS/VSM/ESM, cube/spot parity), reflection probes + SSR, order-independent transparency, full primitive + LOD coverage, GPU-driven indirect rendering, and exhaustive per-feature parity scenes with 1:1 Rust conformance. Each is a substantial independent effort, picked by target-application need. (review.md#gaps, roadmap Gold)

**Admin / cross-cutting doc (not a code change to this package):**

- **`render-backend-support.md` is stale.** It still reads "wgpu blend modes = none" and "punctual lights unwired"; in reality wgpu now has a blend pipeline variant + back-to-front sort, and punctual-light infrastructure is plumbed-but-not-yet-count-specialized (no light renders until #1 lands). The doc update is cross-cutting admin work, not within this package's source — noted for whoever syncs the support matrix, not Recommended. (review.md#contract--docs-fit)

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Routed to the charter's Open directions

Surfaced here for the charter author (not edited into the charter by this pass); they mirror the review's candidate open directions:

1. **Forward-light-count strategy** — specialize-per-count-bucket vs. always-8-loop-with-runtime-guard. Gates whether multi-light rendering works at all; the infrastructure is otherwise complete.
2. **Built-yet-dark shader paths** — is shipping dormant WGSL (forward loops, `HAS_UV1`) intended infrastructure-first discipline, or a smell to close before the next pass?
3. **Renderer-envelope scope & order** — which of shadows / IBL / skinning / instancing are this package's slice vs. a neighbor's, and in what order (fork G accepts full 3D SDK-wide; this slice needs naming).
4. **scene-gl ↔ scene-wgpu twin obligation** — record that shadow-map and IBL types are designed once in `@flighthq/types` and mirrored, so no agent advances one backend's lighting without the other.
5. **uv1 / skinning vertex-layout change** — may scene-wgpu drive the 48-byte-stride extension, or must it wait on a `@flighthq/mesh` decision?
6. **Public surface size** — prelude internals public API vs. implementation detail (barrel breadth).
