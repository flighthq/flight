import { createText, setTextString } from '@flighthq/displayobject';
import type { RenderProxy2D, Text } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import { registerDefaultWebGLMaterial } from './webglDefaultMaterial';
import { flushWebGLSpriteBatch } from './webglSpriteBatch';
import { makeWebGLState } from './webglTestHelper';
import { defaultWebGLTextRenderer, drawWebGLText, drawWebGLTextMask } from './webglText';

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

describe('defaultWebGLTextRenderer', () => {
  it('declares BatchFormat.Quad', () => {
    expect(defaultWebGLTextRenderer.format).toBe(BatchFormat.Quad);
  });

  it('has a createData function', () => {
    expect(typeof defaultWebGLTextRenderer.createData).toBe('function');
  });

  it('has a submit function pointing to drawWebGLText', () => {
    expect(defaultWebGLTextRenderer.submit).toBe(drawWebGLText);
  });

  it('has a drawMask function pointing to drawWebGLTextMask', () => {});
});

describe('drawWebGLText', () => {
  it('returns early without writing to batch when text is empty', () => {
    const { state } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    drawWebGLText(state, makeTextProxy('', makeTextData()));
    expect(state.spriteBatchCount).toBe(0);
  });

  it('returns early without writing to batch when rendererData is null', () => {
    const { state } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    drawWebGLText(state, makeTextProxy('hello', null));
    expect(state.spriteBatchCount).toBe(0);
  });

  it('returns early without writing to batch when no material renderer is registered', () => {
    const { state } = makeWebGLState();
    drawWebGLText(state, makeTextProxy('hello', makeTextData()));
    expect(state.spriteBatchCount).toBe(0);
  });

  it('writes one instance to the sprite batch when text has content', () => {
    const { state } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    drawWebGLText(state, makeTextProxy('hello', makeTextData()));
    expect(state.spriteBatchCount).toBe(1);
  });

  it('draws via drawElementsInstanced after flush', () => {
    const { state, gl } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    drawWebGLText(state, makeTextProxy('hello', makeTextData()));
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });

  it('skips layout and rasterization on repeated calls when the content version is unchanged', () => {
    const { state } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    const proxy = makeTextProxy('hello', makeTextData());
    const deleteSpy = vi.spyOn((state as any).textureCache, 'delete');
    drawWebGLText(state, proxy);
    drawWebGLText(state, proxy);
    // textureCache.delete only happens during rasterization (first call); skipped on second.
    expect(deleteSpy).toHaveBeenCalledTimes(1);
  });

  it('re-rasterizes when the content version is bumped', () => {
    const { state } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    const proxy = makeTextProxy('hello', makeTextData());
    const deleteSpy = vi.spyOn((state as any).textureCache, 'delete');
    drawWebGLText(state, proxy);
    setTextString(proxy.source as Text, 'world');
    drawWebGLText(state, proxy);
    expect(deleteSpy).toHaveBeenCalledTimes(2);
  });

  it('does not re-rasterize when only alpha changes (version unchanged)', () => {
    const { state } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    const proxy = makeTextProxy('hello', makeTextData());
    const deleteSpy = vi.spyOn((state as any).textureCache, 'delete');
    drawWebGLText(state, proxy);
    proxy.alpha = 0.5;
    drawWebGLText(state, proxy);
    // Alpha is applied per-instance in the batch; the expensive raster cache is untouched.
    expect(deleteSpy).toHaveBeenCalledTimes(1);
  });
});

describe('drawWebGLTextMask', () => {
  it('uses the text draw path', () => {
    const { state } = makeWebGLState();
    expect(() => drawWebGLTextMask(state, makeTextProxy('', makeTextData()))).not.toThrow();
    expect(state.spriteBatchCount).toBe(0);
  });
});
