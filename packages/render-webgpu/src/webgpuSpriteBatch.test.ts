import type { Material } from '@flighthq/types';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { defaultWebGPUMaterialRenderer } from './webgpuDefaultMaterial';
import {
  flushWebGPUSpriteBatch,
  prepareWebGPUSpriteBatchWrite,
  resetWebGPUSpriteBatchBufferPool,
} from './webgpuSpriteBatch';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

function makeMaterial(): Material {
  return { kind: Symbol('TestMaterial') } as Material;
}

describe('flushWebGPUSpriteBatch', () => {
  it('does nothing when batch count is zero', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const internal = state as any;
    expect(() => flushWebGPUSpriteBatch(internal)).not.toThrow();
    submitWebGPURenderPass(state);
  });

  it('resets state after flush', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const internal = state as any;
    const tex = document.createElement('img');

    prepareWebGPUSpriteBatchWrite(internal, tex, null, null, defaultWebGPUMaterialRenderer, 1);
    internal.spriteBatchCount = 1;
    flushWebGPUSpriteBatch(internal);

    expect(internal.spriteBatchCount).toBe(0);
    expect(internal.spriteBatchTexture).toBeNull();
    expect(internal.spriteBatchBlendMode).toBeNull();
    expect(internal.spriteBatchMaterial).toBeNull();
    submitWebGPURenderPass(state);
  });

  it('claims a distinct buffer per flush so deferred draws never share one', async () => {
    // The canvas pass is submitted once at end of frame; if successive flushes reused one instance
    // buffer, every draw would read the last flush's data and the batch would collapse to one spot.
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const internal = state as any;
    const tex1 = document.createElement('img');
    const tex2 = document.createElement('img');

    prepareWebGPUSpriteBatchWrite(internal, tex1, null, null, defaultWebGPUMaterialRenderer, 1);
    internal.spriteBatchCount = 1;
    flushWebGPUSpriteBatch(internal);

    prepareWebGPUSpriteBatchWrite(internal, tex2, null, null, defaultWebGPUMaterialRenderer, 1);
    internal.spriteBatchCount = 1;
    flushWebGPUSpriteBatch(internal);

    expect(internal.spriteBatchBufferCursor).toBe(2);
    expect(internal.spriteBatchBufferPool[0].instanceBuffer).not.toBeNull();
    expect(internal.spriteBatchBufferPool[0].instanceBuffer).not.toBe(internal.spriteBatchBufferPool[1].instanceBuffer);
    submitWebGPURenderPass(state);
  });
});

describe('prepareWebGPUSpriteBatchWrite', () => {
  it('returns float index 0 for an empty batch', async () => {
    const state = await createWebGPURenderStateForTest();
    const internal = state as any;
    const tex = document.createElement('img');

    const base = prepareWebGPUSpriteBatchWrite(internal, tex, null, null, defaultWebGPUMaterialRenderer, 1);
    expect(base).toBe(0);
  });

  it('flushes when texture changes', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const internal = state as any;
    const tex1 = document.createElement('img');
    const tex2 = document.createElement('img');

    prepareWebGPUSpriteBatchWrite(internal, tex1, null, null, defaultWebGPUMaterialRenderer, 1);
    internal.spriteBatchCount = 1;
    prepareWebGPUSpriteBatchWrite(internal, tex2, null, null, defaultWebGPUMaterialRenderer, 1);

    expect(internal.spriteBatchTexture).toBe(tex2);
    expect(internal.spriteBatchCount).toBe(0);
    submitWebGPURenderPass(state);
  });

  it('flushes when material changes', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const internal = state as any;
    const tex = document.createElement('img');
    const materialA = makeMaterial();
    const materialB = makeMaterial();

    prepareWebGPUSpriteBatchWrite(internal, tex, null, materialA, defaultWebGPUMaterialRenderer, 1);
    internal.spriteBatchCount = 1;
    prepareWebGPUSpriteBatchWrite(internal, tex, null, materialB, defaultWebGPUMaterialRenderer, 1);

    expect(internal.spriteBatchMaterial).toBe(materialB);
    expect(internal.spriteBatchCount).toBe(0);
    submitWebGPURenderPass(state);
  });
});

describe('resetWebGPUSpriteBatchBufferPool', () => {
  it('rewinds the pool cursor so slots are reclaimed next frame', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const internal = state as any;
    const tex = document.createElement('img');

    prepareWebGPUSpriteBatchWrite(internal, tex, null, null, defaultWebGPUMaterialRenderer, 1);
    internal.spriteBatchCount = 1;
    flushWebGPUSpriteBatch(internal);
    expect(internal.spriteBatchBufferCursor).toBe(1);

    resetWebGPUSpriteBatchBufferPool(internal);
    expect(internal.spriteBatchBufferCursor).toBe(0);
    submitWebGPURenderPass(state);
  });
});
