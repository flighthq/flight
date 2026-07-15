import type { DisplayObject } from '@flighthq/sdk';
import {
  createGlCanvasElement,
  createGlRenderState,
  defaultGlRichTextRenderer,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  defaultGlTextLabelRenderer,
  enableGlTextInput,
  prepareDisplayObjectRender,
  registerDefaultGlMaterial,
  registerGlShapeCommands,
  registerRenderer,
  renderGlBackground,
  renderGlDisplayObject,
  RichTextKind,
  ShapeKind,
  TextLabelKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.style.margin = '0';
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0xd0d0d0ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerDefaultGlMaterial(state);
registerRenderer(state, RichTextKind, defaultGlRichTextRenderer);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerRenderer(state, TextLabelKind, defaultGlTextLabelRenderer);
registerGlShapeCommands(defaultGlShapeCommands);
enableGlTextInput();

export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderGlBackground(state);
  renderGlDisplayObject(state, root);
}
