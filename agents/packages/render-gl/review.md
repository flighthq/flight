---
package: '@flighthq/render-gl'
status: solid
score: 80
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
  - tests
  - types surface
---

# render-gl -- Review

## Verdict

**Solid -- 80/100.** The package is the WebGL2 backend core the charter describes: render-state
ownership, render-target creation/resize/resolve/destroy with MSAA/MRT/depth, nested render-pass
brackets, fullscreen passes, subject-agnostic present, texture upload and binding, GPU readback,
shader/program compilation, material and blend registries, render-texture pools, external texture
handles, a push/pop host-state bracket, and a cache-invalidation handoff for raw-GL consumers. The
diagnostics surface (three `enable*Guards`, two `explain*` queries) satisfies the inversion rule. All
30 source files have colocated test files; test-to-source ratio is 1.6:1 overall. The export surface
is clean: two blessed lanes (`.` and `./contract`), `sideEffects: false`, no exported types (all in
`@flighthq/types`), no inline type imports, no `@flighthq/sdk` imports. Intra-SDK imports uniformly
resolve to `@flighthq/x/contract`.

The score was 74 at first full review and was bumped to 87 in the 2026-08-25 fast assessment. This
full re-review brings it to 80: the fixed-function state sweep (2026-08-31) closed real defects that
the prior score did not know about, two phantom dependencies remain, one `as unknown as` cast lacks
its required constraint comment, module-level mutable state persists in two files against the
explicit-dependency model, seven orphaned header types in `@flighthq/types` still advertise
capabilities this package does not implement, and two structural gaps (HDR tone-mapping, context-loss
recreation) are unchanged.

## Present capabilities

Each item was verified against source in `packages/render-gl/src/` on 2026-09-02.

- **Render state and context tier.** `createGlContextState` allocates shared per-context GPU state
  (quad buffers, five per-policy texture caches, binding mirrors, ref-counted teardown list).
  `createGlRenderState` and `createGlOffscreenRenderState` produce independent policy snapshots
  sharing the underlying context state. `destroyGlRenderState` is ref-counted and idempotent,
  freeing programs and buffers only when the last reference drops. `invalidateGlRenderStateCache`
  clears cached bindings for raw-GL consumers. (`glRenderState.ts`)
- **Pipeline and registries.** `createGlPipeline` wraps an immutable `GlRenderRegistries` (16
  keyed/slot tables covering blend modes, renderers, effects, materials, mesh materials, PBR
  extensions, compressed textures, texture resolvers, velocity writers, and more) into an Entity.
  Registries are created empty by `createEmptyGlRegistries` and populated via per-domain
  `register*` functions. (`glPipeline.ts`)
- **Render targets.** `createGlRenderTarget` accepts a `RenderTargetDescriptor` with format
  negotiation (required/preferred policy via `resolveGlRenderTargetAxes`), MSAA sample count, MRT
  attachments with per-attachment formats, depth/depth-texture, clear values, and color-space tag.
  `resizeGlRenderTarget` preserves all axes including heterogeneous color formats.
  `resolveGlRenderTarget` performs MSAA blit. `destroyGlRenderTarget` frees all GL resources.
  `explainGlRenderTarget` returns requested-vs-effective axes as plain data.
  `isGlRenderTargetFormatSupported` queries float-format capability. (`glRenderTarget.ts`)
- **Render-target pool.** Acquire/release bracket with full-axis matching (dimensions, primary and
  per-attachment formats, attachment count, sample count, depth mode, color space).
  (`glRenderTargetPool.ts`)
- **Render passes.** `beginGlRenderPass` / `endGlRenderPass` implement a nested bracket that saves
  enclosing state, clears aspects not preserved, constrains viewport/scissor, and restores on end.
  Accepts a `Viewport` for partial-target rendering. `setGlRenderTransform2D` sets the 2D root
  device transform. (`glRenderPass.ts`)
- **Host-state bracket.** `pushGlRenderState` / `popGlRenderState` / `withGlRenderState` save and
  restore the full fixed-function GL state: blend (per-channel), stencil (per-face, via
  `Separate` calls), depth test/mask/func, cull face/mode/front-face, scissor, viewport,
  framebuffer, program, VAO, 14 texture units, active texture, color mask, clear color, and
  `UNPACK_PREMULTIPLY_ALPHA_WEBGL`. The per-face stencil restore is a deliberate fix for two-sided
  stencil hosts. (`glRenderStateBracket.ts`)
- **Fullscreen passes.** `drawGlFullscreenPass` draws a clip-space quad through a fragment shader,
  reading N input textures. It owns blend/depth/cull state (save, set, draw, restore), uses a
  dedicated VAO to avoid cross-contamination, and unbinds sampled inputs afterward to prevent
  framebuffer feedback. `clearGlRenderTarget` clears a target to transparent.
  `compileGlFullscreenProgram` compiles vertex+fragment with texture uniform resolution.
  (`glFullscreenPass.ts`)
- **Present.** `presentGlRenderTarget` dispatches linear content through a linear-to-sRGB encode
  pass and sRGB content through a copy pass. Both programs are lazily compiled and cached per
  context. (`glPresentRenderTarget.ts`, `glLinearToSrgbPass.ts`)
- **Draw primitives.** `drawGlQuad` uploads and draws a textured quad. `useGlProgram` binds a
  shader with redundancy elision and an optional binding-cache guard. `bindGlTexture`,
  `bindGlBitmapTexture`, `bindGlImageResourceTexture`, `bindGlCompressedImageTexture`,
  `bindGlVideoTexture`, `bindGlTextureRealization` cover the full texture-source taxonomy.
  `applyGlSamplerState` configures wrap, filter, anisotropy, and mip chain. `createGlTexture`
  allocates. `updateGlTexture` re-uploads a canvas. (`glDraw.ts`)
- **Blend modes.** Open registry via `registerGlBlendMode` with `standardGlBlendRealizations`
  pre-built table. `enableGlBlendModeSupport` installs defaults and sets `applyBlendMode` on the
  state. Six fixed-function blend modes; non-separable modes degrade to Normal (documented as a
  known limitation requiring shader-based blending). (`glDraw.ts`)
- **Shader/program compilation.** `compileGlShader`, `createGlProgram`, `linkGlProgram` with error
  reporting. Shaders are deleted after linking. (`glProgram.ts`)
- **Bitmap shaders.** `compileGlBitmapProgram`, `createGlBitmapShader`, `ensureDefaultGlBitmapShader`
  with per-draw `onBind` callback. `setGlAttributes`, `setGlBaseUniforms`,
  `setGlMatrixFromTransform`. (`glShader.ts`)
- **Shader bindings.** Per-node, per-material-kind, and default shader resolution chain via
  `setGlShader`, `registerGlMaterialShader`, `resolveGlShader`. (`glShaderBinding.ts`,
  `glShaderRegistry.ts`)
- **Material registry.** `registerGlMaterialRenderer` / `resolveGlMaterialRenderer` with
  kind-based lookup and `StandardMaterialKind` fallback. Open registry pattern. (`glMaterialRegistry.ts`)
- **Render textures.** `renderIntoGlRenderTexture` clears and populates a render texture's hidden
  target within push/pop + begin/end brackets. `bindGlRenderTexture` binds a completed texture for
  reading; returns null with guard notification for unready textures. `writeGlRenderTextureTarget`
  exposes the backing target for direct writing with atomic publish on success. Status tracking
  (unrendered/writing/ready/released). `explainGlRenderTexture` returns diagnostic data.
  (`glRenderTexture.ts`)
- **Render-texture pool.** `acquireGlRenderTexture` / `releaseGlRenderTexture` /
  `withGlRenderTextures` (exception-safe N-texture bracket). (`glRenderTexturePool.ts`)
- **Compressed textures.** `uploadGlCompressedTextureContainer` with native and RGBA-decode
  fallback paths. `detectGlCompressedTextureSupport` probes supported families.
  `registerGlCompressedTextureDecoder` / `registerGlCompressedTextureUpload` for opt-in seams.
  Rejects volumes and cubemap arrays before issuing GL calls. (`glCompressedTexture.ts`)
- **External textures.** `createExternalGlTexture` wraps a caller-owned `WebGLTexture` in the
  texture resolver system. `disposeExternalGlTexture` releases from cache without deleting the
  handle. Correctly uses `dispose*` naming. (`glExternalTexture.ts`)
- **Texture resolver system.** `registerGlTextureResolver` / `resolveGlTexture` dispatch by source
  kind. `registerStandardGlTextureResolvers` installs bitmap, image, and render-texture resolvers.
  `standardGlTextureResolvers` pre-built table. (`glTextureResolver.ts`)
- **GPU readback.** `readGlRenderTargetPixels` reads into a provided `out` buffer with framebuffer
  restore on early return. (`glReadback.ts`)
- **Skin palette texture.** `createGlSkinPaletteTexture` / `uploadGlSkinPaletteTexture` /
  `destroyGlSkinPaletteTexture` for joint-matrix data textures. (`glSkinPaletteTexture.ts`)
- **Canvas element factory.** `createGlCanvasElement` / `createGlRenderSurface` /
  `explainGlRenderSurfaceAbsence` with pluggable provider. (`glElement.ts`)
- **Context creation.** `createGlContextFromCanvasElement` wraps `canvas.getContext('webgl2')`.
  (`glContext.ts`)
- **Background.** `renderGlBackground` clears with sRGB-to-linear conversion for linear targets.
  (`glBackground.ts`)
- **Diagnostics.** `enableGlRenderStateGuards` (multiple-root and foreign-GL-binding warnings),
  `enableGlRenderTextureGuards` (unready-texture warnings), `enableGlTextureResolverGuards`
  (missing-resolver warnings). Each is opt-in, uses `logOnce` from `@flighthq/log`, and fills a
  seam exposed by the core module. `explainGlTextureResolution` returns plain data for the texture
  resolver sentinel. All have `are*GuardsEnabled` companion queries and tested idempotency.

## Gaps

Each item was verified against source on 2026-09-02.

- **Phantom dependencies.** `@flighthq/signals` and `@flighthq/scene2d` are declared in
  `package.json` dependencies but never imported by any source file. Both should be removed.
- **Seven orphaned header types in `@flighthq/types`.** `GlCapabilities`, `GlContextLoss`,
  `GlCullFaceKind`, `GlDepthFuncKind`, `GlFramebufferStatusKind`, `GlRenderStats`, and
  `GlTextureDescriptor` (carrying `GlTextureInternalFormat`) are defined in `packages/types/src/`
  with zero references from any package in the monorepo. They advertise capabilities -- capability
  introspection, context-loss detection, pipeline-state enums, draw-call instrumentation -- that
  do not exist. Either the implementations land or the headers are removed.
- **No context-loss detection or recreation.** No `enableGlContextLossSignals`, no
  `GlRecreatable` registry, no `webglcontextrestored` handler. A lost-then-restored context has no
  recovery path. The charter names this as an open direction; no progress has been made.
- **No instrumentation surface.** `recordGlDrawCall`, `getGlRenderStats`, and the `GlRenderStats`
  type exist only as orphaned headers. No draw-call, texture-bind, or program-use counters are
  wired into the actual draw path. The charter calls this out; it remains unaddressed.
- **No capability/extension introspection.** `getGlCapabilities` does not exist.
  `detectGlCompressedTextureSupport` covers compressed formats only.
  `isGlRenderTargetFormatSupported` covers float targets only. There is no unified capability
  table, no extension resolution cache, and no `supportsSrgb` or max-texture-size query outside
  of ad-hoc inline checks.
- **No UBO, sampler-object, blit/copy, or pixel-store helpers.** These charter-scoped device
  primitives are absent across all of `packages/`.
- **Compressed upload limited to 2D.** `uploadGlCompressedTextureContainer` rejects volumes and
  cubemap arrays before issuing any GL call (`glCompressedTexture.ts:242-245`). The RGBA decode
  fallback covers plain 2D only. These shapes need distinct entity and binder families.
- **HDR present is transfer-only.** Linear `rgba16f` content receives only the sRGB OETF on
  present. Values above display white clamp at the canvas. No tone-mapping, exposure, or display
  transform exists in the common path. This is a depth gap, not a defect.
- **Color space is a binary tag.** No primaries, white point, display transfer, or gamut metadata.
- **`GL_RENDER_STATE_TEXTURE_UNIT_COUNT = 14` is a fragile cross-package constant.** The host-state
  bracket must save every texture unit any Flight GL path binds, but the highest unit (12-13 for
  skin palettes) is defined in `scene3d-gl`, which depends on this package and not the reverse.
  Adding a unit above 13 anywhere without updating this constant silently leaks that texture
  binding to the host.

## Charter contradictions

- **Context-loss signals: the charter's `enableGlContextLossSignals` does not exist, and the
  decision between `@flighthq/signals` and a callback-list API remains unresolved.** The package
  declares `@flighthq/signals` as a dependency but never imports it, which means the dependency
  was added in anticipation of this feature and never used. The charter names this as "the single
  clearest contract resolution needed."
- **Stats hot-path wiring: the charter asks whether `recordGl*` calls should be added to the draw
  path.** They cannot be added because the `recordGl*` functions do not exist. The `GlRenderStats`
  type is an orphaned header.
- **The `internal.ts` cast pattern is narrower than the charter suggests.** The charter describes
  `(state as { canvas })` / `(state as { gl })` at `glRenderState.ts:61-62` and `:108-109`. The
  current source uses `Object.assign(state, { contextState, gl, pipeline })` at line 80 instead
  -- this is not an `as { ... }` cast but a runtime property injection, which also bypasses the
  type system. The `as { ... }` casts the charter names are gone; the `Object.assign` is the
  remaining internal.ts-style pattern.
- **Clip primitive ownership is unchanged.** The charter asks whether `pushGlScissorClip` /
  `pushGlStencilClip` should be promoted into render-gl. The runtime reserves `scissorStack` and
  `clipForms` (initialized in `glRenderState.ts:105-106`), but the push/pop operations remain in
  `scene2d-gl`. This is a boundary decision, not a defect.

## Contract and docs fit

- **Export lanes.** Correct: `.` (index.ts) re-exports a curated subset; `./contract` (contract.ts)
  re-exports all source modules. No other subpaths. Intra-SDK imports use `@flighthq/x/contract`
  uniformly.
- **`sideEffects: false`.** Declared and substantively correct. One edge: `glDraw.ts` builds the
  `standardGlBlendRealizations` table at module top level with a `let` + `for` loop, which is
  strictly import-time work. It produces a constant result and has no observable side effects
  beyond allocation, but it is the closest thing to a top-level side effect in the package.
- **No exported types.** All types live in `@flighthq/types`. Zero `export type`, `export interface`,
  or `export enum` declarations in render-gl source. Correct.
- **No inline type imports.** No `import { type Foo, bar }` anywhere. All type imports use separate
  `import type { }` statements. Correct.
- **No `@flighthq/sdk` imports.** Correct.
- **Naming conventions.** Exported functions use the full, unabbreviated type name in their
  identifiers (`createGlRenderTarget`, `destroyGlRenderState`, `bindGlBitmapTexture`). Accessor
  functions use `get*`, booleans use `is*`/`has*`/`are*`. `dispose*` vs `destroy*` is correctly
  applied (`disposeExternalGlTexture` releases from cache; `destroyGlRenderTarget` frees GPU
  resources).
- **`Readonly<T>` usage.** Generally good on texture, render-target, and render-texture files.
  Inconsistent on shader files: `glShader.ts` parameters (`loc`, `renderProxy`), `glShaderBinding.ts`
  (`renderProxy`), `glMaterialRegistry.ts` (`material`) omit `Readonly` on read-only parameters.
- **`as unknown as` cast.** One instance in `glTextureVideoUpload.ts:28` lacks the required
  constraint comment per AGENTS.md. `HTMLVideoElement` implements `TexImageSource` in standard
  typings, so the double cast may be unnecessary.
- **Module-level mutable state.** `glElement.ts` has a `let _provider` singleton that
  `setGlRenderSurfaceProvider` writes and `createGlCanvasElement` reads implicitly -- the
  `set*Backend` pattern AGENTS.md explicitly prohibits. `glShaderBinding.ts` has `_shaderBindings`
  at the top of the file rather than after exports per source-style rules.
- **Source ordering.** Module-level constants and mutable state are correctly at the bottom of files
  in most cases. Exceptions: `glElement.ts` (`_provider` at line 3) and `glShaderBinding.ts`
  (`_shaderBindings` at line 13).
- **No transient notes in code.** Zero `TODO`, `FIXME`, `HACK`, or `REVISIT` comments in source.
  Work-in-progress items are in `status.md` where they belong.
- **Test coverage.** All 30 source files have colocated `.test.ts` files. Total: ~4,334 lines source,
  ~7,026 lines test (1.6:1 ratio). Key files have strong ratios: `glRenderState` 3.5:1,
  `glRenderStateBracket` 2.2:1, `glDraw` 1.7:1, `glFullscreenPass` 1.7:1.

## Candidate open directions

These are not defects or contradictions -- they are the package's natural next-depth work, ordered
by priority. Each references the charter or status open item it relates to.

1. **Resolve or remove the seven orphaned header types.** The headers were written for capabilities
   that were never implemented. They read as promises to every consumer scanning `@flighthq/types`.
   Either implement the feature or delete the type.
2. **Remove phantom dependencies** (`@flighthq/signals`, `@flighthq/scene2d`). Neither is imported.
3. **Decide the context-loss signal API.** The charter names this the single clearest contract
   resolution needed. Either depend on `@flighthq/signals` for a real `enableGlContextLossSignals`,
   or rename to a callback-list API and drop the dependency.
4. **Wire instrumentation counters or remove the instrumentation surface.** `GlRenderStats` exists
   only as a header. If instrumentation is desired, the `recordGl*` functions and their call sites
   in the draw path must be created; otherwise the type should be removed.
5. **Introduce a pass-scoped state bracket.** The status documents a structural weakness: multiple
   passes (velocity, IBL bake, fullscreen, 3D draw) each hand-roll their own subset of
   save/restore, and each subset covers a different slice of fixed-function state. A shared
   pass-scoped bracket would make the contract explicit and prevent the class of leak the sweep
   found.
6. **Close fullscreen-present resource ownership.** Linear-to-sRGB and copy programs plus fullscreen
   VAOs are stored in module-level WeakMaps. `destroyGlRenderState` cannot enumerate or free them.
   The context teardown list (`registerGlContextTeardown`) provides the seam; these caches need
   teardown registrations.
7. **Migrate `glElement.ts` away from the singleton provider.** The `_provider` module variable is a
   `set*Backend` singleton. The explicit-dependency model asks for the provider to be a value the
   caller passes, not a module-level mutable that functions reach for implicitly.
8. **Clip primitive boundary decision.** The runtime initializes `scissorStack` and `clipForms` here;
   the push/pop operations live in `scene2d-gl`. Promoting the GL clip primitives into render-gl
   is cleaner layering and has been an open question since the charter.
9. **`glDraw.ts` decomposition.** At 640 lines with 17 exports spanning blend modes, texture
   binding, quad drawing, and program binding, it bundles more concerns than the composition
   principle recommends. Blend-mode registration, texture binding, and quad drawing are candidates
   for extraction.
