import { describe, expect, it } from 'vitest';

import type { HostHapticsCapability } from './types.ts';

interface AwaitNamedCallable {
  run: (await: number) => void;
}

describe('HostHapticsCapability callable types', () => {
  it('allows callers to omit trailing optional arguments', () => {
    const impact: HostHapticsCapability['impact'] = () => true;
    const vibrateWaveform: NonNullable<HostHapticsCapability['vibrateWaveform']> = () => true;

    expect(impact('light')).toBe(true);
    expect(vibrateWaveform([], [])).toBe(true);
  });

  it('accepts await in a function-type parameter position', () => {
    const run: AwaitNamedCallable['run'] = () => {};

    expect(() => run(1)).not.toThrow();
  });
});
