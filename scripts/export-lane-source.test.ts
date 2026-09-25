import { describe, expect, it } from 'vitest';

import { getSourcePublishedValueExports, getSourceValueExports } from './export-lane-source.ts';

describe('getSourceValueExports', () => {
  it('discovers local value aliases without exposing their private backing names', () => {
    const source = `
      const _standardResolvers = new Map();
      export { _standardResolvers as standardResolvers };
    `;

    expect(getSourceValueExports(source)).toEqual(['standardResolvers']);
  });

  it('keeps package re-exports while leaving relative re-exports to their owning module', () => {
    const source = `
      import { ExternalKind, type ExternalType } from '@flighthq/types/contract';
      import { siblingValue } from './sibling';
      export { ExternalKind as PublicKind, type ExternalType, siblingValue };
    `;

    expect(getSourceValueExports(source)).toEqual(['PublicKind']);
  });

  it('retains forwarded values in the published surface used to make wildcard exports safe', () => {
    const source = `
      import { siblingValue } from './sibling';
      export { siblingValue };
    `;
    expect(getSourcePublishedValueExports(source)).toEqual(['siblingValue']);
  });

  it('discovers declarations and ignores type-only local clauses', () => {
    const source = `
      export const preset = {};
      export function buildPreset() {}
      const local = 1;
      type Local = number;
      export { local, type Local };
    `;

    expect(getSourceValueExports(source)).toEqual(['preset', 'buildPreset', 'local']);
  });
});
