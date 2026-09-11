import type { CapacitorApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { capacitorHostStorage } from './capacitorStorageHost';

describe('capacitorHostStorage', () => {
  it('publishes only the Entity-backed file-system slot', () => {
    const storage = capacitorHostStorage({ filesystem: {} } as unknown as CapacitorApi);
    expect(Object.keys(storage)).toEqual(['fileSystem']);
    expect(EntityRuntimeKey in storage.fileSystem).toBe(true);
  });
});
