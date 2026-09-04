import type { Entity } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { allocateEntity, finishEntity } from './entity';

describe('allocateEntity', () => {
  it('returns an object with an undefined runtime', () => {
    const out = allocateEntity<Entity>();
    expect(out).not.toBeNull();
    expect(out[EntityRuntimeKey]).toBeUndefined();
  });
});

describe('finishEntity', () => {
  it('returns the same object', () => {
    const out = allocateEntity<Entity>();
    const entity = finishEntity(out);
    expect(entity).toBe(out);
  });
});
