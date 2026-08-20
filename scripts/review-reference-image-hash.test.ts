import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createReferenceImageRequestTarget,
  createReviewCommissionPayloadCell,
  markReviewCommissionRequested,
  resolveReferenceImageCommissionState,
} from '../tools/review/src/referenceImageCommission';
import { decodeOraclePng, getOraclePngPixelSha256 } from './reference-image-png';

describe('review reference-image pixel identity', () => {
  it('uses the raw reference hash for both lock inclusion and the written request', () => {
    const screenshot = readFileSync(
      resolve(process.cwd(), 'scripts/fixtures/reference-image-png/bitmap-transparent-compositing-dom.png'),
    );
    expect(screenshot.byteLength).toBeGreaterThan(1_000);

    const decoded = decodeOraclePng(screenshot);
    if ('refused' in decoded) throw new Error(`fixture refused: ${decoded.refused}`);
    const referenceHash = getOraclePngPixelSha256(screenshot);
    if ('refused' in referenceHash) throw new Error(`fixture refused: ${referenceHash.refused}`);

    const captureHash = createHash('sha256')
      .update(`${decoded.png.width}x${decoded.png.height}:`)
      .update(decoded.png.data)
      .digest('hex');
    expect(captureHash).not.toBe(referenceHash.pixelSha256);

    const cell = {
      renderer: 'dom',
      hash: captureHash,
      referencePixelSha256: referenceHash.pixelSha256,
      provenance: { hostInstanceId: 'host-1', environmentId: 'capture-environment' },
      build: { commit: 'a'.repeat(40), dirty: [], dirtyOmitted: 0 },
    };
    expect.soft(resolveReferenceImageCommissionState(cell, referenceHash.pixelSha256, false)).toBe('included');

    const payload = createReviewCommissionPayloadCell(cell);
    if (
      payload.pixelSha256 === null ||
      payload.hostInstanceId === null ||
      payload.build === null ||
      payload.build.commit === null
    ) {
      throw new Error('fixture cell was unexpectedly ineligible');
    }
    const requestTarget = createReferenceImageRequestTarget(
      'bitmap-transparent-compositing',
      {
        ...payload,
        pixelSha256: payload.pixelSha256,
        hostInstanceId: payload.hostInstanceId,
        build: { ...payload.build, commit: payload.build.commit },
      },
      'registered-environment',
    );
    expect.soft(requestTarget.pixelSha256).toBe(referenceHash.pixelSha256);
  });

  it('treats a queued update as requested even when the cell already has a lock', () => {
    // Pre-fix regression control: removing the requested-state precedence failed here with
    // "Expected: requested / Received: differs", proving this assertion exercises the repaired path.
    expect(
      resolveReferenceImageCommissionState({ hash: null, referencePixelSha256: 'candidate' }, 'locked', true, false),
    ).toBe('requested');
  });

  it('patches only named review cells and is idempotent', () => {
    const tests = [
      {
        tool: 'functional',
        name: 'text-basic',
        cells: [
          { renderer: 'canvas', commissionState: 'differs' as const },
          { renderer: 'reference', commissionState: null },
          { renderer: 'webgl', commissionState: 'not-commissioned' as const },
        ],
      },
    ];

    expect(markReviewCommissionRequested(tests, ['functional/text-basic/canvas'])).toBe(1);
    expect(tests[0]!.cells.map((cell) => cell.commissionState)).toEqual(['requested', null, 'not-commissioned']);
    expect(markReviewCommissionRequested(tests, ['functional/text-basic/canvas'])).toBe(0);
  });
});
