# Depth Review: @flighthq/effects

**Domain:** Full-frame / post-process render effects — the catalog of substrate-agnostic effect _intents_ (descriptors) that per-backend recipes consume to drive a screen-space post pipeline (bloom, color grading, blurs, anti-aliasing, film/stylize, screen-space 3D effects).

**Verdict:** solid — completeness 72/100

The package is a deliberately thin descriptor layer: it owns the _catalog of effect intents_ and their shared recipe math, while the actual rendering recipes (`apply*ToCanvas`, `register*RenderEffect`, GL/WGPU passes) and the pipeline/dispatch machinery live in the render backend packages and `@flighthq/render`. Judged as "the canonical catalog of post-process effects," the breadth is genuinely strong and industry-comprehensive. Judged as "an authoritative effects _library_ with depth per effect," it is shallow by construction — almost every export is a one-line `create*Effect` factory wrapping an optional-field descriptor.

## Present capabilities

42 effect descriptors, each exposed as a `create<Name>Effect(options): <Name>Effect` factory that stamps the `kind` discriminant onto a plain-data intent. The catalog is broad and well-chosen, covering every major post-process family:

- **Tone / exposure / color grading:** `Exposure`, `ToneMap`, `BrightnessContrast`, `HueSaturation`, `ColorGrade` (exposure/contrast/saturation/temperature/tint/brightness), `WhiteBalance`, `LiftGammaGain` (lift/gamma/gain wheels), `ChannelMixer`, `LookupTableGrade` (LUT), `Posterize`, `Invert`, `Grayscale`, `Sepia`.
- **Blur family:** `MotionBlur`, `DirectionalBlur`, `RadialBlur`, `CameraMotionBlur` (`[MOTION]`), `BokehDepthOfField` (`[DEPTH]`), `TiltShift`.
- **Bloom / light:** `Bloom` (`[HDR]`, threshold/intensity/radius/passes), `GodRays`, `LensFlare`, `LensDirt`, `ScreenSpaceFog` (`[DEPTH]`).
- **Lens / distortion:** `LensDistortion`, `ChromaticAberration`, `Displacement`.
- **Anti-aliasing:** `Fxaa`, `Smaa`, `Taa` (`[TEMPORAL]`).
- **Screen-space 3D:** `Ssao` (`[DEPTH]`, radius/intensity/bias/samples), `Ssr` (`[DEPTH]`).
- **Stylize / retro:** `Crt`, `Scanlines`, `FilmGrain`, `Glitch`, `Halftone`, `Dither`, `Pixelate`, `Sharpen`, `Outline`, `Sketch`, `Kuwahara`.

Architecture is sound and matches house style: each intent extends the open `RenderEffect` base contract (`{ kind }`) from `@flighthq/types`, colors are packed RGBA ints, and the `[HDR]`/`[DEPTH]`/`[MOTION]`/`[TEMPORAL]` tags in the type comments document the render-input each recipe needs. The single piece of genuine domain _logic_ in the package is `computeBloomBlurRadius(effect)` — "substrate-agnostic recipe math so the GL and WGPU bloom recipes derive identical parameters from the same intent." This is exactly the kind of shared math the package description promises ("substrate-agnostic recipe math"), but it exists for exactly one effect.

## Gaps vs an authoritative effects library

Two distinct kinds of gap.

**1. Per-effect depth is minimal.** The descriptors are correct but shallow, and several lack the parameters a mature post stack exposes:

- `ToneMap` has no operator selector (ACES / Reinhard / Filmic / AgX / Uncharted2) — tone mapping without an operator field is underspecified.
- `MotionBlur`/`CameraMotionBlur`/`RadialBlur`/`DirectionalBlur` lack `samples`/quality fields (only `Ssao` and `Bloom` expose sample/pass counts).
- `Bloom` has no mip/threshold-knee or per-mip weighting (modern bloom is multi-mip, not single-radius).
- `ColorGrade` and `LiftGammaGain` are separate descriptors with no shared color-science primitives (no slope/offset/power "CDL" form, no shadows/mids/highlights split).
- No common `intensity`/`mix`/`enabled` field on the `RenderEffect` base, so per-effect blend strength is ad hoc (some have `intensity`, some do not).

**2. The package owns _intents_ but not the _library_ around them.** Whether these are missing-by-design depends on where you draw the boundary, but a consumer reaching for "an effects library" would expect, and not find here:

- **No recipe/runner code** — `apply*ToCanvas`, GL/WGPU passes, `register*RenderEffect`, and the `*RenderEffectPipeline` types all live in `@flighthq/render*` and `@flighthq/types`. _(Missing-by-design: backend recipes belong in backend packages per the cellular architecture.)_
- **No effect-stack / pipeline composition helper** in this package — no `createEffectChain`, ordering, or `RenderEffect[]` validation. Dispatch over an intent array is the render layer's job. *(Missing-by-design, but it means `effects` alone cannot *compose* effects, only *name* them.)*
- **No shared recipe math beyond `computeBloomBlurRadius`** — no gaussian-weight/kernel helpers, no temperature→RGB conversion, no Gaussian sigma↔radius, no LUT-coordinate math, no luminance/ACES matrices. For the package to fulfill its stated "substrate-agnostic recipe math" role, this is the layer that is thinnest: 41 of 42 effects contribute no math, only a literal-spread factory. _(Missing-by-omission: the package's own description promises this and it is largely absent.)_
- **No introspection/metadata** — no way to enumerate kinds, query required render inputs (the `[DEPTH]`/`[HDR]` tags are comments, not data), or default-fill an effect. _(Missing-by-omission.)_

## Naming / API-shape notes

- Naming is consistent and self-identifying: `create<FullTypeName>Effect`, `kind: '<FullTypeName>Effect'`, one file per effect, alphabetized barrel. This matches the house rules well.
- The factories are nearly pure boilerplate (`{ kind: 'XEffect', ...options }`). Given that every field is optional, these constructors add little over a typed literal except the `kind` stamp — defensible for OOP/kind identity, but it is why the package reads as a stub of factories rather than a library.
- `computeBloomBlurRadius` is the right _shape_ for shared math (takes the intent, returns a derived scalar) and is the model the other 41 effects should follow where they have non-trivial parameter derivation. Its lonely presence is the clearest signal that the "recipe math" half of the package's charter is unbuilt.
- Acronym-cased kinds (`Ssao`, `Ssr`, `Taa`, `Fxaa`, `Smaa`, `Crt`) are reasonable, though inconsistent with how some libraries spell these (`SSAO`); fine as a convention as long as it is uniform.

## Recommendation

Treat this as **solid breadth, thin depth** — the effect _catalog_ is close to authoritative for a 2D/3D post stack, so the verdict is `solid` rather than `partial`. To reach AAA depth without violating the backend-boundary design:

1. Build out the **substrate-agnostic recipe math** that the package description already claims as its job: gaussian kernel/sigma helpers, temperature/tint→RGB, luminance/ACES matrices, sigma↔radius, LUT-coord math, mip-count derivation. Follow the `computeBloomBlurRadius` pattern so GL and WGPU recipes share one source of truth. This is the highest-value gap and is clearly in-scope.
2. Deepen the under-specified descriptors: add a `ToneMap` operator enum, sample/quality fields on the blur family, multi-mip bloom controls, and a shared `intensity`/`mix` on the base contract.
3. Add lightweight introspection: promote the `[DEPTH]`/`[HDR]`/`[MOTION]`/`[TEMPORAL]` tags from comments to a data field (required render inputs) so the pipeline can validate an intent list without backend knowledge.
4. Leave recipes, registration, and pipeline dispatch where they are (render/backends) — that boundary is correct.
