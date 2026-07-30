import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { ImageResource } from '@flighthq/types/contract';

import {
  areWgpuTextureResolverGuardsEnabled,
  enableWgpuTextureResolverGuards,
} from './enableWgpuTextureResolverGuards';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';
import { registerWgpuTextureResolver, resolveWgpuTexture } from './wgpuTextureResolver';

beforeAll(() => {
  installWgpuMock();
});

describe('enableWgpuTextureResolverGuards', () => {
  it('is state-scoped and idempotent', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(areWgpuTextureResolverGuardsEnabled(state)).toBe(false);

    enableWgpuTextureResolverGuards(state);
    enableWgpuTextureResolverGuards(state);

    expect(areWgpuTextureResolverGuardsEnabled(state)).toBe(true);
  });

  it('warns once for a missing resolver and stays silent for a registered resolver returning null', async () => {
    const state = await createWgpuRenderStateForTest();
    const missing = textureWithKind('acme.missing.wgpu');
    const registered = textureWithKind('acme.registered.wgpu');
    const sink = createMemoryLogSink(4);
    addLogSink(sink.sink);
    enableWgpuTextureResolverGuards(state);
    registerWgpuTextureResolver(state, 'acme.registered.wgpu', () => null);
    try {
      expect(resolveWgpuTexture(state, missing)).toBeNull();
      expect(resolveWgpuTexture(state, missing)).toBeNull();
      expect(resolveWgpuTexture(state, registered)).toBeNull();

      const entries = getMemoryLogSinkEntries(sink);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.data).toMatchObject({
        kind: 'acme.missing.wgpu',
        message:
          'resolveWgpuTexture: texture backing kind has no registered resolver — call registerWgpuTextureResolver(state, backingKind, resolver)',
      });
    } finally {
      removeLogSink(sink.sink);
    }
  });
});

function textureWithKind(kind: string) {
  return createTexture({
    storage: { dimension: '2d', image: { kind } as ImageResource },
  });
}
