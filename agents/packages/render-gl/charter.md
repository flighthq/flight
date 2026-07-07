---
package: '@flighthq/render-gl'
crate: flighthq-render-gl
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# render-gl — Charter


## What it is

`@flighthq/render-gl` is the **WebGL2 backend core** — the subject-agnostic GPU plumbing layer in the `<subject>-<backend>` render layering. It owns the device/context tier: render state and the GL context handle, render targets (MSAA / MRT / HDR / depth-stencil) and their pool, textures and samplers, shader compilation and the material/shader registries, cached pipeline state (depth, cull, color mask, scissor, viewport), fullscreen passes, the immediate quad path, GPU readback, capability/extension introspection, context-loss detection, and an opt-in instrumentation surface.

It sits **above** raw `WebGL2RenderingContext` and **below** the per-subject leaf renderers. The backend-agnostic `@flighthq/render` core (registration, render queue, update pipeline, draw contracts) is its peer abstraction; `displayobject-gl` (and a future `scene-gl`) are its consumers — the leaf renderers that draw bitmaps, shapes, sprites, text, and tilemaps over this core's primitives. The line: render-gl is where leaf renderers stop reaching into `gl` directly and call a `Gl`-prefixed core function instead. Anything subject-specific (instanced batch layout, particle sim upload, per-glyph text shaping) belongs in a leaf, not here.

## North star

_Proposed, not blessed. Inferred from the design + the structural forks; confirm or revise in review._

- **The single GL chokepoint.** No leaf renderer should touch `WebGL2RenderingContext` directly. Every device operation — state changes, target binds, texture allocation, capability queries, extension resolution — has a `Gl`-prefixed core function, so the GL surface is owned in exactly one place and leaves depend on intent, not raw constants.
- **Subject-agnostic plumbing.** This core knows about the GPU device, not about what is drawn on it. It mirrors three.js `WebGLState`/`WebGLTextures`, PixiJS systems, and the bgfx device tier — primitives that any subject composes, never a per-subject draw path.
- **Cached, redundancy-eliding state.** Pipeline setters elide redundant GL calls via runtime cache fields; the device tier is the place where "don't re-set what's already set" lives, so leaves get cheap state changes for free.
- **Types-first, sentinel-honest, tree-shakable.** Cross-package types land in `@flighthq/types` before use; expected failures return sentinels (`null` + log, `false`, `-1`) rather than throw; opt-in surfaces (instrumentation, signals) stay out of a minimal bitmap bundle.
- **A faithful peer to `render-wgpu` and the Rust `flighthq-render-gl`.** Color convention, sRGB policy, and the present/draw seam stay aligned across backends and across the TS↔Rust port — a unilateral GL-only choice that breaks cross-backend or conformance parity is a regression.

## Boundaries

_Proposed, not blessed. Drawn from the review and neighboring packages; confirm in review._

In scope:

- Render state + context handle, render targets + pool, textures/samplers, shader compile + material/shader registries, cached pipeline state, fullscreen passes, immediate quad, GPU readback, capabilities/extensions, context-loss detection, opt-in instrumentation.
- The device primitives leaves build on: (candidate) UBO / sampler-object helpers, blit/copy, compressed-texture upload, pixel-store control — the GPU plumbing tier, regardless of which subject consumes it.

Non-goals:

- **Per-subject draw paths.** Instanced batch layout, particle upload, tilemap/text leaf shaders — these live in `displayobject-gl` / `scene-gl`, not here.
- **A Canvas2D or DOM renderer.** Different substrate; not this package's concern.
- **3D-specific intrusion on the 2D path.** Per the 2D/3D additivity fork, any 3D device support must not move a 2D example's bundle-size baseline.

## Decisions

- **2026-07-02 — Canvas-raster fallback accepted; GPU options long-term.**
- **2026-07-02 — No umbrella registerAll — maximum tree-shaking.**
- **2026-07-02 — Context/device loss: detect and signal minimum.**
- **2026-07-02 — TS-leads, Rust conforms later.**

## Open directions

Every question below comes from `review.md` (Candidate open directions + Contract drifts) or from a structural fork that touches this package. These are the real uncertainties — an agent asks here rather than assuming.

- **Is "backend core" the blessed scope?** Confirm that "state + targets + shaders + draw + fullscreen + device primitives" is the charter and that leaf concerns (instanced batch, particles, per-subject shaders) are out-of-scope-by-design — so "missing UBO/instancing draw" reads as correct layering, not a gap.
- **Context-loss signals: real `Signal<T>` or plain listener list? (contract drift)** As shipped, `enableGlContextLossSignals` installs plain callback arrays, not `@flighthq/signals`, despite the `enable*Signals` name. The SDK rule says a multi-listener, `enable*Signals`-gated event should use the signals package. Decide: depend on `@flighthq/signals` for this, or rename to a callback-list API. This is the single clearest contract resolution needed.
- **Stats hot-path wiring.** `recordGl*` counters are exported and tested but called by nothing — `getGlRenderStats` reports all-zero during real draws. Confirm the `recordGl*` calls should be added to `drawGlQuad`/`bindGlTexture`/`useGlProgram`/`beginGlRenderTarget` so the instrumentation surface does what its name promises.
- **Clip primitive ownership (fork A — cross-package).** The runtime type reserves `scissorStack` / `clipForms` / `currentMaskDepth` / `currentScissorRect`, but the `pushGlScissorClip` / `pushGlStencilClip` / pop primitives live in `displayobject-gl`. Promote them into render-gl (backend-core layering), or leave the GL clip state in the leaf? Touches `displayobject-gl` call sites — a real decision, not a sweep.
- **Context-loss recreation contract (cross-package).** Detection/signals exist but no `GlRecreatable` registry walks resource owners on `webglcontextrestored`; a lost-then-restored context has no path back. Is `GlRecreatable` render-gl-internal, or a shared seam that leaf packages self-register into (so `registerGlRecreatable` is exported)?
- **sRGB / color-space policy (cross-backend).** `getGlCapabilities` hard-codes `supportsSrgb: true` and `GlTextureInternalFormat` includes `srgb8_alpha8`, but there is no render-target sRGB path and no documented stance against the Rust "sRGB pass-through" conformance decision. Must be settled jointly with `render-wgpu` and the Rust port before `srgb8_alpha8` is a usable render-target format.
- **Non-separable blend modes (fork B — registry vs closed switch).** The current closed `BlendMode → blendFunc` map degrades non-separable modes (Multiply/Screen/etc.) to Normal. Is shader-based blending (`registerGlBlendModeShader`) render-gl's responsibility or the leaf's, and should the closed map flip to a registry as the family grows?
- **Wasm mixing (fork D).** render-gl is a stateful graph/device crate, expected all-or-nothing for the wasm `-rs` mixing seam (not a value-typed mixable leaf). Confirm this — it bounds what the Rust `flighthq-render-gl` is expected to support as a standalone drop-in.
- **`internal.ts` cast (contract drift, minor).** `createGlRenderState` still does `(state as { canvas })` / `(state as { gl })`. The codebase rule flags the `internal.ts` cast as legacy not to extend; the runtime-slot refactor the roadmap called for did not happen. Migrate to runtime slots, or accept?
- **`GlTextureInternalFormat` casing (minor).** It is a lowercase string union (`'rgba8'`, `'srgb8_alpha8'`) while sibling GL discriminants (`GlTextureWrapKind`, `GlCullFaceKind`, `GlDepthFuncKind`) are PascalCase `*Kind`. Named `*Format` not `*Kind`, so arguably exempt — but inconsistent with every other GL discriminant added this pass. Align casing, or bless the exemption?
- **Test-coverage gaps (pre-existing).** `glRenderTargetPool.ts` has no colocated test; `clearGlRenderTarget`, `drawGlFullscreenPass`, `resolveGlRenderTarget`, and the `glShaderBinding` material-shader getters are uncovered. Within-package sweep work once scope is confirmed.
- **Rust `flighthq-render-gl` parity.** This pass's additions (instrumentation, texture/pipeline primitives, capabilities/extensions) are not yet ported. Confirm the conformance expectation.
