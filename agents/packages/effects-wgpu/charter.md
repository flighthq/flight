---
package: '@flighthq/effects-wgpu'
crate: flighthq-effects-wgpu
draft: false
lastDirection: 2026-07-31
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---


# effects-wgpu — Charter

## What it is

`@flighthq/effects-wgpu` is the WebGPU/WGSL **backend** for the substrate-agnostic full-screen post-process effects pipeline. The agnostic `@flighthq/effects` package owns the data layer — the 53 `RenderEffect` descriptors and their math; this package turns those descriptors into actual WGSL draw work. It ships:

- the per-`WgpuRenderState` **effect registry** (`registerWgpuRenderEffect`, `getWgpuRenderEffectRunner`, `hasWgpuRenderEffectRunner`) — registry dispatch, last-write-wins, tree-shakable, no monolithic `switch`;
- the **ping-pong pipeline orchestrator** (`create/begin/end/destroyWgpuRenderEffectPipeline`, `setWgpuRenderEffectVelocityTexture`) that walks a per-frame `RenderEffect[]` across two pooled scratch targets and presents via a fullscreen pass;
- the explicit **RenderTexture-to-RenderTexture bridge** (`applyWgpuRenderEffectsToRenderTexture`) used by per-node capture lanes, with caller-owned source/destination/scratch leases and deterministic final-destination parity;
- the per-state **compiled-pipeline cache** (`getWgpuEffectPipeline`);
- **44 effect runners** (`apply<Name>EffectToWgpu` + `defaultWgpu<Name>EffectRunner`), each paired with a matching per-kind registrar, including the advanced `BlendEffect` composite and multi-pass recipes such as mip-chain bloom.

Where it ends: it does **not** own the effect descriptors or their math (that is `effects`), and it is one of a family of interchangeable backends alongside `effects-gl`, `effects-canvas`, and the agnostic core. The same agnostic `RenderEffect[]` drives every backend through its registry, but each backend exposes only its genuinely realized subset. WGPU realizes 44 built-ins; GL realizes 46 and additionally has a CustomShader seam that is not applicable to the fixed WGPU catalog.

## North star

_Proposed from the design + structural forks; not blessed. The open questions that would harden or overturn these live in Open directions below._

1. **A backend, not a redefinition.** The agnostic `effects` package owns _what_ an effect is; this package owns _how_ WGSL realizes it. Descriptors, math, and the `RenderEffect[]` contract come from `@flighthq/types` / `effects` — never redefined here.
2. **Registry by default (fork B).** Dispatch is a per-state registry, last-write-wins, with bands as opt-in registrants — never a monolithic `switch`. Unused recipes tree-shake; a user can swap a runner. Import is side-effect-free; registration is explicit.
3. **Explicit, pooled GPU ownership.** Scratch targets and mip chains are pool-acquired and released in matching brackets; `destroy*` (not `dispose*`) frees the GPU targets and pool. Allocation is never hidden.
4. **Real recipes, not stubs.** A registered runner is a parameter-responsive realization of the named effect, not an identity copy or a different algorithm under the requested name. TAA, SSR, and the depthless whole-frame BokehDepthOfField blur are absent.
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
- **2026-07-31 — Per-node effects remain an explicit capture/apply/compose lane over caller-owned leases.**
- **2026-07-31 — WGPU has 44 realized built-ins.** TAA and SSR identity implementations and the depthless whole-frame BokehDepthOfField misimplementation were deleted in full; every remaining runner has one matching per-kind registrar.
- **2026-07-31 — Export lanes are curated.** The reachability baseline reports dot/contract moves without making current placement a hard invariant.

## Open directions

Every durable question is open; the charter is silent on all of them. Each is a candidate for the direction pass.

- **North star / the bar — lockstep vs. best-per-backend.** Is the bar _1:1 algorithmic parity with `effects-gl`_ (same recipes, same kinds — what the code honors today), or _the best WGSL recipe per effect even where it diverges from gl_ (compute-shader bloom/SSAO, half-res HDR)? The existing HDR format asymmetry (`rgba16float` present on wgpu, absent on gl) already hints at the second. This ruling decides whether divergence is a bug or a feature. (Relates to fork D: backend seam.)
- **Descriptor/backend set drift.** The agnostic descriptor set is broader than the 44 realized WGPU kinds. Use the source-derived inventory when scoping gaps rather than preserving a hand-written missing list; several earlier lists became stale as Composite and ContactShadows landed and three false capabilities were removed.
- **`CustomShader` as a user-supplied-WGSL seam.** Distinct from the fixed recipes: is this package obligated to expose a user-supplied-WGSL/GLSL pass? That is a real API-shape decision (the seam to settle), not just another recipe.
- **Depth/velocity G-buffer (cross-package quality seam).** A sampleable depth/normal attachment and velocity bookkeeping would improve the realized depth/velocity-sensitive effects. This is a quality upgrade across `render-wgpu` and the effect recipes, not permission to restore deleted BokehDepthOfField/SSR/TAA stubs.
- **Bundle posture.** Is analytical-area SMAA (no ~89KB LUT) and no-`rgba16float`-by-default the blessed default, with HDR/LUT variants as opt-ins? The status proposes `rgba16float` as a future default — a bundle-and-quality tradeoff the charter should rule on. (Relates to the bundle invariant / fork B's tree-shake intent.)
- **Test floor.** Many per-effect tests remain function-shape smoke tests; registration and RenderTexture-chain tests carry orchestration assertions, while functional scenes carry pixel evidence. Should every recipe gain a uniform-packing / chain-orchestration unit tier that jsdom can run?
- **Rust mirror & functional scenes (Gold scope).** `flighthq-effects-wgpu` and `effect-*` functional scenes are deferred until depth/velocity/TAA settle the pipeline shape. When does the port become blessed work, and does the value seam (WGSL as shared string constants) need to be factored first? (Relates to fork D: Wasm `-rs` mixing — effects as data descriptors are a candidate mixable leaf.)
- **Type homing (cross-package, surfaced).** `RenderEffectPipelineOptions` — a substrate-agnostic type — currently lives in `types/src/GlRenderEffectPipeline.ts` and is imported into the wgpu pipeline type from that gl-named file. Candidate: move it to its own `RenderEffectPipelineOptions.ts` (filename = type name). Low-risk but touches `@flighthq/types`.
- **Admin-doc maintenance.** Generate backend-capability prose from the same runner inventory used by reachability where practical; hand-maintained counts and aggregate names have repeatedly drifted.
