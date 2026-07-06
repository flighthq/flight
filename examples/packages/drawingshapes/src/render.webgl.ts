import type { DisplayObject } from '@flighthq/sdk';
import {
  createGlCanvasElement,
  createGlRenderState,
  defaultGlBeginFill,
  defaultGlCurveTo,
  defaultGlDrawCircle,
  defaultGlDrawEllipse,
  defaultGlDrawRectangle,
  defaultGlDrawRoundRectangle,
  defaultGlLineStyle,
  defaultGlLineTo,
  defaultGlMoveTo,
  defaultGlShapeRenderer,
  prepareDisplayObjectRender,
  registerDefaultGlMaterial,
  registerGlShapeCommands,
  registerRenderer,
  renderGlBackground,
  renderGlDisplayObject,
  ShapeKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xffffffff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlShapeCommands([
  defaultGlBeginFill,
  defaultGlCurveTo,
  defaultGlDrawCircle,
  defaultGlDrawEllipse,
  defaultGlDrawRectangle,
  defaultGlDrawRoundRectangle,
  defaultGlLineStyle,
  defaultGlLineTo,
  defaultGlMoveTo,
]);
registerDefaultGlMaterial(state);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderGlBackground(state);
  renderGlDisplayObject(state, root);
}
