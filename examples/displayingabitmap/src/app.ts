import { createRenderState, renderDisplayObject, setBitmapRenderer } from '@flighthq/render-canvas';
import { clearFrame } from '@flighthq/render-canvas';
import { updateDisplayObjectBeforeRender } from '@flighthq/render-core';

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

const state = createRenderState(canvas, options);
setBitmapRenderer(state);
const main = new Main();

function enterFrame() {
  if (updateDisplayObjectBeforeRender(state, main.model)) {
    clearFrame(state);
    renderDisplayObject(state, main.model);
  }
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
