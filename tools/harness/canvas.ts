import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import type { Node2D } from '@flighthq/sdk';
import {
  createCanvasElement,
  createCanvasRenderState,
  createCanvasRenderSurface,
  createCanvasTextureResolvers,
  createMatrix,
  defaultCanvasParticleEmitter2DRenderer,
  defaultCanvasQuadBatchRenderer,
  defaultCanvasRichTextRenderer,
  defaultCanvasScale9ShapeRenderer,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  defaultCanvasSpriteRenderer,
  defaultCanvasTextLabelRenderer,
  defaultCanvasTextureShapeCommands,
  defaultCanvasTilemapRenderer,
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
  renderCanvasBackground,
  renderCanvasScene2D,
  RichTextKind,
  scene2dCanvasPipeline,
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

  const state = createCanvasRenderState(
    createCanvasRenderSurface(webCanvasRenderSurfaceCreator, canvas, {
      contextAttributes: options.contextAttributes ?? { alpha: false },
      height,
      pixelRatio,
      width,
    }),
    scene2dCanvasPipeline,
    createCanvasTextureResolvers(webCanvasRenderSurfaceCreator),
    {
      backgroundColor: options.background,
      pixelRatio,
      sceneGraphSyncPolicy: options.syncPolicy,
    },
  );

  // Device transform carries DPI: the scene is authored in logical units, scaled to the backing
  // store here. See ../README.md for why this lives in renderTransform2D rather than the scene.
  state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

  enableFlightDiagnostics(state);
  registerCanvasBitmapTextureResolver(getCanvasRenderStateTextureResolvers(state));
  registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
  registerCanvasRenderTextureResolver(getCanvasRenderStateTextureResolvers(state), state);
  for (const kind of options.kinds ?? []) {
    if (kind === ShapeKind) {
      registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
      registerCanvasShapeCommands(state, [...defaultCanvasShapeCommands, ...defaultCanvasTextureShapeCommands]);
    } else if (kind === RichTextKind) {
      registerRenderer(state, RichTextKind, defaultCanvasRichTextRenderer);
    } else if (kind === TextLabelKind) {
      registerRenderer(state, TextLabelKind, defaultCanvasTextLabelRenderer);
    } else if (kind === SpriteKind) {
      registerRenderer(state, SpriteKind, defaultCanvasSpriteRenderer);
    } else if (kind === ParticleEmitter2DKind) {
      registerRenderer(state, ParticleEmitter2DKind, defaultCanvasParticleEmitter2DRenderer);
    } else if (kind === QuadBatchKind) {
      registerRenderer(state, QuadBatchKind, defaultCanvasQuadBatchRenderer);
    } else if (kind === TilemapKind) {
      registerRenderer(state, TilemapKind, defaultCanvasTilemapRenderer);
    } else if (kind === Scale9ShapeKind) {
      registerRenderer(state, Scale9ShapeKind, defaultCanvasScale9ShapeRenderer);
      // Scale9 rasterizes its nine patches through the same canvas shape commands as Shape.
      registerCanvasShapeCommands(state, [...defaultCanvasShapeCommands, ...defaultCanvasTextureShapeCommands]);
    }
  }

  if (options.clip) enableCanvasClip(state);
  if (options.cache) enableCanvasRenderCache(state);
  if (options.blend) enableCanvasBlendMode(state);

  return registerFunctionalTarget({
    kind: 'canvas',
    state,
    width,
    height,
    scale: pixelRatio,
    render(root: Node2D): void {
      if (!prepareScene2DRender(state, root)) return;
      renderCanvasBackground(state);
      renderCanvasScene2D(state, root);
    },
    benchmark(root: Node2D): void {
      invalidateNodeLocalTransform(root);
      this.render(root);
    },
  });
}
