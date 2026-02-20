import { createCanvasRendererState, renderCanvas } from '@flighthq/render';

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

const state = createCanvasRendererState(canvas, options);
const main = new Main();
renderCanvas(state, main);
