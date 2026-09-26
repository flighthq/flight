import type { ThreeDsChunkDispatch, ThreeDsChunkHandler } from '@flighthq/types/contract';

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

/**
 * Expands a handler family into the flat chunk-id lookup the tree walk uses.
 *
 * One map built once per parse, rather than a scan over the family at every chunk: a 3DS tree has
 * thousands of chunks and a handful of handlers, so the per-chunk cost should be a lookup regardless of
 * how many handlers a caller named.
 *
 * A later handler claiming an id an earlier one already claimed WINS, which makes overriding a built-in
 * a matter of appending rather than filtering. That mirrors how kind registration behaves elsewhere in
 * the SDK, where re-registering is a feature and not an error.
 */
export function buildThreeDsChunkDispatch(handlers: readonly Readonly<ThreeDsChunkHandler>[]): ThreeDsChunkDispatch {
  const dispatch = new Map<number, Readonly<ThreeDsChunkHandler>>();
  for (const handler of handlers) {
    for (const chunkId of handler.chunkIds) dispatch.set(chunkId, handler);
  }
  return dispatch;
}
