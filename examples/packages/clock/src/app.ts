import {
  advanceClock,
  createChildClock,
  createClock,
  getClockEffectiveScale,
  isClockEffectivelyPaused,
  pauseClock,
  resumeClock,
  setClockScale,
} from '@flighthq/clock';
import type { DisplayObject } from '@flighthq/sdk';
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
  createTextLabel,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
} from '@flighthq/sdk';

import { render, scale } from './render';

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

// Create the clock hierarchy: one root clock with two child clocks.
const rootClock = createClock();
const childClockA = createChildClock(rootClock, { scale: 1 });
const childClockB = createChildClock(rootClock, { scale: 0.5 });

// Each clock drives a spinning shape. The shapes are drawn centered at origin and positioned via
// the display object's x/y. Rotation is updated each frame from the clock's elapsed time.

const ROOT_X = 400;
const ROOT_Y = 120;
const CHILD_A_X = 220;
const CHILD_A_Y = 300;
const CHILD_B_X = 580;
const CHILD_B_Y = 300;

// Root clock shape: a square.
const rootShape = createShape();

function drawSquare(shape: ReturnType<typeof createShape>, size: number, color: number): void {
  clearShapeCommands(shape);
  const half = size / 2;
  appendShapeBeginFill(shape, color);
  appendShapeRectangle(shape, -half, -half, size, size);
  appendShapeEndFill(shape);
}

drawSquare(rootShape, 60, 0x4488cc);
rootShape.x = ROOT_X;
rootShape.y = ROOT_Y;
invalidateNodeLocalTransform(rootShape);
addNodeChild(root, rootShape);

// Child A shape: a triangle.
const childShapeA = createShape();

function drawTriangle(shape: ReturnType<typeof createShape>, size: number, color: number): void {
  clearShapeCommands(shape);
  const half = size / 2;
  const h = (size * Math.sqrt(3)) / 2;
  appendShapeBeginFill(shape, color);
  appendShapeMoveTo(shape, 0, -h / 2);
  appendShapeLineTo(shape, half, h / 2);
  appendShapeLineTo(shape, -half, h / 2);
  appendShapeLineTo(shape, 0, -h / 2);
  appendShapeEndFill(shape);
}

drawTriangle(childShapeA, 50, 0x44cc88);
childShapeA.x = CHILD_A_X;
childShapeA.y = CHILD_A_Y;
invalidateNodeLocalTransform(childShapeA);
addNodeChild(root, childShapeA);

// Child B shape: a circle with a notch to show rotation.
const childShapeB = createShape();

function drawNotchedCircle(shape: ReturnType<typeof createShape>, radius: number, color: number): void {
  clearShapeCommands(shape);
  appendShapeBeginFill(shape, color);
  appendShapeCircle(shape, 0, 0, radius);
  appendShapeEndFill(shape);
  // Draw a line from center to edge as a rotation indicator.
  appendShapeLineStyle(shape, 3, 0xffffff);
  appendShapeMoveTo(shape, 0, 0);
  appendShapeLineTo(shape, radius, 0);
}

drawNotchedCircle(childShapeB, 30, 0xcc8844);
childShapeB.x = CHILD_B_X;
childShapeB.y = CHILD_B_Y;
invalidateNodeLocalTransform(childShapeB);
addNodeChild(root, childShapeB);

// Hierarchy lines connecting root to children.
const hierarchyLines = createShape();
appendShapeLineStyle(hierarchyLines, 2, 0x555555);
appendShapeMoveTo(hierarchyLines, ROOT_X, ROOT_Y + 30);
appendShapeLineTo(hierarchyLines, CHILD_A_X, CHILD_A_Y - 40);
appendShapeMoveTo(hierarchyLines, ROOT_X, ROOT_Y + 30);
appendShapeLineTo(hierarchyLines, CHILD_B_X, CHILD_B_Y - 40);
addNodeChild(root, hierarchyLines);

// HUD labels.
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

const titleLabel = createLabel('Hierarchical Clocks', 20, 10, 24, 0xffffff);
addNodeChild(root, titleLabel);

// Root clock labels.
const rootNameLabel = createLabel('Root Clock', ROOT_X - 40, ROOT_Y - 55, 14, 0xaaaaaa);
addNodeChild(root, rootNameLabel);

const rootInfoLabel = createLabel('', ROOT_X - 80, ROOT_Y + 40, 12, 0x8888aa);
addNodeChild(root, rootInfoLabel);

// Child A labels.
const childANameLabel = createLabel('Child A (1x)', CHILD_A_X - 45, CHILD_A_Y - 55, 14, 0xaaaaaa);
addNodeChild(root, childANameLabel);

const childAInfoLabel = createLabel('', CHILD_A_X - 80, CHILD_A_Y + 45, 12, 0x88aa88);
addNodeChild(root, childAInfoLabel);

// Child B labels.
const childBNameLabel = createLabel('Child B (0.5x)', CHILD_B_X - 50, CHILD_B_Y - 55, 14, 0xaaaaaa);
addNodeChild(root, childBNameLabel);

const childBInfoLabel = createLabel('', CHILD_B_X - 80, CHILD_B_Y + 45, 12, 0xaa8844);
addNodeChild(root, childBInfoLabel);

// Controls label.
const controlsLabel = createLabel(
  'P root pause    1/2 toggle child pause    Left/Right child A scale    Up/Down child B scale',
  20,
  470,
  13,
  0x888888,
);
addNodeChild(root, controlsLabel);

// Paused overlay indicators (shown when a clock is paused).
const rootPausedLabel = createLabel('PAUSED', ROOT_X - 25, ROOT_Y - 8, 14, 0xff4444);
rootPausedLabel.visible = false;
addNodeChild(root, rootPausedLabel);

const childAPausedLabel = createLabel('PAUSED', CHILD_A_X - 25, CHILD_A_Y - 8, 14, 0xff4444);
childAPausedLabel.visible = false;
addNodeChild(root, childAPausedLabel);

const childBPausedLabel = createLabel('PAUSED', CHILD_B_X - 25, CHILD_B_Y - 8, 14, 0xff4444);
childBPausedLabel.visible = false;
addNodeChild(root, childBPausedLabel);

// Keyboard controls.
window.addEventListener('keydown', (e: KeyboardEvent) => {
  const key = e.key.toLowerCase();

  if (key === 'p') {
    if (rootClock.paused) {
      resumeClock(rootClock);
    } else {
      pauseClock(rootClock);
    }
  }

  if (key === '1') {
    if (childClockA.paused) {
      resumeClock(childClockA);
    } else {
      pauseClock(childClockA);
    }
  }

  if (key === '2') {
    if (childClockB.paused) {
      resumeClock(childClockB);
    } else {
      pauseClock(childClockB);
    }
  }

  if (key === 'arrowleft') {
    setClockScale(childClockA, Math.max(childClockA.scale - 0.25, 0));
  }
  if (key === 'arrowright') {
    setClockScale(childClockA, Math.min(childClockA.scale + 0.25, 4));
  }
  if (key === 'arrowdown') {
    setClockScale(childClockB, Math.max(childClockB.scale - 0.25, 0));
  }
  if (key === 'arrowup') {
    setClockScale(childClockB, Math.min(childClockB.scale + 0.25, 4));
  }
});

function formatTime(seconds: number): string {
  return seconds.toFixed(1) + 's';
}

let lastTime = performance.now();

function enterFrame(): void {
  const now = performance.now();
  const rawDelta = (now - lastTime) / 1000;
  lastTime = now;

  // Advance the root clock; children are advanced recursively.
  advanceClock(rootClock, rawDelta);

  // Rotate each shape proportionally to its clock's elapsed time. A full rotation per ~4 seconds at
  // scale 1 gives a readable spin speed.
  const degreesPerSecond = 90;
  rootShape.rotation = rootClock.elapsed * degreesPerSecond;
  invalidateNodeLocalTransform(rootShape);

  childShapeA.rotation = childClockA.elapsed * degreesPerSecond;
  invalidateNodeLocalTransform(childShapeA);

  childShapeB.rotation = childClockB.elapsed * degreesPerSecond;
  invalidateNodeLocalTransform(childShapeB);

  // Update info labels.
  updateLabel(
    rootInfoLabel,
    'elapsed ' +
      formatTime(rootClock.elapsed) +
      '  dt ' +
      rootClock.deltaTime.toFixed(3) +
      '  scale ' +
      rootClock.scale.toFixed(2),
  );

  updateLabel(
    childAInfoLabel,
    'elapsed ' +
      formatTime(childClockA.elapsed) +
      '  dt ' +
      childClockA.deltaTime.toFixed(3) +
      '  scale ' +
      childClockA.scale.toFixed(2) +
      '  eff ' +
      getClockEffectiveScale(childClockA).toFixed(2),
  );

  updateLabel(
    childBInfoLabel,
    'elapsed ' +
      formatTime(childClockB.elapsed) +
      '  dt ' +
      childClockB.deltaTime.toFixed(3) +
      '  scale ' +
      childClockB.scale.toFixed(2) +
      '  eff ' +
      getClockEffectiveScale(childClockB).toFixed(2),
  );

  // Update name labels with current scale.
  updateLabel(childANameLabel, 'Child A (' + childClockA.scale.toFixed(2) + 'x)');
  updateLabel(childBNameLabel, 'Child B (' + childClockB.scale.toFixed(2) + 'x)');

  // Show/hide paused overlays.
  rootPausedLabel.visible = rootClock.paused;
  invalidateNodeAppearance(rootPausedLabel);

  childAPausedLabel.visible = isClockEffectivelyPaused(childClockA);
  invalidateNodeAppearance(childAPausedLabel);

  childBPausedLabel.visible = isClockEffectivelyPaused(childClockB);
  invalidateNodeAppearance(childBPausedLabel);

  render(root);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
