import { CanvasRenderer } from '@flighthq/render';

import Main from './Main.js';

const canvas = document.createElement('canvas');
canvas.width = 550;
canvas.height = 400;
document.body.appendChild(canvas);

const options = {
  backgroundColor: 0xffffffff,
  contextAttributes: {
    alpha: false,
  },
};

const renderer = new CanvasRenderer(canvas, options);

const main = new Main();
CanvasRenderer.render(renderer, main);
