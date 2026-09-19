import type { CapacitorApi } from '@flighthq/types/contract';

import { capacitorHostFileSystemGroup } from './capacitorStorageHost';

describe('capacitorHostFileSystemGroup', () => {
  it('publishes only the file-system access slot', () => {
    const fileSystem = capacitorHostFileSystemGroup({ filesystem: {} } as unknown as CapacitorApi);
    expect(Object.keys(fileSystem)).toEqual(['access']);
    expect(fileSystem.access.readTextFile).toBeTypeOf('function');
  });
});
