import {
  addChild,
  BitmapKind,
  connectSignal,
  createBitmap,
  createCanvasRenderState,
  createDisplayObject,
  createImageSource,
  createTween,
  createTweenManager,
  defaultCanvasBitmapRenderer,
  Elastic,
  invalidateRender,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  updateDisplayObjectBeforeRender,
  updateTweens,
} from '@flighthq/engine';

const STAGE_WIDTH = 550;
const STAGE_HEIGHT = 400;

const canvas = document.createElement('canvas');
canvas.width = STAGE_WIDTH;
canvas.height = STAGE_HEIGHT;
document.body.appendChild(canvas);

const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);

const manager = createTweenManager();
const main = createDisplayObject();
const container = createDisplayObject();
const bitmap = createBitmap();

container.alpha = 0;
container.scaleX = 0;
container.scaleY = 0;
container.x = STAGE_WIDTH / 2;
container.y = STAGE_HEIGHT / 2;

addChild(container, bitmap);
addChild(main, container);

try {
  const image = createImageSource(await loadImageAndDecode('assets/wabbit_alpha.png'));
  bitmap.data.image = image;
  bitmap.x = -image.width / 2;
  bitmap.y = -image.height / 2;
} catch (error) {
  console.error('Error loading image:', error); // eslint-disable-line
}

const tween = createTween(
  manager,
  container,
  3000,
  { alpha: 1, scaleX: 2, scaleY: 2 },
  { ease: Elastic.easeOut, repeat: -1, reflect: true },
);
connectSignal(tween.onUpdate, () => invalidateRender(container));

function loadImageAndDecode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

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
