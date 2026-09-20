import { webCanvasRenderSurfaceCreator, webHostImage } from '@flighthq/host-web';
import type { Node2D } from '@flighthq/sdk';
import {
  createCanvasElement,
  beginCanvasRenderPass,
  createCanvasRenderState,
  createCanvasScreenRenderTarget,
  endCanvasRenderPass,
  registerCanvasSurfaceCreator,
  createCanvasRenderSurface,
  createCanvasTextureResolvers,
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
  registerRenderer,
  renderCanvasScene2D,
  RichTextKind,
  canvasScene2DRenderRegistries,
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

  const canvas = createCanvasElement(webCanvasRenderSurfaceCreator, width, height, pixelRatio);
  document.body.appendChild(canvas);

  const screen = createCanvasScreenRenderTarget(
    createCanvasRenderSurface(webCanvasRenderSurfaceCreator, canvas, {
      contextAttributes: options.contextAttributes ?? { alpha: false },
      height,
      pixelRatio,
      width,
    }),
  );
  const state = createCanvasRenderState(
    canvasScene2DRenderRegistries,
    createCanvasTextureResolvers(webCanvasRenderSurfaceCreator),
    { pixelRatio, sceneGraphSyncPolicy: options.syncPolicy },
  );
  registerCanvasSurfaceCreator(state, webCanvasRenderSurfaceCreator);
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

  // Device transform carries DPI: the scene is authored in logical units, scaled to the backing
  // store here. See ../README.md for why this lives in renderTransform2D rather than the scene.
  state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

  enableFlightDiagnostics(state);
  registerCanvasBitmapTextureResolver(webHostImage, getCanvasRenderStateTextureResolvers(state));
  registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
  registerCanvasRenderTextureResolver(getCanvasRenderStateTextureResolvers(state), state);
  for (const kind of options.kinds ?? []) {
    if (kind === ShapeKind) {
      registerRenderer(state, ShapeKind, canvasShapeRenderer);
      registerCanvasShapeCommands(state, [...canvasShapeCommands, ...canvasTextureShapeCommands]);
    } else if (kind === RichTextKind) {
      registerRenderer(state, RichTextKind, canvasRichTextRenderer);
    } else if (kind === TextLabelKind) {
      registerRenderer(state, TextLabelKind, canvasTextLabelRenderer);
    } else if (kind === SpriteKind) {
      registerRenderer(state, SpriteKind, canvasSpriteRenderer);
    } else if (kind === ParticleEmitter2DKind) {
      registerRenderer(state, ParticleEmitter2DKind, canvasParticleEmitter2DRenderer);
    } else if (kind === QuadBatchKind) {
      registerRenderer(state, QuadBatchKind, canvasQuadBatchRenderer);
    } else if (kind === TilemapKind) {
      registerRenderer(state, TilemapKind, canvasTilemapRenderer);
    } else if (kind === Scale9ShapeKind) {
      registerRenderer(state, Scale9ShapeKind, canvasScale9ShapeRenderer);
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
      renderCanvasScene2D(pass, root);
      endCanvasRenderPass(pass);
    },
    benchmark(root: Node2D): void {
      invalidateNodeLocalTransform(root);
      this.render(root);
    },
  });
}
