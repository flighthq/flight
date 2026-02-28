import { createCanvasRendererState, render } from '@flighthq/render-canvas';

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
render(state, main.model);
