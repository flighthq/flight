import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  auditEffectBackend,
  collectReachabilityLanes,
  defaultCompositionSymbols,
  effectReachabilitySymbols,
} from './reachability-core';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

describe('source-derived capability reachability', () => {
  it('accepts a mapped public registrar and public raw runner', () => {
    const fixture = entries(
      `
      export const defaultGlBlurEffectRunner = () => {};
      export function registerGlRenderEffect(state: object, kind: string, runner: Function): void {}
      export function registerGlBlurEffect(state: object): void {
        registerGlRenderEffect(state, 'BlurEffect', defaultGlBlurEffectRunner);
      }
    `,
      ['registerGlRenderEffect', 'registerGlBlurEffect', 'defaultGlBlurEffectRunner'],
    );

    expect(auditEffectBackend({ backend: 'gl', ...fixture })).toEqual([]);
  });

  it('rejects an unregistered passthrough runner as a false capability', () => {
    const fixture = entries('export const defaultGlTaaEffectRunner = () => {};', ['defaultGlTaaEffectRunner']);
    expect(auditEffectBackend({ backend: 'gl', ...fixture })).toMatchObject([
      { symbol: 'defaultGlTaaEffectRunner', rule: 'missing-registration' },
    ]);
  });

  it('rejects a registrar without a real runner as a false capability claim', () => {
    const fixture = entries(
      `
      export function registerGlRenderEffect(state: object, kind: string, runner: Function): void {}
      export function registerGlTaaEffect(state: object): void {
        registerGlRenderEffect(state, 'TaaEffect', defaultGlTaaEffectRunner);
      }
    `,
      ['registerGlRenderEffect', 'registerGlTaaEffect'],
    );
    expect(auditEffectBackend({ backend: 'gl', ...fixture })).toMatchObject([
      { symbol: 'registerGlTaaEffect', rule: 'missing-runner' },
    ]);
  });

  it('rejects a register declaration that maps the wrong kind', () => {
    const fixture = entries(
      `
      export const defaultGlBlurEffectRunner = () => {};
      export function registerGlRenderEffect(state: object, kind: string, runner: Function): void {}
      export function registerGlBlurEffect(state: object): void {
        registerGlRenderEffect(state, 'BloomEffect', defaultGlBlurEffectRunner);
      }
    `,
      ['registerGlRenderEffect', 'registerGlBlurEffect', 'defaultGlBlurEffectRunner'],
    );
    expect(auditEffectBackend({ backend: 'gl', ...fixture })).toMatchObject([
      { symbol: 'registerGlBlurEffect', rule: 'registration-mapping' },
    ]);
  });

  it('tracks lane placement without treating it as a hard invariant', () => {
    const fixture = entries(
      `
      export const defaultGlBitmapTextRenderer = {};
      export const defaultGlBlurEffectRunner = () => {};
      export function registerGlRenderEffect(): void {}
      export function registerGlBlurEffect(): void {}
    `,
      ['registerGlRenderEffect', 'registerGlBlurEffect'],
    );
    const symbols = new Set([
      ...effectReachabilitySymbols('gl', fixture.sourceFiles),
      ...defaultCompositionSymbols(fixture.sourceFiles),
    ]);

    expect(collectReachabilityLanes({ packageName: 'fixture', ...fixture, symbols })).toEqual([
      { packageName: 'fixture', symbol: 'defaultGlBitmapTextRenderer', dot: false, contract: true },
      { packageName: 'fixture', symbol: 'defaultGlBlurEffectRunner', dot: false, contract: true },
      { packageName: 'fixture', symbol: 'registerGlBlurEffect', dot: true, contract: true },
      { packageName: 'fixture', symbol: 'registerGlRenderEffect', dot: true, contract: true },
    ]);
  });
});

function entries(sourceText: string, publicValues: readonly string[]) {
  const directory = mkdtempSync(join(tmpdir(), 'flight-reachability-'));
  temporaryDirectories.push(directory);
  const source = join(directory, 'source.ts');
  const contractEntry = join(directory, 'contract.ts');
  const publicEntry = join(directory, 'index.ts');
  writeFileSync(source, sourceText);
  writeFileSync(contractEntry, "export * from './source';");
  writeFileSync(publicEntry, `export { ${publicValues.join(', ')} } from './contract';`);
  return { contractEntry, publicEntry, sourceFiles: [source] };
}
