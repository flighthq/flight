import type { ThreeDsChunkHandler } from '@flighthq/types/contract';

import { threeDsCameraHandler } from './threeDsCameraHandler.ts';
import { threeDsKeyframeHandler } from './threeDsKeyframeHandler.ts';
import { threeDsLightHandler } from './threeDsLightHandler.ts';
import { threeDsMaterialHandler } from './threeDsMaterialHandler.ts';
import { threeDsMeshHandler } from './threeDsMeshHandler.ts';

export const threeDsCameraFamily: readonly ThreeDsChunkHandler[] = [threeDsCameraHandler];

export const threeDsKeyframeFamily: readonly ThreeDsChunkHandler[] = [threeDsKeyframeHandler];

export const threeDsLightFamily: readonly ThreeDsChunkHandler[] = [threeDsLightHandler];

export const threeDsMaterialFamily: readonly ThreeDsChunkHandler[] = [threeDsMaterialHandler];

export const threeDsMeshFamily: readonly ThreeDsChunkHandler[] = [threeDsMeshHandler];

/**
 * Every chunk handler Flight reads a 3DS file with — the full-support preset, which reproduces the
 * importer's complete behavior. A caller who wants only geometry names `threeDsMeshFamily` and the
 * handlers it leaves out — and the parsing, material resolution, and packages behind them — never
 * link.
 */
export const threeDsAllChunkHandlers: readonly ThreeDsChunkHandler[] = [
  ...threeDsCameraFamily,
  ...threeDsKeyframeFamily,
  ...threeDsLightFamily,
  ...threeDsMaterialFamily,
  ...threeDsMeshFamily,
];
