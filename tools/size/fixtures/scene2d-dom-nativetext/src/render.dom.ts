import { addNodeChild } from '@flighthq/node';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene2d';
import {
  createDomRenderState,
  defaultDomNativeTextRenderer,
  renderDomBackground,
  renderDomScene2D,
} from '@flighthq/scene2d-dom';
import { createNativeText } from '@flighthq/text';
import { NativeTextKind } from '@flighthq/types';

const container = document.createElement('div');
container.style.width = '400px';
container.style.height = '300px';
document.body.style.margin = '0';
document.body.appendChild(container);

const state = createDomRenderState(container, { backgroundColor: 0x1a1a2eff, pixelRatio: 1 });

registerRenderer(state, NativeTextKind, defaultDomNativeTextRenderer);

const root = createDisplayObject();
const field = createNativeText();
field.data.text = 'Flight';
field.data.style = { font: 'sans-serif', size: 24, color: 0xff4d67ff };
field.x = 60;
field.y = 40;
addNodeChild(root, field);

prepareScene2DRender(state, root);
renderDomBackground(state);
renderDomScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dDomNativeText', { root });
