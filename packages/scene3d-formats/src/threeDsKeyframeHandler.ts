import type { ThreeDsChunkHandler, ThreeDsParseState } from '@flighthq/types/contract';
import { THREE_DS_KEYFRAME_OBJECT_NODE } from '@flighthq/types/contract';

import { collectThreeDsPivots } from './threeDsParse.ts';

export const threeDsKeyframeHandler: Readonly<ThreeDsChunkHandler> = {
  chunkIds: [THREE_DS_KEYFRAME_OBJECT_NODE],
  collect(state: ThreeDsParseState, view: Readonly<DataView>, offset: number): void {
    for (const [name, pivot] of collectThreeDsPivots(view, offset)) state.pivots.set(name, pivot);
  },
};
