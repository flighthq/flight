import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SourceMapGenerator } from 'source-map-js';
import { describe, expect, it } from 'vitest';

import { flattenDeclarations, makeNamespaceMergeTreeShakeable } from './compiled-package-headers';

function writeDeclaration(directory: string, name: string, source: string): void {
  const file = join(directory, `${name}.d.ts`);
  writeFileSync(file, source);
  const map = new SourceMapGenerator({ file: `${name}.d.ts` });
  source.split('\n').forEach((line, index) => {
    const column = Math.max(0, line.indexOf('interface'));
    map.addMapping({
      generated: { line: index + 1, column },
      original: { line: index + 1, column },
      source: `../src/${name}.ts`,
    });
  });
  writeFileSync(`${file}.map`, map.toString());
}

describe('compiled package declaration headers', () => {
  it('inlines public exports and keeps transitive contract-only dependencies private', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flight-headers-'));
    writeDeclaration(directory, 'index', "export * from './Public';\n");
    writeDeclaration(
      directory,
      'Public',
      "import type { Hidden } from './Hidden';\nexport interface Public { hidden: Hidden }\n",
    );
    writeDeclaration(directory, 'Hidden', 'export interface Hidden { value: number }\n');

    const result = flattenDeclarations(directory, 'index');

    expect(result.code).toContain('export interface Public');
    expect(result.code).toContain('interface Hidden');
    expect(result.code).not.toContain('export interface Hidden');
    expect(result.code).not.toMatch(/(?:import|export).*from/);
    expect(JSON.parse(result.map).sources).toEqual(['../src/Public.ts', '../src/Hidden.ts']);
  });

  it('makes a merged enum namespace one removable initializer', () => {
    const input = [
      'const Other = 1;',
      'var AppearanceFlags = /* @__PURE__ */ ((AppearanceFlags2) => {',
      '  initialize(AppearanceFlags2);',
      '})(AppearanceFlags || {});',
      '((AppearanceFlags2) => {',
      '  augment(AppearanceFlags2);',
      '})(AppearanceFlags || (AppearanceFlags = {}));',
      'export { AppearanceFlags, Other };',
    ].join('\n');

    const result = makeNamespaceMergeTreeShakeable(input);

    expect(result.code).toContain('var AppearanceFlags = /* @__PURE__ */ (() => {');
    expect(result.code).toContain('const AppearanceFlags2 = {};');
    expect(result.code).toContain('return AppearanceFlags2;');
    expect(result.code).toContain('export { AppearanceFlags, Other };');
  });
});
