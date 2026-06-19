import { createTextLabel } from '@flighthq/text';
import type { RenderProxy2D } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { registerDefaultWebGPUMaterial } from './webgpuDefaultMaterial';
import { getWebGPURenderStateRuntime } from './webgpuRenderState';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';
import { defaultWebGPUTextLabelRenderer, drawWebGPUTextLabel } from './webgpuTextLabel';

vi.mock('@flighthq/text-layout', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    computeTextLayout: vi.fn((result: { groups: object[] }) => {
      result.groups.push({
        offsetX: 0,
        offsetY: 0,
        width: 50,
        ascent: 12,
        descent: 4,
        format: {},
        startIndex: 0,
        endIndex: 5,
      });
    }),
  };
});

beforeAll(() => {
  installWebGPUMock();
});

function makeTextData() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx, lastContentID: -1, lastPixelRatio: 0, logW: 0, logH: 0, lastPW: 0, lastPH: 0 };
}

function makeTextProxy(text = '', rendererData: unknown = null): RenderProxy2D {
  const source = createTextLabel();
  source.data.text = text;
  source.data.textFormat = {};
  source.data.width = 200;
  source.data.height = 100;
  return {
    source,
    blendMode: 0,
    alpha: 1,
    material: null,
    materialData: null,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    rendererData,
  } as unknown as RenderProxy2D;
}

describe('defaultWebGPUTextLabelRenderer', () => {
  it('declares BatchFormat.Quad', () => {
    expect(defaultWebGPUTextLabelRenderer.format).toBe(BatchFormat.Quad);
  });

  it('has createData and submit functions', () => {
    expect(typeof defaultWebGPUTextLabelRenderer.createData).toBe('function');
    expect(typeof defaultWebGPUTextLabelRenderer.submit).toBe('function');
  });
});

describe('drawWebGPUTextLabel', () => {
  it('returns early when text is empty', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    registerDefaultWebGPUMaterial(state);
    expect(() => drawWebGPUTextLabel(state, makeTextProxy('', makeTextData()))).not.toThrow();
    expect(getWebGPURenderStateRuntime(state).spriteBatchCount).toBe(0);
    submitWebGPURenderPass(state);
  });

  it('writes one instance to the sprite batch when text has content', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    registerDefaultWebGPUMaterial(state);
    drawWebGPUTextLabel(state, makeTextProxy('hello', makeTextData()));
    expect(getWebGPURenderStateRuntime(state).spriteBatchCount).toBe(1);
    submitWebGPURenderPass(state);
  });

  it('does not re-rasterize when only alpha changes (content version unchanged)', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    registerDefaultWebGPUMaterial(state);
    const proxy = makeTextProxy('hello', makeTextData());
    drawWebGPUTextLabel(state, proxy);
    const updateSpy = vi.spyOn(getWebGPURenderStateRuntime(state).textureCache, 'get');
    proxy.alpha = 0.5;
    drawWebGPUTextLabel(state, proxy);
    // Version is unchanged, so the rasterization block is skipped entirely on the second draw.
    expect((proxy.rendererData as any).lastContentID).toBe(0);
    submitWebGPURenderPass(state);
    updateSpy.mockRestore();
  });
});
