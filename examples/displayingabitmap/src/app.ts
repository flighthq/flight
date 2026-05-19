import {
  addChild,
  BitmapKind,
  createBitmap,
  createCanvasRenderState,
  createDisplayObject,
  defaultCanvasBitmapRenderer,
  loadImageSourceFromURL,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  updateDisplayObjectBeforeRender,
} from '@flighthq/engine';

const main = createDisplayObject();
const bitmap = createBitmap();

const image = await loadImageSourceFromURL('assets/wabbit_alpha.png');
bitmap.data.image = image;
bitmap.x = (550 - image.width) / 2;
bitmap.y = (400 - image.height) / 2;
addChild(main, bitmap);

const canvas = document.createElement('canvas');
canvas.width = 550;
canvas.height = 400;
document.body.appendChild(canvas);

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
