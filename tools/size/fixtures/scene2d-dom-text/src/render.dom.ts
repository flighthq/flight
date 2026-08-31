import { addNodeChild } from '@flighthq/node';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene2d';
import {
  createDomRenderState,
  defaultDomTextLabelRenderer,
  renderDomBackground,
  renderDomScene2D,
} from '@flighthq/scene2d-dom';
import { createTextLabel } from '@flighthq/text';
import { TextLabelKind } from '@flighthq/types';

const container = document.createElement('div');
container.style.width = '400px';
container.style.height = '300px';
document.body.style.margin = '0';
document.body.appendChild(container);

const state = createDomRenderState(container, { backgroundColor: 0x1a1a2eff, pixelRatio: 1 });

registerRenderer(state, TextLabelKind, defaultDomTextLabelRenderer);

const root = createDisplayObject();
const label = createTextLabel();
label.data.text = 'Flight';
label.data.textFormat = { font: 'sans-serif', size: 24, color: 0xff4d67ff };
label.x = 60;
label.y = 40;
addNodeChild(root, label);

prepareScene2DRender(state, root);
renderDomBackground(state);
renderDomScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dDomText', { root });
