import type { Material } from '@flighthq/types';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { defaultWebGPUMaterialRenderer } from './webgpuDefaultMaterial';
import { getWebGPURenderStateRuntime } from './webgpuRenderState';
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
    expect(() => flushWebGPUSpriteBatch(state)).not.toThrow();
    submitWebGPURenderPass(state);
  });

  it('resets state after flush', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const runtime = getWebGPURenderStateRuntime(state);
    const tex = document.createElement('img');

    prepareWebGPUSpriteBatchWrite(state, tex, null, null, defaultWebGPUMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    flushWebGPUSpriteBatch(state);

    expect(runtime.spriteBatchCount).toBe(0);
    expect(runtime.spriteBatchTexture).toBeNull();
    expect(runtime.spriteBatchBlendMode).toBeNull();
    expect(runtime.spriteBatchMaterial).toBeNull();
    submitWebGPURenderPass(state);
  });

  it('claims a distinct buffer per flush so deferred draws never share one', async () => {
    // The canvas pass is submitted once at end of frame; if successive flushes reused one instance
    // buffer, every draw would read the last flush's data and the batch would collapse to one spot.
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const runtime = getWebGPURenderStateRuntime(state);
    const tex1 = document.createElement('img');
    const tex2 = document.createElement('img');

    prepareWebGPUSpriteBatchWrite(state, tex1, null, null, defaultWebGPUMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    flushWebGPUSpriteBatch(state);

    prepareWebGPUSpriteBatchWrite(state, tex2, null, null, defaultWebGPUMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    flushWebGPUSpriteBatch(state);

    expect(runtime.spriteBatchBufferCursor).toBe(2);
    expect(runtime.spriteBatchBufferPool[0].instanceBuffer).not.toBeNull();
    expect(runtime.spriteBatchBufferPool[0].instanceBuffer).not.toBe(runtime.spriteBatchBufferPool[1].instanceBuffer);
    submitWebGPURenderPass(state);
  });
});

describe('prepareWebGPUSpriteBatchWrite', () => {
  it('returns float index 0 for an empty batch', async () => {
    const state = await createWebGPURenderStateForTest();
    const tex = document.createElement('img');

    const base = prepareWebGPUSpriteBatchWrite(state, tex, null, null, defaultWebGPUMaterialRenderer, 1);
    expect(base).toBe(0);
  });

  it('flushes when texture changes', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const runtime = getWebGPURenderStateRuntime(state);
    const tex1 = document.createElement('img');
    const tex2 = document.createElement('img');

    prepareWebGPUSpriteBatchWrite(state, tex1, null, null, defaultWebGPUMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    prepareWebGPUSpriteBatchWrite(state, tex2, null, null, defaultWebGPUMaterialRenderer, 1);

    expect(runtime.spriteBatchTexture).toBe(tex2);
    expect(runtime.spriteBatchCount).toBe(0);
    submitWebGPURenderPass(state);
  });

  it('flushes when material changes', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const runtime = getWebGPURenderStateRuntime(state);
    const tex = document.createElement('img');
    const materialA = makeMaterial();
    const materialB = makeMaterial();

    prepareWebGPUSpriteBatchWrite(state, tex, null, materialA, defaultWebGPUMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    prepareWebGPUSpriteBatchWrite(state, tex, null, materialB, defaultWebGPUMaterialRenderer, 1);

    expect(runtime.spriteBatchMaterial).toBe(materialB);
    expect(runtime.spriteBatchCount).toBe(0);
    submitWebGPURenderPass(state);
  });
});

describe('resetWebGPUSpriteBatchBufferPool', () => {
  it('rewinds the pool cursor so slots are reclaimed next frame', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const runtime = getWebGPURenderStateRuntime(state);
    const tex = document.createElement('img');

    prepareWebGPUSpriteBatchWrite(state, tex, null, null, defaultWebGPUMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    flushWebGPUSpriteBatch(state);
    expect(runtime.spriteBatchBufferCursor).toBe(1);

    resetWebGPUSpriteBatchBufferPool(state);
    expect(runtime.spriteBatchBufferCursor).toBe(0);
    submitWebGPURenderPass(state);
  });
});
