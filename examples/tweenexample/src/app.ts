import {
  addNodeChildAt,
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
  easeOutQuadratic,
  invalidateNodeRender,
  startApplicationLoop,
  updateTweens,
} from '@flighthq/sdk';

import { render, scale } from './render';

const STAGE_WIDTH = 550;
const STAGE_HEIGHT = 400;
const CIRCLE_COUNT = 80;
const MIN_RADIUS = 25;
const MAX_RADIUS = 60;
const MIN_DURATION = 1500;
const MAX_DURATION = 6000;
const MAX_START_DELAY = 10000;

const manager = createTweenManager();
const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

function animateCircle(circle: ReturnType<typeof createShape>): void {
  const duration = MIN_DURATION + Math.random() * (MAX_DURATION - MIN_DURATION);
  const targetX = Math.random() * STAGE_WIDTH;
  const targetY = Math.random() * STAGE_HEIGHT;
  const tween = createTween(manager, circle, duration, { x: targetX, y: targetY }, { ease: easeOutQuadratic });
  connectSignal(tween.onComplete, () => animateCircle(circle));
  connectSignal(tween.onUpdate, () => invalidateNodeRender(circle));
}

function createCircle(): ReturnType<typeof createShape> {
  const radius = MIN_RADIUS + Math.random() * (MAX_RADIUS - MIN_RADIUS);
  const circle = createShape();

  appendShapeBeginFill(circle, Math.floor(Math.random() * 0xffffff));
  appendShapeCircle(circle, 0, 0, radius);
  appendShapeEndFill(circle);

  circle.alpha = 0.2 + Math.random() * 0.6;
  circle.x = Math.random() * STAGE_WIDTH;
  circle.y = Math.random() * STAGE_HEIGHT;

  addNodeChildAt(root, circle, 0);
  return circle;
}

// Populate the whole field synchronously so the scene is never empty, then stagger only when each
// circle *starts* drifting. The loop's first tick delivers a zero delta (see startApplicationLoop),
// so no timer has advanced by the first rendered frame; deferring node creation to timer.onComplete
// would leave that frame — and any single-frame capture of it — blank.
for (let i = 0; i < CIRCLE_COUNT; i++) {
  const circle = createCircle();
  const delay = Math.random() * MAX_START_DELAY;
  const timer = createTweenTimer(manager, delay);
  connectSignal(timer.onComplete, () => animateCircle(circle));
}

const app = createApplication();
connectSignal(app.onUpdate, (delta) => updateTweens(manager, delta));
connectSignal(app.onRender, () => {
  render(root);
});
startApplicationLoop(app);
