import type { ThreeDsChunkHandler, ThreeDsParseState } from '@flighthq/types/contract';
import { THREE_DS_MATERIAL } from '@flighthq/types/contract';

import { parseThreeDsMaterial } from './threeDsParse.ts';

export const threeDsMaterialHandler: Readonly<ThreeDsChunkHandler> = {
  chunkIds: [THREE_DS_MATERIAL],
  collect(state: ThreeDsParseState, view: Readonly<DataView>, offset: number, end: number): void {
    const material = parseThreeDsMaterial(view, offset, end);
    if (material.name.length > 0) state.materials.set(material.name, material);
  },
};
