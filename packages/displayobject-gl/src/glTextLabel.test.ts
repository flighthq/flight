import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import { makeGlState } from '@flighthq/render-gl';
import { createTextLabel, setTextLabelString } from '@flighthq/text';
import type { RenderProxy2D, TextLabel } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import { registerDefaultGlMaterial } from './glDefaultMaterial';
import { flushGlSpriteBatch } from './glSpriteBatch';
import { defaultGlTextLabelRenderer, drawGlTextLabel } from './glTextLabel';

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

function makeTextData() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx, lastHash: '', logW: 0, logH: 0 };
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
    const { state } = makeGlState();
    registerDefaultGlMaterial(state);
    drawGlTextLabel(state, makeTextProxy('', makeTextData()));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(0);
  });

  it('returns early without writing to batch when rendererData is null', () => {
    const { state } = makeGlState();
    registerDefaultGlMaterial(state);
    drawGlTextLabel(state, makeTextProxy('hello', null));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(0);
  });

  it('returns early without writing to batch when no material renderer is registered', () => {
    const { state } = makeGlState();
    drawGlTextLabel(state, makeTextProxy('hello', makeTextData()));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(0);
  });

  it('writes one instance to the sprite batch when text has content', () => {
    const { state } = makeGlState();
    registerDefaultGlMaterial(state);
    drawGlTextLabel(state, makeTextProxy('hello', makeTextData()));
    expect(getGlRenderStateRuntime(state).spriteBatchCount).toBe(1);
  });

  it('draws via drawElementsInstanced after flush', () => {
    const { state, gl } = makeGlState();
    registerDefaultGlMaterial(state);
    drawGlTextLabel(state, makeTextProxy('hello', makeTextData()));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });

  it('skips layout and rasterization on repeated calls when the content version is unchanged', () => {
    const { state } = makeGlState();
    registerDefaultGlMaterial(state);
    const proxy = makeTextProxy('hello', makeTextData());
    const deleteSpy = vi.spyOn(getGlRenderStateRuntime(state).textureCache, 'delete');
    drawGlTextLabel(state, proxy);
    drawGlTextLabel(state, proxy);
    // textureCache.delete only happens during rasterization (first call); skipped on second.
    expect(deleteSpy).toHaveBeenCalledTimes(1);
  });

  it('re-rasterizes when the content version is bumped', () => {
    const { state } = makeGlState();
    registerDefaultGlMaterial(state);
    const proxy = makeTextProxy('hello', makeTextData());
    const deleteSpy = vi.spyOn(getGlRenderStateRuntime(state).textureCache, 'delete');
    drawGlTextLabel(state, proxy);
    setTextLabelString(proxy.source as TextLabel, 'world');
    drawGlTextLabel(state, proxy);
    expect(deleteSpy).toHaveBeenCalledTimes(2);
  });

  it('does not re-rasterize when only alpha changes (version unchanged)', () => {
    const { state } = makeGlState();
    registerDefaultGlMaterial(state);
    const proxy = makeTextProxy('hello', makeTextData());
    const deleteSpy = vi.spyOn(getGlRenderStateRuntime(state).textureCache, 'delete');
    drawGlTextLabel(state, proxy);
    proxy.alpha = 0.5;
    drawGlTextLabel(state, proxy);
    // Alpha is applied per-instance in the batch; the expensive raster cache is untouched.
    expect(deleteSpy).toHaveBeenCalledTimes(1);
  });
});
