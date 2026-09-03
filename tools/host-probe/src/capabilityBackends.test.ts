import { createEntity } from '@flighthq/entity/contract';

import { captureHostProbeBackends, diffHostProbeBackends } from './capabilityBackends';

describe('captureHostProbeBackends', () => {
  it('does not treat an empty optional window group as a provider', () => {
    const before = captureHostProbeBackends();
    const after = captureHostProbeBackends({ window: createEntity({}) });

    expect(after.window).toBeNull();
    expect(diffHostProbeBackends(before, after)).not.toContain('window');
  });

  it('detects a populated window group as a provider', () => {
    const before = captureHostProbeBackends();
    const after = captureHostProbeBackends({ window: createEntity({ focus() {} }) });

    expect(after.window).toBeTypeOf('function');
    expect(diffHostProbeBackends(before, after)).toContain('window');
  });
});
