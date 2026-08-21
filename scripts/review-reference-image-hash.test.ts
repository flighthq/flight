import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createReferenceImageRequestTarget,
  isReviewRequestStillPending,
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

describe('isReviewRequestStillPending', () => {
  // ★ THE REPORTED SYMPTOM: a scene resized since it was commissioned showed "Request pending" with the
  // Commission button disabled — so the one action that would fix it was the one the tool refused, and
  // the stale pin went on to bless a picture the tree no longer produces. Probed on text-wrap before this
  // change: all four cells read commissionState=requested with dimensionMismatch=true; after, differs.
  it('calls a request stale once the capture no longer matches its pin', () => {
    expect(isReviewRequestStillPending('a'.repeat(64), 'b'.repeat(64))).toBe(false);
  });

  it('leaves a request pending while the capture still matches its pin', () => {
    expect(isReviewRequestStillPending('a'.repeat(64), 'a'.repeat(64))).toBe(true);
  });

  it('is not pending when there is no request at all', () => {
    expect(isReviewRequestStillPending(undefined, 'a'.repeat(64))).toBe(false);
    expect(isReviewRequestStillPending(undefined, null)).toBe(false);
  });

  // An undecodable capture cannot show the pin is wrong, and enabling a commission whose pixels we could
  // not read would replace a good pin with nothing. Fail toward leaving the existing request alone.
  it('treats an undecodable capture as still pending rather than stale', () => {
    expect(isReviewRequestStillPending('a'.repeat(64), null)).toBe(true);
  });
});
