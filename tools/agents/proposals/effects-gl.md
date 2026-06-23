---
id: effects-gl
title: '@flighthq/effects-gl'
type: depth
target: effects-gl
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/effects-gl.md
  - tools/agents/docs/reviews/depth/effects-gl.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 82/100. A broad, well-structured WebGL 2 post-process backend with 1:1 runner coverage of all 44 `@flighthq/effects` descriptors and a real ping-pong pipeline; it falls short of authoritative only where the 2D color substrate cannot supply G-buffer data (SSAO/SSR/TAA are honest stand-ins) and where convenience/quality polish is missing (no batch registrar, single-scale bloom, no chain-ordering metadata).

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum to remove the glaring rough edges the depth review already names. All low-risk, in-package, no new substrate.

- **`registerDefaultGlRenderEffects(state)`** — opt-in batch registrar wiring every `defaultGl*EffectRunner` into a `GlRenderState`'s registry under its descriptor `*Kind`. This is the canonical "register the standard set" entry the package currently lacks; document that per-runner `registerGlRenderEffect` import remains the tree-shaking path. (Mirror as `registerDefaultWgpuRenderEffects` in the sibling.) Verify with `npm run size` that importing one effect still tree-shakes the registrar away.
- **`registerColorGradeGlRenderEffects(state)` / `registerBlurGlRenderEffects(state)` / `registerStylizeGlRenderEffects(state)`** — category-scoped batch registrars between "one runner" and "all 44", so a color-grade-only app gets one import without pulling stylize/atmosphere shaders. Categories follow the depth review's grouping.
- **Drop the unused `@flighthq/filters` manifest dependency** — only `@flighthq/filters-gl` is value-imported. Run `npm run packages:check` to confirm clean.
- **`getGlRenderEffectKinds(): ReadonlyArray<string>`** — enumerate the kinds the package's defaults cover, so a caller (or a conformance test) can assert full coverage and so `registerDefaultGlRenderEffects` has a single source of truth for the loop.
- **Sentinel on missing runner is silent today** — `endGlRenderEffectPipeline` `continue`s past an unregistered kind. Keep the sentinel behavior (no throw) but add a dev-only `console.warn`-gated-by-nothing-at-runtime path is wrong for tree-shaking; instead expose `hasGlRenderEffectRunner(state, kind): boolean` so callers can validate a chain up front and decide their own policy.

### Silver

Brings the package to "competitive and solid" — production-grade quality on the effects that the 2D substrate _can_ fully support, plus the chain-orchestration metadata a good post-process library exposes. Requires header-layer additions and one upstream metadata decision.

- **Mip-pyramid bloom** — replace single-scale bloom with a downsample chain + additive upsample (Call-of-Duty / Unreal style) for wide, stable, flicker-free glows. New internal `glBloomPyramid` helper (downsample N levels into pooled half-res targets, upsample with tent filter, additive composite). Drive level count from a new optional `BloomEffect.levels` field — **define `levels` in `@flighthq/effects` / the `BloomEffect` type in `@flighthq/types` first**. Keep the existing single-scale path available under a swapped runner key (`registerGlRenderEffect(state, BloomKind, defaultGlBloomEffectRunner)` vs a `glBloomSingleScaleEffectRunner`) so the cheap path is opt-in.
- **Per-effect chain metadata, consumed by the pipeline** — add a `RenderEffectChainHint` descriptor in `@flighthq/types` (`{ wantsHdrLinear?: boolean; tonemapPhase?: 'pre' | 'post' | 'none'; readsDepth?: boolean; readsVelocity?: boolean }`) and a `getRenderEffectChainHint(effect)` lookup in `@flighthq/effects`. Then add **`validateGlRenderEffectChain(state, effects): ReadonlyArray<string>`** (returns a list of ordering problems — e.g. a `post`-tonemap effect before tone-map, an HDR-wanting effect on an `rgba8` pipeline — empty array = valid, the sentinel-not-throw convention) and **`orderGlRenderEffectChain(effects, out)`** that stable-sorts by phase into a caller-supplied `out` array. The pipeline keeps running array order by default; ordering stays explicit and opt-in.
- **Auto tone-map insertion helper** — `withGlRenderEffectToneMap(effects, toneMapEffect, out)`: given an HDR (`rgba16f`) pipeline and a chain, insert a tone-map stage before the first `post`-phase effect (or at the end) into `out`. Pure data transform, no GL.
- **Real TAA** — the velocity seam (`sceneVelocityTexture`) already exists; the missing half is a per-pipeline history target. Add **`GlRenderEffectPipeline.historyTarget`** (in `@flighthq/types`) plus `applyTaaEffectToGl(state, source, dest, historyTarget, velocityTexture, effect)`: reproject the prior frame by velocity, neighborhood-clamp, and blend by `feedback`. Falls back to the current passthrough when `historyTarget`/`velocityTexture` are null (sentinel path). **Cross-package dependency:** needs `render-gl` to retain and resolve a history target across frames — surface as a design item (below). Mirror in wgpu.
- **CMAA2 or MLAA as a second non-temporal AA option** — fills the AA slot without a history buffer for callers who cannot run a velocity pass. New `glCmaaEffect.ts` (or `glMlaaEffect.ts`) + descriptor in `@flighthq/effects`/`@flighthq/types`. This makes the AA family more than FXAA + SMAA + no-op-TAA.
- **HDR/linear correctness audit** — bloom bright-pass, tone-map, and exposure currently assume the working format silently. With the chain-hint metadata in place, make exposure/tone-map shaders branch on `rgba16f` vs `rgba8` input and document the gamma assumption per effect (the codebase's sRGB-passthrough convention from the Rust color decision).
- **Functional + parity coverage** — add a `tests/functional/effect-*-gl` scene per major family (bloom, color-grade, blur, AA) so `test:functional:parity` proves the GL backend agrees with the canvas/wgpu backends, not just that each file unit-compiles. The colocated `.test.ts` files today are presence checks; the rendered output is unverified across backends.

### Gold

Authoritative / AAA: the canonical 2D-context post-process reference, with the screen-space-3D slots either made real where the 2D G-buffer allows or honestly retired, full performance work, exhaustive tests, and 1:1 Rust parity.

- **Real depth-driven SSAO over the existing depth seam** — `sceneDepthTexture` is already threaded. Implement true SSAO: reconstruct view-space position from depth (a 2D depth-writing scene pass produces it), sample a hemisphere kernel of `samples` offsets within `radius`, gate by `bias`, range-check, and bilateral-blur the occlusion. Falls back to the current luminance stand-in when depth is null. Requires depth reconstruction params (near/far/projection) in the context — **define `GlRenderEffectContext.sceneDepthParams` in `@flighthq/types`**. This is the single highest-value substrate upgrade: it turns SSAO from a stand-in into the real effect wherever the scene opts into depth.
- **Real depth-driven DoF and screen-space fog** — same depth seam; upgrade bokeh DoF to circle-of-confusion from depth (variable-radius gather, near/far separation) and screen-space-fog to true depth-based density. Both already take the depth path when present per the review; Gold is making that path production-quality (proper CoC, bokeh shape from `LensDirtEffect`-style aperture, foreground bleed handling).
- **Resolve the SSR/TAA name-vs-substrate honesty issue at the API level** — either (a) implement SSR ray-march against the depth buffer (only viable for the subset of 2.5D scenes that write depth + a normal buffer; would need a normal G-buffer seam, surface as a design decision), or (b) relocate SSR/TAA-passthrough out of the headline effect set into a clearly-labeled `*ScreenSpace3DStandIn` namespace so the names never over-promise in a 2D engine. Pick one deliberately; do not leave a `defaultGlSsrEffectRunner` named "SSR" that copies pixels.
- **Performance pass** — (1) precompute and cache uniform locations per program instead of `getUniformLocation` every frame in every runner (currently each `draw*` does string lookups per draw — measurable at 44-effect chains); add a small per-program uniform-location cache to `glEffectProgramCache`. (2) Half-resolution option for expensive families (bloom, DoF, SSAO) via a `RenderEffectQuality` scale field in the descriptor. (3) Pool-pressure audit: ensure worst-case chains (bloom-pyramid + DoF + AA) don't exceed a bounded pooled-target high-water mark; add `getGlRenderTargetPoolHighWaterMark` reporting in `render-gl` for the budget test.
- **Exhaustive error/edge handling** — context-loss recovery (programs in `glEffectProgramCache` must be re-compilable after `webglcontextrestored`; today the WeakMap cache holds dead programs), zero-size target guards (sentinel no-op, not a GL error), and `rgba16f`-unsupported fallback (extension probe → degrade to `rgba8` with a reported sentinel rather than a black screen).
- **Effect-chain caching / fused passes** — recognize adjacent color-only point effects (brightness-contrast → hue-saturation → color-grade) and fuse them into one fullscreen pass to cut bandwidth, since each is a pure per-pixel op. A `fuseGlRenderEffectChain` optimization layer that the pipeline can opt into.
- **Full documentation** — a per-effect reference (what each runner does, its descriptor fields, its substrate requirements and fallback, HDR expectations) and a pipeline cookbook (MSAA + HDR + tone-map + bloom ordering). Currently the knowledge lives only in source comments.
- **1:1 Rust parity (`flighthq-effects-gl`)** — the crate exists. Gold requires every Bronze/Silver/Gold addition mirrored: `register_default_gl_render_effects`, `apply_bloom_effect_to_gl` pyramid, the chain-hint/validate/order functions, real SSAO over the depth seam, and conformance scenes paired by name (`effect_bloom_gl` ↔ `tests/functional/effect-bloom-gl`) so the parity matrix differ can prove `rust:gl ~ ts:gl`. Track intentional divergences in the conformance map.

## Sequencing & effort

Recommended order, smallest-blast-radius first.

1. **Bronze, all of it (low effort, in-package, no header changes).** Batch registrars + category registrars + `getGlRenderEffectKinds` + `hasGlRenderEffectRunner` + drop the `@flighthq/filters` dep. A day or two. Do this first because the batch registrar is the single most-requested missing convenience and unblocks every downstream test that wants "all effects registered." Run `npm run packages:check` and `npm run size` to confirm tree-shaking is preserved.

2. **Silver metadata + chain orchestration (header-first).** Define `RenderEffectChainHint`, `getRenderEffectChainHint`, and `BloomEffect.levels` in `@flighthq/types`/`@flighthq/effects` **before** touching `effects-gl`. Then `validateGlRenderEffectChain`, `orderGlRenderEffectChain`, `withGlRenderEffectToneMap`, and mip-pyramid bloom. Medium effort; the bloom pyramid is the largest single shader task here. Land the metadata and registrars in the wgpu sibling in lockstep.

3. **Silver AA + functional coverage.** CMAA/MLAA, then the cross-backend functional/parity scenes. The parity scenes are the gate that makes everything before them trustworthy — do not defer them past Silver.

4. **Real TAA (cross-package).** Depends on `render-gl` gaining a retained, cross-frame **history target** (resolve + carry the prior resolved frame) and `GlRenderEffectPipeline.historyTarget` in `@flighthq/types`. Higher effort and touches `render-gl` lifecycle, so it sequences after the in-package Silver work.

5. **Gold depth-driven effects (largest substrate dependency).** SSAO/DoF/fog real paths depend on the scene producing a sampleable depth texture and on `GlRenderEffectContext.sceneDepthParams` (near/far/projection) in the header. This is gated on the broader question of whether the 2D scene path writes depth — confirm that seam exists end-to-end before building the consumers.

6. **Gold performance + edge handling + Rust parity** last, once the feature surface is stable.

### Cross-package / design items to surface to the user

- **Header-layer additions (must precede implementation):** `BloomEffect.levels`, `RenderEffectChainHint` + `getRenderEffectChainHint`, `GlRenderEffectPipeline.historyTarget`, `GlRenderEffectContext.sceneDepthParams`, and a possible normal-buffer seam for real SSR. All belong in `@flighthq/types` (and the descriptor/math half in `@flighthq/effects`) first — `effects-gl` must not define cross-package types inline.
- **`render-gl` lifecycle dependency:** real TAA needs a retained history target and the existing `glEffectProgramCache` needs context-loss-aware recompilation. Both are `render-gl`/state-lifecycle decisions, not pure `effects-gl` work.
- **Design decision — SSR/TAA/SSAO naming honesty:** whether to implement the depth-driven versions (and accept a normal-buffer seam) or relocate the stand-ins into a clearly-labeled namespace so their names do not over-promise in a 2D engine. This is a naming/scope call for the user, not an autonomous change, because it reshapes the public effect set.
- **Sibling lockstep:** `@flighthq/effects-wgpu` has the identical structure and gaps; every addition here should land as a matched pair to keep cross-backend (`canvas`/`gl`/`wgpu`) consistency, verified by `test:functional:parity`.
- **Rust mirror:** `flighthq-effects-gl` already exists and must track the TS additions for the 1:1 conformance goal; pair conformance scenes by name.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/effects-gl` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
