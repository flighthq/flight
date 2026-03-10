import type { Sprite, SpriteGraphContainer } from '@flighthq/types';
import { SpriteGraphContainerKind } from '@flighthq/types';

import { createSpriteGraphContainer } from './spriteGraphContainer';

describe('createSpriteGraphContainer', () => {
  let spriteGraphContainer: SpriteGraphContainer;

  beforeEach(() => {
    spriteGraphContainer = createSpriteGraphContainer();
  });

  it('initializes default values', () => {
    expect(spriteGraphContainer.data.graph).toBeNull();
    expect(spriteGraphContainer.data.smoothing).toBe(true);
    expect(spriteGraphContainer.kind).toStrictEqual(SpriteGraphContainerKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      data: {
        graph: {} as Sprite,
        smoothing: false,
      },
    };
    const obj = createSpriteGraphContainer(base);
    expect(obj.data.graph).toStrictEqual(base.data.graph);
    expect(obj.data.smoothing).toStrictEqual(base.data.smoothing);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createSpriteGraphContainer(base);
    expect(obj).not.toStrictEqual(base);
  });
});
