---
package: '@flighthq/effects-wgpu'
status: solid
score: 88
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch (builder-67dc46d64)
---

# effects-wgpu — Review

## Verdict

`solid — 88/100`. This is the WebGPU/WGSL backend for the substrate-agnostic full-screen post-process pipeline, and it is a mature, well-architected leaf renderer: a per-state registry, a ping-pong pipeline orchestrator, a per-state compiled-pipeline cache, 44 effect runners spanning six taxonomy bands, and two genuinely industry-grade multi-pass recipes (mip-chain bloom, three-pass SMAA) added this pass. It is in near-perfect structural lockstep with its `effects-gl` sibling. It is held back from "authoritative" by three things: an 8-effect coverage gap behind the agnostic descriptor layer (shared with `effects-gl`), depth/velocity G-buffers still fed `null` (cross-package blocker), and a thin behavioral test floor — most runners have "is a function" smoke tests only.

## Present capabilities

Verified against `incoming/builder-67dc46d64/head/packages/effects-wgpu/`:

**Core infrastructure.**

- `wgpuRenderEffectRegistry.ts` — per-`WgpuRenderState` `Map<kind, runner>` over a `WeakMap`: `registerWgpuRenderEffect`, `getWgpuRenderEffectRunner` (sentinel `null`), `hasWgpuRenderEffectRunner` (added this pass, symmetric with `hasGlRenderEffectRunner`). This is fork B done right: registry dispatch, no monolithic `switch`, last-write-wins so a user can swap a runner, unused recipes tree-shake.
- `wgpuRenderEffectPipeline.ts` — `create/begin/end/destroyWgpuRenderEffectPipeline` plus `setWgpuRenderEffectVelocityTexture`. `end*` ping-pongs two pooled scratch targets across the per-frame `RenderEffect[]`, skips unregistered kinds silently, and presents via a `replace`-blend fullscreen pass. Allocation is explicit and pooled (`acquire*`/`release*` bracketed correctly, including the early-return `scene === null` guard). `destroy*` (not `dispose*`) is the right verb — it frees GPU targets + pool.
- `wgpuEffectProgramCache.ts` — `getWgpuEffectPipeline(state, key, wgsl, blend)`, a per-state `WeakMap<state, Map<key, pipeline>>` keeping compiled pipelines off the render-state runtime type. Mirrors `effects-gl`'s `getGlEffectProgram`.

**Effect library — 44 runners**, each `apply<Name>EffectToWgpu` + `defaultWgpu<Name>EffectRunner`, organized into six registrant bands in `wgpuRenderEffectRegistrants.ts` (`registerAntialiasing/Bloom/Blur/Color/ScreenSpace/StylizeWgpuRenderEffects`, plus `registerStandardWgpuRenderEffects` composing all). The band taxonomy matches `effects-gl` one-for-one after this pass's GL taxonomy reconciliation.

**Two flagship recipes added this pass (both verified in source):**

- `wgpuBloomEffect.ts` — full CoD/Unreal mip-chain: Karis-average bright-pass (firefly suppression), Jimenez-2014 13-tap downsample chain (≤6 levels), 3×3 tent-filter upsample accumulate, additive composite, with a single-level Gaussian fallback below 16×16. Shaders are correct and the pooled mip targets are all released. This is real, not a stub.
- `wgpuSmaaEffect.ts` (~12.7KB) — three-pass SMAA (edge detect → analytical-area blend-weight → neighborhood blend), with the runner path threading the pipeline's persistent pool to avoid per-frame pool churn (`applySmaaEffectWithPoolToWgpu`). The deliberate analytical-area choice (vs the ~89KB precomputed LUT) is documented in the status and reasonable for bundle size.

**Sibling parity.** `effects-wgpu` and `effects-gl` each ship exactly 44 runners over identical kind keys and identical band groupings — the "same agnostic `RenderEffect[]` drives both backends through their registries" claim holds. The HDR-target format selection (`'rgba16f'` → `'rgba16float'`) is actually present in the wgpu pipeline and _absent_ from the gl pipeline, so wgpu slightly leads gl here.

**Status-doc verification.** The status doc's structural claims check out against the diff: the registry/pipeline/cache files, the band registrants, `hasWgpuRenderEffectRunner` + its tests, and the bloom + SMAA rewrites are all present as described. One correction: the doc repeatedly says "45 effects / all 45 runners," but there are **44** runner files (and 44 registrations across the bands). The "45" figure is off by one — likely a stale count.

## Gaps

1. **8-effect coverage gap behind the agnostic descriptor layer.** The agnostic `effects` package now exports 52 effect descriptors; both backends implement 44. Missing from `effects-wgpu` (and equally from `effects-gl`): `AutoExposure`, `BarrelDistortion`, `ColorBlindSimulation`, `ContactShadows`, `CustomShader`, `FilmEmulation`, `PanniniProjection`, `VolumetricLight`. These descriptor + math files were added to the agnostic package _in this same patch_, so the descriptor layer raced ahead of both backends. `CustomShader` is the most architecturally interesting (a user-supplied WGSL/GLSL pass — the seam to settle); the rest are concrete recipes. Not a wgpu-specific regression (gl is equally behind), but it is the clearest distance-to-AAA: a runner with no backend is a descriptor a user can build into a chain that silently no-ops.

2. **Depth/velocity G-buffers fed `null`.** `endWgpuRenderEffectPipeline` hard-codes `sceneDepthTexture: null` and passes the (unset) velocity texture, so SSAO, ScreenSpaceFog, BokehDepthOfField, SSR, MotionBlur, CameraMotionBlur, and TAA all run their color-only fallback — seven recipes that exist but cannot reach their real algorithm. The status doc correctly scopes this as a `render-wgpu` cross-package prerequisite (`getWgpuRenderTargetDepthTexture`, a sampleable depth attachment, a velocity bookkeeping pass). This is the single highest-leverage unblock, but it is a design decision crossing the package boundary — surfaced, not actionable here.

3. **TAA has no history buffer.** Real TAA needs a retained `historyTarget` on the pipeline (a `@flighthq/types` change touching both gl and wgpu pipelines). Until then `applyTaaEffectToWgpu` is a passthrough/jitter approximation. First effect with cross-frame retained state — warrants a design pass.

4. **Thin behavioral test floor.** `exports:check` is satisfied — every export has a colocated test — but most effect tests are `expect(typeof applyXToWgpu).toBe('function')` smoke tests (SMAA, grayscale, and most of the 44 confirm this pattern). The registry and registrants tests are real assertions; the per-effect tests are not. jsdom cannot run WGSL, so true verification belongs to the functional/parity render gates — which for wgpu do not yet exist (no functional scenes, no Rust crate). The result is a 44-recipe library whose pixel behavior is effectively unverified in CI. This is the realistic ceiling on the score.

5. **No Rust mirror, no functional scenes.** `flighthq-effects-wgpu` and `effect-*` functional scenes are Gold scope per the status. The WGSL bodies are plain string constants (extractable as shared constants), but the port is correctly deferred until depth/velocity/TAA settle the pipeline shape.

## Charter contradictions

None — the charter is a stub (What-it-is seeded from the prior depth review; North star, Boundaries, Decisions, Open directions all `TODO`). There is nothing blessed to contradict. Judged against the codebase-map AAA fallback, the package is strongly compliant: registry-over-switch, explicit pooled allocation, `destroy*`/`release*` used correctly, `Readonly<>` on inputs, sentinel-returning lookups, full unabbreviated names, single root export, `sideEffects: false`, no top-level registration.

## Contract & docs fit

**Lives up to the contract (a):**

- Types-first: runners consume `WgpuRenderEffectContext`/`WgpuRenderEffectRunner`/ `WgpuRenderEffectPipeline` from `@flighthq/types`; no cross-package types defined inline.
- Naming: every export carries the full type word (`applyBloomEffectToWgpu`, `getWgpuRenderEffectRunner`), `has*` for the boolean, `register*` for opt-in, `destroy*` for the GPU-resource teardown. Globally unique, greppable.
- Sentinels not throws (`getWgpuRenderEffectRunner` → `null`; `end*` skips unknown kinds); single `.` export; `"sideEffects": false`; import-side-effect-free (registration is opt-in via the band helpers). Exports alphabetized in `index.ts`. Dependencies are tight and correct (`effects`, `filters`, `filters-wgpu`, `geometry`, `render-wgpu`, `types`).

**Candidate revisions to the contract / admin docs (b):**

- **Type homing.** `RenderEffectPipelineOptions` — a _substrate-agnostic_ type — lives in `types/src/GlRenderEffectPipeline.ts` and is imported by the wgpu pipeline type from that gl-named file. A type shared by both backends homed under one backend's filename is a mis-home; it reads as "the gl pipeline owns the options." Candidate: move it to its own `RenderEffectPipelineOptions.ts` (filename = type name, per the types-layout convention). Low-risk, cross-package (touches `@flighthq/types`), so surfaced not acted on.
- **Package Map silence.** The codebase-map Package Map lists `@flighthq/effects` indirectly but does not enumerate the `effects` / `effects-gl` / `effects-wgpu` / `effects-canvas` family the way it enumerates `filters` / `filters-gl`. Given this is now a four-package, 52-descriptor subject, a Package Map line for the effects family (and the descriptor-vs-backend split) is a candidate addition — it would also make the 8-effect backend gap visible at the map level.
- **`render-backend-support.md`** documents blend/stroke/text gaps per backend but says nothing about the post-process _effects_ coverage per backend. Given depth/velocity is null on wgpu (7 recipes in fallback) and 8 descriptors have no backend at all, an "effects support" row mirroring the existing feature-support matrix is a candidate addition.

## Candidate open directions

The charter is silent on every durable question; each below is a candidate Open direction for the direction pass:

- **North star / bar.** Is the bar "1:1 algorithmic parity with effects-gl" (lockstep, same recipes, same kinds — which the code currently honors), or "best WGSL recipe per effect even where it diverges from gl" (compute-shader bloom/SSAO, half-res HDR — which would break lockstep)? The HDR format asymmetry already hints the second is creeping in. This decides whether divergence is a bug or a feature.
- **The 8 missing effects.** Are `AutoExposure`/`ContactShadows`/`VolumetricLight`/etc. in scope for the backends, or agnostic-descriptor-only for now? And is `CustomShader` a user-supplied-WGSL seam this package must expose (a real API-shape decision), distinct from the fixed recipes?
- **Depth/velocity G-buffer.** Blessing the `render-wgpu` depth/velocity attachment work is the keystone unblocking 7 recipes; it needs a cross-package go-ahead and a symmetric gl/wgpu design.
- **TAA cross-frame state.** Whether to add `historyTarget` to the shared pipeline type (and how `destroy*` frees it) — the first retained-state effect, a design fork.
- **Bundle posture.** Is the analytical-SMAA / no-LUT, no-`rgba16float`-by-default stance the blessed default, with HDR/LUT variants as opt-ins? The status proposes `rgba16float` as a future default — that is a bundle-and-quality tradeoff the charter should rule on.
- **Test floor.** Is "is a function" + registry assertions an accepted floor for a GPU package whose real verification lives in the (not-yet-built) functional/parity gates, or should there be a uniform-packing / chain-orchestration unit assertion tier that jsdom _can_ run?
