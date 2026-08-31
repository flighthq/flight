import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene2d';
import {
  createCanvasShapeRasterizer,
  createCanvasTextureResolvers,
  defaultCanvasShapeCommands,
  registerCanvasShapeCommands,
} from '@flighthq/scene2d-canvas';
import {
  createDomRenderState,
  defaultDomScale9ShapeRenderer,
  registerDomShapeRasterizer,
  renderDomBackground,
  renderDomScene2D,
} from '@flighthq/scene2d-dom';
import { appendShapeBeginFill, appendShapeEndFill, appendShapeRectangle, createScale9Shape } from '@flighthq/shape';
import { Scale9ShapeKind } from '@flighthq/types';

const container = document.createElement('div');
container.style.width = '400px';
container.style.height = '300px';
document.body.style.margin = '0';
document.body.appendChild(container);

const state = createDomRenderState(container, { backgroundColor: 0x1a1a2eff, pixelRatio: 1 });

registerRenderer(state, Scale9ShapeKind, defaultDomScale9ShapeRenderer);
const resolvers = createCanvasTextureResolvers(webCanvasRenderSurfaceCreator);
registerCanvasShapeCommands(state, defaultCanvasShapeCommands);
registerDomShapeRasterizer(state, createCanvasShapeRasterizer(resolvers));

const root = createDisplayObject();
const shape = createScale9Shape({ height: 30, width: 80, x: 10, y: 10 });
appendShapeBeginFill(shape, 0xff4d67ff);
appendShapeRectangle(shape, 0, 0, 100, 50);
appendShapeEndFill(shape);
shape.x = 60;
shape.y = 40;
addNodeChild(root, shape);

prepareScene2DRender(state, root);
renderDomBackground(state);
renderDomScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dDomScale9Shape', { root });
