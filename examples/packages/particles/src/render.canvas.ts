import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  createCanvasElement,
  createCanvasRenderSurface,
  createCanvasTextureResolvers,
  scene2dCanvasPipeline,
  createCanvasRenderState,
  defaultCanvasParticleEmitter2DRenderer,
  defaultCanvasTextLabelRenderer,
  enableCanvasBlendMode,
  enableFlightDiagnostics,
  getCanvasRenderStateTextureResolvers,
  ParticleEmitter2DKind,
  prepareScene2DRender,
  registerCanvasImageTextureResolver,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasScene2D,
  TextLabelKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createCanvasElement(webCanvasRenderSurfaceCreator, 800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(
  createCanvasRenderSurface(webCanvasRenderSurfaceCreator, canvas, {
    height: canvas.height / pixelRatio,
    pixelRatio,
    width: canvas.width / pixelRatio,
  }),
  scene2dCanvasPipeline,
  createCanvasTextureResolvers(webCanvasRenderSurfaceCreator),
  {
    sceneGraphSyncPolicy: 'requiresInvalidation',
    backgroundColor: 0x0a0a14ff,
  },
);
enableFlightDiagnostics(state);

registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
registerRenderer(state, ParticleEmitter2DKind, defaultCanvasParticleEmitter2DRenderer);
registerRenderer(state, TextLabelKind, defaultCanvasTextLabelRenderer);
enableCanvasBlendMode(state);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasScene2D(state, root);
}
