---
package: '@flighthq/effects-gl'
status: solid
score: 84
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch
---

# effects-gl — Review

> Survey layer. Evidence is the incoming bundle `builder-67dc46d64` (`head/packages/effects-gl/`
>
> - `changes.patch`), referenced as `67dc46d64:<path>`. No prior `reviews/depth/effects-gl.md` existed to supersede; the charter is a stub (only "What it is" seeded). Where the charter is silent, judged against the codebase-map AAA standard and the SDK-wide structural forks.

## Verdict

`solid` — 84/100. A broad, well-shaped WebGL-2 post-process backend: 44 effect runners across a clean six-band taxonomy, a proper registry (not a switch), an MSAA-aware ping-pong pipeline, a program cache, and now a per-program uniform-location cache and a production-grade mip-pyramid bloom. The package is structurally exemplary and conforms to the contract. It falls short of `authoritative` on two axes: a handful of screen-space effects (SSR, TAA, SSAO, partial SMAA) are honest stand-ins pending a G-buffer/history-target seam, and — newly introduced in this bundle — the bloom recipe **reimplements** mip-count and soft-knee math inline that `@flighthq/effects` now ships as shared helpers, so GL and the other backends will not derive identical bloom parameters.

## Present capabilities

Grounded in `67dc46d64:packages/effects-gl/src/`.

**Effect coverage — 44 runners, one file each.** Every runner is `apply<Name>EffectToGl(...)` plus a `defaultGl<Name>EffectRunner: GlRenderEffectRunner`, with the fragment source as a module-bottom `const`. The set spans antialiasing (Fxaa, Smaa, Taa), bloom/optical (Bloom, ChromaticAberration, GodRays, LensDirt, LensDistortion, LensFlare, Vignette), blur (BokehDepthOfField, CameraMotionBlur, DirectionalBlur, MotionBlur, RadialBlur, TiltShift), color/tone (BrightnessContrast, ChannelMixer, ColorGrade, Exposure, Grayscale, HueSaturation, Invert, LiftGammaGain, LookupTableGrade, Posterize, Sepia, ToneMap, WhiteBalance), screen-space/atmospheric (Displacement, ScreenSpaceFog, Sharpen, Ssao, Ssr), and stylize (Crt, Dither, FilmGrain, Glitch, Halftone, Kuwahara, Outline, Pixelate, Scanlines, Sketch). This is well past a basic filter feature target and reaches into modern engine territory.

**Registry, not switch** (`glRenderEffectRegistry.ts`). Per-`GlRenderState` `WeakMap → Map<kind, runner>` with `getGlRenderEffectRunner`, `hasGlRenderEffectRunner`, `registerGlRenderEffect`. Last-write-wins, opt-in import, unused recipes tree-shake. This is the fork-B "open registry by default" pattern done right; the comment explicitly calls it the material-renderer pattern one tier up.

**Batch registrars + enumeration** (`glRenderEffectRegistrar.ts`). A six-band taxonomy (`registerAntialiasing/Bloom/Blur/Color/ScreenSpace/Stylize…`) symmetric with `effects-wgpu`, plus `registerDefaultGlRenderEffects`/`registerStandardGlRenderEffects` covering all 44, and back-compat aliases (`registerColorGradeGlRenderEffects`, `registerStandardGlRenderEffects`). `getGlRenderEffectKinds()` returns a single-source-of-truth alphabetized 44-entry list; a test asserts every kind in it resolves to a registered runner under `registerDefault`. The `ALL_GL_EFFECT_KINDS` count (44) and the `registerGlRenderEffect` call count (44) match.

**Pipeline** (`glRenderEffectPipeline.ts`). `begin/end/create/destroyGlRenderEffectPipeline` drive an MSAA-aware HDR-capable scene target with a ping-pong pooled-target loop; depth and velocity are read from the original scene target (not the ping-ponged source), and a `setGlRenderEffectVelocityTexture` seam already exists for velocity-driven effects. `destroy*` correctly frees GPU resources (target + pool) — the right verb per the teardown rule. Final present is a GL→GL blit.

**Program cache + uniform-location cache** (`glEffectProgramCache.ts`). `getGlEffectProgram` compiles each `(state, key)` fragment once. New this bundle: `getGlEffectUniformLocation` caches per-program uniform locations in a `WeakMap<GlFullscreenProgram, Map<name, location>>`, keyed by the program object so it survives state-key rotation and frees with the program. The cache was applied uniformly across all effect sources (verified on `glGrayscaleEffect` diff: `gl.getUniformLocation(p.program,…)` → `getGlEffectUniformLocation(state, p,…)`). This removes O(N·uniforms) driver round-trips per frame — a genuine Silver/Gold performance win, correctly reasoned.

**Mip-pyramid bloom** (`glBloomEffect.ts`). The single-scale Gaussian was replaced with a full bright-pass → N-level downsample → per-level Gaussian → tent-upsample → additive-composite chain (CoD/Unreal style), with soft-knee bright-pass, auto-derived mip count, per-mip weights, and O(1) pool churn via accumulation-target swap. The pool bracket is balanced: every `acquireGlRenderTarget` has a matching `releaseGlRenderTarget`. This is real, production-shaped work, not a stand-in.

**Tests.** 48 colocated `*.test.ts` (one per source), 128 tests per the status doc. The registrar test asserts the kind/runner closure and the taxonomy moves (Bloom out of blur, Dither into stylize, Vignette into bloom). Tests are presence/closure checks (jsdom can't exercise WebGL2 draws), which is the honest ceiling for unit tests here.

**Manifest.** `sideEffects: false`, single root `.` export, no `registerRenderer` at module top level, deps trimmed to `effects`/`filters-gl`/`geometry`/`render-gl`/`types` (the unused `@flighthq/filters` was removed). Crate mirror `flighthq-effects-gl` is declared in the contract front matter.

## Gaps

- **Stand-in screen-space effects.** `Ssr` (passthrough copy), `Taa` (passthrough copy), and `Ssao` (luminance-variation stand-in, not depth-driven) preserve the pipeline stage but do not implement the named algorithm. `Smaa` is a single-pass edge-aware blur, not the multi-pass edge/blend-weight recipe. Each is honestly commented, but the _names over-promise_ against what runs. The blocker is real and cross-package: these need a sampleable depth/normal G-buffer and a retained per-pipeline history target from `render-gl`. (`sceneDepthTexture`/`sceneVelocityTexture` seams already exist; the history target does not.)
- **No backend-parity proof.** There are no `tests/functional/effect-*-gl` scenes proving the GL output agrees with canvas/wgpu (`test:functional:parity`). The colocated tests verify wiring, not rendered pixels. This is the highest-value missing coverage for a render backend and is exactly the kind of thing jsdom cannot reach.
- **Bloom math duplicated, not consumed** (see Contract & docs fit — this is also a gap in completeness: the package does not yet use the shared primitive it should).
- **Chain-ordering / validation metadata absent.** No `validateGlRenderEffectChain` / `orderGlRenderEffectChain` / tone-map-last helper; the pipeline silently skips unregistered kinds. `hasGlRenderEffectRunner` lets a caller build their own policy, but there is no canonical ordering hint. Blocked on a `RenderEffectChainHint` type in `@flighthq/types`/`@flighthq/effects`.
- **Adjustment color domain is implicit.** The pipeline applies its fused adjustment runs before the
  final linear-to-sRGB pass regardless of whether the adjustment describes scene-linear correction or
  a display-referred look. Contrast/HSL/LUT operations therefore cannot express a predictable legacy
  gamma-space grade without a custom final shader; this belongs in chain scheduling/output-transform
  metadata, not in material shaders.
- **No context-loss recovery / observable HDR-degrade policy / effect-chain fusion.** Render-gl now
  falls back from unsupported rgba16f to rgba8, but the pipeline does not diagnose that an HDR-required
  chain is operating on already-clipped input. The remaining maturity items are deferred and
  cross-package-dependent.

## Charter contradictions

None against stated direction — the charter's only authored content is the "What it is" line ("the GPU runner layer that turns the data-descriptor effects in `@flighthq/effects` into multi-pass fullscreen shader recipes, plus the post-process pipeline that drives them"). The package matches that description precisely. North star, Boundaries, Decisions, and Open directions are all `TODO`, so there is no blessed principle to contradict. (The duplication finding below would likely contradict a North star _once authored_ — see candidate open directions.)

## Contract & docs fit

**Lives up to the contract — strongly.**

- Types-first: all effect descriptor types (`BloomEffect`, `SsrEffect`, etc.) and the `GlRenderEffectRunner`/`GlRenderEffectPipeline` contracts live in `@flighthq/types`; the bloom fields `mipCount`/`mipWeights`/`thresholdKnee` were added there (`67dc46d64:packages/types/src/BloomEffect.ts`), not inline. Correct.
- Full unabbreviated names, `get*`/`has*`/`register*`/`apply*` verbs, sentinels-not-throws (`getGlRenderEffectRunner` returns `null`; the pipeline `continue`s on a missing runner), single root export, `sideEffects: false`, `destroy*` for GPU teardown. All clean.
- `Readonly<>` on effect/target params throughout.

**Contract-fit drift — one real finding (registry-by-default is fine; this is fork-C, the within-unit duplication smell):**

- **Bloom mip/knee math is reimplemented in the GL backend instead of consuming the shared `@flighthq/effects` helpers added in the same bundle.** `effects/bloomMath.ts` now exports `computeBloomMipCount`, `computeBloomMipWeights`, and `computeBloomThresholdKnee` (with colocated tests), explicitly documented as _"substrate-agnostic … shared by all bloom backends so GL and WGPU derive identical parameters from the same intent."_ But `glBloomEffect.ts` imports only `computeBloomBlurRadius` and computes the rest inline — and the two **disagree**:
  - Mip count: `effects` uses `max(1, floor(log2(minDim)))` (no clamp); GL uses `max(1, min(6, floor(log2(minDim/4))))` (clamped 1–6, `/4`). Different level counts for the same source.
  - Soft knee: `effects.computeBloomThresholdKnee` scales the knee by `threshold` (`thresholdKnee * threshold`) and emits curve constants; the GL shader uses an unscaled `u_knee = thresholdKnee` with a different quadratic. Different bright-pass boundary.
  - Weights: GL re-derives the uniform/normalize fallback inline instead of calling `computeBloomMipWeights`. This defeats the stated purpose of the shared helpers and guarantees GL↔WGPU↔(future Rust) bloom divergence. The status doc claims pass-2 added the pyramid bloom but does **not** flag that it bypasses the shared math — a claim gap worth recording. Candidate revision: have the GL bloom consume the `effects` helpers (and reconcile which derivation is canonical).

**Where the admin docs are stale against the work:**

- The **Package Map** (`agents/index.md`) has an entry for `@flighthq/filters-gl` but **no entry for `@flighthq/effects-gl`** (nor `@flighthq/effects`, `effects-wgpu`, `effects-canvas`). A 44-runner post-process backend is a substantial package and should have a Package Map line. Candidate revision: add `effects` + the three `effects-<backend>` entries.
- `render-backend-support.md` is referenced as the source of truth for "what renders on each backend"; it should record that GL effects exist but that Ssr/Taa/Ssao/Smaa are stand-ins, so a scoping agent does not assume real depth-driven AO/reflections on GL. Candidate revision.

## Candidate open directions

The charter is a stub; each silence below is a question for the user to settle into the charter.

1. **Naming honesty for stand-ins (the central design fork).** Keep `Ssr`/`Taa`/`Ssao`/`Smaa` under their canonical names with honest stand-in comments (current state), or relocate the not-yet-real ones to an `experimental`/`stub` namespace until the G-buffer/history seam lands? This is the one the status doc explicitly escalates; it belongs in the charter's Boundaries/Decisions.
2. **Canonical bloom math home.** Should _all_ bloom backends be required to consume `@flighthq/effects` bloom helpers (making divergence a lint/contract failure), and which of the two current mip/knee derivations is canonical? This is fork-C made concrete for this package.
3. **Taxonomy reconciliation.** GL keeps four-band back-compat aliases over the six-band set, and `BloomEffect`/`DitherEffect` band placement differs from history. Bless the six-band taxonomy as the canonical one and drop or keep the aliases? (Low urgency — last-write-wins, no runtime impact.)
4. **Backend-parity test scope.** Is `effects-gl` expected to carry `tests/functional/effect-*-gl` parity scenes as part of "done," or is that owned by the functional-test harness layer? Settles whether the missing parity coverage is a gap _in this package_.
5. **Chain orchestration ownership.** Where does effect-chain validation/ordering live — a `RenderEffectChainHint` in `effects` consumed here, or a helper in `render-gl`? (Mirrors the `filters-gl` decision that the chain applier is out of scope for the leaf-shader package.)
6. **G-buffer/history-target seam.** The real SSR/SSAO/TAA work all converge on one cross-package decision in `render-gl` (retained-target shape, depth/normal buffers). Worth surfacing as the single unblocking dependency rather than three separate effect TODOs.
