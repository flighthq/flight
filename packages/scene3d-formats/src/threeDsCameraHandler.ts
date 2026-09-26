import type { ThreeDsChunkHandler, ThreeDsParseState } from '@flighthq/types/contract';
import { THREE_DS_CAMERA } from '@flighthq/types/contract';

import { parseThreeDsCamera } from './threeDsParse.ts';

export const threeDsCameraHandler: Readonly<ThreeDsChunkHandler> = {
  chunkIds: [THREE_DS_CAMERA],
  collect(state: ThreeDsParseState, view: Readonly<DataView>, offset: number, end: number, name: string): void {
    const camera = parseThreeDsCamera(view, offset, end, name, null);
    if (camera !== null) state.cameras.push(camera);
  },
};
