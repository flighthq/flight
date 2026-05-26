import {
  addChild,
  BitmapKind,
  createBitmap,
  createCanvasElement,
  createCanvasRenderState,
  createDisplayObject,
  defaultCanvasBitmapRenderer,
  loadImageSourceFromURL,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  updateDisplayObjectBeforeRender,
} from '@flighthq/engine';

const dpr = window.devicePixelRatio || 1;
const canvas = createCanvasElement(550, 400, dpr);
document.body.appendChild(canvas);

const main = createDisplayObject();
main.scaleX = dpr;
main.scaleY = dpr;
const bitmap = createBitmap();

const image = await loadImageSourceFromURL('assets/wabbit_alpha.png');
bitmap.data.image = image;
bitmap.x = (550 - image.width) / 2;
bitmap.y = (400 - image.height) / 2;
addChild(main, bitmap);

const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);

function enterFrame() {
  if (updateDisplayObjectBeforeRender(state, main)) {
    renderCanvasBackground(state);
    renderCanvasDisplayObject(state, main);
  }
  requestAnimationFrame(enterFrame);
}

enterFrame();
