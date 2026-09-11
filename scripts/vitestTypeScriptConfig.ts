import path from 'node:path';

import tsconfigPaths from 'vite-tsconfig-paths';

// Vite's esbuild transform has its own tsconfig discovery, independent of vite-tsconfig-paths. Unless
// `tsconfigRaw` is a string, Vite finds the nearest package config for every transformed TypeScript file
// and tsconfck recursively parses its project references. A wide changed-test run can therefore fan out
// across the monorepo's package configs once per worker and exhaust the process file-descriptor limit.
//
// The test projects deliberately share the root compiler settings. Supplying just the transform-relevant
// root options as raw JSON keeps that contract while preventing Vite's per-file package-config discovery;
// vite-tsconfig-paths continues to own aliases from the root project configured separately below.
export const VITEST_ESBUILD_TSCONFIG_RAW = JSON.stringify({
  compilerOptions: { target: 'ES2022', useDefineForClassFields: true },
});

export function resolveVitestTsconfigPathOptions(rootDir: string) {
  return { projects: [path.resolve(rootDir, 'tsconfig.json')], root: rootDir };
}

export function createVitestTypeScriptConfig(rootDir: string) {
  return {
    plugins: [tsconfigPaths(resolveVitestTsconfigPathOptions(rootDir))],
    esbuild: { tsconfigRaw: VITEST_ESBUILD_TSCONFIG_RAW },
  };
}
