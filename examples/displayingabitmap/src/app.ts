import {
  addChild,
  createBitmap,
  createDisplayObject,
  loadImageSourceFromURL,
  updateDisplayObjectBeforeRender,
} from '@flighthq/sdk';

import { render, scale, state } from './render';

const main = createDisplayObject();
main.scaleX = scale;
main.scaleY = scale;

const bitmap = createBitmap();
const image = await loadImageSourceFromURL('assets/wabbit_alpha.png');
bitmap.data.image = image;
bitmap.x = (550 - image.width) / 2;
bitmap.y = (400 - image.height) / 2;
addChild(main, bitmap);

function enterFrame() {
  if (updateDisplayObjectBeforeRender(state, main)) {
    render(main);
  }
  requestAnimationFrame(enterFrame);
}

enterFrame();
