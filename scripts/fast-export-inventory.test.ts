import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { collectFastEntryPointInventory } from './fast-export-inventory';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

describe('collectFastEntryPointInventory', () => {
  it('preserves aliases and runtime-value provenance through barrels', () => {
    const directory = createSources({
      'source.ts': 'export const runtimeValue = 1; export interface Shape {}',
      'contract.ts': "export { runtimeValue as renamedValue, type Shape } from './source';",
      'index.ts': "export * from './contract';",
    });

    const inventory = collectFastEntryPointInventory(join(directory, 'index.ts'));
    expect([...inventory.names]).toEqual(['renamedValue', 'Shape']);
    expect([...inventory.valueNames]).toEqual(['renamedValue']);
  });

  it('resolves local aliases and imported bindings', () => {
    const directory = createSources({
      'source.ts': 'export const runtimeValue = 1; export interface Shape {}',
      'index.ts': `
        import { runtimeValue, Shape } from './source';
        const localValue = 1;
        interface LocalShape {}
        export { localValue as value, LocalShape, runtimeValue as importedValue, Shape as ImportedShape };
      `,
    });

    const inventory = collectFastEntryPointInventory(join(directory, 'index.ts'));
    expect(inventory.names).toEqual(new Set(['value', 'LocalShape', 'importedValue', 'ImportedShape']));
    expect(inventory.valueNames).toEqual(new Set(['value', 'importedValue']));
  });

  it('keeps export-type aliases and stars type-only', () => {
    const directory = createSources({
      'source.ts': 'export const callable = () => true;',
      'contract.ts': "export type { callable } from './source';",
      'index.ts': "export type * from './contract';",
    });

    const inventory = collectFastEntryPointInventory(join(directory, 'index.ts'));
    expect(inventory.names).toEqual(new Set(['callable']));
    expect(inventory.valueNames).toEqual(new Set());
  });

  it('resolves cyclic export stars to a fixed point', () => {
    const directory = createSources({
      'a.ts': "export const a = 1; export * from './b';",
      'b.ts': "export const b = 1; export * from './a';",
    });

    const inventory = collectFastEntryPointInventory(join(directory, 'a.ts'));
    expect(inventory.names).toEqual(new Set(['a', 'b']));
    expect(inventory.valueNames).toEqual(new Set(['a', 'b']));
  });

  it('does not treat an empty named export as an export star', () => {
    const directory = createSources({
      'source.ts': 'export const hidden = 1;',
      'index.ts': "export {} from './source';",
    });

    expect(collectFastEntryPointInventory(join(directory, 'index.ts')).valueNames).toEqual(new Set());
  });
});

function createSources(sources: Readonly<Record<string, string>>): string {
  const directory = mkdtempSync(join(tmpdir(), 'flight-fast-exports-'));
  temporaryDirectories.push(directory);
  for (const [name, source] of Object.entries(sources)) writeFileSync(join(directory, name), source);
  return directory;
}
