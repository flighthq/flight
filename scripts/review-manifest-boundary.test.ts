import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

import { parseReviewManifest } from '../tools/review/src/reviewManifest';
import type { ReviewTest } from '../tools/review/src/reviewManifest';
import {
  createReviewManifestPlugin,
  REVIEW_MANIFEST_PUBLIC_ID,
  REVIEW_MANIFEST_RESOLVED_ID,
} from '../tools/review/src/reviewManifestPlugin';

const root = resolve(import.meta.dirname, '..');

describe('review manifest type boundary', () => {
  test('producer and consumer use the shared schema without suppressions or payload casts', () => {
    const main = readFileSync(resolve(root, 'tools/review/src/main.ts'), 'utf8');
    const vite = readFileSync(resolve(root, 'tools/review/vite.config.ts'), 'utf8');

    expect(main).not.toContain('@ts-expect-error');
    expect(main).not.toContain('as ReviewTest[]');
    expect(vite).not.toMatch(/interface Review(?:Cell|Test)\b/);
    expect(main).toContain("from './reviewManifest'");
    expect(main).toContain('parseReviewManifest(tests)');
    expect(vite).toContain("from './src/reviewManifest'");
  });

  test('runtime schema rejects a producer payload that drifts from the consumer contract', () => {
    const valid = reviewTest();
    expect(parseReviewManifest([valid])).toEqual([valid]);

    const missingMeasured = structuredClone(valid) as unknown as {
      cells: Record<string, unknown>[];
    };
    delete missingMeasured.cells[0].referenceComparisonMeasured;
    expect(() => parseReviewManifest([missingMeasured])).toThrow(/referenceComparisonMeasured/);

    const wrongRole = structuredClone(valid) as unknown as { cells: Record<string, unknown>[] };
    wrongRole.cells[0].role = 'renderer';
    expect(() => parseReviewManifest([wrongRole])).toThrow(/role/);
  });

  test('virtual plugin publishes only payloads checked by the runtime schema', () => {
    const manifest = [reviewTest()];
    const plugin = createReviewManifestPlugin(() => manifest);

    expect(plugin.resolveId(REVIEW_MANIFEST_PUBLIC_ID)).toBe(REVIEW_MANIFEST_RESOLVED_ID);
    expect(plugin.resolveId('virtual:other')).toBeUndefined();
    expect(plugin.load('virtual:other')).toBeUndefined();
    expect(plugin.load(REVIEW_MANIFEST_RESOLVED_ID)).toContain('parseReviewManifest');
    expect(plugin.load(REVIEW_MANIFEST_RESOLVED_ID)).toContain(JSON.stringify(parseReviewManifest(manifest)));
  });
});

function reviewTest(): ReviewTest {
  return {
    tool: 'functional',
    name: 'shape',
    cells: [
      {
        renderer: 'webgl',
        role: 'reviewable',
        state: 'ready',
        error: null,
        changed: false,
        hash: 'capture-hash',
        referencePixelSha256: 'pixel-hash',
        provenance: { hostInstanceId: 'host', environmentId: null },
        build: { commit: 'a'.repeat(40), dirty: [], dirtyOmitted: 0 },
        commissionState: 'included',
        comparisonPolicy: {
          channelTolerance: 1,
          comparisonPolicyId: 'policy',
          gateOnMaxChannelDelta: true,
          maxChannelDelta: 2,
          maxFraction: 0.01,
          overridden: false,
          reason: null,
          scene: 'functional/shape',
        },
        referenceComparison: { dimensionMismatch: false, fraction: 0, maxChannelDelta: 0 },
        referenceComparisonMatches: true,
        referenceComparisonMeasured: true,
        referenceComparisonProblem: null,
        holdReason: null,
        parityStatus: 'passed',
      },
    ],
    expectedImageDescription: 'a shape',
    sourceHasDescription: true,
    toleranceWritable: true,
  };
}
