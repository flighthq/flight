---
package: '@flighthq/render-gl'
updated: 2026-06-24
basedOn: ./review.md
---

# render-gl — Assessment

Recommendation layer over `review.md` (solid, 86/100), absorbing the prior maturation roadmap (`reviews/maturation/depth/render-gl.md`, Bronze/Silver/Gold). The roadmap is one-time seed and may be removed once this assessment lands.

Scope reminder: render-gl is the WebGL2 **backend-core** tier (state, targets, shaders, draw, fullscreen passes) beneath `displayobject-gl` / `scene-gl`. The charter is still a stub, so judging falls back to the codebase-map AAA standard; items that require a blessed Boundary/North-star decision are routed to **Open directions** (for the charter; not edited here), not into Recommended.

## Recommended

Sweep-safe: within `@flighthq/render-gl`, additive (no breaking change), no open design decision. A blanket "do all recommended" can safely bless this whole set. New cross-package _types_ land in `@flighthq/types` first per the types-first rule — that is the established pattern this pass already followed, not a design fork.

- **Wire the instrumentation counters into the draw paths.** `recordGlDrawCall` / `recordGlTextureBind` / `recordGlProgramSwitch` / `recordGlFramebufferBind` are exported and unit-tested but called by nothing, so `getGlRenderStats` reports all-zero during real draws. Call them from the core hot-path callsites (`drawGlQuad`/`glDraw`, `bindGlTexture`, `useGlProgram`, `beginGlRenderTarget`). The review marks this "low-risk, touches tested hot-path code"; it makes a shipped surface do what its name promises. — review.md#gaps, review.md#candidate-open-directions (stats hot-path wiring)
- **UBO primitives.** `createGlUniformBuffer` / `updateGlUniformBuffer` / `bindGlUniformBuffer` — core GPU plumbing instanced leaf renderers build on; additive, no leaf coupling. — review.md#gaps
- **Sampler-object primitives.** `createGlSampler` / `bindGlSampler` (`WebGLSampler`), decoupling sampler descriptors from texture objects. Additive. — review.md#gaps
- **Blit/copy helpers.** `copyGlRenderTarget` / `blitGlRenderTarget` (general `blitFramebuffer`, not just the MSAA resolve), `copyGlTextureToTexture`, and per-attachment clear `clearGlRenderTargetAttachment`. Additive core primitives. — review.md#gaps
- **Compressed-texture upload.** `uploadGlCompressedTexture` over `compressedTexImage2D` gated on `WEBGL_compressed_texture_*`, plus a format-enumeration query. Core GPU plumbing (not a 3D-crate concern). — review.md#gaps
- **Pixel-store / per-upload override control + dev error checking.** `setGlPixelStore`, flipY/premultiply per-upload overrides, and an opt-in `enableGlErrorChecking` dev mode wrapping draws in `gl.getError()`. Tree-shakable, off by default. — review.md#gaps
- **Generalize `updateGlTextureSubImage` beyond rgba8.** It hard-codes `gl.RGBA, gl.UNSIGNED_BYTE` and a `premultiplyAlpha` default of `true`; vary format/type and premultiply by the texture's actual `GlTextureInternalFormat` so float/r8/rg8 sub-image updates work. Within-package correctness fix. — review.md#gaps
- **Confirm tree-shaking with `npm run size`.** Verify the instrumentation / texture / pipeline additions drop out of a minimal bitmap example (claimed-unverified in the status doc). The bundle invariant gate. — review.md#gaps
- **Close the colocated-test gaps.** Add `*.test.ts` for `glRenderTargetPool` and cover `clearGlRenderTarget`, `drawGlFullscreenPass`, `resolveGlRenderTarget`, and the `glShaderBinding` material-shader getters (pre-existing `exports:check`-intent holes). — review.md#contract-fit
- **Retire the `internal.ts` cast in `createGlRenderState`.** Replace the `(state as { canvas })` / `(state as { gl })` writes with proper runtime slots, per the codebase rule that the `internal.ts` cast is legacy and not to be extended (the roadmap's Bronze cleanup that did not land). Within-package refactor. — review.md#contract-fit, roadmap Bronze

## Backlog

Parked: each needs cross-package coordination, a blessed design decision, or sits outside this port's TS scope. Not sweep-safe.

- **Context-loss "signals" → real `@flighthq/signals` or honest listener-list rename.** `enableGlContextLossSignals` installs plain callback arrays in `@flighthq/types/GlContextLoss.ts`; the name promises signals but render-gl imports `@flighthq/signals` nowhere. Parked because the resolution is a fork: depend on `@flighthq/signals` (priority/cancellation/`Signal<T>`) vs. rename to a callback-list API. The single clearest contract resolution — routed to **Open directions**. — review.md#contract-fit
- **`GlTextureInternalFormat` casing.** Lowercase string union (`'rgba8'`, `'srgb8_alpha8'`) against the PascalCase `*Kind` siblings. Parked because it renames an exported `@flighthq/types` name (cross-package ripple) and the review itself notes it is "arguably exempt" as a `*Format` — a naming judgment, not a sweep. — review.md#contract-fit
- **Scissor/stencil clip primitive promotion (fork A).** Move `pushGlScissorClip` / `pushGlStencilClip` / pop into render-gl (the runtime type already reserves `scissorStack`/`clipForms`/`currentMaskDepth`/ `currentScissorRect`). Parked: cross-package — removes ownership from `displayobject-gl` and changes its callsites. Routed to **Open directions**. — review.md#candidate-open-directions
- **Context-loss recreation contract (`GlRecreatable`).** Detection/signals exist; the registry that walks resource owners on `webglcontextrestored` does not. Parked: requires deciding whether the contract is render-gl-internal or a shared seam leaf packages self-register into (cross-package). Routed to **Open directions**. — review.md#gaps, review.md#candidate-open-directions
- **sRGB / color-space policy.** `srgb8_alpha8` is mapped but `getGlCapabilities` hard-codes `supportsSrgb: true` with no render-target sRGB path. Parked: must be settled jointly with `render-wgpu` and the Rust "sRGB pass-through" conformance decision — a unilateral choice breaks cross-backend and Rust↔TS conformance. Routed to **Open directions**. — review.md#gaps, review.md#candidate-open-directions
- **Non-separable blend modes / `registerGlBlendModeShader` (fork B).** The closed `BlendMode → blendFunc` map degrades Multiply/Screen/etc. to normal. Parked: the registry-vs-closed-switch fork plus a whose-responsibility decision (render-gl core vs. leaf shader). Routed to **Open directions**. — review.md#candidate-open-directions
- **Rust `flighthq-render-gl` parity for this pass's additions.** Mirror the new texture/pipeline/ instrumentation surface in the Rust crate and record any intentional TS↔Rust divergence. Parked: larger, spans the port and the conformance divergence map. — review.md#gaps, roadmap Gold

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._
