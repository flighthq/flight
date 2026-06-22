import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import type { Material } from '@flighthq/types';

import { defaultWgpuMaterialRenderer } from './wgpuDefaultMaterial';
import { flushWgpuSpriteBatch, prepareWgpuSpriteBatchWrite, resetWgpuSpriteBatchBufferPool } from './wgpuSpriteBatch';

beforeAll(() => {
  installWgpuMock();
});

function makeMaterial(): Material {
  return { kind: 'TestMaterial' } as Material;
}

describe('flushWgpuSpriteBatch', () => {
  it('does nothing when batch count is zero', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    expect(() => flushWgpuSpriteBatch(state)).not.toThrow();
    submitWgpuRenderPass(state);
  });

  it('resets state after flush', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex = document.createElement('img');

    prepareWgpuSpriteBatchWrite(state, tex, null, null, defaultWgpuMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    flushWgpuSpriteBatch(state);

    expect(runtime.spriteBatchCount).toBe(0);
    expect(runtime.spriteBatchTexture).toBeNull();
    expect(runtime.spriteBatchBlendMode).toBeNull();
    expect(runtime.spriteBatchMaterial).toBeNull();
    submitWgpuRenderPass(state);
  });

  it('claims a distinct buffer per flush so deferred draws never share one', async () => {
    // The canvas pass is submitted once at end of frame; if successive flushes reused one instance
    // buffer, every draw would read the last flush's data and the batch would collapse to one spot.
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex1 = document.createElement('img');
    const tex2 = document.createElement('img');

    prepareWgpuSpriteBatchWrite(state, tex1, null, null, defaultWgpuMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    flushWgpuSpriteBatch(state);

    prepareWgpuSpriteBatchWrite(state, tex2, null, null, defaultWgpuMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    flushWgpuSpriteBatch(state);

    expect(runtime.spriteBatchBufferCursor).toBe(2);
    expect(runtime.spriteBatchBufferPool[0].instanceBuffer).not.toBeNull();
    expect(runtime.spriteBatchBufferPool[0].instanceBuffer).not.toBe(runtime.spriteBatchBufferPool[1].instanceBuffer);
    submitWgpuRenderPass(state);
  });
});

describe('prepareWgpuSpriteBatchWrite', () => {
  it('returns float index 0 for an empty batch', async () => {
    const state = await createWgpuRenderStateForTest();
    const tex = document.createElement('img');

    const base = prepareWgpuSpriteBatchWrite(state, tex, null, null, defaultWgpuMaterialRenderer, 1);
    expect(base).toBe(0);
  });

  it('flushes when texture changes', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex1 = document.createElement('img');
    const tex2 = document.createElement('img');

    prepareWgpuSpriteBatchWrite(state, tex1, null, null, defaultWgpuMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    prepareWgpuSpriteBatchWrite(state, tex2, null, null, defaultWgpuMaterialRenderer, 1);

    expect(runtime.spriteBatchTexture).toBe(tex2);
    expect(runtime.spriteBatchCount).toBe(0);
    submitWgpuRenderPass(state);
  });

  it('flushes when material changes', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex = document.createElement('img');
    const materialA = makeMaterial();
    const materialB = makeMaterial();

    prepareWgpuSpriteBatchWrite(state, tex, null, materialA, defaultWgpuMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    prepareWgpuSpriteBatchWrite(state, tex, null, materialB, defaultWgpuMaterialRenderer, 1);

    expect(runtime.spriteBatchMaterial).toBe(materialB);
    expect(runtime.spriteBatchCount).toBe(0);
    submitWgpuRenderPass(state);
  });
});

describe('resetWgpuSpriteBatchBufferPool', () => {
  it('rewinds the pool cursor so slots are reclaimed next frame', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex = document.createElement('img');

    prepareWgpuSpriteBatchWrite(state, tex, null, null, defaultWgpuMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    flushWgpuSpriteBatch(state);
    expect(runtime.spriteBatchBufferCursor).toBe(1);

    resetWgpuSpriteBatchBufferPool(state);
    expect(runtime.spriteBatchBufferCursor).toBe(0);
    submitWgpuRenderPass(state);
  });
});
