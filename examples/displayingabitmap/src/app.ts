import { createCanvasRenderState, registerBitmapRenderer, render } from '@flighthq/render-canvas';

import Main from './Main.js';

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

const state = createCanvasRenderState(canvas, options);
registerBitmapRenderer(state);
const main = new Main();

function enterFrame() {
  render(state, main.model);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
