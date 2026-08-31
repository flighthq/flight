import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import { addNodeChild, invalidateNodeAppearance } from '@flighthq/node';
import { createKeyedTable, withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene2d';
import {
  createCanvasPipeline,
  createCanvasRenderState,
  createCanvasRenderSurface,
  createCanvasTextureResolvers,
  createEmptyCanvasRegistries,
  defaultCanvasBeginFill,
  defaultCanvasDrawRectangle,
  defaultCanvasEndFill,
  defaultCanvasShapeRenderer,
  getCanvasPipelineRegistries,
  renderCanvasBackground,
  renderCanvasScene2D,
} from '@flighthq/scene2d-canvas';
import { appendShapeBeginFill, appendShapeEndFill, appendShapeRectangle, createShape } from '@flighthq/shape';
import type { CanvasShapeCommand } from '@flighthq/types';
import { RegistryEntryState, ShapeKind } from '@flighthq/types';

// REQUIRED WIRING for a filled vector rectangle, and nothing else:
//   surface   webCanvasRenderSurfaceCreator — the single Canvas surface provider, NOT the aggregate
//             webHost. Nothing here reaches a whole-store host.
//   renderer  ShapeKind -> defaultCanvasShapeRenderer
//   commands  beginFill, drawRectangle, endFill — the three this shape's stream actually replays.
//             `canvasShapeCommandTable()` is deliberately avoided: it binds every default command
//             plus every texture command, which is the aggregate this fixture exists to measure
//             without.
//   resolvers an EMPTY CanvasTextureResolvers container. A vector fill samples no texture, so no
//             resolver is registered at all — the empty container is the truthful wiring, not a
//             placeholder for one that was forgotten.

const canvas = document.createElement('canvas');
canvas.width = 400;
canvas.height = 300;
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = createEmptyCanvasRegistries();
// Built from an empty table rather than from `emptyRegistries.canvasShapeCommands`, which is optional
// on the registries type — starting from the explicit empty table states the three-command intent
// without a non-null assertion.
let shapeCommands = createKeyedTable<CanvasShapeCommand>('CanvasShapeCommand', 'Unregistered');
for (const command of [defaultCanvasBeginFill, defaultCanvasDrawRectangle, defaultCanvasEndFill]) {
  shapeCommands = withRegistryTableEntry(shapeCommands, command.key, command);
}

const pipeline = createCanvasPipeline({
  ...emptyRegistries,
  canvasShapeCommands: shapeCommands,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, ShapeKind, defaultCanvasShapeRenderer),
});

const state = createCanvasRenderState(
  createCanvasRenderSurface(webCanvasRenderSurfaceCreator, canvas, { height: 300, pixelRatio: 1, width: 400 }),
  pipeline,
  createCanvasTextureResolvers(webCanvasRenderSurfaceCreator),
  { backgroundColor: 0x1a1a2eff, pixelRatio: 1 },
);

const registries = getCanvasPipelineRegistries(pipeline);
for (const [kind, entry] of registries.renderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerRenderer(state, kind, entry.value);
}

const root = createDisplayObject();
const shape = createShape();
appendShapeBeginFill(shape, 0xff4d67ff, 1);
appendShapeRectangle(shape, 0, 0, 120, 90);
appendShapeEndFill(shape);
invalidateNodeAppearance(shape);
shape.x = 60;
shape.y = 40;
addNodeChild(root, shape);

prepareScene2DRender(state, root);
renderCanvasBackground(state);
renderCanvasScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dCanvasShape', { registries, root });
