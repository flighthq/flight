import { describe, expect, it } from 'vitest';

import { getFlightCaptureValidationPreset } from './captureFlightPreset';

describe('getFlightCaptureValidationPreset', () => {
  it('keeps built-in functional parity topology outside the CLI', () => {
    expect(getFlightCaptureValidationPreset('functional')).toMatchObject({
      fingerprintSkip: [],
      parityGroups: { visual: { targets: ['dom', 'canvas', 'webgl', 'webgpu'], reference: 'canvas' } },
    });
  });

  it('keeps example-only fingerprint exceptions scoped to examples', () => {
    expect(getFlightCaptureValidationPreset('examples').fingerprintSkip).toEqual(['playingsound']);
    expect(getFlightCaptureValidationPreset('custom').fingerprintSkip).toEqual([]);
  });
});
