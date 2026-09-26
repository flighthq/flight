import type { ThreeDsChunkHandler, ThreeDsParseState } from '@flighthq/types/contract';
import { THREE_DS_LIGHT } from '@flighthq/types/contract';

import { parseThreeDsLight } from './threeDsParse.ts';

export const threeDsLightHandler: Readonly<ThreeDsChunkHandler> = {
  chunkIds: [THREE_DS_LIGHT],
  collect(state: ThreeDsParseState, view: Readonly<DataView>, offset: number, end: number, name: string): void {
    const light = parseThreeDsLight(view, offset, end, name, state.drops);
    if (light !== null) state.lights.push(light);
  },
};
