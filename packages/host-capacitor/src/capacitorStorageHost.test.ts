import type { CapacitorApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { capacitorHostFileSystemGroup } from './capacitorStorageHost';

describe('capacitorHostFileSystemGroup', () => {
  it('publishes only the Entity-backed file-system access slot', () => {
    const fileSystem = capacitorHostFileSystemGroup({ filesystem: {} } as unknown as CapacitorApi);
    expect(Object.keys(fileSystem)).toEqual(['access']);
    expect(EntityRuntimeKey in fileSystem.access).toBe(true);
  });
});
