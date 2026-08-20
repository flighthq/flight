import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  compareReferenceImage,
  LEGACY_EXACT_COMPARISON_POLICY_ID,
  parseReferenceImageToleranceCatalog,
  readReferenceImageToleranceCatalog,
  referenceImageComparisonPasses,
  resolveReferenceImageTolerance,
  writeReferenceImageSceneTolerance,
} from './reference-image-tolerance';

const SCENE = 'functional/text-basic';
const POLICY_ID = 'registered-per-scene-policy-test';
const OVERRIDE = {
  channelTolerance: 2,
  gateOnMaxChannelDelta: true,
  maxChannelDelta: 16,
  maxFraction: 0.25,
  reason: 'Measured renderer noise on the text coverage family.',
};

describe('reference-image tolerance catalog', () => {
  it('resolves an absent scene to exact comparison', () => {
    const result = parseReferenceImageToleranceCatalog(manifest(POLICY_ID, {}), POLICY_ID, new Set([SCENE]));
    if ('problems' in result) throw new Error(JSON.stringify(result.problems));

    expect(resolveReferenceImageTolerance(result.catalog, `${SCENE}/canvas`)).toEqual({
      channelTolerance: 0,
      comparisonPolicyId: POLICY_ID,
      gateOnMaxChannelDelta: true,
      maxChannelDelta: 0,
      maxFraction: 0,
      overridden: false,
      reason: null,
      scene: SCENE,
    });
  });

  it('resolves one declaration for every renderer in the scene', () => {
    const result = parseReferenceImageToleranceCatalog(
      manifest(POLICY_ID, { [SCENE]: OVERRIDE }),
      POLICY_ID,
      new Set([SCENE]),
    );
    if ('problems' in result) throw new Error(JSON.stringify(result.problems));

    expect(resolveReferenceImageTolerance(result.catalog, `${SCENE}/canvas`)).toMatchObject(OVERRIDE);
    expect(resolveReferenceImageTolerance(result.catalog, `${SCENE}/webgpu`)).toMatchObject(OVERRIDE);
  });

  it.each([
    ['unknown top-level field', { ...manifest(POLICY_ID, {}), defaultTolerance: 1 }],
    ['wrong policy identity', manifest('unregistered-policy', {})],
    ['unknown scene', manifest(POLICY_ID, { 'functional/not-live': OVERRIDE })],
    ['unknown scene field', manifest(POLICY_ID, { [SCENE]: { ...OVERRIDE, unexplained: 3 } })],
    ['fraction outside range', manifest(POLICY_ID, { [SCENE]: { ...OVERRIDE, maxFraction: 1.01 } })],
    ['non-integer channel tolerance', manifest(POLICY_ID, { [SCENE]: { ...OVERRIDE, channelTolerance: 1.5 } })],
    ['blank reason', manifest(POLICY_ID, { [SCENE]: { ...OVERRIDE, reason: '   ' } })],
  ])('fails closed on %s', (_label, value) => {
    expect(parseReferenceImageToleranceCatalog(value, POLICY_ID, new Set([SCENE]))).toHaveProperty('problems');
  });

  it('refuses to disguise overrides as the registered exact policy', () => {
    const result = parseReferenceImageToleranceCatalog(
      manifest(LEGACY_EXACT_COMPARISON_POLICY_ID, { [SCENE]: OVERRIDE }),
      LEGACY_EXACT_COMPARISON_POLICY_ID,
      new Set([SCENE]),
    );

    expect('problems' in result && result.problems.map((problem) => problem.detail).join(' ')).toContain(
      'registered as exact',
    );
  });

  it('reads the committed records together and rejects a policy-id mismatch', () => {
    const paths = fixturePaths(POLICY_ID);
    writeFileSync(paths.captureIdentityPath, JSON.stringify({ comparisonPolicyId: 'different-policy' }));

    const result = readReferenceImageToleranceCatalog(paths);
    expect('problems' in result && result.problems[0]?.detail).toContain('must match capture identity');
  });
});

describe('shared reference-image comparator and verdict', () => {
  it('uses the decoded hash fast path only for exact-by-absence', () => {
    const candidate = pixels([10, 20, 30, 255]);
    const policy = resolved(false, { channelTolerance: 0, maxFraction: 0, maxChannelDelta: 0 });

    expect(compareReferenceImage(candidate, hashOf(candidate.data), null, policy)).toMatchObject({
      comparison: { dimensionMismatch: false, fraction: 0, maxChannelDelta: 0 },
      matches: true,
    });
    expect(compareReferenceImage(candidate, 'a'.repeat(64), null, policy)).toMatchObject({
      comparison: { dimensionMismatch: false, fraction: 1, maxChannelDelta: 255 },
      matches: false,
    });
  });

  it('measures hash-different pixels inside and just outside the same scene policy', () => {
    const reference = pixels([10, 20, 30, 255, 40, 50, 60, 255]);
    const policy = resolved(true, { channelTolerance: 2, maxFraction: 0.5, maxChannelDelta: 4 });
    const inside = pixels([12, 20, 30, 255, 44, 50, 60, 255]);
    const outside = pixels([12, 20, 30, 255, 45, 50, 60, 255]);

    const insideResult = compareReferenceImage(inside, hashOf(reference.data), reference, policy);
    const outsideResult = compareReferenceImage(outside, hashOf(reference.data), reference, policy);
    expect(insideResult).toMatchObject({
      comparison: { dimensionMismatch: false, fraction: 0.5, maxChannelDelta: 4 },
      matches: true,
    });
    expect(outsideResult).toMatchObject({ matches: false });
  });

  it('requires blessed pixels for an override instead of falling back to exact', () => {
    const result = compareReferenceImage(
      pixels([0, 0, 0, 255]),
      'a'.repeat(64),
      null,
      resolved(true, { channelTolerance: 2, maxFraction: 0.1, maxChannelDelta: 4 }),
    );

    expect(result).toEqual({ problem: expect.stringContaining('blessed pixels are unavailable') });
  });

  it('makes a deliberately different consumer policy fail the consistency control', () => {
    const comparison = { dimensionMismatch: false, fraction: 0.125, maxChannelDelta: 4 };
    const reviewPolicy = resolved(true, { channelTolerance: 2, maxFraction: 0.125, maxChannelDelta: 4 });
    const defeatedCiPolicy = resolved(true, { channelTolerance: 2, maxFraction: 0.124, maxChannelDelta: 4 });

    expect(referenceImageComparisonPasses(comparison, reviewPolicy)).toBe(true);
    expect(referenceImageComparisonPasses(comparison, defeatedCiPolicy)).toBe(false);
  });
});

describe('reference-image tolerance writer', () => {
  it('requires a registered non-exact identity before adding an override', () => {
    const paths = fixturePaths(LEGACY_EXACT_COMPARISON_POLICY_ID);
    const before = readFileSync(paths.manifestPath, 'utf8');
    const result = writeReferenceImageSceneTolerance(paths, SCENE, OVERRIDE);

    expect(result).toHaveProperty('problems');
    expect(readFileSync(paths.manifestPath, 'utf8')).toBe(before);
  });

  it('writes a validated override with its reason and deletion restores exact-by-absence', () => {
    const paths = fixturePaths(POLICY_ID);
    const before = readFileSync(paths.manifestPath, 'utf8');
    const written = writeReferenceImageSceneTolerance(paths, SCENE, OVERRIDE);
    const after = readFileSync(paths.manifestPath, 'utf8');

    expect('catalog' in written && written.catalog.scenes[SCENE]).toEqual(OVERRIDE);
    expect(after).not.toBe(before);
    expect(Buffer.byteLength(after)).toBeGreaterThan(128);
    const removed = writeReferenceImageSceneTolerance(paths, SCENE, null);
    expect('catalog' in removed && resolveReferenceImageTolerance(removed.catalog, `${SCENE}/canvas`).overridden).toBe(
      false,
    );
  });

  it('refuses a blank reason without changing the target', () => {
    const paths = fixturePaths(POLICY_ID);
    const before = readFileSync(paths.manifestPath, 'utf8');
    const result = writeReferenceImageSceneTolerance(paths, SCENE, { ...OVERRIDE, reason: '' });

    expect(result).toHaveProperty('problems');
    expect(readFileSync(paths.manifestPath, 'utf8')).toBe(before);
  });
});

function manifest(comparisonPolicyId: string, scenes: Record<string, unknown>) {
  return { schemaVersion: 1, comparisonPolicyId, scenes };
}

function resolved(
  overridden: boolean,
  values: { channelTolerance: number; maxFraction: number; maxChannelDelta: number },
) {
  return {
    ...values,
    comparisonPolicyId: POLICY_ID,
    gateOnMaxChannelDelta: true,
    overridden,
    reason: overridden ? 'test' : null,
    scene: SCENE,
  };
}

function pixels(data: number[]) {
  return { width: data.length / 4, height: 1, data: new Uint8Array(data) };
}

function hashOf(bytes: Readonly<Uint8Array>): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fixturePaths(comparisonPolicyId: string) {
  const root = mkdtempSync(join(tmpdir(), 'reference-image-tolerance-'));
  const paths = {
    manifestPath: join(root, 'reference-image-tolerances.json'),
    captureIdentityPath: join(root, 'reference-image-capture-identity.json'),
    coverageManifestPath: join(root, 'capture-baseline-coverage-manifest.json'),
  };
  writeFileSync(paths.manifestPath, `${JSON.stringify(manifest(comparisonPolicyId, {}), null, 2)}\n`);
  writeFileSync(paths.captureIdentityPath, JSON.stringify({ comparisonPolicyId }));
  writeFileSync(
    paths.coverageManifestPath,
    JSON.stringify({ subjects: { functional: { 'text-basic/canvas': ['referenceImage'] } } }),
  );
  return paths;
}
