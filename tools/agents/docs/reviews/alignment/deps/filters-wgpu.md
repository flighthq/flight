# Dependency Alignment: @flighthq/filters-wgpu

**Verdict:** Clean — deps are minimal, correct, and well-typed; the only judgment item is a backend-bound pipeline type that crosses into `effects-wgpu` (defensible as package-local).

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Info | `WgpuFilterPipeline` / `WgpuDualSourcePipeline` (exported from `wgpuFilterPass.ts`) | These exported types cross a package boundary — `effects-wgpu` imports `WgpuFilterPipeline` (`wgpuEffectProgramCache.ts`) and `WgpuDualSourcePipeline` (`wgpuMotionBlurEffect.ts`, `wgpuBloomEffect.ts`). The convention says cross-package types belong in `@flighthq/types`. Counter-argument: both are pure WebGPU-substrate types (`GPURenderPipeline`, `GPUTextureFormat` maps) tightly bound to the `createWgpu*Pipeline` functions that produce them, and `@flighthq/types` is meant to stay implementation-free (it must not depend on `@webgpu/types` runtime semantics). Keeping them next to their constructors is reasonable. | No action required; if a header-layer pass standardizes backend pipeline contracts, lift these alongside the `Gl` equivalents. Verify the `filters-gl` sibling makes the same call to stay symmetric. |
| Info | `@flighthq/render-wgpu` runtime edge (`getWgpuRenderStateRuntime`, plus test-helper `createWgpuRenderStateForTest`/`installWgpuMock`/`renderWgpuBackground`) | Backend leaf → its render core. Correct layering direction; `render-wgpu` does **not** depend back on `filters-wgpu`, so no cycle. Surfaced only to confirm the one runtime (non-type) external edge is sound. | None. |

## Declared vs used

**Unused declared deps:** none. All three runtime deps are used:

- `@flighthq/types` — type-only, imported with `import type` in every source file (no runtime weight).
- `@flighthq/render-wgpu` — runtime value import (`getWgpuRenderStateRuntime` in `wgpuFilterPass.ts`; test-helper symbols in `wgpuTestHelper.ts`).
- `@flighthq/filters` — runtime value import (`computeBoxBlurPassRadius` in `wgpuBlurFilter.ts`), reusing the CPU/data filter core rather than reimplementing.

**Phantom (used-but-undeclared) deps:** none. Every external module imported in `src/` is declared.

**devDeps:** `@webgpu/types` is justified (`GPU*` ambient types used across `wgpuFilterPass.ts`, `wgpuGradientRamp.ts`, etc.); `typescript` standard. Unlike the `filters-gl` sibling, `@flighthq/surface` is correctly **absent** — no source or test imports it.

**Other hygiene (all pass):**

- No import of `@flighthq/sdk` (the barrel).
- All `@flighthq/*` workspace deps pinned `"*"`.
- `"sideEffects": false`; single root `.` export, no per-file subpaths.
- `npm run packages:check` passes (86 packages valid).
- Dependency mapping reads cleanly: a WebGPU filter backend depending on `types` (header) + `render-wgpu` (its core) + `filters` (shared data/math) is exactly what its role predicts. No surprising edges.
