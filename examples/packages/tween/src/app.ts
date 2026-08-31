import type { EasingFunction } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeEndFill,
  connectSignal,
  createApplication,
  createDisplayObject,
  createShape,
  createTextLabel,
  createTween,
  createTweenManager,
  createTweenTimer,
  easeInCubic,
  easeInElastic,
  easeInExponential,
  easeInOutCubic,
  easeInOutExponential,
  easeInOutQuadratic,
  easeInOutSine,
  easeInQuadratic,
  easeInSine,
  easeOutBounce,
  easeOutCubic,
  easeOutElastic,
  easeOutExponential,
  easeOutQuadratic,
  easeOutSine,
  invalidateNodeLocalTransform,
  stepApplicationLoop,
  updateTweens,
} from '@flighthq/sdk';

import { render, scale } from './render';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const COLUMNS = 3;
const ROWS = 5;
const CELL_WIDTH = CANVAS_WIDTH / COLUMNS;
const CELL_HEIGHT = CANVAS_HEIGHT / ROWS;
const CIRCLE_RADIUS = 8;
const TWEEN_DURATION = 3200;
const TRACK_STAGGER = 110;
const END_HOLD = 900;
const TRACK_MARGIN = 20;
const FRAME_DELTA = 1000 / 60;
const CAPTURE_PREVIEW_TIME = 1900;
const captureMode = (window as typeof window & { __flightCapture?: boolean }).__flightCapture === true;

const easings: ReadonlyArray<{ readonly name: string; readonly ease: EasingFunction }> = [
  { name: 'easeInQuadratic', ease: easeInQuadratic },
  { name: 'easeOutQuadratic', ease: easeOutQuadratic },
  { name: 'easeInOutQuadratic', ease: easeInOutQuadratic },
  { name: 'easeInCubic', ease: easeInCubic },
  { name: 'easeOutCubic', ease: easeOutCubic },
  { name: 'easeInOutCubic', ease: easeInOutCubic },
  { name: 'easeInSine', ease: easeInSine },
  { name: 'easeOutSine', ease: easeOutSine },
  { name: 'easeInOutSine', ease: easeInOutSine },
  { name: 'easeInExponential', ease: easeInExponential },
  { name: 'easeOutExponential', ease: easeOutExponential },
  { name: 'easeInOutExponential', ease: easeInOutExponential },
  { name: 'easeInElastic', ease: easeInElastic },
  { name: 'easeOutElastic', ease: easeOutElastic },
  { name: 'easeOutBounce', ease: easeOutBounce },
];

const manager = createTweenManager();
const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

function startTween(
  circle: ReturnType<typeof createShape>,
  startX: number,
  endX: number,
  ease: EasingFunction,
  delay = 0,
): void {
  circle.x = startX;
  invalidateNodeLocalTransform(circle);
  const tween = createTween(manager, circle, TWEEN_DURATION, { x: endX }, { delay, ease });
  connectSignal(tween.onComplete, () => {
    const hold = createTweenTimer(manager, END_HOLD);
    connectSignal(hold.onComplete, () => startTween(circle, startX, endX, ease));
  });
  connectSignal(tween.onUpdate, () => invalidateNodeLocalTransform(circle));
}

for (let i = 0; i < easings.length; i++) {
  const col = i % COLUMNS;
  const row = Math.floor(i / COLUMNS);
  const cellX = col * CELL_WIDTH;
  const cellY = row * CELL_HEIGHT;

  const label = createTextLabel();
  label.data.text = easings[i].name;
  label.data.textFormat = { size: 13, color: 0xccccccff };
  label.x = cellX + 10;
  label.y = cellY + 8;
  invalidateNodeLocalTransform(label);
  addNodeChild(root, label);

  const trackStartX = cellX + TRACK_MARGIN;
  const trackEndX = cellX + CELL_WIDTH - TRACK_MARGIN;
  const trackY = cellY + CELL_HEIGHT * 0.62;

  const circle = createShape();
  appendShapeBeginFill(circle, 0x44aaeeff);
  appendShapeCircle(circle, 0, 0, CIRCLE_RADIUS);
  appendShapeEndFill(circle);
  circle.x = trackStartX;
  circle.y = trackY;
  invalidateNodeLocalTransform(circle);
  addNodeChild(root, circle);

  startTween(circle, trackStartX, trackEndX, easings[i].ease, i * TRACK_STAGGER);
}

const app = createApplication();
connectSignal(app.onUpdate, (delta) => updateTweens(manager, delta));
connectSignal(app.onRender, () => {
  render(root);
});

let frame = 0;

function enterFrame(): void {
  if (frame === 0 && captureMode) {
    stepApplicationLoop(app, CAPTURE_PREVIEW_TIME, {
      fixedTimeStep: 0,
      maxDeltaTime: CAPTURE_PREVIEW_TIME,
    });
  } else {
    stepApplicationLoop(app, frame === 0 ? 0 : FRAME_DELTA);
  }
  frame++;
  if (!captureMode) requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
