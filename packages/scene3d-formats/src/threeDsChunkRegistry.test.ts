import { describe, expect, it } from 'vitest';

import { threeDsCameraFamily } from './threeDsCameraHandler.ts';
import { threeDsAllChunkHandlers } from './threeDsChunkRegistry.ts';
import { threeDsKeyframeFamily } from './threeDsKeyframeHandler.ts';
import { threeDsLightFamily } from './threeDsLightHandler.ts';
import { threeDsMaterialFamily } from './threeDsMaterialHandler.ts';
import { threeDsMeshFamily } from './threeDsMeshHandler.ts';

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
