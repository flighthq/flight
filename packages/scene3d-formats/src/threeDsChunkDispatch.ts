import type { ThreeDsChunkDispatch, ThreeDsChunkHandler } from '@flighthq/types/contract';

export function buildThreeDsChunkDispatch(handlers: readonly Readonly<ThreeDsChunkHandler>[]): ThreeDsChunkDispatch {
  const dispatch = new Map<number, Readonly<ThreeDsChunkHandler>>();
  for (const handler of handlers) {
    for (const chunkId of handler.chunkIds) dispatch.set(chunkId, handler);
  }
  return dispatch;
}
