import { createText } from '@flighthq/displayobject';
import type { RenderProxy2D } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { registerDefaultWebGPUMaterial } from './webgpuDefaultMaterial';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';
import { defaultWebGPUTextRenderer, drawWebGPUText, drawWebGPUTextMask } from './webgpuText';

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
  const source = createText();
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

describe('defaultWebGPUTextRenderer', () => {
  it('declares BatchFormat.Quad', () => {
    expect(defaultWebGPUTextRenderer.format).toBe(BatchFormat.Quad);
  });

  it('has createData and submit functions', () => {
    expect(typeof defaultWebGPUTextRenderer.createData).toBe('function');
    expect(typeof defaultWebGPUTextRenderer.submit).toBe('function');
  });
});

describe('drawWebGPUText', () => {
  it('returns early when text is empty', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    registerDefaultWebGPUMaterial(state);
    expect(() => drawWebGPUText(state, makeTextProxy('', makeTextData()))).not.toThrow();
    expect((state as any).spriteBatchCount).toBe(0);
    submitWebGPURenderPass(state);
  });

  it('writes one instance to the sprite batch when text has content', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    registerDefaultWebGPUMaterial(state);
    drawWebGPUText(state, makeTextProxy('hello', makeTextData()));
    expect((state as any).spriteBatchCount).toBe(1);
    submitWebGPURenderPass(state);
  });

  it('does not re-rasterize when only alpha changes (content version unchanged)', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    registerDefaultWebGPUMaterial(state);
    const proxy = makeTextProxy('hello', makeTextData());
    drawWebGPUText(state, proxy);
    const updateSpy = vi.spyOn((state as any).textureCache, 'get');
    proxy.alpha = 0.5;
    drawWebGPUText(state, proxy);
    // Version is unchanged, so the rasterization block is skipped entirely on the second draw.
    expect((proxy.rendererData as any).lastContentID).toBe(0);
    submitWebGPURenderPass(state);
    updateSpy.mockRestore();
  });
});

describe('drawWebGPUTextMask', () => {
  it('delegates to drawWebGPUText', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    expect(() => drawWebGPUTextMask(state, makeTextProxy('', makeTextData()))).not.toThrow();
    submitWebGPURenderPass(state);
  });
});
