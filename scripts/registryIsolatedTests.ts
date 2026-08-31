// The test files that CANNOT SHARE A MODULE REGISTRY, and therefore run isolated.
//
// The unit suite runs `isolate: false` by default — one shared module registry per worker, which is a
// large speedup because per-file environment setup dominates its cost. Some files cannot live there.
//
// `mocks-modules` — a top-level `vi.mock` registers for the whole worker rather than the file, so it
//   leaks into every later file importing that module. Most files that formerly needed this have been
//   migrated to `vi.spyOn` on namespace imports, which replaces a property on the module namespace
//   object and is restorable via `vi.restoreAllMocks()` in `afterEach`. The remaining entries are cases
//   where `vi.spyOn` cannot work: native Node.js ESM modules with non-configurable exports, or mocks
//   whose effect must precede the first import of the subject.
// `process-global-registry` — the file asserts something about PROCESS state, typically that nothing
//   has been registered yet. That claim holds only in a process nobody else has touched, so under the
//   shared tier it is decided by file scheduling rather than by the code.

export type RegistryIsolationReason = 'mocks-modules' | 'process-global-registry';

export interface RegistryIsolatedTest {
  path: string;
  reason: RegistryIsolationReason;
}

export const REGISTRY_ISOLATED_TESTS: readonly RegistryIsolatedTest[] = [
  // Mocks `node:child_process.spawnSync` — a native Node.js ESM module whose exports are
  // non-configurable, so `vi.spyOn` cannot replace them.
  { path: 'packages/tool-capture/src/captureServer.test.ts', reason: 'mocks-modules' },
  // Mocks `registerDefaultShapeBoundsCommands` to test SVG import with incomplete bounds. The mock
  // must be in place before the subject's first import, and the test also depends on the process-global
  // shape bounds registry being empty — both require isolation.
  { path: 'packages/scene2d-formats/src/svgDocumentIncompleteBounds.test.ts', reason: 'mocks-modules' },
  // Asserts that importing @flighthq/shape registers nothing — the side-effect-free-import guarantee
  // that `registerDefaultShapeBoundsCommands` exists as an explicit entry point to protect. The
  // registry is process-global with no reset, so "nothing is registered" can only be asserted in a
  // process nobody else has touched.
  { path: 'packages/shape/src/registerDefaultShapeBoundsCommands.test.ts', reason: 'process-global-registry' },
  // Asserts that the collision support registry is empty before registration — verifying the
  // explain-collision diagnostic for the state a caller who forgot to register is in. The registry is
  // process-global with no reset, so the empty claim requires an untouched process.
  { path: 'packages/physics3d/src/explainPhysics3DCollision.test.ts', reason: 'process-global-registry' },
];

/** Every isolated path, in the form the Vitest project globs consume. */
export const REGISTRY_ISOLATED_TEST_FILES: readonly string[] = REGISTRY_ISOLATED_TESTS.map((t) => t.path);
