// The test files that mock modules, and therefore run isolated.
//
// The unit suite runs `isolate: false` by default — one shared module registry per worker, which is a
// large speedup because per-file environment setup dominates its cost. A file that mocks a module
// cannot live there safely: a top-level `vi.mock` registers for the whole worker rather than the file,
// so it leaks into every later file importing that module.
//
// These files used to buy per-file hermeticity by hand, calling `vi.resetModules()` and dynamically
// re-importing the subject inside `beforeAll`. That works, but it rebuilds the subject's entire
// transitive graph on every run — unbounded work inside a fixed hook deadline, which is wrong on any
// machine slow enough or any cache cold enough, and produced a flake four agents chased. Running them
// with `isolate: true` gets the same hermeticity from the platform, with no hook and no deadline.
//
// This list is the single source of truth: `vitest.config.ts` builds the two projects from it, and
// `npm run mocks:check` verifies it against reality in both directions — a module-mocking file missing
// from it, or a listed file that no longer mocks, is a reported violation. It is checked, not
// remembered.
export const ISOLATED_MOCK_TEST_FILES: readonly string[] = [
  'packages/application-gl/src/glApplicationRenderView.test.ts',
  'packages/effects-canvas/src/canvasDropShadowEffect.test.ts',
  'packages/effects-canvas/src/canvasOuterGlowEffect.test.ts',
  'packages/effects-gl/src/glContactShadowsEffect.test.ts',
  'packages/effects-gl/src/glDropShadowEffect.test.ts',
  'packages/effects-gl/src/glEffectBoxBlur.test.ts',
  'packages/effects-gl/src/glInnerGlowEffect.test.ts',
  'packages/effects-gl/src/glInnerShadowEffect.test.ts',
  'packages/effects-gl/src/glOuterGlowEffect.test.ts',
  'packages/effects-wgpu/src/wgpuContactShadowsEffect.test.ts',
  'packages/effects-wgpu/src/wgpuDropShadowEffect.test.ts',
  'packages/effects-wgpu/src/wgpuEffectBoxBlur.test.ts',
  'packages/effects-wgpu/src/wgpuEffectTintShader.test.ts',
  'packages/effects-wgpu/src/wgpuInnerGlowEffect.test.ts',
  'packages/effects-wgpu/src/wgpuInnerShadowEffect.test.ts',
  'packages/effects-wgpu/src/wgpuOuterGlowEffect.test.ts',
  'packages/scene2d-gl/src/glCache.test.ts',
  'packages/scene2d-gl/src/glMeshShapeRenderer.test.ts',
  'packages/scene2d-gl/src/glRasterShapeRenderer.test.ts',
  'packages/scene2d-gl/src/glShape.test.ts',
  'packages/scene2d-gl/src/glTextLabel.test.ts',
  'packages/scene2d-formats/src/svgDocumentIncompleteBounds.test.ts',
  'packages/scene2d-wgpu/src/wgpuCache.test.ts',
  'packages/scene2d-wgpu/src/wgpuMeshShapeRenderer.test.ts',
  'packages/scene2d-wgpu/src/wgpuRasterShapeRenderer.test.ts',
  'packages/scene2d-wgpu/src/wgpuShape.test.ts',
  'packages/scene2d-wgpu/src/wgpuTextLabel.test.ts',
  'packages/scene3d-resources/src/awd2Load.test.ts',
  'packages/scene3d-resources/src/gltfLoad.test.ts',
  'packages/scene3d-resources/src/imageResourceFetch.test.ts',
  'packages/scene3d-resources/src/md2Load.test.ts',
  'packages/scene3d-resources/src/md5Load.test.ts',
  'packages/scene3d-resources/src/objLoad.test.ts',
  'packages/scene3d-resources/src/resolveScene3DResources.test.ts',
  'packages/scene3d-resources/src/threeDsLoad.test.ts',
  'packages/tool-capture/src/captureServer.test.ts',
];
