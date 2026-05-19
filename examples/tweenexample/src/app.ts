import {
  addChildAt,
  beginFill,
  connectSignal,
  createCanvasRenderState,
  createDisplayObject,
  createShape,
  createTimer,
  createTween,
  createTweenManager,
  defaultCanvasShapeRenderer,
  drawCircle,
  endFill,
  invalidateRender,
  Quad,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  ShapeKind,
  updateDisplayObjectBeforeRender,
  updateTweens,
} from '@flighthq/engine';

const STAGE_WIDTH = 550;
const STAGE_HEIGHT = 400;
const CIRCLE_COUNT = 80;
const MIN_RADIUS = 25;
const MAX_RADIUS = 60;
const MIN_DURATION = 1500;
const MAX_DURATION = 6000;
const MAX_CREATION_DELAY = 10000;

const canvas = document.createElement('canvas');
canvas.width = STAGE_WIDTH;
canvas.height = STAGE_HEIGHT;
document.body.appendChild(canvas);

const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);

const manager = createTweenManager();
const root = createDisplayObject();

function animateCircle(circle: ReturnType<typeof createShape>): void {
  const duration = MIN_DURATION + Math.random() * (MAX_DURATION - MIN_DURATION);
  const targetX = Math.random() * STAGE_WIDTH;
  const targetY = Math.random() * STAGE_HEIGHT;
  const tween = createTween(manager, circle, duration, { x: targetX, y: targetY }, { ease: Quad.easeOut });
  connectSignal(tween.onComplete, () => animateCircle(circle));
  connectSignal(tween.onUpdate, () => invalidateRender(circle));
}

function createCircle(): void {
  const radius = MIN_RADIUS + Math.random() * (MAX_RADIUS - MIN_RADIUS);
  const circle = createShape();

  beginFill(circle.data.graphics, Math.floor(Math.random() * 0xffffff));
  drawCircle(circle.data.graphics, 0, 0, radius);
  endFill(circle.data.graphics);

  circle.alpha = 0.2 + Math.random() * 0.6;
  circle.x = Math.random() * STAGE_WIDTH;
  circle.y = Math.random() * STAGE_HEIGHT;

  addChildAt(root, circle, 0);
  animateCircle(circle);
}

for (let i = 0; i < CIRCLE_COUNT; i++) {
  const delay = Math.random() * MAX_CREATION_DELAY;
  const timer = createTimer(manager, delay);
  connectSignal(timer.onComplete, createCircle);
}

let lastTime = 0;

function enterFrame(time: number): void {
  const delta = lastTime === 0 ? 0 : time - lastTime;
  lastTime = time;
  updateTweens(manager, delta);
  if (updateDisplayObjectBeforeRender(state, root)) {
    renderCanvasBackground(state);
    renderCanvasDisplayObject(state, root);
  }
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
