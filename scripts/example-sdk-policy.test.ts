import { describe, expect, it } from 'vitest';

import { getInvalidExampleFlightDependencies, getInvalidExampleFlightImportSpecifiers } from './example-sdk-policy';

describe('example SDK consumption policy', () => {
  it('allows the SDK root and public group subpaths', () => {
    expect(
      getInvalidExampleFlightImportSpecifiers([
        '@flighthq/sdk',
        '@flighthq/sdk/game',
        '@flighthq/sdk/rendering',
        './render',
      ]),
    ).toEqual([]);
  });

  it('rejects direct package and SDK contract-lane imports', () => {
    expect(
      getInvalidExampleFlightImportSpecifiers([
        '@flighthq/scene3d',
        '@flighthq/sdk/contract',
        '@flighthq/sdk/contract/internal',
      ]),
    ).toEqual(['@flighthq/scene3d', '@flighthq/sdk/contract', '@flighthq/sdk/contract/internal']);
  });

  it('rejects direct Flight dependencies while allowing unrelated dependencies', () => {
    expect(getInvalidExampleFlightDependencies(['@flighthq/sdk', '@flighthq/scene3d-gl', 'cross-env', 'vite'])).toEqual(
      ['@flighthq/scene3d-gl'],
    );
  });

  it('allows host-* packages as dependencies and import specifiers', () => {
    expect(
      getInvalidExampleFlightDependencies(['@flighthq/sdk', '@flighthq/host-web', '@flighthq/host-electron']),
    ).toEqual([]);
    expect(
      getInvalidExampleFlightImportSpecifiers(['@flighthq/sdk', '@flighthq/host-web', '@flighthq/host-electron']),
    ).toEqual([]);
  });
});
