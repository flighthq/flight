import {
  addGraphChild,
  connectSignal,
  createBitmap,
  createDisplayObject,
  createTween,
  createTweenManager,
  Elastic,
  invalidateRender,
  loadImageSourceFromURL,
  updateDisplayObjectBeforeRender,
  updateTweens,
} from '@flighthq/sdk';

import { render, scale, state } from './render';

const STAGE_WIDTH = 550;
const STAGE_HEIGHT = 400;

const manager = createTweenManager();
const main = createDisplayObject();
main.scaleX = scale;
main.scaleY = scale;
const container = createDisplayObject();
const bitmap = createBitmap();

container.alpha = 0;
container.scaleX = 0;
container.scaleY = 0;
container.x = STAGE_WIDTH / 2;
container.y = STAGE_HEIGHT / 2;

addGraphChild(container, bitmap);
addGraphChild(main, container);

const image = await loadImageSourceFromURL('assets/wabbit_alpha.png');
bitmap.data.image = image;
bitmap.x = -image.width / 2;
bitmap.y = -image.height / 2;

const tween = createTween(
  manager,
  container,
  3000,
  { alpha: 1, scaleX: 2, scaleY: 2 },
  { ease: Elastic.easeOut, repeat: -1, reflect: true },
);
connectSignal(tween.onUpdate, () => invalidateRender(container));

let lastTime = 0;

function enterFrame(time: number) {
  const delta = lastTime === 0 ? 0 : time - lastTime;
  lastTime = time;
  updateTweens(manager, delta);
  if (updateDisplayObjectBeforeRender(state, main)) {
    render(main);
  }
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
