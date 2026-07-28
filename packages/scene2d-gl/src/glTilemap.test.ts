import type { RenderProxy2D } from '@flighthq/types/contract';

import { flushGlSpriteBatch } from './glSpriteBatch';
import { registerStandardGlMaterial } from './glStandardMaterial';
import { createGlState } from './glTestHelper';
import { defaultGlTilemapRenderer } from './glTilemap';

function makeAtlas() {
  const img = document.createElement('img');
  const image = createImageResource(img);
  image.width = 64;
  image.height = 64;
  return {
    regions: [{ x: 0, y: 0, width: 16, height: 16 }],
    texture: createTexture({ storage: { dimension: '2d', image } }),
  };
}

function createAtlasGlState() {
  const result = createGlState();
  registerGlImageTextureResolver(result.state);
  return result;
}

function makeTilemapNode(data: Record<string, unknown> = {}): RenderProxy2D {
  return {
    source: {
      data: {
        atlas: makeAtlas(),
        columns: 2,
        rows: 2,
        tileHeight: 16,
        tileWidth: 16,
        tiles: [0, 0, 0, 0],
        ...data,
      },
    },
    blendMode: 0,
    alpha: 1,
    material: null,
    materialData: null,
    renderer: null,
    traverseChildren: false,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as RenderProxy2D;
}

describe('defaultGlTilemapRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultGlTilemapRenderer.createData).toBe('function');
  });

  it('has a submit function', () => {
    expect(typeof defaultGlTilemapRenderer.submit).toBe('function');
  });
});

describe('defaultGlTilemapRenderer.submit', () => {
  it('returns early without drawing when atlas is null', () => {
    const { state, gl } = createAtlasGlState();
    registerStandardGlMaterial(state);
    defaultGlTilemapRenderer.submit(state, makeTilemapNode({ atlas: null }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.texture is null', () => {
    const { state, gl } = createAtlasGlState();
    registerStandardGlMaterial(state);
    defaultGlTilemapRenderer.submit(state, makeTilemapNode({ atlas: { regions: [], texture: null } }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas Texture is unbound', () => {
    const { state, gl } = createAtlasGlState();
    registerStandardGlMaterial(state);
    defaultGlTilemapRenderer.submit(
      state,
      makeTilemapNode({
        atlas: { regions: [], texture: createTexture() },
      }),
    );
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when columns is 0', () => {
    const { state, gl } = createAtlasGlState();
    registerStandardGlMaterial(state);
    defaultGlTilemapRenderer.submit(state, makeTilemapNode({ columns: 0 }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when rows is 0', () => {
    const { state, gl } = createAtlasGlState();
    registerStandardGlMaterial(state);
    defaultGlTilemapRenderer.submit(state, makeTilemapNode({ rows: 0 }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('draws all valid tiles in a single instanced call', () => {
    const { state, gl } = createAtlasGlState();
    registerStandardGlMaterial(state);
    defaultGlTilemapRenderer.submit(state, makeTilemapNode());
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 4);
  });

  it('excludes out-of-range tile ids from the instanced draw count', () => {
    const { state, gl } = createAtlasGlState();
    registerStandardGlMaterial(state);
    defaultGlTilemapRenderer.submit(state, makeTilemapNode({ tiles: [0, 99, 99, 0] }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 2);
  });
});
import { createImageResource } from '@flighthq/image/contract';
import { registerGlImageTextureResolver } from '@flighthq/render-gl/contract';
import { createTexture } from '@flighthq/texture/contract';
