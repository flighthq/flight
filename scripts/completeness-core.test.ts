import { describe, expect, it } from 'vitest';

import { getFunctionExports } from './completeness-core';

describe('getFunctionExports', () => {
  it('collects exported declarations initialized with functions', () => {
    expect(
      getFunctionExports(
        'source.ts',
        `
          export function declared() {}
          export async function asyncDeclared() {}
          export const arrow = () => true;
          export const expression = function () {};
          export const value = 1;
        `,
      ),
    ).toEqual(['arrow', 'asyncDeclared', 'declared', 'expression']);
  });

  it('collects local aliases but ignores imported and forwarded functions', () => {
    expect(
      getFunctionExports(
        'source.ts',
        `
          import { imported } from './imported';
          const local = () => true;
          export { local as alias, imported };
          export { forwarded } from './forwarded';
        `,
      ),
    ).toEqual(['alias']);
  });

  it('collects callable default exports', () => {
    expect(getFunctionExports('source.ts', 'export default function named() {}')).toEqual(['default']);
    expect(getFunctionExports('source.ts', 'const local = () => true; export default local;')).toEqual(['default']);
    expect(getFunctionExports('source.ts', 'export default 1;')).toEqual([]);
  });

  it('deduplicates overload declarations', () => {
    expect(
      getFunctionExports(
        'source.ts',
        `
          export function overloaded(value: string): string;
          export function overloaded(value: number): number;
          export function overloaded(value: string | number): string | number { return value; }
        `,
      ),
    ).toEqual(['overloaded']);
  });
});
