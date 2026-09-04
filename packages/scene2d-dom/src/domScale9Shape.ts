import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { getNodeLocalBoundsRectangle } from '@flighthq/node/contract';
import { mapScale9ShapeCommands } from '@flighthq/shape/contract';
import type {
  DomRenderState,
  EntityConstruction,
  MatrixLike,
  RenderProxy2D,
  RenderState,
  Renderable,
  RendererData,
  Scale9Shape,
  Scene2DRenderer,
  ShapeCommandToken,
} from '@flighthq/types/contract';
import { RenderRegistry, Scale9ShapeKind } from '@flighthq/types/contract';

import { getDomRenderStateRuntime } from './domRenderState';
import { buildDomScale9Mapper } from './domScale9Mapper';
import { drawDomShape } from './domShape';
import { getDomShapeRasterizer } from './domShapeRasterizer';
import { prepareDomElement, setDomRendererElement } from './domStyle';

interface DomScale9ShapeData extends RendererData {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
}

const _remappedCommands: ShapeCommandToken[] = [];

export function createDomScale9ShapeData(_state: RenderState, _source: Renderable): DomScale9ShapeData {
  const out = allocateEntity<DomScale9ShapeData>();
  out.canvas = null;
  out.context = null;
  return finishEntity(out);
}

export function drawDomScale9Shape(state: DomRenderState, renderProxy: RenderProxy2D): void {
  const data = renderProxy.rendererData as DomScale9ShapeData | null;
  if (data === null) return;

  const source = renderProxy.source as Scale9Shape;
  const { commands, scale9Grid } = source.data;
  if (commands.length === 0) return;

  // A fill with no tessellated form is the registered rasterizer's job; an absent one is reported
  // rather than quietly dropping the fill.
  const rasterizer = getDomShapeRasterizer(state);
  if (rasterizer === null) {
    getDomRenderStateRuntime(state).registryMiss?.(RenderRegistry.ShapeRasterizer, Scale9ShapeKind);
    return;
  }

  const bounds = getNodeLocalBoundsRectangle(source);
  const mapper = buildDomScale9Mapper(bounds, scale9Grid, source.scaleX, source.scaleY);
  if (mapper === null) {
    drawDomShape(state, renderProxy);
    return;
  }

  if (data.canvas === null) {
    data.canvas = document.createElement('canvas');
    data.context = data.canvas.getContext('2d');
    prepareDomElement(data.canvas);
  }

  const w = Math.max(1, Math.ceil(bounds.width * source.scaleX));
  const h = Math.max(1, Math.ceil(bounds.height * source.scaleY));

  // Backing store in device pixels, CSS box in layout units — the split every DPI-aware canvas element
  // uses, and what keeps the stripped transform below working in layout space.
  const pixelRatio = state.pixelRatio;
  data.canvas.width = Math.ceil(w * pixelRatio);
  data.canvas.height = Math.ceil(h * pixelRatio);
  data.canvas.style.width = `${w}px`;
  data.canvas.style.height = `${h}px`;

  const ctx = data.context!;
  mapScale9ShapeCommands(_remappedCommands, commands, mapper);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, -bounds.x * pixelRatio, -bounds.y * pixelRatio);
  rasterizer(ctx, _remappedCommands, state);

  data.canvas.style.opacity = renderProxy.alpha < 1 ? String(renderProxy.alpha) : '';
  data.canvas.style.imageRendering = state.allowSmoothing ? '' : 'pixelated';
  state.applyBlendMode?.(data.canvas, renderProxy.blendMode);
  setStrippedDomTransform(data.canvas, renderProxy.transform2D, source.scaleX, source.scaleY, state.roundPixels);
  setDomRendererElement(state, data.canvas);
}

export const defaultDomScale9ShapeRenderer: Scene2DRenderer = {
  createData: createDomScale9ShapeData,
  submit: drawDomScale9Shape,
};

function setStrippedDomTransform(
  element: HTMLElement,
  transform: Readonly<MatrixLike>,
  scaleX: number,
  scaleY: number,
  roundPixels: boolean,
): void {
  const a = scaleX !== 0 ? transform.a / scaleX : transform.a;
  const b = scaleX !== 0 ? transform.b / scaleX : transform.b;
  const c = scaleY !== 0 ? transform.c / scaleY : transform.c;
  const d = scaleY !== 0 ? transform.d / scaleY : transform.d;
  const tx = roundPixels ? Math.fround(transform.tx) : transform.tx;
  const ty = roundPixels ? Math.fround(transform.ty) : transform.ty;
  element.style.transform = `matrix(${a},${b},${c},${d},${tx},${ty})`;
}
