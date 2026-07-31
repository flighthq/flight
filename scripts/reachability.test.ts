import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';

import type { ReachabilityAllowance } from './reachability-core';
import { auditReachability, classifyReachabilityDeclaration, collectEntryPointInventory } from './reachability-core';

describe('declared reachability', () => {
  it('resolves authoritative public and contract inventories through barrel aliases', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/packages/example/src/example.ts', 'export const originalName = 1;');
    const contract = project.createSourceFile(
      '/packages/example/src/contract.ts',
      "export { originalName, originalName as aliasName } from './example';",
    );
    const index = project.createSourceFile('/packages/example/src/index.ts', "export { aliasName } from './contract';");

    const inventory = collectEntryPointInventory(index, contract);
    expect([...inventory.publicNames]).toEqual(['aliasName']);
    expect([...inventory.contractNames]).toEqual(['originalName', 'aliasName']);
  });

  it('reports root-missing defaults with their current lane', () => {
    const { source, report } = fixture(
      `
      export const defaultExampleRunner = () => {};
      const defaultHiddenRenderer = () => {};
    `,
      ['defaultExampleRunner'],
    );

    expect(source.getVariableDeclarations().map(classifyReachabilityDeclaration)).toEqual([
      'default-runner',
      'default-renderer',
    ]);
    expect(report.violations).toMatchObject([
      { symbol: 'defaultExampleRunner', kind: 'default-runner', lane: 'contract-only' },
      { symbol: 'defaultHiddenRenderer', kind: 'default-renderer', lane: 'private' },
    ]);
  });

  it('accepts public composition points and exact reasoned internal allowances', () => {
    const allowance: ReachabilityAllowance = {
      packageName: 'example',
      symbol: 'defaultHiddenRenderer',
      source: 'packages/example/src/example.ts',
      reason: 'backend-private renderer selected only by the package adapter',
    };
    const { report } = fixture(
      `
        export const defaultExampleRunner = () => {};
        const defaultHiddenRenderer = () => {};
      `,
      [],
      ['defaultExampleRunner'],
      [allowance],
    );

    expect(report.violations).toEqual([]);
    expect(report.allowed).toMatchObject([{ symbol: 'defaultHiddenRenderer', reason: allowance.reason }]);
    expect(report.staleAllowances).toEqual([]);
  });

  it('recognizes thin per-kind registrars but excludes generic and aggregate registration', () => {
    const { source } = fixture(`
      export function registerExample(state: object, kind: string, runner: Function): void {}
      export function registerExampleBlur(state: object): void {
        registerExample(state, 'BlurKind', () => {});
      }
      export function registerExampleDefaults(state: object): void {
        registerExampleBlur(state);
        registerExampleGlow(state);
      }
      function registerExampleGlow(state: object): void {
        registerExample(state, GlowKind, () => {});
      }
    `);

    expect(
      source.getFunctions().map((declaration) => [declaration.getName(), classifyReachabilityDeclaration(declaration)]),
    ).toEqual([
      ['registerExample', null],
      ['registerExampleBlur', 'per-kind-registrar'],
      ['registerExampleDefaults', null],
      ['registerExampleGlow', 'per-kind-registrar'],
    ]);
  });

  it('reports stale allowances instead of silently retaining dead exceptions', () => {
    const allowance: ReachabilityAllowance = {
      packageName: 'example',
      symbol: 'defaultRemovedRunner',
      source: 'packages/example/src/example.ts',
      reason: 'former internal runner',
    };
    const { report } = fixture('', [], [], [allowance]);

    expect(report.staleAllowances).toEqual([allowance]);
  });
});

function fixture(
  text: string,
  contractNames: readonly string[] = [],
  publicNames: readonly string[] = [],
  allowances: readonly ReachabilityAllowance[] = [],
) {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile('/packages/example/src/example.ts', text);
  return {
    source,
    report: auditReachability({
      packageName: 'example',
      sourceFiles: [source],
      publicNames: new Set(publicNames),
      contractNames: new Set(contractNames),
      relativePath: () => 'packages/example/src/example.ts',
      allowances,
    }),
  };
}
