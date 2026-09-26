import type { ThreeDsChunkHandler, ThreeDsParseState } from '@flighthq/types/contract';
import { THREE_DS_TRIMESH } from '@flighthq/types/contract';

import { parseThreeDsTrimesh } from './threeDsParse.ts';

export const threeDsMeshHandler: Readonly<ThreeDsChunkHandler> = {
  chunkIds: [THREE_DS_TRIMESH],
  collect(state: ThreeDsParseState, view: Readonly<DataView>, offset: number, end: number, name: string): void {
    const mesh = parseThreeDsTrimesh(view, offset, end, name, state.drops);
    if (mesh !== null) state.meshes.push(mesh);
  },
};
