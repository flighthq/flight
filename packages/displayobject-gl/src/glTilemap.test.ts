import type { RenderProxy2D } from '@flighthq/types';

import { registerDefaultGlMaterial } from './glDefaultMaterial';
import { flushGlSpriteBatch } from './glSpriteBatch';
import { makeGlState } from './glTestHelper';
import { defaultGlTilemapRenderer } from './glTilemap';

function makeAtlas() {
  const img = document.createElement('img');
  return {
    image: { source: img, width: 64, height: 64 },
    regions: [{ x: 0, y: 0, width: 16, height: 16 }],
  };
}

function makeTileset(atlasOverride?: unknown) {
  return {
    atlas: atlasOverride !== undefined ? atlasOverride : makeAtlas(),
    tileWidth: 16,
    tileHeight: 16,
  };
}

function makeTilemapNode(data: Record<string, unknown> = {}): RenderProxy2D {
  return {
    source: {
      data: {
        tileset: makeTileset(),
        columns: 2,
        rows: 2,
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
  it('returns early without drawing when tileset is null', () => {
    const { state, gl } = makeGlState();
    registerDefaultGlMaterial(state);
    defaultGlTilemapRenderer.submit(state, makeTilemapNode({ tileset: null }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas is null', () => {
    const { state, gl } = makeGlState();
    registerDefaultGlMaterial(state);
    defaultGlTilemapRenderer.submit(state, makeTilemapNode({ tileset: makeTileset(null) }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image is null', () => {
    const { state, gl } = makeGlState();
    registerDefaultGlMaterial(state);
    defaultGlTilemapRenderer.submit(
      state,
      makeTilemapNode({ tileset: { atlas: { image: null, regions: [] }, tileWidth: 16, tileHeight: 16 } }),
    );
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image.source is null', () => {
    const { state, gl } = makeGlState();
    registerDefaultGlMaterial(state);
    defaultGlTilemapRenderer.submit(
      state,
      makeTilemapNode({ tileset: { atlas: { image: { source: null }, regions: [] }, tileWidth: 16, tileHeight: 16 } }),
    );
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when columns is 0', () => {
    const { state, gl } = makeGlState();
    registerDefaultGlMaterial(state);
    defaultGlTilemapRenderer.submit(state, makeTilemapNode({ columns: 0 }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when rows is 0', () => {
    const { state, gl } = makeGlState();
    registerDefaultGlMaterial(state);
    defaultGlTilemapRenderer.submit(state, makeTilemapNode({ rows: 0 }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('draws all valid tiles in a single instanced call', () => {
    const { state, gl } = makeGlState();
    registerDefaultGlMaterial(state);
    defaultGlTilemapRenderer.submit(state, makeTilemapNode());
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 4);
  });

  it('excludes out-of-range tile ids from the instanced draw count', () => {
    const { state, gl } = makeGlState();
    registerDefaultGlMaterial(state);
    defaultGlTilemapRenderer.submit(state, makeTilemapNode({ tiles: [0, 99, 99, 0] }));
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 2);
  });
});
