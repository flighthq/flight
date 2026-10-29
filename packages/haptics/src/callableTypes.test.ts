import { describe, expect, it } from 'vitest';

import type { HostHapticsCapability } from './types.ts';

describe('HostHapticsCapability callable types', () => {
  it('allows callers to omit trailing optional arguments', () => {
    const impact: HostHapticsCapability['impact'] = () => true;
    const vibrateWaveform: NonNullable<HostHapticsCapability['vibrateWaveform']> = () => true;

    expect(impact('light')).toBe(true);
    expect(vibrateWaveform([], [])).toBe(true);
  });
});
