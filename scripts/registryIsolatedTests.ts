// The test files that CANNOT SHARE A MODULE REGISTRY, and therefore run isolated.
//
// The unit suite runs `isolate: false` by default — one shared module registry per worker, which is a
// large speedup because per-file environment setup dominates its cost. Some files cannot live there.
//
// `mocks-modules` — a top-level `vi.mock` registers for the whole worker rather than the file, so it
//   leaks into every later file importing that module. Most files that formerly needed this have been
//   migrated to `vi.spyOn` on namespace imports, and process-global registries have been given
//   `clear*` contract APIs so tests can bracket their empty-registry assertions with restore.
// `process-global-registry` — the file asserts something about PROCESS state that no contract API can
//   provide: an import-time invariant (importing the module must not register anything). That claim
//   requires a process whose module graph has not yet loaded the subject.

export type RegistryIsolationReason = 'mocks-modules' | 'process-global-registry';

export interface RegistryIsolatedTest {
  path: string;
  reason: RegistryIsolationReason;
}

export const REGISTRY_ISOLATED_TESTS: readonly RegistryIsolatedTest[] = [
  // Asserts that importing @flighthq/shape registers nothing — the side-effect-free-import guarantee
  // that `registerDefaultShapeBoundsCommands` exists as an explicit entry point to protect. This is
  // an import-time invariant: in a shared worker the module is already loaded, so the assertion is
  // vacuously decided by file scheduling rather than by the code.
  { path: 'packages/shape/src/registerDefaultShapeBoundsCommands.test.ts', reason: 'process-global-registry' },
];

/** Every isolated path, in the form the Vitest project globs consume. */
export const REGISTRY_ISOLATED_TEST_FILES: readonly string[] = REGISTRY_ISOLATED_TESTS.map((t) => t.path);
