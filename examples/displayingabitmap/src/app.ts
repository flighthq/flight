import { addNodeChild, createBitmap, createDisplayObject, loadImageSourceFromURL } from '@flighthq/sdk';

import { render, scale } from './render';

const main = createDisplayObject();
main.scaleX = scale;
main.scaleY = scale;

const bitmap = createBitmap();
const image = await loadImageSourceFromURL('assets/wabbit_alpha.png');
bitmap.data.image = image;
bitmap.x = (550 - image.width) / 2;
bitmap.y = (400 - image.height) / 2;
addNodeChild(main, bitmap);

function enterFrame() {
  render(main);
  requestAnimationFrame(enterFrame);
}

enterFrame();
