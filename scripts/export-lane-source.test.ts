import { describe, expect, it } from 'vitest';

import {
  getGeneratedExportLane,
  getSourcePublishedValueExports,
  getSourceValueExports,
  isTestSupportSource,
} from './export-lane-source.ts';

describe('isTestSupportSource', () => {
  it('identifies helper modules by their direct Vitest dependency rather than an export manifest name', () => {
    expect(isTestSupportSource("import { expect } from 'vitest';\nexport const rustTestSupport = {};\n")).toBe(true);
    expect(isTestSupportSource("import { value } from './value.ts';\nexport { value };\n")).toBe(false);
  });
});

describe('getGeneratedExportLane', () => {
  it('derives public, protected, and excluded names from generated Rust barrels', () => {
    const contractNames = new Set(['attachEntityWrapper', 'Entity', 'finishEntity']);
    const publicNames = new Set(['Entity', 'finishEntity']);

    expect(getGeneratedExportLane('Entity', contractNames, publicNames)).toBe('public');
    expect(getGeneratedExportLane('attachEntityWrapper', contractNames, publicNames)).toBe('protected');
    expect(getGeneratedExportLane('readEntityRuntime', contractNames, publicNames)).toBe('exclude');
  });
});

describe('getSourceValueExports', () => {
  it('owns exported classes as runtime values', () => {
    const source = `
export class Entity {}
class LocalWrapper {}
export { LocalWrapper };
`;

    expect(getSourceValueExports(source)).toEqual(['Entity', 'LocalWrapper']);
    expect(getSourcePublishedValueExports(source)).toEqual(['Entity', 'LocalWrapper']);
  });

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
