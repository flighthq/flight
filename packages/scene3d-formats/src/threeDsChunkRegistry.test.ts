import {
  THREE_DS_CAMERA,
  THREE_DS_KEYFRAME_OBJECT_NODE,
  THREE_DS_LIGHT,
  THREE_DS_MATERIAL,
  THREE_DS_TRIMESH,
} from '@flighthq/types/contract';
import type { ThreeDsChunkHandler } from '@flighthq/types/contract';

import {
  buildThreeDsChunkDispatch,
  threeDsAllChunkHandlers,
  threeDsCameraFamily,
  threeDsKeyframeFamily,
  threeDsLightFamily,
  threeDsMaterialFamily,
  threeDsMeshFamily,
} from './threeDsChunkRegistry.ts';

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

  // Appending is how a caller overrides a built-in: the family is a list, not a set keyed by id, so the
  // later claim wins rather than colliding. Filtering the standard family out first would work too, but
  // that requires knowing which handler owns the id — appending does not.
  it('lets a later handler take an id an earlier one already claimed', () => {
    const override: Readonly<ThreeDsChunkHandler> = { chunkIds: [THREE_DS_TRIMESH], collect: () => {} };
    const dispatch = buildThreeDsChunkDispatch([...threeDsMeshFamily, override]);
    expect(dispatch.get(THREE_DS_TRIMESH)).toBe(override);
  });

  it('builds an empty dispatch from an empty family, rather than falling back to a default', () => {
    expect(buildThreeDsChunkDispatch([]).size).toBe(0);
  });
});

describe('threeDsAllChunkHandlers', () => {
  it('contains every family', () => {
    const all = new Set(threeDsAllChunkHandlers);
    for (const handler of threeDsCameraFamily) expect(all.has(handler)).toBe(true);
    for (const handler of threeDsKeyframeFamily) expect(all.has(handler)).toBe(true);
    for (const handler of threeDsLightFamily) expect(all.has(handler)).toBe(true);
    for (const handler of threeDsMaterialFamily) expect(all.has(handler)).toBe(true);
    for (const handler of threeDsMeshFamily) expect(all.has(handler)).toBe(true);
  });

  it('claims chunk IDs without duplicates', () => {
    const ids = threeDsAllChunkHandlers.flatMap((h) => [...h.chunkIds]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('threeDsCameraFamily', () => {
  it('claims THREE_DS_CAMERA', () => {
    expect(threeDsCameraFamily.flatMap((h) => [...h.chunkIds])).toContain(THREE_DS_CAMERA);
  });
});

describe('threeDsKeyframeFamily', () => {
  it('claims THREE_DS_KEYFRAME_OBJECT_NODE', () => {
    expect(threeDsKeyframeFamily.flatMap((h) => [...h.chunkIds])).toContain(THREE_DS_KEYFRAME_OBJECT_NODE);
  });
});

describe('threeDsLightFamily', () => {
  it('claims THREE_DS_LIGHT', () => {
    expect(threeDsLightFamily.flatMap((h) => [...h.chunkIds])).toContain(THREE_DS_LIGHT);
  });
});

describe('threeDsMaterialFamily', () => {
  it('claims THREE_DS_MATERIAL', () => {
    expect(threeDsMaterialFamily.flatMap((h) => [...h.chunkIds])).toContain(THREE_DS_MATERIAL);
  });
});

describe('threeDsMeshFamily', () => {
  it('claims THREE_DS_TRIMESH', () => {
    expect(threeDsMeshFamily.flatMap((h) => [...h.chunkIds])).toContain(THREE_DS_TRIMESH);
  });
});
