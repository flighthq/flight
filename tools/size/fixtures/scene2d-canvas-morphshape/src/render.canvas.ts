import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import { addNodeChild, invalidateNodeAppearance } from '@flighthq/node';
import { appendPathRectangle, createPath, createPathMorph } from '@flighthq/path';
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
  defaultCanvasDrawPath,
  defaultCanvasEndFill,
  defaultCanvasMorphShapeRenderer,
  getCanvasPipelineRegistries,
  renderCanvasBackground,
  renderCanvasScene2D,
} from '@flighthq/scene2d-canvas';
import { appendMorphShapeBeginFill, appendMorphShapePath, appendShapeEndFill, createMorphShape } from '@flighthq/shape';
import type { CanvasShapeCommand } from '@flighthq/types';
import { MorphShapeKind, RegistryEntryState } from '@flighthq/types';

// REQUIRED WIRING for one interpolated vector shape, and nothing else:
//   surface   webCanvasRenderSurfaceCreator — the single Canvas surface provider, NOT the aggregate
//             webHost.
//   renderer  MorphShapeKind -> defaultCanvasMorphShapeRenderer
//   commands  beginFill, drawPath, endFill. A MorphShape does NOT record the same commands the plain
//             Shape fixture does: `appendMorphShapePath` samples the morph into a Path and emits a
//             single drawPath command, so `defaultCanvasDrawPath` is required and
//             `defaultCanvasDrawRectangle` is not. Registering the Shape fixture's three commands here
//             would leave the shape unrendered.
//   resolvers an EMPTY CanvasTextureResolvers container. This morph fills with an interpolated solid
//             colour and samples no texture.
//
// ★ PROGRESS IS SET AWAY FROM AN ENDPOINT ON PURPOSE. At progress 0 or 1 the sampled path equals one
// of the two authored paths, so the interpolation would never run and the fixture would measure a
// plain path fill wearing a MorphShape's name. 0.5 forces both the geometry and the colour endpoints
// through the interpolation this fixture exists to price.

const canvas = document.createElement('canvas');
canvas.width = 400;
canvas.height = 300;
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = createEmptyCanvasRegistries();
let shapeCommands = createKeyedTable<CanvasShapeCommand>('CanvasShapeCommand', 'Unregistered');
for (const command of [defaultCanvasBeginFill, defaultCanvasDrawPath, defaultCanvasEndFill]) {
  shapeCommands = withRegistryTableEntry(shapeCommands, command.key, command);
}

const pipeline = createCanvasPipeline({
  ...emptyRegistries,
  canvasShapeCommands: shapeCommands,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, MorphShapeKind, defaultCanvasMorphShapeRenderer),
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

const startPath = createPath();
appendPathRectangle(startPath, 0, 0, 120, 40);
const endPath = createPath();
appendPathRectangle(endPath, 0, 0, 40, 120);

const root = createDisplayObject();
const morph = createPathMorph(startPath, endPath);
if (morph !== null) {
  const shape = createMorphShape(morph);
  shape.data.progress = 0.5;
  appendMorphShapeBeginFill(shape, { color: 0xff4d67ff }, { color: 0x4d9fffff });
  appendMorphShapePath(shape);
  appendShapeEndFill(shape);
  invalidateNodeAppearance(shape);
  shape.x = 60;
  shape.y = 40;
  addNodeChild(root, shape);
}

prepareScene2DRender(state, root);
renderCanvasBackground(state);
renderCanvasScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dCanvasMorphShape', { registries, root });
