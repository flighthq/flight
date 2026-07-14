import {
  addNodeChild,
  addTextureAtlasRegion,
  createDisplayObject,
  createImageResource,
  createQuadBatch,
  createTextLabel,
  createTextureAtlas,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  resizeQuadBatch,
} from '@flighthq/sdk';

import { canvas, render, scale } from './render';

const GRAVITY = 0.5;
const WIDTH = 800;
const HEIGHT = 500;
const INITIAL_COUNT = 10;
const BATCH_SIZE = 100;
const SHAPE_SIZE = 16;

const shapeCanvas = document.createElement('canvas');
shapeCanvas.width = SHAPE_SIZE;
shapeCanvas.height = SHAPE_SIZE;
const ctx = shapeCanvas.getContext('2d')!;
ctx.fillStyle = '#44aaee';
ctx.beginPath();
ctx.arc(SHAPE_SIZE / 2, SHAPE_SIZE / 2, SHAPE_SIZE / 2 - 1, 0, Math.PI * 2);
ctx.fill();

const atlas = createTextureAtlas({ image: createImageResource(shapeCanvas) });
addTextureAtlasRegion(atlas, 0, 0, SHAPE_SIZE, SHAPE_SIZE);

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const quadBatch = createQuadBatch();
quadBatch.data.atlas = atlas;
addNodeChild(root, quadBatch);

const countLabel = createTextLabel();
countLabel.data.text = '0 shapes';
countLabel.data.textFormat = { size: 14, color: 0xffffff };
countLabel.x = 10;
countLabel.y = HEIGHT - 24;
invalidateNodeLocalTransform(countLabel);
addNodeChild(root, countLabel);

const fpsOverlay = document.createElement('div');
fpsOverlay.style.cssText =
  'position:fixed;top:0;left:0;padding:4px 8px;background:rgba(0,0,0,0.6);color:#0f0;font:bold 12px monospace;z-index:10000';
document.body.appendChild(fpsOverlay);

const posX: number[] = [];
const posY: number[] = [];
const speedX: number[] = [];
const speedY: number[] = [];
let addingShapes = false;

function addShape(): void {
  resizeQuadBatch(quadBatch, posX.length + 1);
  invalidateNodeAppearance(quadBatch);
  posX.push(0);
  posY.push(0);
  speedX.push(Math.random() * 5);
  speedY.push(Math.random() * 5 - 2.5);
}

canvas.addEventListener('mousedown', () => {
  addingShapes = true;
});

canvas.addEventListener('mouseup', () => {
  addingShapes = false;
});

let frameCount = 0;
let fpsTime = performance.now();

function enterFrame(): void {
  const count = quadBatch.data.instanceCount;
  const transforms = quadBatch.data.transforms;

  for (let i = 0; i < count; i++) {
    posX[i] += speedX[i];
    posY[i] += speedY[i];
    speedY[i] += GRAVITY;

    if (posX[i] > WIDTH - SHAPE_SIZE) {
      speedX[i] *= -1;
      posX[i] = WIDTH - SHAPE_SIZE;
    } else if (posX[i] < 0) {
      speedX[i] *= -1;
      posX[i] = 0;
    }

    if (posY[i] > HEIGHT - SHAPE_SIZE) {
      speedY[i] *= -0.8;
      posY[i] = HEIGHT - SHAPE_SIZE;
      if (Math.random() > 0.5) {
        speedY[i] -= 3 + Math.random() * 4;
      }
    } else if (posY[i] < 0) {
      speedY[i] = 0;
      posY[i] = 0;
    }

    transforms[i * 2] = posX[i];
    transforms[i * 2 + 1] = posY[i];
  }

  invalidateNodeAppearance(quadBatch);

  if (addingShapes) {
    for (let i = 0; i < BATCH_SIZE; i++) {
      addShape();
    }
  }

  countLabel.data.text = posX.length + ' shapes';
  invalidateNodeLocalTransform(countLabel);

  frameCount++;
  const now = performance.now();
  if (now - fpsTime >= 1000) {
    fpsOverlay.textContent = frameCount + ' FPS';
    frameCount = 0;
    fpsTime = now;
  }

  render(root);

  requestAnimationFrame(enterFrame);
}

for (let i = 0; i < INITIAL_COUNT; i++) {
  addShape();
}

enterFrame();
