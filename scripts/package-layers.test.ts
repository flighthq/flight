import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getPackageLayerCoverageViolations,
  getPackageLayerDependencyViolation,
  isTransitionalTypeAggregatorPackage,
} from './package-layers.ts';
import { isSdkBarrelExcludedPackage } from './sdk-policy.ts';

describe('package dependency layers', () => {
  it('rejects feature packages depending on renderer backends', () => {
    expect(getPackageLayerDependencyViolation('@flighthq/app', '@flighthq/render-gl')).toEqual({
      label: '@flighthq/render-gl obeys the feature dependency-layer rule',
      detail:
        '@flighthq/app (feature) -> @flighthq/render-gl (backend) is forbidden: feature packages may depend only on types/core primitives or feature packages',
    });
  });

  it('allows Surface and renderer backends to depend on App as a Rust-mirroring feature peer', () => {
    expect(getPackageLayerDependencyViolation('@flighthq/surface', '@flighthq/app')).toBeNull();
    expect(getPackageLayerDependencyViolation('@flighthq/scene2d-canvas', '@flighthq/app')).toBeNull();
  });

  it('allows both sibling tiers to depend on feature contracts', () => {
    expect(getPackageLayerDependencyViolation('@flighthq/app', '@flighthq/render')).toBeNull();
    expect(getPackageLayerDependencyViolation('@flighthq/render-gl', '@flighthq/render')).toBeNull();
  });

  it('classifies every workspace package exactly once', () => {
    const packagesDir = join(import.meta.dirname, '..', 'packages');
    const workspacePackageNames = readdirSync(packagesDir)
      .map((directory) => join(packagesDir, directory, 'package.json'))
      .filter((manifestPath) => existsSync(manifestPath))
      .map((manifestPath) => JSON.parse(readFileSync(manifestPath, 'utf8')) as { name: string })
      .map((manifest) => manifest.name);

    expect(getPackageLayerCoverageViolations(workspacePackageNames, isSdkBarrelExcludedPackage)).toEqual([]);
  });

  it('marks Types as a transitional type aggregator without changing its core layer', () => {
    expect(isTransitionalTypeAggregatorPackage('@flighthq/types')).toBe(true);
    expect(isTransitionalTypeAggregatorPackage('@flighthq/app')).toBe(false);
  });
});
