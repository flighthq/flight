# Filename Alignment: @flighthq/render-wgpu

**Verdict:** Backend-variant package (`-wgpu`) — every source file must (and does) carry the `wgpu` backend token prefix-first; the set is strong, with only two soft naming flags (`wgpuElement.ts`, `wgpuTestHelper.ts`).

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `src/wgpuElement.ts` | Names a generic concept (`Element`) rather than the concrete object. Holds only `createWgpuCanvasElement`; the domain is the WebGPU canvas surface element, not "elements" broadly. | `wgpuCanvasElement.ts` (or `wgpuCanvas.ts`) |
| `src/wgpuTestHelper.ts` | `Helper` is a flagged generic suffix that carries no domain. Provides `createWgpuRenderStateForTest` + `installWgpuMock` — a test-state/mock fixture. (No colocated `.test.ts` is correct: it is itself a test fixture, not a tested source file.) | `wgpuTestState.ts` or `wgpuTestMock.ts` |

## Clean

All remaining files are `wgpu`-prefixed, prefix-first, and name a real domain/object — none is named after a single function, none uses a bare or suffix-style backend token, and none uses a flagged generic (`data`/`utils`/`format`/`math`/`common`). Tests are colocated as `<source>.test.ts` and mirror their source filenames.

- `src/index.ts` — package barrel (re-export entry, exempt).
- `src/wgpuBackground.ts` (+ `.test.ts`) — frame background clear/draw.
- `src/wgpuDraw.ts` (+ `.test.ts`) — quad draw, texture binding/upload, blend application.
- `src/wgpuMaterialRegistry.ts` (+ `.test.ts`) — material renderer registry.
- `src/wgpuRenderState.ts` (+ `.test.ts`) — render state lifecycle and runtime.
- `src/wgpuRenderTarget.ts` (+ `.test.ts`) — render target create/begin/end/resize.
- `src/wgpuRenderTargetPool.ts` (+ `.test.ts`) — render target acquire/release pool.
- `src/wgpuShader.ts` (+ `.test.ts`) — pipelines, bind-group/pipeline layouts, uniform writes.
- `src/wgpuShaderBinding.ts` (+ `.test.ts`) — per-node shader resolve/get/set.
- `src/wgpuSurface.ts` (+ `.test.ts`) — frame-capture readback to a `Surface`.
