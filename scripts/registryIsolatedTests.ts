// The test files that CANNOT SHARE A MODULE REGISTRY, and therefore run isolated.
//
// The unit suite runs `isolate: false` by default — one shared module registry per worker, which is a
// large speedup because per-file environment setup dominates its cost. Some files cannot live there.
//
// ★ THE LIST IS KEYED BY MECHANISM, NOT BY CAUSE, AND THAT DISTINCTION IS THE POINT. What every entry
// buys is a private module registry; `reason` records WHY that file needs one. It was once called
// ISOLATED_MOCK_TEST_FILES because mocking was the only reason anyone had needed — a name that encodes
// the first instance of a category as the category, and so was accurate exactly once. When a second
// reason appeared, a test asserting the empty pre-state of a process-global registry was briefly
// carried as an allow-listed escape against the old contract. ★ AN ESCAPE THAT DISSOLVES UNDER A
// CORRECT RENAME WAS NEVER AN ESCAPE — IT WAS A NAME REPORTING A MISCLASSIFICATION.
//
// `mocks-modules` — a top-level `vi.mock` registers for the whole worker rather than the file, so it
//   leaks into every later file importing that module. These files used to buy per-file hermeticity by
//   hand with `vi.resetModules()` plus a dynamic re-import inside `beforeAll`, which rebuilds the
//   subject's entire transitive graph on every run: unbounded work inside a fixed hook deadline, wrong
//   on any machine slow enough, and the source of a flake four agents chased. `isolate: true` buys the
//   same hermeticity from the platform, with no hook and no deadline.
// `process-global-registry` — the file asserts something about PROCESS state, typically that nothing
//   has been registered yet. That claim holds only in a process nobody else has touched, so under the
//   shared tier it is decided by file scheduling rather than by the code.
//
// ★ THE TWO REASONS ARE CHECKED TO DIFFERENT DEPTHS, DELIBERATELY. `npm run mocks:check` verifies
// `mocks-modules` entries in both directions — a module-mocking file missing from this list, or a
// `mocks-modules` entry that no longer mocks, is a reported violation. A `process-global-registry`
// entry is accepted on its declared reason, because there is no honest pattern for "asserts process
// state" and a detector that guessed would be worse than the claim. ITS ENFORCEMENT IS REVIEW, NOT A
// REGEX, AND THAT IS A CHOICE RATHER THAN AN OVERSIGHT — do not "fix" it by inventing a detector.

export type RegistryIsolationReason = 'mocks-modules' | 'process-global-registry';

export interface RegistryIsolatedTest {
  path: string;
  reason: RegistryIsolationReason;
}

export const REGISTRY_ISOLATED_TESTS: readonly RegistryIsolatedTest[] = [
  { path: 'packages/application-gl/src/glApplicationRenderView.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-canvas/src/canvasDropShadowEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-canvas/src/canvasOuterGlowEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glBevelEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glChromaticAberrationEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glContactShadowsEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glConvolutionEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glCrtEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glDirectionalBlurEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glDropShadowEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glEffectBoxBlur.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glEffectTintShader.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glGlitchEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glGodRaysEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glInnerGlowEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glInnerShadowEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glLensDirtEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glLensFlareEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glMotionBlurEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glOuterGlowEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glRadialBlurEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glScreenSpaceFogEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-gl/src/glTiltShiftEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-wgpu/src/wgpuContactShadowsEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-wgpu/src/wgpuDropShadowEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-wgpu/src/wgpuEffectBoxBlur.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-wgpu/src/wgpuEffectTintShader.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-wgpu/src/wgpuInnerGlowEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-wgpu/src/wgpuInnerShadowEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-wgpu/src/wgpuLensDirtEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/effects-wgpu/src/wgpuOuterGlowEffect.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene2d-formats/src/svgDocumentIncompleteBounds.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene2d-gl/src/glCache.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene2d-gl/src/glMeshShapeRenderer.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene2d-gl/src/glRasterShapeRenderer.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene2d-gl/src/glShape.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene2d-gl/src/glTextLabel.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene2d-wgpu/src/wgpuCache.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene2d-wgpu/src/wgpuMeshShapeRenderer.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene2d-wgpu/src/wgpuRasterShapeRenderer.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene2d-wgpu/src/wgpuShape.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene2d-wgpu/src/wgpuTextLabel.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene3d-resources/src/awd2Load.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene3d-resources/src/gltfLoad.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene3d-resources/src/imageResourceFetch.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene3d-resources/src/md2Load.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene3d-resources/src/md5Load.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene3d-resources/src/objLoad.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene3d-resources/src/resolveScene3DResources.test.ts', reason: 'mocks-modules' },
  { path: 'packages/scene3d-resources/src/threeDsLoad.test.ts', reason: 'mocks-modules' },
  { path: 'packages/tool-capture/src/captureServer.test.ts', reason: 'mocks-modules' },
  // Asserts that importing @flighthq/shape registers nothing — the side-effect-free-import guarantee
  // that `registerDefaultShapeBoundsCommands` exists as an explicit entry point to protect. It failed
  // and then passed across two whole-repo runs whose only difference was a markdown edit, because the
  // shared tier let file scheduling decide it.
  { path: 'packages/shape/src/registerDefaultShapeBoundsCommands.test.ts', reason: 'process-global-registry' },
];

/** Every isolated path, in the form the Vitest project globs consume. */
export const REGISTRY_ISOLATED_TEST_FILES: readonly string[] = REGISTRY_ISOLATED_TESTS.map((t) => t.path);
