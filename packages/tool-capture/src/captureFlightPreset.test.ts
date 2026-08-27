import { describe, expect, it } from 'vitest';

import { getFlightCaptureValidationPreset } from './captureFlightPreset';

describe('getFlightCaptureValidationPreset', () => {
  it('keeps built-in functional parity topology outside the CLI', () => {
    expect(getFlightCaptureValidationPreset('functional')).toMatchObject({
      fingerprintSkip: [],
      parityGroups: { visual: { targets: ['dom', 'canvas', 'webgl', 'webgpu'], reference: 'canvas' } },
    });
  });

  it('gives examples the same-run parity topology, since no example carries a committed baseline', () => {
    // Without a group, every example renderer takes the not-baselined `continue` and the leg compares
    // nothing while reporting success — the defect this topology closes.
    expect(getFlightCaptureValidationPreset('examples').parityGroups).toMatchObject({
      visual: { targets: ['dom', 'canvas', 'webgl', 'webgpu'], reference: 'canvas' },
    });
  });

  it('leaves an unknown subject without a parity topology to inherit', () => {
    expect(getFlightCaptureValidationPreset('custom').parityGroups).toBeUndefined();
  });

  it('keeps example-only fingerprint exceptions scoped to examples', () => {
    expect(getFlightCaptureValidationPreset('examples').fingerprintSkip).toEqual(['playingsound']);
    expect(getFlightCaptureValidationPreset('custom').fingerprintSkip).toEqual([]);
  });

  // ★ THIS TEST IS A MIRROR OF THE CONSTANT, so retiring an exception means editing BOTH. Two entries
  // were retired once their stated cause was fixed — effect-god-rays (the centerY UV-origin repair)
  // and effect-vignette (canvas now matches the GPU recipe byte-for-byte) — and this deep-equal went
  // red on the merge tree because only the constant had been updated. `npm run check` cannot see it:
  // it runs 28 gates and no tests. `npm run test tool-capture` is what catches it, in 34 seconds.
  it('keeps only the parity exceptions backed by current renderer behavior', () => {
    expect(getFlightCaptureValidationPreset('functional').paritySkip).toEqual({
      'effect-invert': ['webgpu'],
      'effect-msaa': ['webgpu'],
      'effect-msaa-bloom': ['webgpu'],
      'render-target-node-2d': ['canvas'],
      'swf-color-transform': ['webgl', 'webgpu'],
    });
  });

  it('compares every swf-alpha-transform backend after the RGB fold moves to its own held scene', () => {
    expect(getFlightCaptureValidationPreset('functional').paritySkip).not.toHaveProperty('swf-alpha-transform');
  });
});
