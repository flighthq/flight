import {
  enableHostWebGlRenderSurface,
  webCanvasRenderSurfaceCreator,
  webGraphicsHost,
  webRaster2DSurfaceProvider,
} from '@flighthq/host-web';
import type { Node2D, ShapeRasterizer } from '@flighthq/sdk';
import {
  scene2dGlPipeline,
  createGlContextState,
  createGlContextFromCanvasElement,
  createCanvasRenderState,
  createCanvasRenderSurface,
  createCanvasShapeRasterizer,
  createCanvasTextureResolvers,
  createGlCanvasElement,
  createGlRenderState,
  createMatrix,
  defaultGlParticleEmitter2DRenderer,
  defaultGlQuadBatchRenderer,
  defaultGlRichTextRenderer,
  defaultGlScale9ShapeRenderer,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  defaultGlSpriteRenderer,
  defaultGlTextLabelRenderer,
  defaultGlTextureShapeCommands,
  defaultGlTilemapRenderer,
  enableFlightDiagnostics,
  enableGlBlendModeSupport,
  enableGlClipSupport,
  enableGlRenderCache,
  enableGlRenderEffectGuards,
  enableGlStrokePathTessellation,
  getCanvasRenderStateTextureResolvers,
  invalidateNodeLocalTransform,
  ParticleEmitter2DKind,
  prepareScene2DRender,
  QuadBatchKind,
  registerCanvasBitmapTextureResolver,
  registerCanvasImageTextureResolver,
  registerCanvasRenderTextureResolver,
  registerGlShapeCommands,
  registerGlShapeRasterizer,
  registerGlStandardMaterial,
  registerRenderer,
  registerStandardGlTextureResolvers,
  renderGlBackground,
  renderGlScene2D,
  scene2dCanvasPipeline,
  RichTextKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  TilemapKind,
} from '@flighthq/sdk';
import { registerFunctionalTarget } from '@ft/verify';

import type { FunctionalGlTarget, FunctionalTargetOptions } from './target';

export function createGlTarget(options: Readonly<FunctionalTargetOptions>): FunctionalGlTarget {
  const { width, height } = options;
  const pixelRatio = window.devicePixelRatio || 1;

  enableHostWebGlRenderSurface();
  const canvas = createGlCanvasElement(width, height, pixelRatio);
  document.body.appendChild(canvas);

  const state = createGlRenderState(
    createGlContextState(
      createGlContextFromCanvasElement(canvas, {
        contextAttributes: { alpha: false, preserveDrawingBuffer: true, ...options.contextAttributes },
      }),
    ),
    scene2dGlPipeline,
    {
      pixelRatio,
      backgroundColor: options.background,
      raster2DSurfaceProvider: webRaster2DSurfaceProvider,
      sceneGraphSyncPolicy: options.syncPolicy,
    },
  );

  // Device transform carries DPI: the scene is authored in logical units, scaled to the backing
  // store here. See ../README.md for why this lives in renderTransform2D rather than the scene.
  state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

  enableFlightDiagnostics(state);
  enableGlRenderEffectGuards(state);
  registerStandardGlTextureResolvers(state);
  registerGlStandardMaterial(state);
  for (const kind of options.kinds ?? []) {
    if (kind === ShapeKind) {
      registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
      registerGlShapeRasterizer(state, createHarnessShapeRasterizer());
      registerGlShapeCommands(state, [...defaultGlShapeCommands, ...defaultGlTextureShapeCommands]);
    } else if (kind === RichTextKind) {
      registerRenderer(state, RichTextKind, defaultGlRichTextRenderer);
    } else if (kind === TextLabelKind) {
      registerRenderer(state, TextLabelKind, defaultGlTextLabelRenderer);
    } else if (kind === SpriteKind) {
      registerRenderer(state, SpriteKind, defaultGlSpriteRenderer);
    } else if (kind === ParticleEmitter2DKind) {
      registerRenderer(state, ParticleEmitter2DKind, defaultGlParticleEmitter2DRenderer);
    } else if (kind === QuadBatchKind) {
      registerRenderer(state, QuadBatchKind, defaultGlQuadBatchRenderer);
    } else if (kind === TilemapKind) {
      registerRenderer(state, TilemapKind, defaultGlTilemapRenderer);
    } else if (kind === Scale9ShapeKind) {
      registerRenderer(state, Scale9ShapeKind, defaultGlScale9ShapeRenderer);
      registerGlShapeRasterizer(state, createHarnessShapeRasterizer());
      registerGlShapeCommands(state, [...defaultGlShapeCommands, ...defaultGlTextureShapeCommands]);
    }
  }

  if (options.clip) enableGlClipSupport(state);
  if (options.cache) enableGlRenderCache(state);
  if (options.blend) enableGlBlendModeSupport(state);
  if (options.strokePathTessellation) enableGlStrokePathTessellation(state);

  return registerFunctionalTarget({
    kind: 'webgl',
    state,
    width,
    height,
    scale: pixelRatio,
    render(root: Node2D): void {
      if (!prepareScene2DRender(state, root)) return;
      renderGlBackground(state);
      renderGlScene2D(state, root);
    },
    benchmark(root: Node2D): void {
      invalidateNodeLocalTransform(root);
      this.render(root);
    },
  });
}

// The shape rasterizer draws the fills the GPU mesh path has no tessellated form for — gradients and
// texture fills. It resolves its pixels through a CanvasRenderState of its own, so the resolvers
// registered here are exactly what those fills can paint.
function createHarnessShapeRasterizer(): ShapeRasterizer {
  const canvas = document.createElement('canvas');
  const resolverState = createCanvasRenderState(
    createCanvasRenderSurface(webCanvasRenderSurfaceCreator, canvas),
    scene2dCanvasPipeline,
    createCanvasTextureResolvers(webCanvasRenderSurfaceCreator),
  );
  registerCanvasBitmapTextureResolver(webGraphicsHost, getCanvasRenderStateTextureResolvers(resolverState));
  registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(resolverState));
  registerCanvasRenderTextureResolver(getCanvasRenderStateTextureResolvers(resolverState), resolverState);
  return createCanvasShapeRasterizer(getCanvasRenderStateTextureResolvers(resolverState));
}
