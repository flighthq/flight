import { describe, expect, it } from 'vitest';

import { Physics3DAbiVersion } from './physics3DAbiLayout';
import { createReferencePhysics3DAbi } from './referencePhysics3DAbi';

describe('createReferencePhysics3DAbi', () => {
  it('creates isolated persistent-world storage under the public ABI version', () => {
    const first = createReferencePhysics3DAbi();
    const second = createReferencePhysics3DAbi();
    const firstWorld = first.createWorld();
    const secondWorld = second.createWorld();

    expect(first.version).toBe(Physics3DAbiVersion);
    expect(firstWorld).toBe(1);
    expect(secondWorld).toBe(1);
    expect(first.destroyWorld(firstWorld)).toBe(true);
    expect(second.destroyWorld(secondWorld)).toBe(true);
  });
});
