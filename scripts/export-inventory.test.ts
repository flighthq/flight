import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';

import { collectEntryPointInventory } from './export-inventory';

describe('collectEntryPointInventory', () => {
  it('preserves aliases and runtime-value provenance through barrels', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/source.ts', 'export const runtimeValue = 1; export interface Shape {}');
    const contract = project.createSourceFile(
      '/contract.ts',
      "export { runtimeValue as renamedValue, type Shape } from './source';",
    );
    const index = project.createSourceFile('/index.ts', "export * from './contract';");

    const inventory = collectEntryPointInventory(index);
    expect([...inventory.names]).toEqual(['renamedValue', 'Shape']);
    expect([...inventory.valueNames]).toEqual(['renamedValue']);
  });

  it('does not resolve an export-type alias through to its underlying const', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/source.ts', 'export const callable = () => true;');
    const contract = project.createSourceFile('/contract.ts', "export type { callable } from './source';");
    const index = project.createSourceFile('/index.ts', "export * from './contract';");

    const inventory = collectEntryPointInventory(index);
    expect(inventory.names.has('callable')).toBe(true);
    expect(inventory.valueNames.has('callable')).toBe(false);
  });

  it('treats export-type stars as type-only even when the source declaration is a value', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/source.ts', 'export const callable = () => true;');
    const index = project.createSourceFile('/index.ts', "export type * from './source';");

    expect(collectEntryPointInventory(index).valueNames).toEqual(new Set());
  });

  it('does not treat an empty named export as an export star', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/source.ts', 'export const hidden = 1;');
    const index = project.createSourceFile('/index.ts', "export {} from './source';");

    expect(collectEntryPointInventory(index).valueNames).toEqual(new Set());
  });
});
