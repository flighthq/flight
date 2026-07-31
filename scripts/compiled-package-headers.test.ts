// oxlint-disable no-restricted-imports -- This regression must prove the generated identity survives the SDK barrel.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Node2DTraitsKey as sdkNode2DTraitsKey } from '@flighthq/sdk';
import type { Node2D as SdkNode2D } from '@flighthq/sdk';
import { Node2DTraitsKey as publicNode2DTraitsKey } from '@flighthq/types';
import type { Node2D as PublicNode2D } from '@flighthq/types';
import { Node2DTraitsKey as contractNode2DTraitsKey } from '@flighthq/types/contract';
import type { Node2D as ContractNode2D } from '@flighthq/types/contract';
import { SourceMapGenerator } from 'source-map-js';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  declarationExportNames,
  flattenDeclarations,
  makeNamespaceMergeTreeShakeable,
  namedReexport,
} from './compiled-package-headers';

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

  it('builds a deterministic named view with one outgoing edge', () => {
    const names = declarationExportNames(
      'export interface Zebra {}\nexport const Alpha = 1;\nexport namespace Alpha {}\ninterface Hidden {}\n',
    );

    expect(names).toEqual(['Alpha', 'Zebra']);
    expect(namedReexport(names, './contract', 'index.d.ts.map')).toBe(
      "export {\n  Alpha,\n  Zebra,\n} from './contract';\n//# sourceMappingURL=index.d.ts.map\n",
    );
  });
});

describe('compiled package header identity', () => {
  it('shares checker brands and runtime symbols across public, contract, and SDK lanes', () => {
    expectTypeOf<PublicNode2D>().toEqualTypeOf<ContractNode2D>();
    expectTypeOf<PublicNode2D>().toEqualTypeOf<SdkNode2D>();
    expect(publicNode2DTraitsKey).toBe(contractNode2DTraitsKey);
    expect(publicNode2DTraitsKey).toBe(sdkNode2DTraitsKey);
  });

  it('keeps contract-only symbols out of the public view', () => {
    const publicHeader = readFileSync('packages/types/dist/index.d.ts', 'utf8');
    const contractHeader = readFileSync('packages/types/dist/contract.d.ts', 'utf8');

    expect(publicHeader).toContain('  Material,');
    expect(publicHeader).not.toContain('  RenderProxy,');
    expect(contractHeader).toContain('export interface RenderProxy extends Entity');
  });
});
