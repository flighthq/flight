import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import { addNodeChild, invalidateNodeAppearance } from '@flighthq/node';
import { createKeyedTable, withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene2d';
import {
  beginCanvasRenderPass,
  createCanvasPipeline,
  createCanvasRenderState,
  createCanvasRenderSurface,
  createCanvasScreenRenderTarget,
  createCanvasTextureResolvers,
  createEmptyCanvasRegistries,
  defaultCanvasBeginFill,
  defaultCanvasDrawRectangle,
  defaultCanvasEndFill,
  defaultCanvasScale9ShapeRenderer,
  endCanvasRenderPass,
  getCanvasPipelineRegistries,
  registerCanvasSurfaceCreator,
  renderCanvasScene2D,
} from '@flighthq/scene2d-canvas';
import { appendShapeBeginFill, appendShapeEndFill, appendShapeRectangle, createScale9Shape } from '@flighthq/shape';
import type { CanvasShapeCommand } from '@flighthq/types';
import { RegistryEntryState, Scale9ShapeKind } from '@flighthq/types';

// REQUIRED WIRING for one nine-sliced vector shape, and nothing else:
//   surface   webCanvasRenderSurfaceCreator — the single Canvas surface provider, NOT the aggregate
//             webHost.
//   renderer  Scale9ShapeKind -> defaultCanvasScale9ShapeRenderer
//   commands  beginFill, drawRectangle, endFill. A Scale9Shape carries a shape command stream like any
//             Shape does — the renderer remaps the command coordinates through a nine-slice mapper and
//             then replays them, so the SAME three commands this shape records must be registered.
//             `canvasShapeCommandTable()` is deliberately avoided; it binds every default command plus
//             every texture command.
//   resolvers an EMPTY CanvasTextureResolvers container. This nine-slice fills with a solid colour and
//             samples no texture.
//
// The marginal cost this isolates over the plain Shape fixture is the nine-slice mapper: the node is
// scaled so the mapper actually runs, since an unscaled Scale9Shape would exercise the remap path
// without ever exercising the remapping.

const canvas = document.createElement('canvas');
canvas.width = 400;
canvas.height = 300;
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = createEmptyCanvasRegistries();
let shapeCommands = createKeyedTable<CanvasShapeCommand>('CanvasShapeCommand', 'Unregistered');
for (const command of [defaultCanvasBeginFill, defaultCanvasDrawRectangle, defaultCanvasEndFill]) {
  shapeCommands = withRegistryTableEntry(shapeCommands, command.key, command);
}

const pipeline = createCanvasPipeline({
  ...emptyRegistries,
  canvasShapeCommands: shapeCommands,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, Scale9ShapeKind, defaultCanvasScale9ShapeRenderer),
});

const screen = createCanvasScreenRenderTarget(
  createCanvasRenderSurface(webCanvasRenderSurfaceCreator, canvas, { height: 300, pixelRatio: 1, width: 400 }),
);
const state = createCanvasRenderState(pipeline, createCanvasTextureResolvers(webCanvasRenderSurfaceCreator), {
  pixelRatio: 1,
});
registerCanvasSurfaceCreator(state, webCanvasRenderSurfaceCreator);
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x1a / 0xff, 0x1a / 0xff, 0x2e / 0xff, 1] } as const;

const registries = getCanvasPipelineRegistries(pipeline);
for (const [kind, entry] of registries.renderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerRenderer(state, kind, entry.value);
}

const root = createDisplayObject();
const scale9 = createScale9Shape({ height: 30, width: 40, x: 20, y: 20 });
appendShapeBeginFill(scale9, 0xff4d67ff, 1);
appendShapeRectangle(scale9, 0, 0, 80, 70);
appendShapeEndFill(scale9);
invalidateNodeAppearance(scale9);
scale9.x = 60;
scale9.y = 40;
scale9.scaleX = 2.5;
scale9.scaleY = 2;
addNodeChild(root, scale9);

prepareScene2DRender(state, root);
const pass = beginCanvasRenderPass(state, screen, screenClear);
renderCanvasScene2D(pass, root);

Reflect.set(globalThis, '__flightScene2dCanvasScale9Shape', { registries, root });
endCanvasRenderPass(pass);
