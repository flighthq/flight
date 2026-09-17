import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { HostWindowFocusCapability } from '@flighthq/types/contract';

import { captureHostProbeBackends, diffHostProbeBackends } from './capabilityBackends';

describe('captureHostProbeBackends', () => {
  it('does not treat an empty window group as a provider', () => {
    const before = captureHostProbeBackends();
    const after = captureHostProbeBackends({ window: {} });

    expect(after.window).toBeNull();
    expect(diffHostProbeBackends(before, after)).not.toContain('window');
  });

  it('detects a populated window group as a provider', () => {
    const before = captureHostProbeBackends();
    const focus = finishEntity(allocateEntity<HostWindowFocusCapability>());
    focus.focus = () => {};
    const after = captureHostProbeBackends({ window: { focus } });

    expect(after.window).toBe(focus);
    expect(diffHostProbeBackends(before, after)).toContain('window');
  });
});
