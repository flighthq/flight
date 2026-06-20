// Requires: assets/wabbit_alpha.png
// Port of DropShadowTest. Shows drop shadow and inner shadow variants.
// Abstract filter descriptors are created here; each render layer applies them with
// the strategy that suits its substrate:
//   - DOM:    element CSS filter (computeDropShadowFilterCSS → setDOMCSSFilter)
//   - Canvas: baked once into an offscreen render cache via CSS drop-shadow
//   - WebGL:  offscreen render target + applyDropShadowFilterToWebGL /
//             applyInnerShadowFilterToWebGL shader passes
// CSS only covers non-knockout outer variants; inner shadow is WebGL-only.
import type { DropShadowFilter, InnerShadowFilter } from '@flighthq/filters';
import { computeDropShadowFilterCSS, createDropShadowFilter, createInnerShadowFilter } from '@flighthq/filters';
import {
  applyDropShadowFilterToWebGL,
  applyInnerShadowFilterToWebGL,
  clearWebGLFilterTarget,
} from '@flighthq/filters-webgl';
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
  height: 500,
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

const IMAGE_SCALE = 3;
const iw = image.width * IMAGE_SCALE;
const ih = image.height * IMAGE_SCALE;
const colSpacing = iw + 40;
const rowSpacing = ih + 50;
const startX = 50;
const startY = 40;

const variants: { label: string; filter: DropShadowFilter | InnerShadowFilter }[] = [
  { label: 'drop shadow', filter: createDropShadowFilter() },
  { label: 'colored shadow', filter: createDropShadowFilter({ color: 0xff0000 }) },
  { label: 'large shadow', filter: createDropShadowFilter({ distance: 16, blurX: 8, blurY: 8 }) },
  { label: 'hide object', filter: createDropShadowFilter({ hideObject: true }) },
  { label: 'inner shadow', filter: createInnerShadowFilter() },
  { label: 'inner + colored', filter: createInnerShadowFilter({ color: 0x0044ff, blurX: 6, blurY: 6 }) },
];

type FilterEntry = { node: DisplayObject; filter: DropShadowFilter | InnerShadowFilter };
const filtered: FilterEntry[] = [];

for (let i = 0; i < variants.length; i++) {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const x = startX + col * colSpacing;
  const y = startY + row * rowSpacing;
  const { label, filter } = variants[i];

  const bmp = createBitmap();
  bmp.data.image = image;
  bmp.data.smoothing = true;
  bmp.scaleX = IMAGE_SCALE;
  bmp.scaleY = IMAGE_SCALE;
  bmp.x = x;
  bmp.y = y;
  addNodeChild(root, bmp);
  filtered.push({ node: bmp, filter });

  const lbl = createRichText();
  lbl.data.defaultTextFormat = { font: 'sans-serif', size: 12, color: 0x444444 };
  lbl.x = x;
  lbl.y = y + ih + 4;
  lbl.data.width = colSpacing - 8;
  lbl.data.height = 20;
  lbl.data.text = label;
  addNodeChild(root, lbl);
}

const _bounds = createRectangle();
const _identity = createMatrix();

if (target.kind === 'canvas') {
  applyCanvasDropShadow(target.state, filtered);
  target.render(root);
} else if (target.kind === 'webgl') {
  renderWebGLDropShadow(target.state, filtered, root);
} else if (target.kind === 'dom') {
  applyDOMDropShadow(target.state, filtered);
  target.render(root);
} else {
  target.render(root);
}

function applyCanvasDropShadow(state: CanvasRenderState, list: FilterEntry[]): void {
  for (const { node, filter } of list) {
    if (filter.type === 'innerShadow') continue;
    const css = computeDropShadowFilterCSS(filter);
    if (css === null) continue;
    const img = (node as Bitmap).data.image;
    if (img === null || img.source === null) continue;
    computeNodeBoundsRectangle(_bounds, node, node);
    const padding = dropShadowPadding(filter);
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

type ShadowEntry = {
  node: DisplayObject;
  filter: DropShadowFilter | InnerShadowFilter;
  source: WebGLRenderTarget;
  dest: WebGLRenderTarget;
  scratch: [WebGLRenderTarget, WebGLRenderTarget, WebGLRenderTarget];
  cacheTransform: Matrix;
  sceneTransform: Matrix;
};

function renderWebGLDropShadow(state: WebGLRenderState, list: FilterEntry[], root: DisplayObject): void {
  const entries: ShadowEntry[] = [];
  for (const { node, filter } of list) {
    computeNodeBoundsRectangle(_bounds, node, node);
    const padding = dropShadowPadding(filter);
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
    const padding = dropShadowPadding(filter);
    computeNodeBoundsRectangle(_bounds, node, node);
    computeRenderCacheTransform(entry.cacheTransform, _bounds, padding, padding);
    const renderProxy = getRenderProxy2D(state, node);
    if (renderProxy === undefined) continue;
    setTranslation(renderProxy.transform2D, padding - _bounds.x, padding - _bounds.y);
    beginWebGLRenderTarget(state, source, _identity);
    clearWebGLFilterTarget(state, source);
    renderWebGLDisplayObject(state, node);
    if (filter.type === 'innerShadow') {
      applyInnerShadowFilterToWebGL(state, source, dest, scratch, filter);
    } else {
      applyDropShadowFilterToWebGL(state, source, dest, scratch, filter);
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

function applyDOMDropShadow(state: DOMRenderState, list: FilterEntry[]): void {
  enableDOMCSSFilterSupport(state);
  for (const { node, filter } of list) {
    if (filter.type === 'innerShadow') continue;
    setDOMCSSFilter(state, node, computeDropShadowFilterCSS(filter));
  }
}

function dropShadowPadding(filter: Readonly<DropShadowFilter | InnerShadowFilter>): number {
  const blur = Math.max(filter.blurX ?? 4, filter.blurY ?? 4);
  if (filter.type === 'innerShadow') return Math.ceil(blur * 2.5 + 4);
  const distance = (filter as DropShadowFilter).distance ?? 4;
  return Math.ceil(blur * 2.5 + Math.abs(distance) + 4);
}

function setTranslation(out: Matrix, tx: number, ty: number): void {
  out.a = 1;
  out.b = 0;
  out.c = 0;
  out.d = 1;
  out.tx = tx;
  out.ty = ty;
}
