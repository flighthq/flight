import { createImageResource } from '@flighthq/image';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import { createTextLabel } from '@flighthq/text';
import type { RenderProxy2D } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import { scopeModuleMocks } from './moduleMockTestHelper';
import { registerDefaultWgpuMaterial } from './wgpuDefaultMaterial';
import type * as WgpuTextLabelModule from './wgpuTextLabel';

// @flighthq/textlayout.computeTextLayout is stubbed to emit one deterministic glyph group.
// scopeModuleMocks scopes the stub to this file (registry reset before the mock applies, unmock +
// reset after), so under a shared (isolate:false) worker it never leaks into the real text-layout
// consumers (text package) — and a sibling that pre-evaluated ./wgpuTextLabel still picks up the stub.
let defaultWgpuTextLabelRenderer: typeof WgpuTextLabelModule.defaultWgpuTextLabelRenderer;
let drawWgpuTextLabel: typeof WgpuTextLabelModule.drawWgpuTextLabel;

scopeModuleMocks(['@flighthq/textlayout']);

beforeAll(async () => {
  vi.doMock('@flighthq/textlayout', async (importOriginal) => {
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
    registerDefaultWgpuMaterial(state);
    expect(() => drawWgpuTextLabel(state, makeTextProxy('', makeTextData()))).not.toThrow();
    expect(getWgpuRenderStateRuntime(state).spriteBatchCount).toBe(0);
    submitWgpuRenderPass(state);
  });

  it('writes one instance to the sprite batch when text has content', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerDefaultWgpuMaterial(state);
    drawWgpuTextLabel(state, makeTextProxy('hello', makeTextData()));
    expect(getWgpuRenderStateRuntime(state).spriteBatchCount).toBe(1);
    submitWgpuRenderPass(state);
  });

  it('does not re-rasterize when only alpha changes (content version unchanged)', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerDefaultWgpuMaterial(state);
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
