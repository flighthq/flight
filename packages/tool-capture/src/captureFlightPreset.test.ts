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

  it('keeps only the parity exceptions backed by current renderer behavior', () => {
    expect(getFlightCaptureValidationPreset('functional').paritySkip).toEqual({
      'effect-invert': ['webgpu'],
      'effect-lens-distortion': ['canvas'],
      'effect-lens-flare': ['canvas'],
      'effect-msaa': ['webgpu'],
      'effect-msaa-bloom': ['webgpu'],
      'effect-posterize': ['canvas'],
      'effect-vignette': ['canvas'],
      'effect-god-rays': 'all',
    });
  });
});
