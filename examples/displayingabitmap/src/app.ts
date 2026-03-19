import { CanvasRenderer } from '@flighthq/flight';

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

const renderer = new CanvasRenderer(canvas, options);
const main = new Main();

function enterFrame() {
  renderer.render(main);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
