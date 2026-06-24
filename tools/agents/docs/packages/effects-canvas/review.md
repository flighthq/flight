---
package: '@flighthq/effects-canvas'
status: solid
score: 88
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/effects-canvas.md
  - source
  - incoming/builder-67dc46d64
---

# Review: @flighthq/effects-canvas

## Verdict

**solid — 88/100.** Canvas 2D realizations of the renderer-agnostic post-process effect set in `@flighthq/effects`: an opt-in offscreen ping-pong pipeline, a render-target pool, a per-state runner registry, and apply-functions for all 44 effect kinds. The headline finding of the prior depth review — **33 of 44 effects were no-op passthroughs** — is now closed: 34 effects are genuinely implemented (real or approximate) and only 10 remain passthrough, each for a documented hard-input reason (depth buffer, velocity buffer, multi-frame history, GPU AA samples, or a missing LUT payload). The infrastructure was already solid; the catalog is now mostly real. Held back from `authoritative` by stale framing in its own docs (the support map and barrel comments), a small dead- code residue, and an unresolved cross-backend support-type naming question.

## What changed since the depth review (48/100 → claimed 92)

The depth review's central charge was that the package "restricts itself to `ctx.filter` CSS strings and draw-op compositing" and wrongly declared everything else "shader-only," omitting `getImageData`/`putImageData`. **That is resolved.** This pass added the missing per-pixel primitive and built the omitted effects on it. Verified against the bundle source (`builder-67dc46d64`):

- `drawCanvasImageDataPass` (`canvasEffectCompositing.ts:64`) — the `getImageData` → per-pixel transform → `putImageData` primitive the depth review asked for, by name.
- `drawCanvasAccumulationPass` (`:13`) — equal-weight multi-draw accumulation, the shared primitive behind directional/radial blur and god-rays.
- Real per-pixel effects verified by reading source: `applyPosterizeEffectToCanvas` (channel quantization), `applySharpenEffectToCanvas` (3×3 Laplacian, alias-safe via an `orig` copy), `applyDirectionalBlurEffectToCanvas` (centered multi-draw smear). All three were passthrough stubs in the depth review and are now genuine implementations.

The status doc's claims are **AS-CLAIMED → verified**: the support-map tiers, the real/approximate/passthrough split, the category registrars, and the taxonomy-completeness tests all match source. The one number to correct: the status says "35 real/approximate runners"; the support map is 32 `real` + 2 `approximate` = **34** registered, with 10 passthrough (44 total). The discrepancy is `ScreenSpaceShadowsEffect`, which is in the support map as passthrough but has **no colocated source file** at all (the only kind without one) — counted by neither the registrars nor `exports:check` (no export to bind a test to).

## Present capabilities

**Infrastructure (all real, grounded in source):**

- Pipeline — `createCanvasRenderEffectPipeline` / `begin*` / `end*` / `destroy*` (`canvasRenderEffectPipeline.ts`). Redirects scene render into an offscreen `CanvasRenderTarget`, ping-pongs two pooled scratch canvases through the registry, then `presentCanvasRenderEffectResult` blits to the main canvas with correct clear-before-draw for transparent scenes. Unregistered kinds are silently skipped (`getCanvasRenderEffectRunner` → `null` → `continue`).
- Render-target pool — `createCanvasRenderTargetPool`, `acquireCanvasRenderTarget`, `releaseCanvasRenderTarget`. Paired brackets, size-aware reuse, correct ownership.
- Registry — `registerCanvasRenderEffect` / `getCanvasRenderEffectRunner` / `hasCanvasRenderEffectRunner` over a per-state `WeakMap<state, Map<kind, runner>>`. Opt-in, last-write-wins, no monolithic switch. `hasCanvasRenderEffectRunner` is correctly homed in the registry module (mirrors `hasGlRenderEffectRunner`).
- Compositing primitives — `drawCanvasEffectPass` (filter + composite-op blit with full state reset), `drawCanvasAccumulationPass`, `drawCanvasImageDataPass`, `passthroughCanvasEffectPass`.
- Support tiers — `CANVAS_RENDER_EFFECT_SUPPORT` (static map of all 44 kinds) + `getCanvasRenderEffectSupport` (runtime lookup, `'passthrough'` sentinel for unknown kinds). The discoverability gap the depth review flagged ("a consumer cannot discover that `posterize` will silently do nothing") is closed by this lookup.

**Effect catalog (34 implemented):** color-grade per-pixel (posterize, channel-mixer, lift/gamma/gain, white-balance, dither) and CSS-filter (brightness-contrast, grayscale, invert, sepia, hue-saturation, color-grade); convolution/neighbor (sharpen, outline/Sobel, kuwahara, sketch, halftone); spatial blur (directional, radial, tilt-shift, bloom); stylized screen (chromatic aberration, crt, displacement, film grain, glitch, god-rays, lens-dirt, lens-distortion, lens-flare, pixelate, scanlines, screen-space fog, vignette); and two `approximate` tone/exposure (`applyExposureEffectToCanvas` via CSS `brightness(2^stops)`, `applyToneMapEffectToCanvas`), honestly flagged because 8-bit sRGB has no HDR headroom.

**Category registrars:** `registerAllCanvasRenderEffects` delegates to four registrars (`registerBlurCanvasRenderEffects`, `registerColorGradeCanvasRenderEffects`, `registerStylizeCanvasRenderEffects`, `registerScreenSpaceCanvasRenderEffects`), each driven by a local kind→runner tuple constant — mirroring the GL registrar design. `registerScreenSpace*` is an intentional no-op (empty tuple) for symmetry with the GL/WGPU equivalents.

**Passthrough set (10, each defensible):** depth-buffer (`BokehDepthOfField`, `Ssao`, `Ssr`, `ScreenSpaceShadows`), velocity-buffer (`CameraMotionBlur`, `MotionBlur` — `MotionBlurEffect` genuinely carries a `scene velocity buffer` semantic in its type, so the depth review's claim that a "screen-space variant" is achievable does not hold against the descriptor), multi-frame history (`Taa`), GPU AA samples (`Fxaa`, `Smaa`), and missing descriptor data (`LookupTableGrade` — descriptor carries only `size`/`strength`, no cube data). Each is documented in-comment with its specific missing input rather than the old "shader-only" hand-wave the depth review criticized. **That comment-rewrite ask is satisfied.**

**Tests:** `canvasRenderEffectRegistration.test.ts` includes the Gold taxonomy-completeness assertion — every non-passthrough kind in the support map is registered after `registerAllCanvasRenderEffects`, and every passthrough kind stays unregistered. This binds the support map and the registrars together so they cannot silently drift. Per-effect tests exist for every source file. (jsdom does not execute canvas draw commands, so unit tests verify math/non-throwing only; the visual gate is the functional baselines.)

## Gaps

- **`ScreenSpaceShadowsEffect` has no colocated source file.** Every other of the 44 kinds has a `canvas<Kind>Effect.ts` + test; this one exists only as a passthrough entry in the support map. It is invisible to `exports:check`. Either it needs a passthrough stub file for symmetry, or its support-map entry is the only home and that asymmetry should be conscious.
- **Approximate tier is shallow (2 of a plausibly larger set).** Only `Exposure` and `ToneMap` are `approximate`. `ToneMap` is registered but its LDR fidelity vs. the GL HDR path is asserted nowhere; a parity note (or an explicit "approximate means X% off" comment) would harden the tier.
- **`LookupTableGrade` real path blocked on a `@flighthq/types` descriptor change** — needs a `data: Float32Array` (or side-channel) on `LookupTableGradeEffect`; correctly left passthrough. This is a cross-package design decision, not a within-package gap.
- **Functional-test kind-string bug is upstream, not fixed.** The status notes the `tests/functional/effect-*` canvas render files register with lowercase kinds (`'grayscale'` vs `'GrayscaleEffect'`), so the canvas column of those baselines may apply no effect. That is a cross-package functional-suite fix, correctly surfaced and not acted on — but it means the "visual correctness gate is closed" claim in the status is weaker than stated for the canvas backend until those kind strings are corrected.

## Charter contradictions

The charter is a **stub** — only "What it is" is seeded; North star, Boundaries, Decisions, and Open directions are all `TODO`. There is no stated principle to contradict. Judged against the fallback codebase-map AAA standard, no violations: naming is fully self-identifying (`apply<Effect>EffectToCanvas`, `defaultCanvas<Effect>EffectRunner`, `acquire/releaseCanvasRenderTarget`), teardown verbs are correct (`destroyCanvasRenderEffectPipeline` correctly reasoned as GC-memory in its comment), out-param/aliasing discipline holds (distinct source/dest targets; `applySharpen` reads an `orig` copy before writing), sentinels-not-throws is honored (`getCanvasRenderEffectRunner` → `null`, `getCanvasRenderEffectSupport` → `'passthrough'`), and `sideEffects: false` with a single root export is intact.

## Contract & docs fit

**Lives up to the contract:**

- `CanvasRenderEffectSupport`, `CanvasRenderEffectRunner`, `CanvasRenderTarget`, `CanvasRenderState`, `CanvasRenderEffectPipeline` all live in `@flighthq/types` (header-first). No cross-package type is defined inline.
- Single `.` export, `sideEffects: false`, full unabbreviated names, opt-in registration (no top-level `registerRenderer`).
- `crate: null` is correct — the Rust port provides Canvas-2D-equivalent CPU effects via `flighthq-effects-skia` (tiny-skia), not a Canvas emulator. The status's note that `drawCanvasImageDataPass` maps to Pixmap iteration and `drawCanvasAccumulationPass` to multi-draw accumulation is the right conformance seam to record.

**Candidate revisions (user's gate, not mine):**

1. **Package Map omits the entire effects family.** `tools/agents/docs/index.md` has no line for `@flighthq/effects`, `effects-canvas`, `effects-gl`, or `effects-wgpu` — yet all four packages exist in the tree. The Map should gain an effects entry (and ideally the `<subject>-<backend>` framing the render reorg established).
2. **The "not-yet-present `effects-webgl`" framing is stale** in both the charter's seeded "What it is" and the depth review. `effects-gl` and `effects-wgpu` both exist now with 44 effect files each. The charter's identity line should be re-seeded to "the Canvas member of the `effects-<backend>` family" rather than "counterpart to a not-yet-present sibling."
3. **Self-contradicting barrel comment.** `registerAllCanvasRenderEffects`'s comment claims it "is NOT re-exported from the root barrel by default," but `index.ts` does `export *` from the registration module, so it _is_ exported — and under the SDK's single-root-barrel + `sideEffects:false` rule it tree-shakes identically whether re-exported or not. The comment describes a separate-entry-point model the SDK explicitly rejects; it should be deleted or corrected.

**Cleanliness residue:**

- `canvasSharpenEffect.ts:31-33,54-56` — `cr`/`cg`/`cb` are read from `orig` then never used and `void`-ed away. Dead bindings; violates "leave touched files cleaner." Should be removed.

## Candidate open directions

The charter is a stub, so each of these is a question the review had to assume past — collect them into the charter's Open directions:

1. **Cross-backend support-type naming (fork-adjacent).** `CanvasRenderEffectSupport` is the only backend-specific tier type in `@flighthq/types`. If `effects-gl`/`effects-wgpu` grow `get*RenderEffectSupport`, do they each get a `GlRenderEffectSupport` /`WgpuRenderEffectSupport`, or is there one shared `RenderEffectSupport` alias? Decide before a third copy lands.
2. **Is the 10-kind passthrough floor permanent, or a build target?** `LookupTableGrade` is one `@flighthq/types` field away from real; the depth/velocity/history set is genuinely impossible on Canvas 2D. The charter should state whether "passthrough for parity" is the accepted terminal state for the impossible set (it should be) and which passthroughs are merely blocked-on-types.
3. **`CANVAS_RENDER_EFFECT_SUPPORT` as a closed `Record` vs. registry (structural fork B).** The support map is a closed `Readonly<Record<string, …>>` keyed by all 44 built-in kinds — a closed taxonomy in a domain the codebase otherwise drives by open string registries. It is _not_ in a hot loop (lookup is a one-shot per effect), and the taxonomy test pins it to the registrars, so the maintenance risk is bounded — but a user's custom vendor-prefixed effect kind has no support entry and silently reports `'passthrough'`. Worth a conscious ruling: is the support map intentionally closed-to-built-ins (the lean answer, given fork B's "closed is fine when small / not hot"), or should support tier be a registerable property alongside the runner?
4. **Approximate-tier fidelity contract.** What does `'approximate'` promise a consumer — "looks plausible," or "within a bounded error of the GL path"? This governs whether `ToneMap`/`Exposure` need parity baselines against `effects-gl`.
