import { createEntity } from '@flighthq/entity';
import type {
  DOMRenderState,
  Renderable,
  RendererData,
  RenderState,
  SpriteRenderer,
  SpriteRenderNode,
  Tilemap,
} from '@flighthq/types';

import { applyDOMStyle, initDOMElement } from './domStyle';

interface DOMTilemapData extends RendererData {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
}

function createDOMTilemapData(_state: RenderState, _source: Renderable): DOMTilemapData {
  return createEntity({ canvas: null, context: null });
}

export function drawDOMTilemap(state: DOMRenderState, tilemapNode: SpriteRenderNode): void {
  const source = tilemapNode.source as Tilemap;
  const { tileset, columns, rows, tiles } = source.data;

  if (tileset === null) return;
  const atlas = tileset.atlas;
  if (atlas === null || atlas.image === null || atlas.image.src === null) return;
  if (columns === 0 || rows === 0) return;

  const data = tilemapNode.rendererData as DOMTilemapData | null;
  if (data === null) return;

  const pr = state.pixelRatio;
  const { tileWidth, tileHeight } = tileset;
  const canvasW = columns * tileWidth;
  const canvasH = rows * tileHeight;
  const physicalW = canvasW * pr;
  const physicalH = canvasH * pr;

  if (data.canvas === null) {
    data.canvas = document.createElement('canvas');
    data.context = data.canvas.getContext('2d');
    initDOMElement(data.canvas);
    data.canvas.width = physicalW;
    data.canvas.height = physicalH;
    data.canvas.style.width = canvasW + 'px';
    data.canvas.style.height = canvasH + 'px';
  } else if (data.canvas.width !== physicalW || data.canvas.height !== physicalH) {
    data.canvas.width = physicalW;
    data.canvas.height = physicalH;
    data.canvas.style.width = canvasW + 'px';
    data.canvas.style.height = canvasH + 'px';
  } else {
    data.context!.clearRect(0, 0, physicalW, physicalH);
  }

  const ctx = data.context!;
  ctx.imageSmoothingEnabled = state.allowSmoothing;
  ctx.globalAlpha = tilemapNode.alpha;

  const image = atlas.image.src;
  const regions = atlas.regions;
  const numRegions = regions.length;
  const roundPixels = state.roundPixels;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const id = tiles[row * columns + col];
      if (id < 0 || id >= numRegions) continue;

      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;

      const dx = col * tileWidth * pr;
      const dy = row * tileHeight * pr;

      ctx.drawImage(
        image,
        region.x,
        region.y,
        region.width,
        region.height,
        roundPixels ? dx | 0 : dx,
        roundPixels ? dy | 0 : dy,
        region.width * pr,
        region.height * pr,
      );
    }
  }

  applyDOMStyle(state, data.canvas, tilemapNode);
  state.element.appendChild(data.canvas);
}

export const defaultDOMTilemapRenderer: SpriteRenderer = {
  createData: createDOMTilemapData as SpriteRenderer['createData'],
  draw: drawDOMTilemap,
};
