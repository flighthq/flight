import type { Node2D } from '@flighthq/sdk';
import {
  SpriteKind,
  createGlCanvasElement,
  createGlRenderState,
  enableFlightDiagnostics,
  defaultGlSpriteRenderer,
  prepareScene2DRender,
  registerGlImageTextureResolver,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0xf0f0f0ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
enableFlightDiagnostics(state);

// This example creates only Image sources, so it registers only the Image resolver. The
// registerStandard* bag is a legitimate convenience and stays as it is — but an example is
// documentation, and reaching for the bag here would teach "install everything" while quietly
// carrying the Bitmap and RenderTarget resolvers this app never resolves.
registerGlImageTextureResolver(state);
registerGlStandardMaterial(state);
registerRenderer(state, SpriteKind, defaultGlSpriteRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderGlBackground(state);
  renderGlScene2D(state, root);
}
