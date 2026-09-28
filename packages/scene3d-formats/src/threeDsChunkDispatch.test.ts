import { THREE_DS_CAMERA, THREE_DS_TRIMESH } from '@flighthq/types/contract';
import type { ThreeDsChunkHandler } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { buildThreeDsChunkDispatch } from './threeDsChunkDispatch.ts';
import { threeDsAllChunkHandlers } from './threeDsChunkRegistry.ts';
import { threeDsMeshFamily } from './threeDsMeshHandler.ts';

describe('buildThreeDsChunkDispatch', () => {
  it('maps every chunk id a handler claims to that handler', () => {
    const dispatch = buildThreeDsChunkDispatch(threeDsAllChunkHandlers);
    for (const handler of threeDsAllChunkHandlers) {
      for (const chunkId of handler.chunkIds) expect(dispatch.get(chunkId)).toBe(handler);
    }
  });

  it('claims nothing for a chunk id no handler named, so the walk skips it', () => {
    expect(buildThreeDsChunkDispatch(threeDsMeshFamily).get(THREE_DS_CAMERA)).toBeUndefined();
  });

  it('lets a later handler take an id an earlier one already claimed', () => {
    const override: Readonly<ThreeDsChunkHandler> = { chunkIds: [THREE_DS_TRIMESH], collect: () => {} };
    const dispatch = buildThreeDsChunkDispatch([...threeDsMeshFamily, override]);
    expect(dispatch.get(THREE_DS_TRIMESH)).toBe(override);
  });

  it('builds an empty dispatch from an empty family, rather than falling back to a default', () => {
    expect(buildThreeDsChunkDispatch([]).size).toBe(0);
  });
});
