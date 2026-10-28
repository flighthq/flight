import { allocateEntity, finishEntity } from './entity.ts';
import type { Entity } from './types.ts';
import { EntityRuntimeKey } from './types.ts';

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
