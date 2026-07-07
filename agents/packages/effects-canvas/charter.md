---
package: '@flighthq/effects-canvas'
crate: null
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---


# effects-canvas — Charter

## What it is

The Canvas 2D member of the `effects-<backend>` family: the Canvas 2D realizations of the renderer-agnostic full-screen / post-process effect set defined in `@flighthq/effects`. It provides the opt-in Canvas post-process pipeline (offscreen render target, ping-pong scratch pool, per-state effect runner registry) plus apply-functions for the 44 effect kinds, sitting alongside its siblings `@flighthq/effects-gl` and `@flighthq/effects-wgpu` (both now built with 44 effect files each).

Where it ends: `@flighthq/effects` owns the renderer-agnostic descriptors and the effect taxonomy; `effects-canvas` owns only how those descriptors are _realized on a Canvas 2D context_ — `ctx.filter` CSS strings, draw-op compositing, multi-draw accumulation, and per-pixel `getImageData`/`putImageData` passes. It does not define effect kinds, and it has no Rust crate (`crate: null`): the Rust port supplies Canvas-2D-equivalent CPU effects through `flighthq-effects-skia` (tiny-skia), not a Canvas emulator.

## North star

- **Realize every effect the substrate can express; be honest where it cannot.** Canvas 2D has no depth/velocity/history buffers and no HDR headroom. The bar is a genuine implementation for every effect Canvas can do (34 today), an explicitly `approximate` tier where the result is plausible but LDR-limited (exposure, tone-map), and a documented passthrough — with its specific missing input named in-comment — for the rest. No silent no-ops, no "shader-only" hand-waving.
- **Discoverability over surprise.** A consumer must be able to learn, before rendering, that a given effect will do nothing on Canvas. `getCanvasRenderEffectSupport` and the support map exist so passthrough is a queryable fact, not a silent surprise.
- **Opt-in, registry-driven, tree-shakable.** No monolithic `switch(kind)`, no top-level registration, single `.` export, `sideEffects: false`. Effects register into a per-state registry via category registrars; an app pays only for the effects it registers. (Structural fork B: registry by default.)
- **Mirror the sibling backends.** Naming, registrar structure, and the support/runner split should be symmetric with `effects-gl`/`effects-wgpu` so the three backends read as one family and a reader who knows one knows all three (`hasCanvasRenderEffectRunner` mirrors `hasGlRenderEffectRunner`, the empty `registerScreenSpace*` mirrors the GL/WGPU no-op, etc.).
- **Explicit allocation and alias-safety in the pixel path.** Pooled render targets through paired `acquire`/`release` brackets; per-pixel passes that read a source copy before writing (`applySharpen`'s `orig`), so source/dest aliasing is always safe.

## Boundaries

**In scope:**

- Canvas 2D realizations of the `@flighthq/effects` taxonomy (CSS-filter, draw-op composite, accumulation, and per-pixel passes).
- The opt-in Canvas post-process pipeline, render-target pool, per-state runner registry, and compositing primitives.
- The support map / support-tier lookup that reports each kind's Canvas fidelity tier.

**Non-goals:**

- Defining effect kinds or descriptors — those live in `@flighthq/effects` / `@flighthq/types`.
- Effects whose required inputs do not exist on a Canvas 2D context (depth buffer, velocity buffer, multi-frame history, GPU AA samples). These stay passthrough for taxonomy parity, by design.
- A Rust crate — the CPU-effect role in the Rust port belongs to `flighthq-effects-skia`.
- Emulating WebGL/WebGPU shader effects on Canvas where the substrate genuinely cannot express them.

## Decisions

- **2026-07-02 — TS-leads. `crate: null` (browser-API-bound).**

## Open directions

1. **Cross-backend support-type naming (fork-adjacent).** `CanvasRenderEffectSupport` is currently the only backend-specific tier type in `@flighthq/types`. If `effects-gl`/`effects-wgpu` grow `get*RenderEffectSupport`, do they each get their own `GlRenderEffectSupport` / `WgpuRenderEffectSupport`, or is there one shared `RenderEffectSupport` alias? Worth deciding before a third copy lands.
2. **Is the 10-kind passthrough floor permanent, or a build target?** The depth/velocity/history set is genuinely impossible on Canvas 2D, but `LookupTableGrade` is one `@flighthq/types` field away from real (it needs `data: Float32Array` or a side-channel on `LookupTableGradeEffect`). Should the charter state that "passthrough for parity" is the accepted terminal state for the impossible set, while flagging the few passthroughs that are merely blocked-on-types?
3. **`CANVAS_RENDER_EFFECT_SUPPORT` as a closed `Record` vs. a registerable property (structural fork B).** The support map is a closed `Readonly<Record<string, …>>` over all 44 built-in kinds — a closed taxonomy in a codebase that otherwise drives by open string registries. It is not hot (one lookup per effect) and the taxonomy test pins it to the registrars, so the risk is bounded — but a user's vendor-prefixed custom kind has no support entry and silently reports `'passthrough'`. Conscious ruling needed: is the support map intentionally closed-to-built-ins (the lean answer under fork B), or should support tier become a registerable property alongside the runner?
4. **Approximate-tier fidelity contract.** What does `'approximate'` promise a consumer — "looks plausible," or "within a bounded error of the GL path"? This governs whether `ToneMap`/`Exposure` need parity baselines against `effects-gl`, and whether the tier should carry an explicit "approximate means X% off" note.
5. **`ScreenSpaceShadowsEffect` has no colocated source file** — the only one of 44 kinds without a `canvas<Kind>Effect.ts` + test, so it is invisible to `exports:check`. Should it get a passthrough stub file for symmetry, or is the support-map entry its only intended home (a conscious asymmetry)?
6. **Stale framing in the package's own docs (cross-package, charter-adjacent).** The Package Map in `agents/index.md` omits the entire effects family (`effects`, `effects-canvas`, `effects-gl`, `effects-wgpu`); the seeded "not-yet-present `effects-webgl`" framing is stale now that both GL and WGPU siblings exist; and `registerAllCanvasRenderEffects`'s barrel comment claims it "is NOT re-exported from the root barrel" while `index.ts` re-exports it. Do these doc/comment corrections belong to this package's direction or to a separate docs sweep?
