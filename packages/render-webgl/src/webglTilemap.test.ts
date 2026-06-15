import type { SpriteRenderNode } from '@flighthq/types';

import { flushWebGLSpriteBatch } from './webglSpriteBatch';
import { makeWebGLState } from './webglTestHelper';
import { defaultWebGLTilemapRenderer } from './webglTilemap';

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
    renderer: null,
    traverseChildren: false,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as SpriteRenderNode;
}

describe('defaultWebGLTilemapRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWebGLTilemapRenderer.createData).toBe('function');
  });

  it('has a submit function', () => {
    expect(typeof defaultWebGLTilemapRenderer.submit).toBe('function');
  });
});

describe('defaultWebGLTilemapRenderer.submit', () => {
  it('returns early without drawing when tileset is null', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLTilemapRenderer.submit(state, makeTilemapNode({ tileset: null }));
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas is null', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLTilemapRenderer.submit(state, makeTilemapNode({ tileset: makeTileset(null) }));
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image is null', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLTilemapRenderer.submit(
      state,
      makeTilemapNode({ tileset: { atlas: { image: null, regions: [] }, tileWidth: 16, tileHeight: 16 } }),
    );
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when atlas.image.src is null', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLTilemapRenderer.submit(
      state,
      makeTilemapNode({ tileset: { atlas: { image: { src: null }, regions: [] }, tileWidth: 16, tileHeight: 16 } }),
    );
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when columns is 0', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLTilemapRenderer.submit(state, makeTilemapNode({ columns: 0 }));
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('returns early without drawing when rows is 0', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLTilemapRenderer.submit(state, makeTilemapNode({ rows: 0 }));
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('draws all valid tiles in a single instanced call', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLTilemapRenderer.submit(state, makeTilemapNode());
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 4);
  });

  it('excludes out-of-range tile ids from the instanced draw count', () => {
    const { state, gl } = makeWebGLState();
    defaultWebGLTilemapRenderer.submit(state, makeTilemapNode({ tiles: [0, 99, 99, 0] }));
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 2);
  });
});
