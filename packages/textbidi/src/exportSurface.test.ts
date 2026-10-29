import * as contractApi from './contract.ts';
import * as publicApi from './index.ts';

const PUBLIC_EXPORTS = [
  'compactBidiClassKernel',
  'disableTextBidiGuards',
  'enableTextBidiGuards',
  'explainBidiClassKernel',
  'getBidiRuns',
  'reorderBidiLine',
  'resolveBidiLevels',
] as const;

const CONTRACT_EXPORTS = [
  'compactBidiClassKernel',
  'createCompactBidiClassKernel',
  'disableTextBidiGuards',
  'enableTextBidiGuards',
  'explainBidiClassKernel',
  'getBidiRuns',
  'initializeCompactBidiClassKernel',
  'reorderBidiLine',
  'reportTextBidiCompactTableMiss',
  'resolveBidiLevels',
  'setTextBidiGuard',
] as const;

describe('textbidi export surface', () => {
  it('publishes exactly the Rust-authoritative contract and package-root values', () => {
    expect(Object.keys(contractApi).sort()).toEqual(CONTRACT_EXPORTS);
    expect(Object.keys(publicApi).sort()).toEqual(PUBLIC_EXPORTS);
  });

  it('re-exports each package-root value from the contract without a second implementation', () => {
    expect(publicApi.compactBidiClassKernel).toBe(contractApi.compactBidiClassKernel);
    expect(publicApi.disableTextBidiGuards).toBe(contractApi.disableTextBidiGuards);
    expect(publicApi.enableTextBidiGuards).toBe(contractApi.enableTextBidiGuards);
    expect(publicApi.explainBidiClassKernel).toBe(contractApi.explainBidiClassKernel);
    expect(publicApi.getBidiRuns).toBe(contractApi.getBidiRuns);
    expect(publicApi.reorderBidiLine).toBe(contractApi.reorderBidiLine);
    expect(publicApi.resolveBidiLevels).toBe(contractApi.resolveBidiLevels);
  });
});
