import { createImageResource } from '@flighthq/image';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import { createTextLabel, setTextLabelString } from '@flighthq/text';
import type { RenderProxy2D, TextLabel } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import { registerDefaultGlMaterial } from './glDefaultMaterial';
import { flushGlSpriteBatch } from './glSpriteBatch';
import { createGlState } from './glTestHelper';
import type * as GlTextLabelModule from './glTextLabel';
import { scopeModuleMocks } from './moduleMockTestHelper';

// @flighthq/textlayout.computeTextLayout is stubbed to emit one deterministic glyph group.
// scopeModuleMocks scopes the stub to this file (registry reset before the mock applies, unmock +
// reset after), so under a shared (isolate:false) worker it never leaks into the real text-layout
// consumers (text package) — and a sibling that pre-evaluated ./glTextLabel still picks up the stub.
let defaultGlTextLabelRenderer: typeof GlTextLabelModule.defaultGlTextLabelRenderer;
let drawGlTextLabel: typeof GlTextLabelModule.drawGlTextLabel;

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
  ({ defaultGlTextLabelRenderer, drawGlTextLabel } = await import('./glTextLabel'));
});

function makeTextData() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx, image: createImageResource(canvas), lastHash: '', logW: 0, logH: 0 };
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

describe('defaultGlTextLabelRenderer', () => {
  it('declares BatchFormat.Quad', () => {
    expect(defaultGlTextLabelRenderer.format).toBe(BatchFormat.Quad);
  });

  it('has a createData function', () => {
    expect(typeof defaultGlTextLabelRenderer.createData).toBe('function');
  });

  it('has a submit function pointing to drawGlTextLabel', () => {
    expect(defaultGlTextLabelRenderer.submit).toBe(drawGlTextLabel);
  });
});

describe('drawGlTextLabel', () => {
  it('returns early without writing to batch when text is empty', () => {
    const { state } = createGlState();
    registerDefaultGlMaterial(state);
    drawGlTextLabel(state, makeTextProxy('', makeTextData()));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(0);
  });

  it('returns early without writing to batch when rendererData is null', () => {
    const { state } = createGlState();
    registerDefaultGlMaterial(state);
    drawGlTextLabel(state, makeTextProxy('hello', null));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(0);
  });

  it('returns early without writing to batch when no material renderer is registered', () => {
    const { state } = createGlState();
    drawGlTextLabel(state, makeTextProxy('hello', makeTextData()));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(0);
  });

  it('writes one instance to the sprite batch when text has content', () => {
    const { state } = createGlState();
    registerDefaultGlMaterial(state);
    drawGlTextLabel(state, makeTextProxy('hello', makeTextData()));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(1);
  });

  it('draws via drawElementsInstanced after flush', () => {
    const { state, gl } = createGlState();
    registerDefaultGlMaterial(state);
    drawGlTextLabel(state, makeTextProxy('hello', makeTextData()));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });

  it('skips layout and rasterization on repeated calls when the content version is unchanged', () => {
    const { state } = createGlState();
    registerDefaultGlMaterial(state);
    const data = makeTextData();
    const proxy = makeTextProxy('hello', data);
    drawGlTextLabel(state, proxy);
    // Rasterization bumps the canvas resource's version (setImageResourceSource); a skipped raster leaves
    // it untouched. First draw rasterizes (version → 1); the repeat is skipped.
    const rasterized = data.image.version;
    drawGlTextLabel(state, proxy);
    expect(data.image.version).toBe(rasterized);
  });

  it('re-rasterizes when the content version is bumped', () => {
    const { state } = createGlState();
    registerDefaultGlMaterial(state);
    const data = makeTextData();
    const proxy = makeTextProxy('hello', data);
    drawGlTextLabel(state, proxy);
    const rasterized = data.image.version;
    setTextLabelString(proxy.source as TextLabel, 'world');
    drawGlTextLabel(state, proxy);
    expect(data.image.version).toBeGreaterThan(rasterized);
  });

  it('does not re-rasterize when only alpha changes (version unchanged)', () => {
    const { state } = createGlState();
    registerDefaultGlMaterial(state);
    const data = makeTextData();
    const proxy = makeTextProxy('hello', data);
    drawGlTextLabel(state, proxy);
    const rasterized = data.image.version;
    proxy.alpha = 0.5;
    drawGlTextLabel(state, proxy);
    // Alpha is applied per-instance in the batch; the expensive raster (and its version bump) is untouched.
    expect(data.image.version).toBe(rasterized);
  });
});
