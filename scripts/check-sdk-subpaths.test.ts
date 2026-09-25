import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
  checkSdkSubpaths,
  createEmptySdkSubpathReport,
  formatSdkSubpathReport,
  readSdkPackageNames,
} from './check-sdk-subpaths.ts';

describe('checkSdkSubpaths', () => {
  it('accepts a package that has both a one-line barrel and a matching exports entry', () => {
    const root = fakeSdk({ barrels: { collision: "export * from '@flighthq/collision';\n" }, packages: ['collision'] });
    expect(checkSdkSubpaths(root).defects).toEqual([]);
    expect(checkSdkSubpaths(root).packages).toEqual(['collision']);
  });

  it('reports a package whose barrel file was never created', () => {
    const root = fakeSdk({ barrels: {}, packages: ['collision'] });
    const defects = checkSdkSubpaths(root).defects;
    expect(defects.map((defect) => defect.kind)).toEqual(['barrel-missing']);
    expect(defects[0].name).toBe('collision');
  });

  it('reports a barrel that re-exports something other than its own package', () => {
    // The whole point of the derived barrel: a hand-edit that widens it back into a domain grouping
    // reintroduces exactly the drift this replaced.
    const root = fakeSdk({
      barrels: { collision: "export * from '@flighthq/collision';\nexport * from '@flighthq/spatial';\n" },
      packages: ['collision'],
    });
    expect(checkSdkSubpaths(root).defects.map((defect) => defect.kind)).toEqual(['barrel-content']);
  });

  it('reports an exports entry that points at the wrong dist files', () => {
    const root = fakeSdk({
      barrels: { collision: "export * from '@flighthq/collision';\n" },
      exports: { './collision': { default: './dist/game.js', types: './dist/game.d.ts' } },
      packages: ['collision'],
    });
    expect(checkSdkSubpaths(root).defects.map((defect) => defect.kind)).toEqual(['exports-entry']);
  });

  it('reports an exports entry left behind for a package the root no longer re-exports', () => {
    const root = fakeSdk({
      barrels: { collision: "export * from '@flighthq/collision';\n" },
      exports: { './game': { default: './dist/game.js', types: './dist/game.d.ts' } },
      packages: ['collision'],
    });
    const defects = checkSdkSubpaths(root).defects;
    expect(defects.map((defect) => defect.kind)).toEqual(['exports-orphan']);
    expect(defects[0].name).toBe('game');
  });

  it('never treats the root and contract lanes as orphaned per-package subpaths', () => {
    const root = fakeSdk({ barrels: { collision: "export * from '@flighthq/collision';\n" }, packages: ['collision'] });
    expect(checkSdkSubpaths(root).defects).toEqual([]);
  });
});

describe('createEmptySdkSubpathReport', () => {
  it('reports no packages and no defects', () => {
    expect(createEmptySdkSubpathReport()).toEqual({ defects: [], packages: [] });
  });
});

describe('formatSdkSubpathReport', () => {
  it('states the package count on a clean run', () => {
    const text = formatSdkSubpathReport({ defects: [], packages: ['collision', 'spatial'] });
    expect(text).toContain('2 packages re-exported');
    expect(text).toContain('0 defects');
  });

  it('names every defect when the gate fails', () => {
    const text = formatSdkSubpathReport({
      defects: [{ detail: 'src/collision.ts does not exist', kind: 'barrel-missing', name: 'collision' }],
      packages: ['collision'],
    });
    expect(text).toContain('barrel-missing collision');
  });
});

describe('readSdkPackageNames', () => {
  it('reads every re-export past a leading byte order mark', () => {
    // index.ts carries a BOM. A regex anchored at ^ silently skips the first line when it is left in,
    // which produces a smaller, entirely plausible package count rather than an error.
    const root = mkdtempSync(resolve(tmpdir(), 'sdk-subpaths-'));
    const path = resolve(root, 'index.ts');
    writeFileSync(path, "﻿export * from '@flighthq/accessibility';\nexport * from '@flighthq/collision';\n");
    expect(readSdkPackageNames(path)).toEqual(['accessibility', 'collision']);
    rmSync(root, { force: true, recursive: true });
  });

  it('throws rather than under-report when a re-export line does not parse', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'sdk-subpaths-'));
    const path = resolve(root, 'index.ts');
    writeFileSync(path, "export * from '@flighthq/collision';\nexport * from '@flighthq/Not_A_Package';\n");
    expect(() => readSdkPackageNames(path)).toThrow(/parsed 1 SDK re-exports but index\.ts declares 2/u);
    rmSync(root, { force: true, recursive: true });
  });
});

function fakeSdk(options: {
  barrels: Record<string, string>;
  exports?: Record<string, { default: string; types: string }>;
  packages: readonly string[];
}): string {
  const root = mkdtempSync(resolve(tmpdir(), 'sdk-subpaths-'));
  mkdirSync(resolve(root, 'src'));
  writeFileSync(
    resolve(root, 'src/index.ts'),
    options.packages.map((name) => `export * from '@flighthq/${name}';`).join('\n') + '\n',
  );
  for (const [name, text] of Object.entries(options.barrels)) writeFileSync(resolve(root, `src/${name}.ts`), text);
  const exportsField: Record<string, unknown> = {
    '.': { default: './dist/index.js', types: './dist/index.d.ts' },
    './contract': { default: './dist/contract.js', types: './dist/contract.d.ts' },
  };
  for (const name of options.packages) {
    exportsField[`./${name}`] = { default: `./dist/${name}.js`, types: `./dist/${name}.d.ts` };
  }
  Object.assign(exportsField, options.exports ?? {});
  writeFileSync(resolve(root, 'package.json'), JSON.stringify({ exports: exportsField, name: '@flighthq/sdk' }));
  return root;
}
