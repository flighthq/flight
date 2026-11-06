import { threeDsCameraFamily } from './threeDsCameraHandler.ts';
import { threeDsKeyframeFamily } from './threeDsKeyframeHandler.ts';
import { threeDsLightFamily } from './threeDsLightHandler.ts';
import { threeDsMaterialFamily } from './threeDsMaterialHandler.ts';
import { threeDsMeshFamily } from './threeDsMeshHandler.ts';
import type { ThreeDsChunkHandler } from './types/ThreeDsChunkHandler.ts';

export const threeDsAllChunkHandlers: readonly ThreeDsChunkHandler[] = [
  ...threeDsCameraFamily,
  ...threeDsKeyframeFamily,
  ...threeDsLightFamily,
  ...threeDsMaterialFamily,
  ...threeDsMeshFamily,
];
