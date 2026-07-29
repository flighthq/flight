import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getPackageLayerCoverageViolations, getPackageLayerDependencyViolation } from './package-layers';

describe('package dependency layers', () => {
  it('rejects application packages depending on renderer backends', () => {
    expect(getPackageLayerDependencyViolation('@flighthq/application', '@flighthq/render-gl')).toEqual({
      label: '@flighthq/render-gl obeys the application dependency-layer rule',
      detail:
        '@flighthq/application (application) -> @flighthq/render-gl (backend) is forbidden: application packages may depend only on types/core primitives, features, or other application packages',
    });
  });

  it('rejects renderer backends depending on application packages', () => {
    expect(getPackageLayerDependencyViolation('@flighthq/render-gl', '@flighthq/application')).toEqual({
      label: '@flighthq/application obeys the backend dependency-layer rule',
      detail:
        '@flighthq/render-gl (backend) -> @flighthq/application (application) is forbidden: backend/renderer packages may depend only on types/core primitives, features, or other backends',
    });
  });

  it('allows both sibling tiers to depend on feature contracts', () => {
    expect(getPackageLayerDependencyViolation('@flighthq/application', '@flighthq/render')).toBeNull();
    expect(getPackageLayerDependencyViolation('@flighthq/render-gl', '@flighthq/render')).toBeNull();
  });

  it('classifies every workspace package exactly once', () => {
    const packagesDir = join(import.meta.dirname, '..', 'packages');
    const workspacePackageNames = readdirSync(packagesDir)
      .map((directory) => join(packagesDir, directory, 'package.json'))
      .filter((manifestPath) => existsSync(manifestPath))
      .map((manifestPath) => JSON.parse(readFileSync(manifestPath, 'utf8')) as { name: string })
      .map((manifest) => manifest.name);

    expect(getPackageLayerCoverageViolations(workspacePackageNames)).toEqual([]);
  });
});
