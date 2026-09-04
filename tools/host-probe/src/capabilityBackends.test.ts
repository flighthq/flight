import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity } from '@flighthq/types/contract';

import { captureHostProbeBackends, diffHostProbeBackends } from './capabilityBackends';

describe('captureHostProbeBackends', () => {
  it('does not treat an empty optional window group as a provider', () => {
    const before = captureHostProbeBackends();
    const after = captureHostProbeBackends({ window: finishEntity(allocateEntity<Entity>()) });

    expect(after.window).toBeNull();
    expect(diffHostProbeBackends(before, after)).not.toContain('window');
  });

  it('detects a populated window group as a provider', () => {
    const before = captureHostProbeBackends();
    const windowEntity = allocateEntity<Entity & { focus(): void }>();
    windowEntity.focus = () => {};
    const after = captureHostProbeBackends({ window: finishEntity(windowEntity) });

    expect(after.window).toBeTypeOf('function');
    expect(diffHostProbeBackends(before, after)).toContain('window');
  });
});
