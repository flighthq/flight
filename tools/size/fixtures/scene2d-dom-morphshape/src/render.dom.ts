import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { appendPathRectangle, createPath, createPathMorph } from '@flighthq/path';
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
  defaultDomMorphShapeRenderer,
  registerDomShapeRasterizer,
  renderDomBackground,
  renderDomScene2D,
} from '@flighthq/scene2d-dom';
import { appendMorphShapeBeginFill, appendMorphShapePath, createMorphShape } from '@flighthq/shape';
import { MorphShapeKind } from '@flighthq/types';

const container = document.createElement('div');
container.style.width = '400px';
container.style.height = '300px';
document.body.style.margin = '0';
document.body.appendChild(container);

const state = createDomRenderState(container, { backgroundColor: 0x1a1a2eff, pixelRatio: 1 });

registerRenderer(state, MorphShapeKind, defaultDomMorphShapeRenderer);
const resolvers = createCanvasTextureResolvers(webCanvasRenderSurfaceCreator);
registerCanvasShapeCommands(state, defaultCanvasShapeCommands);
registerDomShapeRasterizer(state, createCanvasShapeRasterizer(resolvers));

const startPath = createPath();
appendPathRectangle(startPath, 0, 0, 100, 50);
const endPath = createPath();
appendPathRectangle(endPath, 0, 0, 50, 100);
const morph = createPathMorph(startPath, endPath)!;

const root = createDisplayObject();
const shape = createMorphShape(morph);
appendMorphShapeBeginFill(shape, { color: 0xff4d67ff }, { color: 0x4d67ffff });
appendMorphShapePath(shape);
shape.x = 60;
shape.y = 40;
addNodeChild(root, shape);

prepareScene2DRender(state, root);
renderDomBackground(state);
renderDomScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dDomMorphShape', { root });
