# render-wgpu status

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered lost source for `@flighthq/render-wgpu` by merging gitignored `dist/*.js` (impl + verbatim comments) with `dist/*.d.ts` (types) and `dist/*.test.js` (tests), the validated camera pattern.

### Recovered

- **wgpuScissor.ts** — `applyWgpuScissorRect`, `popWgpuScissorRect`, `pushWgpuScissorRect`. Pixel-space scissor stack over the existing `WgpuRenderState` runtime slots `scissorStack` / `currentScissorRect`; uses `WgpuScissorRect` (already present in `@flighthq/types`, `WgpuRenderState.ts`). Tests recovered (3 describe blocks, 7 its).
- **wgpuShaderRegistry.ts** — `registerWgpuBitmapShader`. Sets the state-wide default bitmap shader via the existing `defaultBitmapShader` runtime slot; uses `WgpuBitmapShader` (already present in `@flighthq/types`). Tests recovered (1 describe block, 2 its).

Added `export * from './wgpuScissor'` and `export * from './wgpuShaderRegistry'` to `src/index.ts`, keeping it alphabetized.

### Fossils skipped

None. All six dist-only modules are genuine functionality; none implement a dropped/deprecated concept.

### Parked

These dist-only modules are real work but depend on types/runtime slots NOT present in `packages/types/src/` (the hard boundary forbids editing `@flighthq/types`):

- **wgpuAdapterCapabilities** — needs type `WgpuAdapterCapabilities` in `@flighthq/types` (the `getWgpuAdapterCapabilities` return type; no `WgpuAdapterCapabilities.ts` and no definition exists).
- **wgpuFullscreenPass** — needs type `WgpuFullscreenPipeline` in `@flighthq/types` (return/param of `createWgpuFullscreenPipeline` / `drawWgpuFullscreenPass`; not defined anywhere).
- **wgpuRenderStateSignals** — needs type `WgpuRenderStateSignals` in `@flighthq/types` AND a `wgpuRenderStateSignals` runtime slot on `WgpuRenderState`; neither exists.
- **wgpuTimestampQuery** — needs runtime slots on `WgpuRenderState` in `@flighthq/types` (`timestampEnabled`, `timestampQuerySet`, `timestampResolveBuffer`, `timestampReadbackBuffer`, `lastFrameGpuTimeNs`); none are present. (No new named type, but the slot additions are still a `@flighthq/types` edit.)

All four are recoverable verbatim once the corresponding type/slot additions land in `@flighthq/types` under a separate task.

### Test result

`npm run test --workspace=packages/render-wgpu` — 12 files passed, 81 tests passed.

## 2026-06-25 — builder R2-4 second-pass recovery

Re-checked the four modules parked in the first pass now that the parallel type-recovery pass restored several `Wgpu*` types into `@flighthq/types`. Present now: `WgpuAdapterCapabilities.ts`, `WgpuFullscreenPipeline.ts`, `WgpuRenderStateSignals.ts`. Two of the four are recoverable; two remain parked on missing runtime slots.

### Recovered

- **wgpuAdapterCapabilities** (`getWgpuAdapterCapabilities`) + colocated test. Imports `WgpuAdapterCapabilities` (now present). Self-contained: reads a `GPUAdapter` and returns the caps record. Added `export * from './wgpuAdapterCapabilities'` to `src/index.ts` (alphabetized, first line).
- **wgpuFullscreenPass** (`createWgpuFullscreenPipeline`, `destroyWgpuFullscreenPipeline`, `drawWgpuFullscreenPass`) + colocated test. Imports `WgpuFullscreenPipeline` (now present); only touches existing runtime slots (`renderPass`, `linearSampler`/`nearestSampler`). The `dest`-ternary in `drawWgpuFullscreenPass` (`dest !== null ? runtime.renderPass : runtime.renderPass`) is preserved verbatim from the dist build. Added `export * from './wgpuFullscreenPass'` to `src/index.ts` (alphabetized).

### Skipped fossils

None. All remaining dist-only modules are genuine functionality.

### Parked

Still blocked on runtime-slot additions to `WgpuRenderStateRuntime` in `@flighthq/types` — outside the hard boundary (slots live on the single `WgpuRenderState.ts` interface, not per-name type files):

- **wgpuRenderStateSignals** — the `WgpuRenderStateSignals` type now exists, but the module reads/writes `runtime.wgpuRenderStateSignals`, a slot absent from `WgpuRenderStateRuntime`. Needs slot `wgpuRenderStateSignals: WgpuRenderStateSignals | undefined` added to `@flighthq/types`.
- **wgpuTimestampQuery** — reads/writes `runtime.timestampEnabled`, `timestampQuerySet`, `timestampResolveBuffer`, `timestampReadbackBuffer`, `lastFrameGpuTimeNs` — none present on `WgpuRenderStateRuntime`. (The dist `wgpuRenderState.js` also initializes these slots plus MSAA slots `sampleCount`/`msaaTexture`/`msaaView`/`msaaWidth`/`msaaHeight` and an `adapterCapabilities`/`sampleCount` option path; the live `src/wgpuRenderState.ts` is a reduced variant without them, and wiring `destroyWgpuTimestampQueryResources` into `destroyWgpuRenderState` is deferred with this module.) Needs the timestamp runtime slots added to `@flighthq/types`.

Both recover verbatim once the slot additions land in `@flighthq/types` under a types-pass task.

### Test result

`npm run test --workspace=packages/render-wgpu` — 14 files passed, 93 tests passed (up from 12 files / 81 tests). The two new colocated test files account for the +12 tests.
