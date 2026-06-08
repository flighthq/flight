import {
  addTextureAtlasRegion,
  createQuadBatch,
  createTextureAtlas,
  invalidateAppearance,
  loadImageSourceFromURL,
  resizeQuadBatch,
} from '@flighthq/sdk';
import Stats from 'stats.js';

import { canvas, render, scale } from './render';

const GRAVITY = 0.5;
const WIDTH = 550;
const HEIGHT = 400;
const INITIAL_COUNT = 10;
const BATCH_SIZE = 100;

const stats = new Stats();
stats.dom.style.position = 'absolute';
stats.dom.style.left = '0px';
stats.dom.style.top = '0px';
document.body.appendChild(stats.dom);

const counter = document.createElement('div');
counter.style.cssText =
  'position:fixed;bottom:0;right:0;width:80px;padding:3px 0;background:#fff;color:#333;font:bold 9px monospace;text-align:center;opacity:0.9;z-index:10000';
document.body.appendChild(counter);

const bunny = await loadImageSourceFromURL('assets/wabbit_alpha.png');

const atlas = createTextureAtlas({ image: bunny });
addTextureAtlasRegion(atlas, 0, 0, bunny.width, bunny.height);

const bunnyWidth = bunny.width;
const bunnyHeight = bunny.height;

const quadBatch = createQuadBatch();
quadBatch.data.atlas = atlas;
quadBatch.scaleX = scale;
quadBatch.scaleY = scale;

const posX: number[] = [];
const posY: number[] = [];
const speedX: number[] = [];
const speedY: number[] = [];
let addingBunnies = false;

function addBunny(): void {
  resizeQuadBatch(quadBatch, posX.length + 1);
  invalidateAppearance(quadBatch);
  posX.push(0);
  posY.push(0);
  speedX.push(Math.random() * 5);
  speedY.push(Math.random() * 5 - 2.5);
}

canvas.addEventListener('mousedown', () => {
  addingBunnies = true;
});

canvas.addEventListener('mouseup', () => {
  addingBunnies = false;
});

function enterFrame(): void {
  stats.begin();

  const count = quadBatch.data.instanceCount;
  const transforms = quadBatch.data.transforms;

  for (let i = 0; i < count; i++) {
    posX[i] += speedX[i];
    posY[i] += speedY[i];
    speedY[i] += GRAVITY;

    if (posX[i] > WIDTH - bunnyWidth) {
      speedX[i] *= -1;
      posX[i] = WIDTH - bunnyWidth;
    } else if (posX[i] < 0) {
      speedX[i] *= -1;
      posX[i] = 0;
    }

    if (posY[i] > HEIGHT - bunnyHeight) {
      speedY[i] *= -0.8;
      posY[i] = HEIGHT - bunnyHeight;
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

  invalidateAppearance(quadBatch);

  if (addingBunnies) {
    for (let i = 0; i < BATCH_SIZE; i++) {
      addBunny();
    }
  }

  counter.textContent = posX.length + ' bunnies';

  render(quadBatch);

  stats.end();
  requestAnimationFrame(enterFrame);
}

for (let i = 0; i < INITIAL_COUNT; i++) {
  addBunny();
}

enterFrame();
