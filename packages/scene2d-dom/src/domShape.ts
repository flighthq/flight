import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { getNodeLocalBoundsRectangle } from '@flighthq/node/contract';
import type {
  DomRenderState,
  EntityConstruction,
  RenderProxy2D,
  RenderState,
  Renderable,
  RendererData,
  Scene2DRenderer,
  Shape,
} from '@flighthq/types/contract';
import { RenderRegistry, ShapeKind } from '@flighthq/types/contract';

import { getDomRenderStateRuntime } from './domRenderState';
import { getDomShapeRasterizer } from './domShapeRasterizer';
import { prepareDomElement, setDomRendererElement } from './domStyle';
import { setDomTransformWithOffset } from './domTransform';

interface DomShapeData extends RendererData {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
}

function createDomShapeData(_state: RenderState, _source: Renderable): DomShapeData {
  const out = allocateEntity<DomShapeData>();
  initializeDomShapeData(out);
  return finishEntity(out);
}

export function drawDomShape(state: DomRenderState, renderProxy: RenderProxy2D): void {
  const data = renderProxy.rendererData as DomShapeData | null;
  if (data === null) return;

  const source = renderProxy.source as Shape;
  const { commands } = source.data;
  if (commands.length === 0) return;

  // A fill with no tessellated form is the registered rasterizer's job; an absent one is reported
  // rather than quietly dropping the fill.
  const rasterizer = getDomShapeRasterizer(state);
  if (rasterizer === null) {
    getDomRenderStateRuntime(state).registryMiss?.(RenderRegistry.ShapeRasterizer, ShapeKind);
    return;
  }

  if (data.canvas === null) {
    data.canvas = document.createElement('canvas');
    data.context = data.canvas.getContext('2d');
    prepareDomElement(data.canvas);
  }

  const bounds = getNodeLocalBoundsRectangle(source);
  const w = Math.max(1, Math.ceil(bounds.width));
  const h = Math.max(1, Math.ceil(bounds.height));

  // The canvas is the DOM element itself, so its backing store carries device pixels while its CSS box
  // stays in layout units — the same split every DPI-aware canvas element uses. Resizing clears the
  // canvas and resets context state.
  const pixelRatio = state.pixelRatio;
  data.canvas.width = Math.ceil(w * pixelRatio);
  data.canvas.height = Math.ceil(h * pixelRatio);
  data.canvas.style.width = `${w}px`;
  data.canvas.style.height = `${h}px`;

  const ctx = data.context!;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, -bounds.x * pixelRatio, -bounds.y * pixelRatio);

  rasterizer(ctx, commands, state);

  data.canvas.style.opacity = renderProxy.alpha < 1 ? String(renderProxy.alpha) : '';
  if (state.domCssFilterResolver !== null) {
    data.canvas.style.filter = state.domCssFilterResolver(renderProxy) ?? '';
  }
  state.applyBlendMode?.(data.canvas, renderProxy.blendMode);
  setDomTransformWithOffset(data.canvas, renderProxy.transform2D, bounds.x, bounds.y, state.roundPixels);

  setDomRendererElement(state, data.canvas);
}

export function initializeDomShapeData(out: EntityConstruction<DomShapeData>): void {
  out.canvas = null;
  out.context = null;
}

export const defaultDomShapeRenderer: Scene2DRenderer = {
  createData: createDomShapeData,
  submit: drawDomShape,
};

// MorphShape owns a distinct kind while rendering the same retained command vocabulary.
export const defaultDomMorphShapeRenderer: Scene2DRenderer = defaultDomShapeRenderer;
