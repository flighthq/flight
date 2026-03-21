import { RuntimeKey } from '@flighthq/types';

import { createEntity } from './entity';

describe('createEntity', () => {
  it('returns an object', () => {
    const entity = createEntity();
    expect(entity).not.toBeNull();
  });

  it('has an undefined runtime', () => {
    const entity = createEntity();
    expect(entity[RuntimeKey]).toBeUndefined();
  });
});
