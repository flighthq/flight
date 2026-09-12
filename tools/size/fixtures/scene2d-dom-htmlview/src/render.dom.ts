import { addNodeChild } from '@flighthq/node';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import { createDisplayObject, createHtmlView } from '@flighthq/scene2d';
import { createDomRenderState, defaultDomHtmlViewRenderer, renderDomScene2D } from '@flighthq/scene2d-dom';
import { HtmlViewKind } from '@flighthq/types';

const container = document.createElement('div');
container.style.width = '400px';
container.style.height = '300px';
document.body.style.margin = '0';
document.body.appendChild(container);

const state = createDomRenderState(container, { pixelRatio: 1 });
// DOM has no pass and no clear: the background is a CSS property on the element the caller
// already holds, set once rather than reapplied by a render function every frame.
container.style.backgroundColor = '#1a1a2e';

registerRenderer(state, HtmlViewKind, defaultDomHtmlViewRenderer);

const root = createDisplayObject();
const view = createHtmlView();
const content = document.createElement('div');
content.style.backgroundColor = '#ff4d67';
content.style.width = '100px';
content.style.height = '50px';
view.data.element = content;
view.data.width = 100;
view.data.height = 50;
view.x = 60;
view.y = 40;
addNodeChild(root, view);

prepareScene2DRender(state, root);
renderDomScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dDomHtmlView', { root });
