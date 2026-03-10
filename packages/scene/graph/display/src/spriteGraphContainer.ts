import type { PartialWithData, SpriteGraphContainer, SpriteGraphContainerData } from '@flighthq/types';
import { SpriteGraphContainerKind } from '@flighthq/types';

import { createDisplayObjectGeneric } from './displayObject';

export function createSpriteGraphContainer(
  obj?: Readonly<PartialWithData<SpriteGraphContainer>>,
): SpriteGraphContainer {
  return createDisplayObjectGeneric(
    SpriteGraphContainerKind,
    obj,
    createSpriteGraphContainerData,
  ) as SpriteGraphContainer;
}

export function createSpriteGraphContainerData(
  data?: Readonly<Partial<SpriteGraphContainerData>>,
): SpriteGraphContainerData {
  return {
    graph: data?.graph ?? null,
    smoothing: data?.smoothing ?? true,
  };
}
