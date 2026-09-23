import { getWebSurfaceCanvasHandle, webHostCanvas, webHostImage } from '@flighthq/host-web';
import type { Node2D } from '@flighthq/sdk';
import {
  createCanvasElement,
  beginCanvasRenderPass,
  createCanvasRenderState,
  createCanvasScreenRenderTarget,
  endCanvasRenderPass,
  createMatrix,
  canvasParticleEmitter2DRenderer,
  canvasQuadBatchRenderer,
  canvasRichTextRenderer,
  canvasScale9ShapeRenderer,
  canvasShapeCommands,
  canvasShapeRenderer,
  canvasSpriteRenderer,
  canvasTextLabelRenderer,
  canvasTextureShapeCommands,
  canvasTilemapRenderer,
  enableCanvasBlendMode,
  enableCanvasClip,
  enableCanvasRenderCache,
  enableFlightDiagnostics,
  getCanvasRenderStateTextureResolvers,
  invalidateNodeLocalTransform,
  ParticleEmitter2DKind,
  prepareScene2DRender,
  QuadBatchKind,
  registerCanvasBitmapTextureResolver,
  registerCanvasImageTextureResolver,
  registerCanvasRenderTextureResolver,
  registerCanvasShapeCommands,
  registerNodeRenderer,
  renderCanvasScene2D,
  RichTextKind,
  canvasScene2DRenderPreset,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  TilemapKind,
} from '@flighthq/sdk';
import { registerFunctionalTarget } from '@ft/verify';

import type { FunctionalCanvasTarget, FunctionalTargetOptions } from './target';

export function createCanvasTarget(options: Readonly<FunctionalTargetOptions>): FunctionalCanvasTarget {
  const { width, height } = options;
  const pixelRatio = window.devicePixelRatio || 1;

  const surface = createCanvasElement(webHostCanvas, width, height, pixelRatio);
  document.body.appendChild(getWebSurfaceCanvasHandle(surface) as HTMLCanvasElement);

  const screen = createCanvasScreenRenderTarget(surface);
  const state = createCanvasRenderState({
    ...canvasScene2DRenderPreset,
    canvasHost: webHostCanvas,
    pixelRatio,
    sceneGraphSyncPolicy: options.syncPolicy,
  });
  // The background is what the frame is cleared to — a per-pass value the render loop below passes in,
  // rather than a property the state carries for every pass it will ever open.
  const background = options.background ?? 0x00000000;
  const screenClear = {
    color: [
      ((background >>> 24) & 0xff) / 0xff,
      ((background >>> 16) & 0xff) / 0xff,
      ((background >>> 8) & 0xff) / 0xff,
      (background & 0xff) / 0xff,
    ] as const,
  };

  const dpiTransform = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

  enableFlightDiagnostics(state);
  registerCanvasBitmapTextureResolver(webHostImage, getCanvasRenderStateTextureResolvers(state));
  registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
  registerCanvasRenderTextureResolver(getCanvasRenderStateTextureResolvers(state), state);
  for (const kind of options.kinds ?? []) {
    if (kind === ShapeKind) {
      registerNodeRenderer(state, ShapeKind, canvasShapeRenderer);
      registerCanvasShapeCommands(state, [...canvasShapeCommands, ...canvasTextureShapeCommands]);
    } else if (kind === RichTextKind) {
      registerNodeRenderer(state, RichTextKind, canvasRichTextRenderer);
    } else if (kind === TextLabelKind) {
      registerNodeRenderer(state, TextLabelKind, canvasTextLabelRenderer);
    } else if (kind === SpriteKind) {
      registerNodeRenderer(state, SpriteKind, canvasSpriteRenderer);
    } else if (kind === ParticleEmitter2DKind) {
      registerNodeRenderer(state, ParticleEmitter2DKind, canvasParticleEmitter2DRenderer);
    } else if (kind === QuadBatchKind) {
      registerNodeRenderer(state, QuadBatchKind, canvasQuadBatchRenderer);
    } else if (kind === TilemapKind) {
      registerNodeRenderer(state, TilemapKind, canvasTilemapRenderer);
    } else if (kind === Scale9ShapeKind) {
      registerNodeRenderer(state, Scale9ShapeKind, canvasScale9ShapeRenderer);
      // Scale9 rasterizes its nine patches through the same canvas shape commands as Shape.
      registerCanvasShapeCommands(state, [...canvasShapeCommands, ...canvasTextureShapeCommands]);
    }
  }

  if (options.clip) enableCanvasClip(state);
  if (options.cache) enableCanvasRenderCache(state);
  if (options.blend) enableCanvasBlendMode(state);

  return registerFunctionalTarget({
    kind: 'canvas',
    screen,
    state,
    width,
    height,
    scale: pixelRatio,
    render(root: Node2D): void {
      if (!prepareScene2DRender(state, root)) return;
      const pass = beginCanvasRenderPass(state, screen, screenClear);
      renderCanvasScene2D(pass, root, dpiTransform);
      endCanvasRenderPass(pass);
    },
    benchmark(root: Node2D): void {
      invalidateNodeLocalTransform(root);
      this.render(root);
    },
  });
}
