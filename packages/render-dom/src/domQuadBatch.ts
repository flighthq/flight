import { createEntity } from '@flighthq/entity';
import { setMatrixFromFloat32Array } from '@flighthq/geometry';
import { acquireMatrix, releaseMatrix } from '@flighthq/geometry/matrixPool';
import type {
  DOMRenderState,
  QuadBatch,
  Renderable,
  RendererData,
  RenderState,
  SpriteRenderer,
  SpriteRenderTreeNode,
} from '@flighthq/types';

import { applyDOMStyle, initDOMElement, setDOMRendererElement } from './domStyle';

interface DOMQuadBatchData extends RendererData {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
}

function createDOMQuadBatchData(_state: RenderState, _source: Renderable): DOMQuadBatchData {
  return createEntity({ canvas: null, context: null });
}

export function drawDOMQuadBatch(state: DOMRenderState, quadBatch: SpriteRenderTreeNode): void {
  const source = quadBatch.source as QuadBatch;
  const { atlas, instanceCount, ids, transforms } = source.data;
  if (atlas === null || atlas.image === null || atlas.image.src === null || instanceCount === 0) return;

  const data = quadBatch.rendererData as DOMQuadBatchData | null;
  if (data === null) return;

  const regions = atlas.regions;
  const numRegions = regions.length;
  const image = atlas.image.src;
  const stride = source.data.transformType === 'vector2' ? 2 : 6;

  let maxX = 1;
  let maxY = 1;

  if (stride === 2) {
    for (let i = 0; i < instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      const dx = transforms[i * 2];
      const dy = transforms[i * 2 + 1];
      if (dx + region.width > maxX) maxX = dx + region.width;
      if (dy + region.height > maxY) maxY = dy + region.height;
    }
  } else {
    for (let i = 0; i < instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      const offset = i * 6;
      const tx = transforms[offset + 4];
      const ty = transforms[offset + 5];
      if (tx + region.width > maxX) maxX = tx + region.width;
      if (ty + region.height > maxY) maxY = ty + region.height;
    }
  }

  const pr = state.pixelRatio;
  const requiredW = Math.ceil(maxX);
  const requiredH = Math.ceil(maxY);
  const physicalW = Math.ceil(maxX * pr);
  const physicalH = Math.ceil(maxY * pr);

  if (data.canvas === null) {
    data.canvas = document.createElement('canvas');
    data.context = data.canvas.getContext('2d');
    initDOMElement(data.canvas);
    data.canvas.width = physicalW;
    data.canvas.height = physicalH;
  } else if (data.canvas.width !== physicalW || data.canvas.height !== physicalH) {
    data.canvas.width = physicalW;
    data.canvas.height = physicalH;
  } else {
    data.context!.clearRect(0, 0, physicalW, physicalH);
  }

  data.canvas.style.width = requiredW + 'px';
  data.canvas.style.height = requiredH + 'px';

  const ctx = data.context!;
  ctx.imageSmoothingEnabled = state.allowSmoothing;
  ctx.globalAlpha = quadBatch.alpha;

  const roundPixels = state.roundPixels;

  if (stride === 2) {
    for (let i = 0; i < instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;
      const dx = transforms[i * 2] * pr;
      const dy = transforms[i * 2 + 1] * pr;
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
  } else {
    const localMatrix = acquireMatrix();
    for (let i = 0; i < instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;
      setMatrixFromFloat32Array(localMatrix, i * 6, transforms);
      ctx.setTransform(
        localMatrix.a * pr,
        localMatrix.b * pr,
        localMatrix.c * pr,
        localMatrix.d * pr,
        localMatrix.tx * pr,
        localMatrix.ty * pr,
      );
      ctx.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    releaseMatrix(localMatrix);
  }

  applyDOMStyle(state, data.canvas, quadBatch);
  setDOMRendererElement(state, data.canvas);
}

export const defaultDOMQuadBatchRenderer: SpriteRenderer = {
  createData: createDOMQuadBatchData as SpriteRenderer['createData'],
  draw: drawDOMQuadBatch,
};
