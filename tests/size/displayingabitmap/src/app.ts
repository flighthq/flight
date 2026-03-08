import { createImageSource } from '@flighthq/assets';
import { clearFrame, createRenderState, renderDisplayObject } from '@flighthq/render-canvas';
import { setBitmapRenderer } from '@flighthq/render-canvas/bitmap';
import { updateForRender } from '@flighthq/render-core';
import { addChild } from '@flighthq/scene-graph-core';
import { createBitmap, createDisplayObject } from '@flighthq/scene-graph-display';

const main = createDisplayObject();
const bitmap = createBitmap();

try {
  const image = createImageSource(await loadImageAndDecode('assets/wabbit_alpha.png'));
  bitmap.data.image = image;
  bitmap.x = (550 - image.width) / 2;
  bitmap.y = (400 - image.height) / 2;
  addChild(main, bitmap);
} catch (error) {
  console.error('Error loading image:', error); // eslint-disable-line
}

function loadImageAndDecode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

const canvas = document.createElement('canvas');
canvas.width = 550;
canvas.height = 400;
document.body.appendChild(canvas);

const options = {
  backgroundColor: 0xeeddccff,
  contextAttributes: {
    alpha: false,
  },
};

const state = createRenderState(canvas, options);
setBitmapRenderer(state);

function enterFrame() {
  if (updateForRender(state, main)) {
    clearFrame(state);
    renderDisplayObject(state, main);
  }

  requestAnimationFrame(enterFrame);
}

enterFrame();
