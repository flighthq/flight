import { captureHostProbeBackends, diffHostProbeBackends } from './capabilityBackends';

describe('captureHostProbeBackends', () => {
  it('does not treat an empty optional window group as a provider', () => {
    const before = captureHostProbeBackends();
    const after = captureHostProbeBackends({ window: {} });

    expect(after.window).toBeNull();
    expect(diffHostProbeBackends(before, after)).not.toContain('window');
  });

  it('detects a populated window group as a provider', () => {
    const before = captureHostProbeBackends();
    const after = captureHostProbeBackends({ window: { focus() {} } });

    expect(after.window).toBeTypeOf('function');
    expect(diffHostProbeBackends(before, after)).toContain('window');
  });
});
