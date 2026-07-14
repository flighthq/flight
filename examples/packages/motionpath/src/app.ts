import {
  createMotionPath,
  getMotionPathHeading,
  getMotionPathPosition,
  getMotionPathProgress,
  updateMotionPath,
} from '@flighthq/motionpath';
import { appendPathCubicCurveTo, appendPathMoveTo, createPath } from '@flighthq/path';
import type { DisplayObject, MotionPathLoopMode } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCubicCurveTo,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  clearShapeCommands,
  createDisplayObject,
  createShape,
  createTextLabel,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  RAD_TO_DEG,
} from '@flighthq/sdk';

import { render, scale } from './render';

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

// Build a bezier path with two cubic segments forming an S-curve across the canvas.
const path = createPath();
appendPathMoveTo(path, 100, 400);
appendPathCubicCurveTo(path, 250, 100, 350, 100, 400, 250);
appendPathCubicCurveTo(path, 450, 400, 550, 400, 700, 100);

// Create the motion path driver with an initial speed.
let speed = 150;
let loopMode: MotionPathLoopMode = 'loop';
const mp = createMotionPath(path, speed, loopMode);

// Draw the visible track on screen as a shape with a line style.
const track = createShape();
appendShapeLineStyle(track, 2, 0x4488aa);
appendShapeMoveTo(track, 100, 400);
appendShapeCubicCurveTo(track, 250, 100, 350, 100, 400, 250);
appendShapeCubicCurveTo(track, 450, 400, 550, 400, 700, 100);
addNodeChild(root, track);

// Draw small circles at the control points for visual reference.
const controlPoints = [
  [100, 400],
  [250, 100],
  [350, 100],
  [400, 250],
  [450, 400],
  [550, 400],
  [700, 100],
];

for (const [cx, cy] of controlPoints) {
  const dot = createShape();
  appendShapeBeginFill(dot, 0x335566);
  // Draw a small diamond as a control-point marker.
  const r = 4;
  appendShapeMoveTo(dot, cx, cy - r);
  appendShapeLineTo(dot, cx + r, cy);
  appendShapeLineTo(dot, cx, cy + r);
  appendShapeLineTo(dot, cx - r, cy);
  appendShapeLineTo(dot, cx, cy - r);
  appendShapeEndFill(dot);
  addNodeChild(root, dot);
}

// Arrow shape that follows the path. Drawn as a triangle pointing right (along +X), then rotated
// by the heading so the tip faces the direction of travel.
const ARROW_LENGTH = 20;
const ARROW_HALF_WIDTH = 8;
const arrow = createShape();

function drawArrow(x: number, y: number, headingDegrees: number): void {
  clearShapeCommands(arrow);
  arrow.x = x;
  arrow.y = y;
  arrow.rotation = headingDegrees;
  invalidateNodeLocalTransform(arrow);

  // Triangle centered at origin, pointing right (+X).
  appendShapeBeginFill(arrow, 0xff6644);
  appendShapeMoveTo(arrow, ARROW_LENGTH, 0);
  appendShapeLineTo(arrow, -ARROW_LENGTH / 2, -ARROW_HALF_WIDTH);
  appendShapeLineTo(arrow, -ARROW_LENGTH / 2, ARROW_HALF_WIDTH);
  appendShapeLineTo(arrow, ARROW_LENGTH, 0);
  appendShapeEndFill(arrow);
}

drawArrow(100, 400, 0);
addNodeChild(root, arrow);

// HUD labels for speed, loop mode, and progress.
function createLabel(text: string, x: number, y: number, size: number, color: number): DisplayObject {
  const label = createTextLabel();
  label.data.text = text;
  label.data.textFormat = { size, color };
  label.x = x;
  label.y = y;
  invalidateNodeLocalTransform(label);
  return label;
}

function updateLabel(label: DisplayObject, text: string): void {
  (label as ReturnType<typeof createTextLabel>).data.text = text;
  invalidateNodeAppearance(label);
}

const titleLabel = createLabel('Motion Path', 20, 10, 24, 0xffffff);
addNodeChild(root, titleLabel);

const speedLabel = createLabel('Speed: ' + speed, 20, 445, 16, 0xcccccc);
addNodeChild(root, speedLabel);

const modeLabel = createLabel('Mode: ' + loopMode + ' (1/2/3)', 20, 465, 16, 0xcccccc);
addNodeChild(root, modeLabel);

const progressLabel = createLabel('Progress: 0%', 250, 445, 16, 0xcccccc);
addNodeChild(root, progressLabel);

const controlsLabel = createLabel('+/- speed    1 clamp  2 loop  3 pingpong', 250, 465, 14, 0x888888);
addNodeChild(root, controlsLabel);

// Keyboard controls.
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === '+' || e.key === '=') {
    speed = Math.min(speed + 25, 500);
    mp.speed = speed;
    updateLabel(speedLabel, 'Speed: ' + speed);
  }
  if (e.key === '-' || e.key === '_') {
    speed = Math.max(speed - 25, 25);
    mp.speed = speed;
    updateLabel(speedLabel, 'Speed: ' + speed);
  }
  if (e.key === '1') {
    loopMode = 'clamp';
    mp.loopMode = loopMode;
    updateLabel(modeLabel, 'Mode: ' + loopMode + ' (1/2/3)');
  }
  if (e.key === '2') {
    loopMode = 'loop';
    mp.loopMode = loopMode;
    updateLabel(modeLabel, 'Mode: ' + loopMode + ' (1/2/3)');
  }
  if (e.key === '3') {
    loopMode = 'pingpong';
    mp.loopMode = loopMode;
    updateLabel(modeLabel, 'Mode: ' + loopMode + ' (1/2/3)');
  }
});

// Scratch vectors for position and tangent sampling (no per-frame allocation).
const pointOut = { x: 0, y: 0 };
const tangentOut = { x: 0, y: 0 };

let lastTime = performance.now();

function enterFrame(): void {
  const now = performance.now();
  const deltaTime = (now - lastTime) / 1000;
  lastTime = now;

  // Advance the motion path by the elapsed time.
  updateMotionPath(mp, deltaTime);

  // Sample the current position and tangent.
  if (getMotionPathPosition(mp, pointOut, tangentOut)) {
    const heading = getMotionPathHeading(mp);
    drawArrow(pointOut.x, pointOut.y, heading * RAD_TO_DEG);
  }

  // Update progress readout.
  const progress = getMotionPathProgress(mp);
  updateLabel(progressLabel, 'Progress: ' + ((progress * 100) | 0) + '%');

  render(root);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
