import type { Sprite, SpriteContainer } from '@flighthq/types';
import { SpriteContainerKind } from '@flighthq/types';

import { createSpriteContainer } from './spriteContainer';

describe('createSpriteContainer', () => {
  let spriteGraphContainer: SpriteContainer;

  beforeEach(() => {
    spriteGraphContainer = createSpriteContainer();
  });

  it('initializes default values', () => {
    expect(spriteGraphContainer.data.graph).toBeNull();
    expect(spriteGraphContainer.data.smoothing).toBe(true);
    expect(spriteGraphContainer.kind).toStrictEqual(SpriteContainerKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      data: {
        graph: {} as Sprite,
        smoothing: false,
      },
    };
    const obj = createSpriteContainer(base);
    expect(obj.data.graph).toStrictEqual(base.data.graph);
    expect(obj.data.smoothing).toStrictEqual(base.data.smoothing);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createSpriteContainer(base);
    expect(obj).not.toStrictEqual(base);
  });
});
