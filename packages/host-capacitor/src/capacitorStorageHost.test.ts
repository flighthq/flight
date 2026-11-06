import { capacitorHostFileSystemGroup } from './capacitorStorageHost.ts';
import type { CapacitorApi } from './types/index.ts';

describe('capacitorHostFileSystemGroup', () => {
  it('publishes only the file-system access slot', () => {
    const fileSystem = capacitorHostFileSystemGroup({ filesystem: {} } as unknown as CapacitorApi);
    expect(Object.keys(fileSystem)).toEqual(['access']);
    expect(fileSystem.access.readTextFile).toBeTypeOf('function');
  });
});
