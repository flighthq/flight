---
package: '@flighthq/effects-wgpu'
crate: flighthq-effects-wgpu
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---


# effects-wgpu — Charter

## What it is

`@flighthq/effects-wgpu` is the WebGPU/WGSL **backend** for the substrate-agnostic full-screen post-process effects pipeline. The agnostic `@flighthq/effects` package owns the data layer — the 52 `RenderEffect` descriptors and their math; this package turns those descriptors into actual WGSL draw work. It ships:

- the per-`WgpuRenderState` **effect registry** (`registerWgpuRenderEffect`, `getWgpuRenderEffectRunner`, `hasWgpuRenderEffectRunner`) — registry dispatch, last-write-wins, tree-shakable, no monolithic `switch`;
- the **ping-pong pipeline orchestrator** (`create/begin/end/destroyWgpuRenderEffectPipeline`, `setWgpuRenderEffectVelocityTexture`) that walks a per-frame `RenderEffect[]` across two pooled scratch targets and presents via a fullscreen pass;
- the per-state **compiled-pipeline cache** (`getWgpuEffectPipeline`);
- **44 effect runners** (`apply<Name>EffectToWgpu` + `defaultWgpu<Name>EffectRunner`) across six taxonomy bands (antialiasing, bloom, blur, color, screen-space, stylize), including two industry-grade multi-pass recipes — mip-chain bloom (Karis-average bright-pass, Jimenez-2014 downsample, tent-filter upsample) and three-pass SMAA.

Where it ends: it does **not** own the effect descriptors or their math (that is `effects`), and it is one of a family of interchangeable backends alongside `effects-gl` (its structural twin), `effects-canvas`, and the agnostic core. The "same agnostic `RenderEffect[]` drives every backend through its registry" claim holds: `effects-wgpu` and `effects-gl` ship the same 44 runners over identical kind keys and band groupings.

## North star

_Proposed from the design + structural forks; not blessed. The open questions that would harden or overturn these live in Open directions below._

1. **A backend, not a redefinition.** The agnostic `effects` package owns _what_ an effect is; this package owns _how_ WGSL realizes it. Descriptors, math, and the `RenderEffect[]` contract come from `@flighthq/types` / `effects` — never redefined here.
2. **Registry by default (fork B).** Dispatch is a per-state registry, last-write-wins, with bands as opt-in registrants — never a monolithic `switch`. Unused recipes tree-shake; a user can swap a runner. Import is side-effect-free; registration is explicit.
3. **Explicit, pooled GPU ownership.** Scratch targets and mip chains are pool-acquired and released in matching brackets; `destroy*` (not `dispose*`) frees the GPU targets and pool. Allocation is never hidden.
4. **Real recipes, not stubs.** A registered runner is the genuine algorithm (or a documented, honest fallback), not a no-op. The flagship recipes (mip-chain bloom, analytical-area SMAA) set the bar.
5. **Conformance-ready value seam.** WGSL bodies are plain string constants and the package consumes only data-shaped inputs, keeping it on the path to a Rust mirror and cross-backend parity once the pipeline shape settles.

## Boundaries

**In scope.**

- WGSL runners for the agnostic effect descriptors, one per kind, registered through the bands.
- The wgpu effect registry, ping-pong pipeline orchestration, and compiled-pipeline cache.
- HDR target-format selection where wgpu can lead (e.g. `rgba16float`).
- Multi-pass recipe orchestration internal to a single effect (bloom mip chain, SMAA three passes).

**Non-goals.**

- Defining effect descriptors or their math (owned by `effects` / `@flighthq/types`).
- The GL, Canvas, or any non-wgpu backend (siblings).
- Owning the depth/velocity G-buffer attachments — those are a `render-wgpu` concern this package consumes.
- Per-effect pixel verification in jsdom (WGSL cannot run there; real verification is the functional/parity render gates).

## Decisions

- **2026-07-02 — TS-leads, Rust conforms later.**

## Open directions

Every durable question is open; the charter is silent on all of them. Each is a candidate for the direction pass.

- **North star / the bar — lockstep vs. best-per-backend.** Is the bar _1:1 algorithmic parity with `effects-gl`_ (same recipes, same kinds — what the code honors today), or _the best WGSL recipe per effect even where it diverges from gl_ (compute-shader bloom/SSAO, half-res HDR)? The existing HDR format asymmetry (`rgba16float` present on wgpu, absent on gl) already hints at the second. This ruling decides whether divergence is a bug or a feature. (Relates to fork D: backend seam.)
- **The 8 missing effects.** The agnostic layer exports 52 descriptors; both backends implement 44. Missing here (and equally in `effects-gl`): `AutoExposure`, `BarrelDistortion`, `ColorBlindSimulation`, `ContactShadows`, `CustomShader`, `FilmEmulation`, `PanniniProjection`, `VolumetricLight`. Are these in scope for the backends, or agnostic-descriptor-only for now? A descriptor with no backend silently no-ops in a user's chain.
- **`CustomShader` as a user-supplied-WGSL seam.** Distinct from the fixed recipes: is this package obligated to expose a user-supplied-WGSL/GLSL pass? That is a real API-shape decision (the seam to settle), not just another recipe.
- **Depth/velocity G-buffer (cross-package keystone).** `endWgpuRenderEffectPipeline` hard-codes `sceneDepthTexture: null`, so SSAO, ScreenSpaceFog, BokehDepthOfField, SSR, MotionBlur, CameraMotionBlur, and TAA run color-only fallbacks. Blessing the `render-wgpu` depth/velocity attachment work (`getWgpuRenderTargetDepthTexture`, a sampleable depth attachment, a velocity bookkeeping pass) is the single highest-leverage unblock — 7 recipes. It crosses the package boundary and needs a symmetric gl/wgpu design. (Relates to fork A: source-data vs. graph participation; fork D: backend seam.)
- **TAA cross-frame state.** Real TAA needs a retained `historyTarget` on the shared pipeline type (a `@flighthq/types` change touching both gl and wgpu, plus how `destroy*` frees it). The first retained-state effect — a design fork. Until then `applyTaaEffectToWgpu` is a jitter approximation.
- **Bundle posture.** Is analytical-area SMAA (no ~89KB LUT) and no-`rgba16float`-by-default the blessed default, with HDR/LUT variants as opt-ins? The status proposes `rgba16float` as a future default — a bundle-and-quality tradeoff the charter should rule on. (Relates to the bundle invariant / fork B's tree-shake intent.)
- **Test floor.** Most per-effect tests are `expect(typeof applyXToWgpu).toBe('function')` smoke tests; only the registry/registrants tests carry real assertions. jsdom cannot run WGSL, and the wgpu functional/parity gates do not yet exist (no functional scenes, no Rust crate). Is "is-a-function + registry assertions" an accepted floor, or should there be a uniform-packing / chain-orchestration unit tier that jsdom _can_ run?
- **Rust mirror & functional scenes (Gold scope).** `flighthq-effects-wgpu` and `effect-*` functional scenes are deferred until depth/velocity/TAA settle the pipeline shape. When does the port become blessed work, and does the value seam (WGSL as shared string constants) need to be factored first? (Relates to fork D: Wasm `-rs` mixing — effects as data descriptors are a candidate mixable leaf.)
- **Type homing (cross-package, surfaced).** `RenderEffectPipelineOptions` — a substrate-agnostic type — currently lives in `types/src/GlRenderEffectPipeline.ts` and is imported into the wgpu pipeline type from that gl-named file. Candidate: move it to its own `RenderEffectPipelineOptions.ts` (filename = type name). Low-risk but touches `@flighthq/types`.
- **Admin-doc gaps (surfaced).** The codebase-map Package Map does not enumerate the `effects` / `effects-gl` / `effects-wgpu` / `effects-canvas` family the way it does `filters` / `filters-gl`; and `render-backend-support.md` documents blend/stroke/text gaps but not post-process _effects_ coverage per backend. Candidate additions that would make the 8-effect gap and the depth-null fallbacks visible at the map level.
