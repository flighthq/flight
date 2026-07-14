import {
  addMovieClipFrameScript,
  createMovieClip,
  getMovieClipCurrentFrame,
  getMovieClipCurrentLabel,
  getMovieClipTotalFrames,
  gotoAndPlayMovieClip,
  gotoAndStopMovieClip,
  isMovieClipPlaying,
  nextFrameMovieClip,
  playMovieClip,
  prevFrameMovieClip,
  setMovieClipSource,
  stopMovieClip,
  updateMovieClip,
} from '@flighthq/movieclip';
import type { DisplayObject, Shape } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeEndFill,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapeRectangle,
  clearShapeCommands,
  createDisplayObject,
  createShape,
  createTextLabel,
  createTimelineSource,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
} from '@flighthq/sdk';

import { render, scale } from './render';

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const TOTAL_FRAMES = 24;
const FRAME_RATE = 8;

// Lazily cache a child Shape per MovieClip target so the source is shareable.
const shapeCache = new WeakMap<DisplayObject, Shape>();

function getOrCreateChildShape(target: DisplayObject): Shape {
  let shape = shapeCache.get(target);
  if (shape === undefined) {
    shape = createShape();
    shape.x = 300;
    shape.y = 180;
    invalidateNodeLocalTransform(shape);
    addNodeChild(target, shape);
    shapeCache.set(target, shape);
  }
  return shape;
}

// Draw different shapes/colors depending on the frame range:
//   Frames 1-8 (intro): growing blue squares
//   Frames 9-18 (loop): rotating green triangles
//   Frames 19-24 (outro): shrinking red circles
function drawFrameContent(shape: Shape, frame: number): void {
  clearShapeCommands(shape);

  if (frame <= 8) {
    const progress = frame / 8;
    const size = 40 + progress * 80;
    const half = size / 2;
    const blue = 0x4488ccff;
    appendShapeBeginFill(shape, blue);
    appendShapeRectangle(shape, -half, -half, size, size);
    appendShapeEndFill(shape);
  } else if (frame <= 18) {
    const progress = (frame - 8) / 10;
    const size = 60 + progress * 40;
    const half = size / 2;
    const height = (size * Math.sqrt(3)) / 2;
    const green = 0x44cc88ff;
    appendShapeBeginFill(shape, green);
    appendShapeMoveTo(shape, 0, -height / 2);
    appendShapeLineTo(shape, half, height / 2);
    appendShapeLineTo(shape, -half, height / 2);
    appendShapeLineTo(shape, 0, -height / 2);
    appendShapeEndFill(shape);
  } else {
    const progress = (frame - 18) / 6;
    const radius = 60 - progress * 40;
    const red = 0xcc4444ff;
    appendShapeBeginFill(shape, red);
    appendShapeCircle(shape, 0, 0, radius);
    appendShapeEndFill(shape);
  }

  invalidateNodeAppearance(shape);
}

// Build the timeline source with labeled frame ranges.
const timelineSource = createTimelineSource({
  totalFrames: TOTAL_FRAMES,
  frameRate: FRAME_RATE,
  labels: [
    { name: 'intro', frame: 1 },
    { name: 'loop', frame: 9 },
    { name: 'outro', frame: 19 },
  ],
  constructFrame(target: DisplayObject, frame: number): void {
    const shape = getOrCreateChildShape(target);
    drawFrameContent(shape, frame);
  },
});

// Create the MovieClip and bind its source.
const clip = createMovieClip();
clip.x = 100;
clip.y = 20;
invalidateNodeLocalTransform(clip);
addNodeChild(root, clip);
setMovieClipSource(clip, timelineSource);

// Frame scripts at labeled frames update the frame-script status text.
let lastFrameScriptMessage = '';

addMovieClipFrameScript(clip, 'intro', () => {
  lastFrameScriptMessage = 'Frame script: entered "intro"';
});

addMovieClipFrameScript(clip, 'loop', () => {
  lastFrameScriptMessage = 'Frame script: entered "loop"';
});

addMovieClipFrameScript(clip, 'outro', () => {
  lastFrameScriptMessage = 'Frame script: entered "outro"';
});

// Start playing.
playMovieClip(clip);

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

const titleLabel = createLabel('Movie Clip', 20, 10, 24, 0xffffff);
addNodeChild(root, titleLabel);

const frameLabel = createLabel('', 20, 50, 16, 0xcccccc);
addNodeChild(root, frameLabel);

const labelLabel = createLabel('', 20, 75, 16, 0x88aacc);
addNodeChild(root, labelLabel);

const statusLabel = createLabel('', 20, 100, 16, 0x88cc88);
addNodeChild(root, statusLabel);

const scriptLabel = createLabel('', 20, 125, 14, 0xccaa44);
addNodeChild(root, scriptLabel);

const controlsLabel = createLabel(
  'Space play/stop   Left/Right step   1 intro   2 loop   3 outro',
  20,
  470,
  13,
  0x888888,
);
addNodeChild(root, controlsLabel);

// Keyboard controls.
window.addEventListener('keydown', (e: KeyboardEvent) => {
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      if (isMovieClipPlaying(clip)) {
        stopMovieClip(clip);
      } else {
        playMovieClip(clip);
      }
      break;
    case 'ArrowLeft':
      e.preventDefault();
      prevFrameMovieClip(clip);
      break;
    case 'ArrowRight':
      e.preventDefault();
      nextFrameMovieClip(clip);
      break;
    case 'Digit1':
      gotoAndPlayMovieClip(clip, 'intro');
      break;
    case 'Digit2':
      gotoAndPlayMovieClip(clip, 'loop');
      break;
    case 'Digit3':
      gotoAndStopMovieClip(clip, 'outro');
      break;
  }
});

let lastTime = performance.now();

function enterFrame(): void {
  const now = performance.now();
  const deltaTime = now - lastTime;
  lastTime = now;

  updateMovieClip(clip, deltaTime);

  // Update HUD.
  const currentFrame = getMovieClipCurrentFrame(clip);
  const totalFrames = getMovieClipTotalFrames(clip);
  const currentLabel = getMovieClipCurrentLabel(clip);
  const playing = isMovieClipPlaying(clip);

  updateLabel(frameLabel, 'Frame: ' + currentFrame + ' / ' + totalFrames);
  updateLabel(labelLabel, 'Label: ' + (currentLabel !== null ? currentLabel.name : '(none)'));
  updateLabel(statusLabel, playing ? 'Playing' : 'Stopped');
  updateLabel(scriptLabel, lastFrameScriptMessage);

  render(root);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
