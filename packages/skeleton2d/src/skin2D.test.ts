import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createSkin2D } from './skin2D';

describe('createSkin2D', () => {
  it('adopts the streams it is given rather than copying them', () => {
    const influenceCounts = new Uint16Array([1]);
    const influences = new Float32Array([0, 1, 0, 1]);
    const skin = createSkin2D(influenceCounts, influences);
    expect(skin.influenceCounts).toBe(influenceCounts);
    expect(skin.influences).toBe(influences);
  });

  it('carries the entity runtime slot, so a skin can be bound at runtime', () => {
    expect(EntityRuntimeKey in createSkin2D(new Uint16Array([1]), new Float32Array([0, 1, 0, 1]))).toBe(true);
  });
});
