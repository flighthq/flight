---
package: '@flighthq/render-gl'
status: solid
score: 74
updated: 2026-07-13
ingested:
  - charter.md
  - status.md
  - prior review.md (2026-06-25 merge-gate)
  - source + tests (live tree)
  - agents/render-architecture.md + render-backend-support.md
---

# render-gl — Review (live tree, full survey)

Supersedes the 2026-06-25 merge-gate review, which judged only a test-only integration delta. This is a full survey of `packages/render-gl/src/` as it stands.

## Verdict

**solid — 74/100.** What exists is a lean, coherent, honestly-documented WebGL2 2D-core — 12 barrel modules, every export covered by a mirrored `describe` block, three real consumers (`displayobject-gl`, `effects-gl`, `scene-gl`). Two things hold the score down: roughly half of the charter's "What it is" surface (capabilities/extensions, context-loss, the depth/cull/colorMask pipeline-state tier, samplers, instrumentation) does not exist in the live tree, and the render-target/pool layer carries two concrete latent bugs. The prior review's blocking defect is **resolved**: `glFullscreenPass.test.ts` now imports only `clearGlRenderTarget` / `compileGlFullscreenProgram` / `drawGlFullscreenPass` — the `tryCompileGlFullscreenProgram` / `getGlLastShaderLog` blocks are gone, and those symbols remain absent from source.

## Present capabilities

- **State/context** (`glRenderState.ts`): `createGlRenderState` (WebGL2 context, default bitmap program, static quad index + dynamic vertex buffers, premultiplied `(ONE, ONE_MINUS_SRC_ALPHA)` baseline), `createGlRenderStateRuntime`/`getGlRenderStateRuntime`, `destroyGlRenderState` (deduped program/buffer teardown with documented non-owned exclusions: shared material shaders, WeakMap texture cache), and `invalidateGlRenderStateCache` — the documented guest-renderer contract for scene-gl's raw-GL passes.
- **Targets + pool** (`glRenderTarget.ts`, `glRenderTargetPool.ts`): `createGlRenderTarget` realizes the descriptor axes — format (`rgba8`/`rgba16f`/`rgba32f`, auto-enabling `EXT_color_buffer_float`), MSAA (clamped to `MAX_SAMPLES`, renderbuffers + resolve FBO), MRT (`colorFormats` per attachment), depth (`depth-stencil` / sampled depth texture). `beginGlRenderTarget`/`endGlRenderTarget` nest via a WeakMap stack saving framebuffer/viewport/`renderTransform2D`; `resolveGlRenderTarget` per-attachment blit + a documented SwiftShader `flush`; `drawGlRenderTargetResult` composites with V-flip; `destroyGlRenderTarget`, `resizeGlRenderTarget`. The pool is a correct `acquire*`/`release*` bracket with clear-on-reuse semantics.
- **Textures** (`glDraw.ts`): `bindGlTexture` (element-keyed WeakMap cache, premultiply-on-upload with a durable rationale comment), `createGlTexture`, `updateGlTexture`. No sampler/mipmap/anisotropy layer.
- **Shader compile + registries**: `glProgram.ts` is the uniform compile/link chokepoint (`compileGlShader`/`createGlProgram`/`linkGlProgram`, with the KHR_parallel_shader_compile rationale documented); `compileGlBitmapProgram`/`createGlBitmapShader` are the custom-fragment seam; `glMaterialRegistry.ts` (`get`/`register`/`resolveGlMaterialRenderer`, `DefaultMaterialKind` fallback, unresolved = no-op never a built-in); `glShaderBinding.ts` (per-render-proxy `setGlShader` WeakMap binding, `materialBitmapShaderMap`, `resolveGlShader` precedence per-node → material-kind → default, resolver installed lazily so it tree-shakes).
- **Blend modes as an open registry** (`glDraw.ts`): `registerGlBlendMode` (per-state lazy map, last-write-wins), `registerDefaultGlBlendModes` seeding the 10-mode fixed-function set (Add, Darken=MIN, Erase, Layer, Lighten=MAX, premultiplied Multiply, None, Normal, Screen, Subtract=REVERSE_SUBTRACT), `enableGlBlendModeSupport` opt-in, `isBlendModeSupported` probe. **Fork B landed here** — the closed `DEFAULT_GL_BLEND_MODES` map the prior review described is now a registry seed. Overlay/HardLight/Difference/Invert stay unregistered by design (need a shader pass).
- **Cached state — binding form only**: `currentProgram`/`currentTexture`/`currentFramebuffer`/`currentBlendMode` elision in `useGlProgram`/`bindGlTexture`/`applyGlBlendMode`/target begin-end. This is not the depth/cull/colorMask/scissor/viewport *setter* tier the charter names.
- **Fullscreen + quad passes** (`glFullscreenPass.ts`, `glDraw.ts`): `drawGlFullscreenPass` (N inputs via `u_texture0..7`, dest-or-canvas, per-pass `setUniforms`), `compileGlFullscreenProgram`, `clearGlRenderTarget`; `drawGlQuad` immediate path + `setGlQuadMatrixFromOffset`.
- **Readback** (`glReadback.ts`): `readGlRenderTargetPixels` — sentinel-honest (`false` on incomplete FBO/empty target), Uint8/Float32 dispatch, resolve-FBO aware.
- **Context-loss: none.** No `isContextLost`/`webglcontextlost` reference anywhere in the package (or any render package).

### Defects in the present surface

- **`resizeGlRenderTarget` destroys the axes it should preserve.** It nulls `target.depthTexture`/`depthStencilRenderbuffer` and empties `target.textures` *before* computing `depth` (always `'none'`) and attachments (`target.textures.length || 1` → always 1). A resized MRT or depth target silently comes back single-attachment with no depth, and per-attachment `colorFormats` are lost. The old `resolveFramebuffer` is also never deleted while `allocateGlRenderTargetStorage` creates a new one for MSAA targets — a leak per resize. Tests cover only the single-attachment no-depth case.
- **`acquireGlRenderTarget`'s free-list match is incomplete.** It compares width/height/format/sampleCount but not `colorAttachments`/`depth`/`colorFormats`, so a pooled plain target can satisfy a depth or MRT request.

## Gaps

Vs the charter's own scope and a textbook mature GL backend core (verified absent by grep, not assumed):

- **Capability/extension introspection** — no `getGlCapabilities`/`getGlExtension`; `EXT_color_buffer_float` is fetched inline in target allocation only.
- **Context-loss detect + signal** — charter Decision 2026-07-02 blesses the minimum; nothing exists. `GlContextLoss` sits orphaned in `@flighthq/types`.
- **Pipeline-state setter tier** (cached depth test/write/func, cull, colorMask, scissor, viewport) — scene-gl instead drives raw `gl` calls and calls `invalidateGlRenderStateCache` on handback.
- **Mipmaps / anisotropy / sampler objects**; **per-bitmap smoothing** — `bindGlTexture` reads the global `state.allowSmoothing`, and the element-keyed cache makes the first draw's filter stick (render-backend-support gap #3, still true).
- **Compressed-texture upload**, **pixel-store control** (premultiply is hardcoded on), **UBO/VAO/instancing primitives** (instance-buffer *slots* live on the runtime; the ensure/upload code lives in leaves — defensible layering per the charter, but no shared primitive exists either), **general blit/copy** beyond the MSAA resolve, **timer queries / draw stats** (`GlRenderStats` orphaned in types), **sRGB** (`mapGlFormat` knows 3 formats; policy deferred jointly with wgpu/Rust), **non-separable blend shader pass**.

## Charter contradictions

- **The charter's "What it is" over-describes the tree.** It claims capability/extension introspection, context-loss detection, cached pipeline state (depth/cull/colorMask/scissor/viewport), and an opt-in instrumentation surface as owned — none exists. The charter absorbed the never-merged builder-67dc46d64 claims (see status.md 2026-06-25, which verified those modules absent). Decision 2026-07-02 "Context/device loss: detect and signal minimum" is a blessed ruling with no implementation behind it.
- Otherwise the tree **respects the boundaries well**: no per-subject draw path lives here (particle/quad-batch shader *types* are runtime slots; the code is in leaves), no Canvas/DOM concern, no 3D intrusion on the 2D path.

## Contract & docs fit

**Good:** `sideEffects: false`; single root entry; types-first (`GlRenderState`/`GlRenderStateRuntime`/`GlBlendRealization`/`GlFullscreenProgram` all in `@flighthq/types` with strong ownership comments); `Gl`-prefixed globally self-identifying names; `destroy*` used correctly for GPU resources; `acquire*`/`release*` brackets; sentinel-honest readback; opt-in `enableGlBlendModeSupport`; runtime-slot architecture throughout.

**Drift:**

1. `createGlRenderState` still writes the readonly entity fields via `(state as { canvas })` / `(state as { gl })` casts — the legacy pattern persists (retiring it means changing `canvas`/`gl` ownership or readonly-ness in `@flighthq/types`, cross-package). Meanwhile `internal.ts` is now only a vestigial type-re-export shim that no consumer can even import under single-root exports; `glShaderTypes.ts` is a similar internal alias layer over `@flighthq/types`.
2. **`glShaderRegistry.ts` is missing from the barrel** — `registerGlBitmapShader` is unreachable by consumers; its only caller is an in-package test.
3. `isBlendModeSupported` lacks the type name every sibling carries (`isGlBlendModeSupported`); no callers outside its own tests.
4. `@flighthq/displayobject` is a **prod dependency used only by `glRenderTarget.test.ts`**.
5. `glShader.ts` opens with a UTF-8 BOM.
6. `createGlRenderState` throws on a missing WebGL2 context — an expected environment failure under the sentinel rule. `compileGlShader`/`linkGlProgram` throw deliberately (documented: forces deferred compiles to finish, identifiable error); the chartered non-throwing `tryCompile*` family remains unbuilt.

**Candidate admin-doc revisions (user's gate):**

- `agents/index.md`'s render-backend-support summary line still says "blend modes (gl = Normal+Add only, wgpu = none)" — stale; `render-backend-support.md` and `glDraw.ts` both show the full fixed-function set on gl (and wgpu's own set).
- The Package Map / charter phrase "textures/samplers … cached pipeline state … context-loss" for render-gl over-claims: samplers, the pipeline-setter tier, and context-loss are absent.
- `@flighthq/types` carries **nine orphaned `Gl*` type files with zero implementations or references** outside `types` itself: `GlCapabilities`, `GlContextLoss`, `GlRenderStats`, `GlFramebufferStatusKind`, `GlTextureDescriptor` (+`GlTextureInternalFormat`), `GlTextureFilterKind`, `GlTextureWrapKind`, `GlCullFaceKind`, `GlDepthFuncKind` — header-layer dead surface left by the unmerged builder branch. Implement-or-remove needs a call.

## Candidate open directions

The charter's existing Open directions remain accurate (clip ownership fork A, recreation contract, sRGB, non-separable blends, signals-vs-callbacks, Rust parity). New from this survey:

- **Resolve the charter-vs-tree drift.** Either re-scope "What it is" to the shipped core, or bless a build-out of the missing device tier (capabilities, context-loss, pipeline setters, instrumentation) — ideally consumer-driven rather than rebuilding the unconsumed builder surface.
- **Orphaned `@flighthq/types` Gl\* files:** implement against them or remove them from the header layer.
- **Scissor ownership symmetry:** `render-wgpu` owns an in-core `wgpuScissor.ts` while gl leaves scissor/stencil clip to `displayobject-gl` (which manipulates render-gl's `scissorStack`/`clipForms` runtime slots). The backends answer fork A differently today — worth settling once, for both.
