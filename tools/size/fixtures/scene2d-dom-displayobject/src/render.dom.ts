import { addNodeChild } from '@flighthq/node';
import { prepareScene2DRender } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene2d';
import { createDomRenderState, renderDomBackground, renderDomScene2D } from '@flighthq/scene2d-dom';

const container = document.createElement('div');
container.style.width = '400px';
container.style.height = '300px';
document.body.style.margin = '0';
document.body.appendChild(container);

const state = createDomRenderState(container, { backgroundColor: 0x1a1a2eff, pixelRatio: 1 });

const root = createDisplayObject();
const child = createDisplayObject();
child.x = 60;
child.y = 40;
addNodeChild(root, child);

prepareScene2DRender(state, root);
renderDomBackground(state);
renderDomScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dDomDisplayObject', { root });
