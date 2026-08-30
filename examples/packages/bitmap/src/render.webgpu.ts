import type { Node2D } from '@flighthq/sdk';
import {
  SpriteKind,
  createWgpuCanvasElement,
  createWgpuRenderStateFromCanvasElement,
  scene2dWgpuPipeline,
  enableFlightDiagnostics,
  defaultWgpuSpriteRenderer,
  prepareScene2DRender,
  registerWgpuImageTextureResolver,
  registerWgpuStandardMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, scene2dWgpuPipeline, {
  pixelRatio,
  backgroundColor: 0xf0f0f0ff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
enableFlightDiagnostics(state);

// This example creates only Image sources, so it registers only the Image resolver. The
// registerStandard* bag is a legitimate convenience and stays as it is — but an example is
// documentation, and reaching for the bag here would teach "install everything" while quietly
// carrying the Bitmap and RenderTarget resolvers this app never resolves.
registerWgpuImageTextureResolver(state);
registerWgpuStandardMaterial(state);
registerRenderer(state, SpriteKind, defaultWgpuSpriteRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuScene2D(state, root);
  submitWgpuRenderPass(state);
}
