// Requires: assets/wabbit_alpha.png
// Port of GlowTest. Shows outer glow and inner glow filter variants.
// Abstract filter descriptors are created here; each render layer applies them with
// the strategy that suits its substrate:
//   - DOM:    element CSS filter (computeOuterGlowFilterCSS → setDOMCSSFilter)
//   - Canvas: baked once into an offscreen render cache via CSS drop-shadow(0,0,σ,color)
//   - WebGL:  offscreen render target + applyOuterGlowFilterToWebGL /
//             applyInnerGlowFilterToWebGL shader passes
// CSS only covers non-knockout outer glow; inner glow and knockout are WebGL-only.
import type { InnerGlowFilter, OuterGlowFilter } from '@flighthq/filters';
import { computeOuterGlowFilterCSS, createInnerGlowFilter, createOuterGlowFilter } from '@flighthq/filters';
import { applyInnerGlowFilterToWebGL, applyOuterGlowFilterToWebGL } from '@flighthq/filters-webgl';
import type {
  Bitmap,
  CanvasRenderState,
  DisplayObject,
  DOMRenderState,
  Matrix,
  WebGLRenderState,
  WebGLRenderTarget,
} from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWebGLRenderTarget,
  BitmapKind,
  clearWebGLRenderTarget,
  computeNodeBoundsRectangle,
  computeRenderCacheTransform,
  computeRenderTargetSize,
  copyMatrix,
  createBitmap,
  createDisplayContainer,
  createMatrix,
  createRectangle,
  createRenderCache,
  createRichText,
  createShape,
  createWebGLRenderTarget,
  drawWebGLRenderTargetResult,
  enableDOMCSSFilterSupport,
  endWebGLRenderTarget,
  ensureCanvasRenderCacheTarget,
  getRenderProxy2D,
  loadImageResourceFromURL,
  prepareDisplayObjectRender,
  renderWebGLBackground,
  renderWebGLDisplayObject,
  RichTextKind,
  setDOMCSSFilter,
  ShapeKind,
  useRenderCache,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const target = await createFunctionalTarget({
  width: 800,
  height: 400,
  background: 0xffffffff,
  kinds: [BitmapKind, RichTextKind, ShapeKind],
  cache: true,
});
const { scale } = target;

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const W = target.width / scale;
const H = target.height / scale;

const bg = createShape();
appendShapeBeginFill(bg, 0xffffff);
appendShapeRectangle(bg, 0, 0, W, H);
appendShapeEndFill(bg);
addNodeChild(root, bg);

const image = await loadImageResourceFromURL('assets/wabbit_alpha.png');

const IMAGE_SCALE = 4;
const iw = image.width * IMAGE_SCALE;
const ih = image.height * IMAGE_SCALE;
const colSpacing = iw + 50;
const startX = 50;
const startY = 50;

const variants: { label: string; filter: OuterGlowFilter | InnerGlowFilter }[] = [
  { label: 'outer glow', filter: createOuterGlowFilter() },
  { label: 'outer glow (knockout)', filter: createOuterGlowFilter({ knockout: true }) },
  { label: 'inner glow', filter: createInnerGlowFilter() },
  { label: 'inner glow (strong)', filter: createInnerGlowFilter({ strength: 2, blurX: 8, blurY: 8 }) },
];

type FilterEntry = { node: DisplayObject; filter: OuterGlowFilter | InnerGlowFilter };
const filtered: FilterEntry[] = [];

for (let i = 0; i < variants.length; i++) {
  const x = startX + i * colSpacing;
  const { label, filter } = variants[i];

  const bmp = createBitmap();
  bmp.data.image = image;
  bmp.data.smoothing = true;
  bmp.scaleX = IMAGE_SCALE;
  bmp.scaleY = IMAGE_SCALE;
  bmp.x = x;
  bmp.y = startY;
  addNodeChild(root, bmp);
  filtered.push({ node: bmp, filter });

  const lbl = createRichText();
  lbl.data.defaultTextFormat = { font: 'sans-serif', size: 12, color: 0x444444 };
  lbl.x = x;
  lbl.y = startY + ih + 4;
  lbl.data.width = colSpacing - 8;
  lbl.data.height = 20;
  lbl.data.text = label;
  addNodeChild(root, lbl);
}

const _bounds = createRectangle();
const _identity = createMatrix();

if (target.kind === 'canvas') {
  applyCanvasGlow(target.state, filtered);
  target.render(root);
} else if (target.kind === 'webgl') {
  renderWebGLGlow(target.state, filtered, root);
} else if (target.kind === 'dom') {
  applyDOMGlow(target.state, filtered);
  target.render(root);
} else {
  target.render(root);
}

function applyCanvasGlow(state: CanvasRenderState, list: FilterEntry[]): void {
  for (const { node, filter } of list) {
    if (filter.type === 'innerGlow') continue;
    const css = computeOuterGlowFilterCSS(filter);
    if (css === null) continue;
    const img = (node as Bitmap).data.image;
    if (img === null || img.source === null) continue;
    computeNodeBoundsRectangle(_bounds, node, node);
    const padding = glowPadding(filter);
    const { width: w, height: h } = computeRenderTargetSize(_bounds, padding, 1, 1);
    const cache = createRenderCache();
    useRenderCache(state, node, cache);
    const renderTarget = ensureCanvasRenderCacheTarget(state, cache, w, h);
    const ctx = renderTarget.context;
    ctx.clearRect(0, 0, renderTarget.canvas.width, renderTarget.canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.filter = css;
    ctx.drawImage(img.source, padding - _bounds.x, padding - _bounds.y);
    ctx.filter = 'none';
    computeRenderCacheTransform(cache.transform, _bounds, padding, padding);
  }
}

type GlowEntry = {
  node: DisplayObject;
  filter: OuterGlowFilter | InnerGlowFilter;
  source: WebGLRenderTarget;
  dest: WebGLRenderTarget;
  scratch: [WebGLRenderTarget, WebGLRenderTarget, WebGLRenderTarget];
  cacheTransform: Matrix;
  sceneTransform: Matrix;
};

function renderWebGLGlow(state: WebGLRenderState, list: FilterEntry[], root: DisplayObject): void {
  const entries: GlowEntry[] = [];
  for (const { node, filter } of list) {
    computeNodeBoundsRectangle(_bounds, node, node);
    const padding = glowPadding(filter);
    const { width: w, height: h } = computeRenderTargetSize(_bounds, padding, 1, 1);
    entries.push({
      node,
      filter,
      source: createWebGLRenderTarget(state, { width: w, height: h }),
      dest: createWebGLRenderTarget(state, { width: w, height: h }),
      scratch: [
        createWebGLRenderTarget(state, { width: w, height: h }),
        createWebGLRenderTarget(state, { width: w, height: h }),
        createWebGLRenderTarget(state, { width: w, height: h }),
      ],
      cacheTransform: createMatrix(),
      sceneTransform: createMatrix(),
    });
  }

  prepareDisplayObjectRender(state, root);

  for (const entry of entries) {
    const renderProxy = getRenderProxy2D(state, entry.node);
    if (renderProxy !== undefined) copyMatrix(entry.sceneTransform, renderProxy.transform2D);
  }

  for (const entry of entries) {
    const { node, filter, source, dest, scratch } = entry;
    const padding = glowPadding(filter);
    computeNodeBoundsRectangle(_bounds, node, node);
    computeRenderCacheTransform(entry.cacheTransform, _bounds, padding, padding);
    const renderProxy = getRenderProxy2D(state, node);
    if (renderProxy === undefined) continue;
    setTranslation(renderProxy.transform2D, padding - _bounds.x, padding - _bounds.y);
    beginWebGLRenderTarget(state, source, _identity);
    clearWebGLRenderTarget(state, source);
    renderWebGLDisplayObject(state, node);
    if (filter.type === 'innerGlow') {
      applyInnerGlowFilterToWebGL(state, source, dest, scratch, filter);
    } else {
      applyOuterGlowFilterToWebGL(state, source, dest, scratch, filter);
    }
    endWebGLRenderTarget(state);
  }

  for (const entry of entries) {
    const renderProxy = getRenderProxy2D(state, entry.node);
    if (renderProxy !== undefined) copyMatrix(renderProxy.transform2D, entry.sceneTransform);
  }

  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);

  for (const entry of entries) {
    const renderProxy = getRenderProxy2D(state, entry.node);
    if (renderProxy === undefined) continue;
    drawWebGLRenderTargetResult(state, renderProxy, entry.dest, entry.cacheTransform);
  }
}

function applyDOMGlow(state: DOMRenderState, list: FilterEntry[]): void {
  enableDOMCSSFilterSupport(state);
  for (const { node, filter } of list) {
    if (filter.type === 'innerGlow') continue;
    setDOMCSSFilter(state, node, computeOuterGlowFilterCSS(filter));
  }
}

function glowPadding(filter: Readonly<OuterGlowFilter | InnerGlowFilter>): number {
  return Math.ceil(Math.max(filter.blurX ?? 6, filter.blurY ?? 6) * 2.5 + 4);
}

function setTranslation(out: Matrix, tx: number, ty: number): void {
  out.a = 1;
  out.b = 0;
  out.c = 0;
  out.d = 1;
  out.tx = tx;
  out.ty = ty;
}
