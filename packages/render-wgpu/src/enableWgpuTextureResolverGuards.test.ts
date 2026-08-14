import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { Image } from '@flighthq/types/contract';

import {
  areWgpuTextureResolverGuardsEnabled,
  enableWgpuTextureResolverGuards,
} from './enableWgpuTextureResolverGuards';
import { bindWgpuTexture } from './wgpuDraw';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';
import { registerWgpuTextureResolver, resolveWgpuTexture } from './wgpuTextureResolver';

beforeAll(() => {
  installWgpuMock();
});

describe('areWgpuTextureResolverGuardsEnabled', () => {
  it('reports whether diagnostics were installed for the state', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(areWgpuTextureResolverGuardsEnabled(state)).toBe(false);

    enableWgpuTextureResolverGuards(state);
    expect(areWgpuTextureResolverGuardsEnabled(state)).toBe(true);
  });
});

describe('enableWgpuTextureResolverGuards', () => {
  it('is idempotent', async () => {
    const state = await createWgpuRenderStateForTest();
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
          'resolveWgpuTexture: texture source kind has no registered resolver — call registerWgpuTextureResolver(state, sourceKind, resolver)',
      });
    } finally {
      removeLogSink(sink.sink);
    }
  });

  it('installs the mipmap-degraded guard on the runtime', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(getWgpuRenderStateRuntime(state).mipmapDegradedGuard).toBeNull();
    enableWgpuTextureResolverGuards(state);
    expect(getWgpuRenderStateRuntime(state).mipmapDegradedGuard).not.toBeNull();
  });

  it('logs a warning when mipmaps are requested without a registered generator', async () => {
    const state = await createWgpuRenderStateForTest();
    const sink = createMemoryLogSink(4);
    addLogSink(sink.sink);
    enableWgpuTextureResolverGuards(state);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      bindWgpuTexture(state, canvas, true);

      const entries = getMemoryLogSinkEntries(sink);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.data).toMatchObject({
        message: expect.stringContaining('no WGPU mipmap generator registered'),
      });
    } finally {
      removeLogSink(sink.sink);
    }
  });
});

function textureWithKind(kind: string) {
  return createTexture({
    dimension: '2d',
    source: { kind } as Image,
  });
}
