import {
  addChild,
  BitmapKind,
  connectSignal,
  createBitmap,
  createCanvasRenderState,
  createDisplayObject,
  createTween,
  createTweenManager,
  defaultCanvasBitmapRenderer,
  Elastic,
  invalidateRender,
  loadImageSourceFromURL,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  updateDisplayObjectBeforeRender,
  updateTweens,
} from '@flighthq/engine';

const STAGE_WIDTH = 550;
const STAGE_HEIGHT = 400;

const dpr = window.devicePixelRatio || 1;

const canvas = document.createElement('canvas');
canvas.style.width = `${STAGE_WIDTH}px`;
canvas.style.height = `${STAGE_HEIGHT}px`;
canvas.width = STAGE_WIDTH * dpr;
canvas.height = STAGE_HEIGHT * dpr;
document.body.appendChild(canvas);

const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);

const manager = createTweenManager();
const main = createDisplayObject();
main.scaleX = dpr;
main.scaleY = dpr;
const container = createDisplayObject();
const bitmap = createBitmap();

container.alpha = 0;
container.scaleX = 0;
container.scaleY = 0;
container.x = STAGE_WIDTH / 2;
container.y = STAGE_HEIGHT / 2;

addChild(container, bitmap);
addChild(main, container);

const image = await loadImageSourceFromURL('assets/wabbit_alpha.png');
bitmap.data.image = image;
bitmap.x = -image.width / 2;
bitmap.y = -image.height / 2;

const tween = createTween(
  manager,
  container,
  3000,
  { alpha: 1, scaleX: 2, scaleY: 2 },
  { ease: Elastic.easeOut, repeat: -1, reflect: true },
);
connectSignal(tween.onUpdate, () => invalidateRender(container));

let lastTime = 0;

function enterFrame(time: number) {
  const delta = lastTime === 0 ? 0 : time - lastTime;
  lastTime = time;
  updateTweens(manager, delta);
  if (updateDisplayObjectBeforeRender(state, main)) {
    renderCanvasBackground(state);
    renderCanvasDisplayObject(state, main);
  }
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
