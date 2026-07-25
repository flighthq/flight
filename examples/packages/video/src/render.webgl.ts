import type { Node2D } from '@flighthq/sdk';
import {
  VideoKind,
  createGlCanvasElement,
  createGlRenderState,
  defaultGlVideoRenderer,
  prepareScene2DRender,
  registerDefaultGlMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x1a1a2eff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerDefaultGlMaterial(state);
registerRenderer(state, VideoKind, defaultGlVideoRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderGlBackground(state);
  renderGlScene2D(state, root);
}
