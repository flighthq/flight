import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { prepareScene2DRender } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene2d';
import {
  createCanvasPipeline,
  createCanvasRenderState,
  createCanvasRenderSurface,
  createCanvasTextureResolvers,
  createEmptyCanvasRegistries,
  getCanvasPipelineRegistries,
  renderCanvasBackground,
  renderCanvasScene2D,
} from '@flighthq/scene2d-canvas';

// THE CONTAINER-ONLY PATH, and why it is a distinct fixture rather than a smaller sprite one.
//
// This scene registers NO RENDERER AT ALL. It builds a nested container hierarchy, drives the
// pre-render update pass, and draws the background — so it measures the floor every Canvas scene pays
// before any leaf renderer exists: scene graph + transform propagation + render state + surface +
// background clear.
//
// That makes it the subtrahend for the other three. sprite/shape/text each equal this floor plus
// exactly one feature, so the marginal cost of a feature is (that fixture − this one). Without it
// every other measurement conflates the feature with the substrate it sits on.
//
// REQUIRED WIRING:
//   surface   webCanvasRenderSurfaceCreator — the single Canvas surface provider, NOT aggregate webHost
//   renderer  none
//   commands  none
//   resolvers an EMPTY CanvasTextureResolvers container
//
// `renderCanvasScene2D` is still called on purpose: traversing a hierarchy that resolves no renderer
// is the path being measured, and skipping the call would measure a scene nobody draws.

const canvas = document.createElement('canvas');
canvas.width = 400;
canvas.height = 300;
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = createEmptyCanvasRegistries();
const pipeline = createCanvasPipeline({ ...emptyRegistries });

const state = createCanvasRenderState(
  createCanvasRenderSurface(webCanvasRenderSurfaceCreator, canvas, { height: 300, pixelRatio: 1, width: 400 }),
  pipeline,
  createCanvasTextureResolvers(webCanvasRenderSurfaceCreator),
  { backgroundColor: 0x1a1a2eff, pixelRatio: 1 },
);

const root = createDisplayObject();
const group = createDisplayObject();
group.x = 60;
group.y = 40;
group.rotation = 15;
group.scaleX = 1.5;
group.scaleY = 1.5;
addNodeChild(root, group);

const child = createDisplayObject();
child.x = 20;
child.y = 10;
addNodeChild(group, child);

prepareScene2DRender(state, root);
renderCanvasBackground(state);
renderCanvasScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dCanvasTransform', {
  registries: getCanvasPipelineRegistries(pipeline),
  root,
});
