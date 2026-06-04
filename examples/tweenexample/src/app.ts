import {
  addSceneChildAt,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeEndFill,
  connectSignal,
  createApplication,
  createDisplayObject,
  createShape,
  createTween,
  createTweenManager,
  createTweenTimer,
  invalidateRender,
  Quad,
  startApplicationLoop,
  updateDisplayObjectBeforeRender,
  updateTweens,
} from '@flighthq/sdk';

import { render, scale, state } from './render';

const STAGE_WIDTH = 550;
const STAGE_HEIGHT = 400;
const CIRCLE_COUNT = 80;
const MIN_RADIUS = 25;
const MAX_RADIUS = 60;
const MIN_DURATION = 1500;
const MAX_DURATION = 6000;
const MAX_CREATION_DELAY = 10000;

const manager = createTweenManager();
const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

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

  appendShapeBeginFill(circle, Math.floor(Math.random() * 0xffffff));
  appendShapeCircle(circle, 0, 0, radius);
  appendShapeEndFill(circle);

  circle.alpha = 0.2 + Math.random() * 0.6;
  circle.x = Math.random() * STAGE_WIDTH;
  circle.y = Math.random() * STAGE_HEIGHT;

  addSceneChildAt(root, circle, 0);
  animateCircle(circle);
}

for (let i = 0; i < CIRCLE_COUNT; i++) {
  const delay = Math.random() * MAX_CREATION_DELAY;
  const timer = createTweenTimer(manager, delay);
  connectSignal(timer.onComplete, createCircle);
}

const app = createApplication();
connectSignal(app.onUpdate, (delta) => updateTweens(manager, delta));
connectSignal(app.onRender, () => {
  if (updateDisplayObjectBeforeRender(state, root)) render(root);
});
startApplicationLoop(app);
