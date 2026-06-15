import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { flushWebGPUSpriteBatch, prepareWebGPUSpriteBatchWrite } from './webgpuSpriteBatch';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

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

    prepareWebGPUSpriteBatchWrite(internal, tex, null, null, 1);
    internal.spriteBatchCount = 1;
    flushWebGPUSpriteBatch(internal);

    expect(internal.spriteBatchCount).toBe(0);
    expect(internal.spriteBatchTexture).toBeNull();
    expect(internal.spriteBatchBlendMode).toBeNull();
    submitWebGPURenderPass(state);
  });
});

describe('prepareWebGPUSpriteBatchWrite', () => {
  it('returns float index 0 for an empty batch', async () => {
    const state = await createWebGPURenderStateForTest();
    const internal = state as any;
    const tex = document.createElement('img');

    const base = prepareWebGPUSpriteBatchWrite(internal, tex, null, null, 1);
    expect(base).toBe(0);
  });

  it('flushes when texture changes', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const internal = state as any;
    const tex1 = document.createElement('img');
    const tex2 = document.createElement('img');

    prepareWebGPUSpriteBatchWrite(internal, tex1, null, null, 1);
    internal.spriteBatchCount = 1;
    prepareWebGPUSpriteBatchWrite(internal, tex2, null, null, 1);

    expect(internal.spriteBatchTexture).toBe(tex2);
    expect(internal.spriteBatchCount).toBe(0);
    submitWebGPURenderPass(state);
  });

  it('flushes when color transform changes', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const internal = state as any;
    const tex = document.createElement('img');
    const ct = {
      redMultiplier: 1,
      greenMultiplier: 0.5,
      blueMultiplier: 1,
      alphaMultiplier: 1,
      redOffset: 0,
      greenOffset: 0,
      blueOffset: 0,
      alphaOffset: 0,
    } as any;

    prepareWebGPUSpriteBatchWrite(internal, tex, null, ct, 1);
    internal.spriteBatchCount = 1;
    prepareWebGPUSpriteBatchWrite(internal, tex, null, null, 1);

    expect(internal.spriteBatchColorTransform).toBeNull();
    expect(internal.spriteBatchCount).toBe(0);
    submitWebGPURenderPass(state);
  });
});
