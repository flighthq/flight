# Depth Review: @flighthq/effects-canvas

**Domain**: Canvas 2D backend realizations of the renderer-agnostic full-screen / post-process effect set defined in `@flighthq/effects` — the Canvas counterpart to a (not-yet-present) `effects-webgl`, plus the opt-in Canvas post-process pipeline (offscreen render target, ping-pong pool, per-state effect runner registry).

**Verdict**: partial — **48/100**

The package has excellent _breadth of surface_ (a runner + apply function for all 44 effect kinds, a clean tree-shakable registry, a correct ping-pong pipeline, render-target pooling) but shallow _depth of realization_: **33 of the 44 effects are no-op passthroughs** that copy source→dest unchanged. As a standalone "Canvas 2D effects library," three quarters of its named effects do nothing. The infrastructure is solid; the effect catalog is mostly hollow.

## Present capabilities

Infrastructure (all real and well-built):

- **Pipeline**: `createCanvasRenderEffectPipeline` / `begin*` / `end*` / `destroy*` — redirects scene render into an offscreen `CanvasRenderTarget`, then runs the per-frame effect list, ping-ponging two pooled scratch canvases via `ctx.filter` + draw-op compositing, then `presentCanvasRenderEffectResult` blits to the main canvas. Correct clear-before-draw handling for transparent scenes.
- **Render-target pool**: `createCanvasRenderTargetPool`, `acquireCanvasRenderTarget`, `releaseCanvasRenderTarget` — paired acquire/release brackets, size-aware reuse. Correct ownership discipline.
- **Registry**: `registerCanvasRenderEffect` / `getCanvasRenderEffectRunner` — per-state `WeakMap` of `kind → runner`, opt-in registration, last-write-wins swap, no monolithic switch. Matches the kind-based renderer-registration pattern in the docs.
- **Compositing primitives**: `drawCanvasEffectPass` (filter + composite-op blit with full state reset) and `passthroughCanvasEffectPass`.

Real effect implementations (11):

- `applyBloomEffectToCanvas` — genuine multi-pass: bright-pass (contrast/brightness CSS crush) → CSS blur of the bright branch → additive (`lighter`) composite scaled by intensity. Uses the pool correctly.
- `applyBrightnessContrastEffectToCanvas`, `applyGrayscaleEffectToCanvas`, `applyInvertEffectToCanvas`, `applySepiaEffectToCanvas`, `applyHueSaturationEffectToCanvas`, `applyColorGradeEffectToCanvas` — map onto native CSS `filter` functions (brightness/contrast/grayscale/invert/sepia/hue-rotate/saturate). Legitimate and correct.
- `applyVignetteEffectToCanvas`, `applyScanlinesEffectToCanvas`, `applyFilmGrainEffectToCanvas`, `applyPixelateEffectToCanvas` — real draw-op recipes (radial gradient overlay, line overlay, procedural grain, downscale/upscale pixelation).

## Gaps vs an authoritative Canvas-2D effects library

The central gap: **the package restricts itself to `ctx.filter` CSS strings and draw-op compositing**, and declares everything outside that toolset "shader-only" / impossible. That premise is wrong. Canvas 2D exposes `getImageData` / `putImageData`, giving full per-pixel read/write — the canonical Canvas-2D path for exactly these effects. The sibling `@flighthq/surface` package already uses `getImageData`/`putImageData` in this same repo, so the capability is established and available; this package simply never reaches for it.

Effects stubbed as passthrough that are **routinely implemented on Canvas 2D via ImageData** (these are missing-by-omission, not missing-by-design):

- **Per-pixel color math**: `Posterize` (channel quantization), `ChannelMixer` (3×4 RGB matrix), `LookupTableGrade` (3D LUT sample), `LiftGammaGain` (per-channel offset/pow/mul), `WhiteBalance` (temperature/tint), `Dither` (ordered-Bayer). All are trivial ImageData loops. The "no CSS equivalent → shader-only" justification ignores ImageData entirely.
- **Convolution kernels**: `Sharpen` (unsharp/Laplacian), `Outline` (Sobel), `Kuwahara`, `Sketch` — standard neighbor-sampling loops over ImageData; a 3×3/5×5 kernel pass is a textbook Canvas-2D operation.
- **Spatial blurs**: `DirectionalBlur`, `RadialBlur`, `MotionBlur` (the screen-space variant), `Halftone`, `Displacement`, `LensDistortion` — all expressible either via accumulated multi-draw compositing (directional/radial/motion can sum offset draws with `globalAlpha`) or ImageData remap. Stubbed regardless.
- **Stylized / composite screen effects**: `Glitch` (RGB-split + slice offset via multi-draw), `ChromaticAberration` (channel-offset draws), `GodRays`/`LensFlare`/`LensDirt` (radial-gradient + additive composite overlays — the same toolkit `Bloom` and `Vignette` already use), `Crt`, `TiltShift` (graduated blur via masked CSS-blur draws), `ScreenSpaceFog`. Several of these reuse techniques the package already demonstrates elsewhere, yet are passthrough.
- **Tone/exposure**: `Exposure`, `ToneMap` — legitimately limited by 8-bit non-HDR canvas for the linear-HDR path, but an approximate LDR exposure (brightness/curve) is still expected of a mature library; full passthrough is a hard floor, not an approximation.

Genuinely missing-by-design (correctly stubbed — these need a depth or velocity buffer Canvas 2D never produces): `BokehDepthOfField`, `Ssao`, `Ssr`, `Taa`, `CameraMotionBlur` (velocity-buffer variant), and the GPU-AA passes `Fxaa`/`Smaa` (post-process AA on an already-rasterized 8-bit canvas is near-pointless). These ~7 passthroughs are defensible; documenting them as preserved-but-inert pipeline stages for cross-backend parity is reasonable.

Net: of 33 passthroughs, roughly **26 are achievable on Canvas 2D and are stubbed by omission**, and ~7 are legitimately out of scope.

Also absent for an "authoritative" claim:

- No effect _chaining/ordering_ helper beyond the raw list the pipeline iterates (acceptable — that lives one tier up).
- No coverage parity instrument flagging which kinds are real vs passthrough at runtime (a consumer cannot discover that `posterize` will silently do nothing).

## Naming / API-shape notes

- Naming is consistent and self-identifying: `apply<Effect>EffectToCanvas`, `defaultCanvas<Effect>EffectRunner`, `register/getCanvasRenderEffect`, `acquire/releaseCanvasRenderTarget`. Matches the project's full-type-word and `create/dispose/destroy/acquire/release` conventions exactly.
- Out-param/aliasing discipline is correct (source/dest distinct render targets, pool brackets paired). `destroyCanvasRenderEffectPipeline` vs the GC nature of canvases is correctly reasoned in-comment.
- The `_effect` unused-parameter prefix on every passthrough is an honest, greppable signal of inertness — good. But it also makes the hollow surface visible: 33 functions accept an effect descriptor and ignore it.
- The passthrough comments assert "shader-only" / "no CSS filter equivalent" as the rationale. This is the load-bearing error: it conflates "no CSS `filter` string" with "impossible on Canvas 2D," omitting ImageData. The comments should be corrected, and the effects implemented, rather than documented as impossible.

## Recommendation

Treat the infrastructure (pipeline, pool, registry, compositing, the 11 real effects) as solid and keep it. The package is **not** authoritative for its domain because the majority of its named effects are inert.

To reach AAA depth:

1. Add an ImageData-backed pass primitive (`drawCanvasImageDataPass` or reuse `@flighthq/surface`) and implement the ~26 omitted effects: start with the pure per-pixel set (posterize, channel-mixer, LUT grade, lift/gamma/gain, white-balance, dither), then convolution (sharpen, outline/Sobel, kuwahara, sketch), then multi-draw spatial/stylized (directional/radial/motion blur, glitch, chromatic aberration, god-rays, lens-flare/dirt, tilt-shift, halftone), then approximate exposure/tone-map.
2. Rewrite the "shader-only / no CSS equivalent" comments to the truthful "no Canvas-2D path" only for the ~7 depth/velocity/GPU-AA cases.
3. Keep the legitimately-impossible set as documented passthroughs, and consider a discoverable capability flag so consumers know which kinds are inert on this backend.
