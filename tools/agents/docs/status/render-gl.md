# render-gl status

## 2026-06-25 — builder R2-4 lost-source recovery

Compared `packages/render-gl/dist/*.js` (non-test, non-map) against `packages/render-gl/src/`. Seven dist modules had no src counterpart: `glCapabilities`, `glContextLoss`, `glExtension`, `glInstrumentation`, `glPipelineState`, `glReadback`, `glTexture`.

### Recovered

- **glReadback** — `readGlRenderTargetPixels(state, target, x, y, width, height, out)`. Reads pixels from a render target's resolve (or draw) framebuffer via `gl.readPixels`, returning false on zero-size targets or incomplete framebuffers. Recovered `glReadback.ts` (impl from `dist/glReadback.js` with types restored from `dist/glReadback.d.ts`, comments kept verbatim) and `glReadback.test.ts` (6 specs from `dist/glReadback.test.js`). Added `export * from './glReadback'` to `index.ts` (alphabetized, between glMaterialRegistry and glRenderState). Only depends on `GlRenderState` + `GlRenderTarget`, both present in `@flighthq/types`.

### Fossils skipped

None. None of the missing modules implement a deliberately-dropped/deprecated concept.

### Parked

All parked for the same class of reason: the module imports a type (or requires a runtime field) that is not present in `@flighthq/types`, and the hard boundary forbids editing that package.

- **glCapabilities** — needs type `GlCapabilities` in `@flighthq/types` (no such file/export).
- **glContextLoss** — needs type `GlContextLossSignals` in `@flighthq/types` (no such file/export).
- **glInstrumentation** — needs type `GlRenderStats` in `@flighthq/types` (no such file/export).
- **glPipelineState** — needs types `GlCullFaceKind` and `GlDepthFuncKind` in `@flighthq/types` (no such files/exports).
- **glTexture** — needs types `GlFramebufferStatusKind` and `GlTextureDescriptor` in `@flighthq/types` (no such files/exports).
- **glExtension** — imports only `GlRenderState` (present), but the impl uses `runtime.extensionCache ??= new Map()`, and `extensionCache` is not a declared field on `GlRenderStateRuntime` in `@flighthq/types`. Recovering it as-is would be a type error originating in `@flighthq/types`; parked pending an `extensionCache` field on that runtime interface.

### Test result

`npm run test --workspace=packages/render-gl`: 12 files, 165 tests, all passing (glReadback adds 1 file / 6 tests). No mechanical drift from the edits.

## 2026-06-25 — builder R2-4 second-pass recovery

Re-examined the modules parked last pass now that the parallel type-recovery pass has restored the standalone `@flighthq/types` GL types. Confirmed present and barrel-exported: `GlCapabilities`, `GlRenderStats`, `GlCullFaceKind`, `GlDepthFuncKind`, `GlFramebufferStatusKind`, `GlTextureDescriptor`, `GlTextureFilterKind`, `GlTextureWrapKind`. So the _type-import_ blockers cited last pass are resolved.

A deeper blocker remains, however, and it is shared by every missing module and function: they read/write package-private slots on `GlRenderStateRuntime` (`@flighthq/types/src/GlRenderState.ts`) that were **not** restored by the type pass. `GlRenderStateRuntime` and its `EntityRuntime`/`RenderStateRuntime` base chain carry **no index signature**, so writing an undeclared slot is a genuine type error, and the only fix is to add the fields in `@flighthq/types` — which the hard boundary forbids. Recovery via `internal.ts` is not an option: it is a pure type re-export barrel, and the dist `.js` writes the slots directly (`runtime.capabilities = …`, `runtime.extensionCache ??= …`), i.e. it was built against a `GlRenderStateRuntime` that declared them.

### Recovered

None. No module or function could be recovered cleanly without adding slots to `GlRenderStateRuntime` in `@flighthq/types`.

### Fossils skipped

None. None of the remaining missing modules/functions implement a deliberately-dropped concept (no cacheAsBitmap/scrollRect/opaqueBackground, no Loader, no Stage frameRate/quality setters, no Bitmap pixelSnapping/sourceRectangle, no displayobject lifecycle signals, no traversal wrappers). All are genuine render plumbing.

### Parked

Six missing modules and three functions-in-existing-files, all blocked on undeclared `GlRenderStateRuntime` slots in `@flighthq/types` (and one additional missing type):

- **glCapabilities** (`createGlCapabilities`, `getGlCapabilities`) — needs `GlRenderStateRuntime.capabilities?: GlCapabilities`.
- **glExtension** (`getGlExtension`, `hasGlExtension`) — needs `GlRenderStateRuntime.extensionCache?: Map<string, object | null>`.
- **glContextLoss** (`attachGlContextLossHandlers`, `detachGlContextLossHandlers`, `enableGlContextLossSignals`, `isGlContextLost`) — needs the `GlContextLossSignals` type (still absent from `@flighthq/types`) AND `GlRenderStateRuntime.contextLossSignals?: GlContextLossSignals`.
- **glInstrumentation** (`beginGlTimerQuery`, `enableGlRenderStats`, `endGlTimerQuery`, `getGlRenderStats`, `getGlTimerQueryResult`, `recordGlDrawCall`, `recordGlFramebufferBind`, `recordGlProgramSwitch`, `recordGlTextureBind`, `resetGlRenderStats`, `setGlObjectLabel`, plus the `GL_DEBUG_TYPE_*` consts) — needs `GlRenderStateRuntime.renderStats?: GlRenderStats`; also imports `getGlExtension` from the parked glExtension.
- **glPipelineState** (`setGlColorMask`, `setGlCullFace`, `setGlDepthFunc`, `setGlDepthTest`, `setGlDepthWrite`, `setGlPolygonOffset`, `setGlScissorTest`, `setGlViewport`) — needs `GlRenderStateRuntime` pipeline-cache slots (`pipelineColorMaskR/G/B/A`, `pipelineCullFace`, `pipelineDepthFunc`, `pipelineDepthTest`, `pipelineDepthWrite`, `pipelineScissorTest`, `pipelineViewportX/Y/W/H`).
- **glTexture** (`configureGlTextureSampler`, `createGlTextureFromDescriptor`, `generateGlTextureMipmaps`, `getGlRenderTargetStatus`, `updateGlTextureSubImage`) — all its imported types are present and it only writes the declared `currentTexture` slot, but it imports `getGlExtension` from the parked glExtension, so it is blocked transitively until glExtension is recoverable.
- **glShader::getGlLastShaderLog** and **glShader::tryCompileGlBitmapProgram** (functions missing from existing `src/glShader.ts`) — both touch `GlRenderStateRuntime.lastShaderLog?: string`.
- **glFullscreenPass::tryCompileGlFullscreenProgram** (function missing from existing `src/glFullscreenPass.ts`) — writes `GlRenderStateRuntime.lastShaderLog` (same slot as above).

Unblocking all of the above is a single `@flighthq/types` change: add the listed slots to `GlRenderStateRuntime` and add a `GlContextLossSignals` type. That belongs to a types-package recovery task, not render-gl.

### Test result

`npm run test --workspace=packages/render-gl`: 12 files, 165 tests, all passing. No source changes this pass, so the suite is unchanged from the first pass.
