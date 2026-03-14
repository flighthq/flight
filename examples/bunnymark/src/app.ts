import { createRenderState, renderSprite, setSpriteRenderer } from '@flighthq/render-canvas';
import { renderBackground } from '@flighthq/render-canvas';
import { updateSpriteBeforeRender } from '@flighthq/render-core';
import { addChild } from '@flighthq/scene-graph-core';
import { createSprite } from '@flighthq/scene-graph-sprite';
import { addTextureAtlasRegion, createImageSource, createTextureAtlas } from 'packages/assets/dist';
import Stats from 'stats.js';

import type { Bunny } from './bunny';
import { createBunny } from './bunny';

const canvas = document.createElement('canvas');
canvas.width = 550;
canvas.height = 400;
document.body.appendChild(canvas);

const stats = new Stats();
stats.dom.style.position = 'absolute';
stats.dom.style.left = '0px';
stats.dom.style.top = '0px';
document.body.appendChild(stats.dom);

const bunnies: Bunny[] = [];
const container = createSprite();
const gravity: number = 0.5;
const minX: number = 0;
const minY: number = 0;
const maxX: number = canvas.width;
const maxY: number = canvas.height;

let addingBunnies: boolean;

const image = createImageSource(await loadImageAndDecode('assets/wabbit_alpha.png'));
const atlas = createTextureAtlas();
atlas.image = image;
addTextureAtlasRegion(atlas, 0, 0, image.width, image.height);

document.addEventListener('mousedown', () => {
  addingBunnies = true;
});

document.addEventListener('mouseup', () => {
  addingBunnies = false;
  console.log(bunnies.length + ' bunnies'); // eslint-disable-line
});

for (let i = 0; i < 10; i++) {
  addBunny();
}

const options = {
  backgroundColor: 0xeeddccff,
  contextAttributes: {
    alpha: false,
  },
};

const state = createRenderState(canvas, options);
setSpriteRenderer(state);
requestAnimationFrame(enterFrame);

function addBunny(): void {
  const bunny = createBunny();
  bunny.x = 0;
  bunny.y = 0;
  bunny.speedX = Math.random() * 5;
  bunny.speedY = Math.random() * 5 - 2.5;
  bunnies.push(bunny);
  addChild(container, bunny);
}

function enterFrame() {
  stats.begin();
  for (let i = 0; i < bunnies.length; i++) {
    const bunny = bunnies[i];
    bunny.x += bunny.speedX;
    bunny.y += bunny.speedY;
    bunny.speedY += gravity;

    if (bunny.x > maxX) {
      bunny.speedX *= -1;
      bunny.x = maxX;
    } else if (bunny.x < minX) {
      bunny.speedX *= -1;
      bunny.x = minX;
    }

    if (bunny.y > maxY) {
      bunny.speedY *= -0.8;
      bunny.y = maxY;
      if (Math.random() > 0.5) {
        bunny.speedY -= 3 + Math.random() * 4;
      }
    } else if (bunny.y < minY) {
      bunny.speedY = 0;
      bunny.y = minY;
    }
  }

  if (addingBunnies) {
    for (let i = 0; i < 100; i++) {
      addBunny();
    }
  }
  if (updateSpriteBeforeRender(state, container)) {
    renderBackground(state);
    renderSprite(state, container);
  }
  stats.end();
  requestAnimationFrame(enterFrame);
}

async function loadImageAndDecode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}
