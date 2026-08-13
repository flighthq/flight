import { createImageResource } from '@flighthq/image/contract';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { createTextLabel } from '@flighthq/text/contract';
import type { RenderProxy2D } from '@flighthq/types/contract';
import { BatchFormat } from '@flighthq/types/contract';

import { scopeModuleMocks } from './moduleMockTestHelper';
import { registerWgpuStandardMaterial } from './wgpuStandardMaterial';
import type * as WgpuTextLabelModule from './wgpuTextLabel';

// @flighthq/textlayout.computeTextLayout is stubbed to emit one deterministic glyph group.
// scopeModuleMocks scopes the stub to this file (registry reset before the mock applies, unmock +
// reset after), so under a shared (isolate:false) worker it never leaks into the real text-layout
// consumers (text package) — and a sibling that pre-evaluated ./wgpuTextLabel still picks up the stub.
let defaultWgpuTextLabelRenderer: typeof WgpuTextLabelModule.defaultWgpuTextLabelRenderer;
let drawWgpuTextLabel: typeof WgpuTextLabelModule.drawWgpuTextLabel;

scopeModuleMocks(['@flighthq/textlayout']);

beforeAll(async () => {
  vi.doMock('@flighthq/textlayout/contract', async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
      ...actual,
      computeTextLayout: vi.fn((result: { groups: object[] }, params: { formatRanges: Array<{ format: object }> }) => {
        result.groups.push({
          offsetX: 0,
          offsetY: 0,
          width: 50,
          ascent: 12,
          descent: 4,
          format: params.formatRanges[0]?.format ?? {},
          startIndex: 0,
          endIndex: 5,
        });
      }),
    };
  });
  ({ defaultWgpuTextLabelRenderer, drawWgpuTextLabel } = await import('./wgpuTextLabel'));
  installWgpuMock();
});

function makeTextData() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return {
    canvas,
    ctx,
    image: createImageResource(canvas),
    lastContentId: -1,
    lastPixelRatio: 0,
    logW: 0,
    logH: 0,
    lastPW: 0,
    lastPH: 0,
  };
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

describe('defaultWgpuTextLabelRenderer', () => {
  it('declares BatchFormat.Quad', () => {
    expect(defaultWgpuTextLabelRenderer.format).toBe(BatchFormat.Quad);
  });

  it('has createData and submit functions', () => {
    expect(typeof defaultWgpuTextLabelRenderer.createData).toBe('function');
    expect(typeof defaultWgpuTextLabelRenderer.submit).toBe('function');
  });
});

describe('drawWgpuTextLabel', () => {
  it('returns early when text is empty', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerWgpuStandardMaterial(state);
    expect(() => drawWgpuTextLabel(state, makeTextProxy('', makeTextData()))).not.toThrow();
    expect(getWgpuRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
    submitWgpuRenderPass(state);
  });

  it('writes one instance to the quad-batch writer when text has content', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerWgpuStandardMaterial(state);
    drawWgpuTextLabel(state, makeTextProxy('hello', makeTextData()));
    expect(getWgpuRenderStateRuntime(state).quadBatchWriterCount).toBe(1);
    submitWgpuRenderPass(state);
  });

  it('rasterizes packed run alpha into the canvas color', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerWgpuStandardMaterial(state);
    const data = makeTextData();
    const proxy = makeTextProxy('hello', data);
    (proxy.source as ReturnType<typeof createTextLabel>).data.textFormat = { color: 0xff000080 };
    const styles: Array<string | CanvasGradient | CanvasPattern> = [];
    vi.spyOn(data.ctx, 'fillText').mockImplementation(() => styles.push(data.ctx.fillStyle));

    drawWgpuTextLabel(state, proxy);

    expect(styles).toEqual(['rgba(255, 0, 0, 0.5019607843137255)']);
    submitWgpuRenderPass(state);
  });

  it('does not re-rasterize when only alpha changes (content version unchanged)', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerWgpuStandardMaterial(state);
    const proxy = makeTextProxy('hello', makeTextData());
    drawWgpuTextLabel(state, proxy);
    const updateSpy = vi.spyOn(getWgpuRenderStateRuntime(state).textureCache, 'get');
    proxy.alpha = 0.5;
    drawWgpuTextLabel(state, proxy);
    // Version is unchanged, so the rasterization block is skipped entirely on the second draw.
    expect((proxy.rendererData as any).lastContentId).toBe(0);
    submitWgpuRenderPass(state);
    updateSpy.mockRestore();
  });
});
