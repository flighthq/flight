import {
  THREE_DS_CAMERA,
  THREE_DS_KEYFRAME_OBJECT_NODE,
  THREE_DS_LIGHT,
  THREE_DS_MATERIAL,
  THREE_DS_TRIMESH,
} from '@flighthq/types/contract';

import {
  threeDsAllChunkHandlers,
  threeDsCameraFamily,
  threeDsKeyframeFamily,
  threeDsLightFamily,
  threeDsMaterialFamily,
  threeDsMeshFamily,
} from './threeDsChunkRegistry.ts';

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
