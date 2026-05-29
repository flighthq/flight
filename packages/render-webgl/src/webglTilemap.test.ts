import type { SpriteRenderNode } from '@flighthq/types';

import { defaultWebGLTilemapRenderer, drawWebGLTilemap } from './webglTilemap';
import { makeWebGLState } from './webglTestHelper';

function makeAtlas() {
  const img = document.createElement('img');
  return {
    image: { src: img, width: 64, height: 64 },
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

function makeTilemapNode(data: Record<string, unknown> = {}): SpriteRenderNode {
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
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as SpriteRenderNode;
}

describe('defaultWebGLTilemapRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWebGLTilemapRenderer.createData).toBe('function');
  });

  it('has a draw function pointing to drawWebGLTilemap', () => {
    expect(defaultWebGLTilemapRenderer.draw).toBe(drawWebGLTilemap);
  });
});

describe('drawWebGLTilemap', () => {
  it('returns early without drawing when tileset is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLTilemap(state, makeTilemapNode({ tileset: null }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLTilemap(state, makeTilemapNode({ tileset: makeTileset(null) }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLTilemap(state, makeTilemapNode({ tileset: { atlas: { image: null, regions: [] }, tileWidth: 16, tileHeight: 16 } }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image.src is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLTilemap(state, makeTilemapNode({ tileset: { atlas: { image: { src: null }, regions: [] }, tileWidth: 16, tileHeight: 16 } }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when columns is 0', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLTilemap(state, makeTilemapNode({ columns: 0 }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when rows is 0', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLTilemap(state, makeTilemapNode({ rows: 0 }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('draws once per tile with a valid region', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLTilemap(state, makeTilemapNode());
    // 2x2 grid, all tiles reference region 0 (16×16) which is valid
    expect(gl.drawElements).toHaveBeenCalledTimes(4);
  });

  it('skips tiles with out-of-range ids', () => {
    const { state, gl } = makeWebGLState();
    // tile id 99 is out of range, only the valid tiles (id=0) should draw
    drawWebGLTilemap(state, makeTilemapNode({ tiles: [0, 99, 99, 0] }));
    expect(gl.drawElements).toHaveBeenCalledTimes(2);
  });
});
