import type { SpringConfig } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapeRectangle,
  clearShapeCommands,
  createDisplayObject,
  createShape,
  createTween,
  createTweenManager,
  easeInOutCubic,
  invalidateNodeLocalTransform,
  invalidateNodeRender,
  updateTweens,
} from '@flighthq/sdk';
import { createSpring2D, createSpringConfig, updateSpring2D } from '@flighthq/sdk/animation';

import { canvas, render, scale } from './render';

const STAGE_WIDTH = 600;
const STAGE_HEIGHT = 400;
const CIRCLE_RADIUS = 18;
const TRACK_OFFSET = 22;

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

// Spring configuration — starts with a bouncy underdamped preset.
let springConfig: SpringConfig = createSpringConfig(3, 0.3);

// Spring-driven circle (blue).
const spring2D = createSpring2D(STAGE_WIDTH / 2, STAGE_HEIGHT / 2 - TRACK_OFFSET);
const springCircle = createShape();
appendShapeBeginFill(springCircle, 0x2196f3ff);
appendShapeCircle(springCircle, 0, 0, CIRCLE_RADIUS);
appendShapeEndFill(springCircle);
springCircle.x = spring2D.x.value;
springCircle.y = spring2D.y.value;
invalidateNodeLocalTransform(springCircle);
addNodeChild(root, springCircle);

// Tween-driven circle (orange) — fixed-duration easing, the first-order comparison.
const tweenManager = createTweenManager();
const tweenCircle = createShape();
appendShapeBeginFill(tweenCircle, 0xff9800ff);
appendShapeCircle(tweenCircle, 0, 0, CIRCLE_RADIUS);
appendShapeEndFill(tweenCircle);
tweenCircle.x = STAGE_WIDTH / 2;
tweenCircle.y = STAGE_HEIGHT / 2 + TRACK_OFFSET;
invalidateNodeLocalTransform(tweenCircle);
addNodeChild(root, tweenCircle);

// Target marker (small crosshair).
let targetX = 470;
let targetY = STAGE_HEIGHT / 2;
const targetMarker = createShape();
addNodeChild(root, targetMarker);

function redrawTargetMarker(): void {
  clearShapeCommands(targetMarker);
  const arm = 10;
  appendShapeLineStyle(targetMarker, 1.5, 0x999999ff);
  appendShapeMoveTo(targetMarker, targetX - arm, targetY);
  appendShapeLineTo(targetMarker, targetX + arm, targetY);
  appendShapeMoveTo(targetMarker, targetX, targetY - arm);
  appendShapeLineTo(targetMarker, targetX, targetY + arm);
  invalidateNodeRender(targetMarker);
}

redrawTargetMarker();

function tweenToTarget(): void {
  createTween(tweenManager, tweenCircle, 900, { x: targetX, y: targetY + TRACK_OFFSET }, { ease: easeInOutCubic });
}

tweenToTarget();

// Legend — small colored squares with labels drawn as shapes (no font dependency).
const legend = createShape();
const legendY = STAGE_HEIGHT - 28;
appendShapeBeginFill(legend, 0x2196f3ff);
appendShapeRectangle(legend, 12, legendY, 12, 12);
appendShapeEndFill(legend);
appendShapeBeginFill(legend, 0xff9800ff);
appendShapeRectangle(legend, 110, legendY, 12, 12);
appendShapeEndFill(legend);
addNodeChild(root, legend);

// Click to set a new target.
canvas.addEventListener('click', (event: MouseEvent) => {
  const rect = canvas.getBoundingClientRect();
  targetX = ((event.clientX - rect.left) / rect.width) * STAGE_WIDTH;
  targetY = ((event.clientY - rect.top) / rect.height) * STAGE_HEIGHT;
  redrawTargetMarker();
  tweenToTarget();
});

// HTML controls for spring presets and parameter display.
const controls = document.createElement('div');
controls.style.cssText =
  'font-family:system-ui,sans-serif;font-size:13px;margin:8px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap';

const presets: Array<{ label: string; frequency: number; dampingRatio: number }> = [
  { dampingRatio: 0.3, frequency: 3, label: 'Underdamped (bouncy)' },
  { dampingRatio: 1, frequency: 3, label: 'Critically damped' },
  { dampingRatio: 3, frequency: 3, label: 'Overdamped (sluggish)' },
  { dampingRatio: 0.15, frequency: 5, label: 'Very bouncy' },
  { dampingRatio: 0.6, frequency: 8, label: 'Snappy' },
];

const info = document.createElement('span');
info.style.cssText = 'margin-left:auto;color:#555';

function updateInfo(): void {
  info.textContent = `frequency: ${springConfig.frequency} Hz  damping: ${springConfig.dampingRatio}`;
}

for (const preset of presets) {
  const button = document.createElement('button');
  button.textContent = preset.label;
  button.style.cssText = 'cursor:pointer;padding:4px 10px;border:1px solid #ccc;border-radius:4px;background:#fff';
  button.addEventListener('click', () => {
    springConfig = createSpringConfig(preset.frequency, preset.dampingRatio);
    updateInfo();
  });
  controls.appendChild(button);
}

controls.appendChild(info);
document.body.appendChild(controls);

// Labels under the canvas (plain HTML since no font is loaded for text display objects).
const labels = document.createElement('div');
labels.style.cssText = 'font-family:system-ui,sans-serif;font-size:12px;color:#666;margin:2px 0';
labels.innerHTML =
  '<span style="color:#2196f3">&#9632; Spring (2nd-order, overshoots)</span>' +
  '&nbsp;&nbsp;&nbsp;' +
  '<span style="color:#ff9800">&#9632; Tween (fixed duration)</span>' +
  '&nbsp;&nbsp;&nbsp;' +
  '<span style="color:#999">Click anywhere to move the target</span>';
document.body.appendChild(labels);

updateInfo();

// Animation loop.
let lastTime = performance.now();
const captureMode = (window as typeof window & { __flightCapture?: boolean }).__flightCapture === true;

function enterFrame(now: number): void {
  const deltaTime = captureMode ? 1 / 60 : Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // Advance the spring toward the target.
  updateSpring2D(spring2D, targetX, targetY - TRACK_OFFSET, springConfig, deltaTime);
  springCircle.x = spring2D.x.value;
  springCircle.y = spring2D.y.value;
  invalidateNodeLocalTransform(springCircle);

  // Advance the fixed-duration comparison in milliseconds (the manager is unit-agnostic).
  updateTweens(tweenManager, deltaTime * 1000);
  invalidateNodeLocalTransform(tweenCircle);

  render(root);
  if (!captureMode) requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
