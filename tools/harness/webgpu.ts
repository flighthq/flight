import {
  createWebWgpuCanvasElement,
  webCanvasRenderSurfaceCreator,
  webHostImage,
  webRaster2DSurfaceProvider,
} from '@flighthq/host-web';
import type { Node2D, ShapeRasterizer } from '@flighthq/sdk';
import {
  beginCanvasRenderPass,
  beginWgpuRenderPass,
  createCanvasRenderState,
  createCanvasRenderSurface,
  createCanvasScreenRenderTarget,
  createCanvasShapeRasterizer,
  createCanvasTextureResolvers,
  createMatrix,
  createWgpuAcquisition,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  defaultWgpuParticleEmitter2DRenderer,
  defaultWgpuQuadBatchRenderer,
  defaultWgpuRichTextRenderer,
  defaultWgpuScale9ShapeRenderer,
  defaultWgpuShapeCommands,
  defaultWgpuShapeRenderer,
  defaultWgpuSpriteRenderer,
  defaultWgpuTextLabelRenderer,
  defaultWgpuTextureShapeCommands,
  defaultWgpuTilemapRenderer,
  enableFlightDiagnostics,
  enableWgpuScreenRenderTargetAntialias,
  enableWgpuBlendModeSupport,
  enableWgpuClipSupport,
  enableWgpuRenderCache,
  enableWgpuRenderEffectGuards,
  enableWgpuScreenRenderTargetCapture,
  enableWgpuStrokePathTessellation,
  endWgpuRenderPass,
  getCanvasRenderStateTextureResolvers,
  invalidateNodeLocalTransform,
  ParticleEmitter2DKind,
  prepareScene2DRender,
  QuadBatchKind,
  registerCanvasBitmapTextureResolver,
  registerCanvasImageTextureResolver,
  registerCanvasRenderTextureResolver,
  registerRenderer,
  registerWgpuShapeCommands,
  registerWgpuShapeRasterizer,
  renderWgpuScene2D,
  RichTextKind,
  Scale9ShapeKind,
  scene2DCanvasPipeline,
  scene3DWgpuPipeline,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  TilemapKind,
} from '@flighthq/sdk';
import { registerFunctionalTarget } from '@ft/verify';

import type { FunctionalTargetOptions, FunctionalWgpuTarget } from './target';

export async function createWgpuTarget(options: Readonly<FunctionalTargetOptions>): Promise<FunctionalWgpuTarget> {
  const { width, height } = options;
  const pixelRatio = window.devicePixelRatio || 1;

  const canvas = createWebWgpuCanvasElement(width, height, pixelRatio);
  document.body.appendChild(canvas);

  const acquisition = await createWgpuAcquisition(canvas);
  if (acquisition === null) throw new Error('createWgpuTarget: this environment has no WebGPU adapter');
  const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
  const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
    format: acquisition.format,
    pixelRatio,
    raster2DSurfaceProvider: webRaster2DSurfaceProvider,
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
    depth: 1.0,
  };

  state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

  enableFlightDiagnostics(state);
  // enableFlightDiagnostics lives in @flighthq/debug and cannot reach a backend package, so the WGPU
  // effect guards are wired here so a requested sample count outside WGPU's supported 1/4 values is
  // reported together with the applied substitution.
  enableWgpuRenderEffectGuards(state);
  // Frame capture lets the verifier read the rendered frame back from the GPU; canvas presentation is
  // unavailable on the headless/software adapter, so this is the only path to the pixels.
  enableWgpuScreenRenderTargetCapture(screen);
  if (options.contextAttributes?.antialias !== false) enableWgpuScreenRenderTargetAntialias(screen);
  for (const kind of options.kinds ?? []) {
    if (kind === ShapeKind) {
      registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
      registerWgpuShapeRasterizer(state, createHarnessShapeRasterizer());
      registerWgpuShapeCommands(state, [...defaultWgpuShapeCommands, ...defaultWgpuTextureShapeCommands]);
    } else if (kind === RichTextKind) {
      registerRenderer(state, RichTextKind, defaultWgpuRichTextRenderer);
    } else if (kind === TextLabelKind) {
      registerRenderer(state, TextLabelKind, defaultWgpuTextLabelRenderer);
    } else if (kind === SpriteKind) {
      registerRenderer(state, SpriteKind, defaultWgpuSpriteRenderer);
    } else if (kind === ParticleEmitter2DKind) {
      registerRenderer(state, ParticleEmitter2DKind, defaultWgpuParticleEmitter2DRenderer);
    } else if (kind === QuadBatchKind) {
      registerRenderer(state, QuadBatchKind, defaultWgpuQuadBatchRenderer);
    } else if (kind === TilemapKind) {
      registerRenderer(state, TilemapKind, defaultWgpuTilemapRenderer);
    } else if (kind === Scale9ShapeKind) {
      registerRenderer(state, Scale9ShapeKind, defaultWgpuScale9ShapeRenderer);
      registerWgpuShapeRasterizer(state, createHarnessShapeRasterizer());
      registerWgpuShapeCommands(state, [...defaultWgpuShapeCommands, ...defaultWgpuTextureShapeCommands]);
    }
  }

  if (options.clip) enableWgpuClipSupport(state);
  if (options.cache) enableWgpuRenderCache(state);
  if (options.blend) enableWgpuBlendModeSupport(state);
  if (options.strokePathTessellation) enableWgpuStrokePathTessellation(state);

  return registerFunctionalTarget({
    kind: 'webgpu',
    screen,
    state,
    width,
    height,
    scale: pixelRatio,
    render(root: Node2D): void {
      if (!prepareScene2DRender(state, root)) return;
      const pass = beginWgpuRenderPass(state, screen, screenClear);
      renderWgpuScene2D(pass, root);
      endWgpuRenderPass(pass);
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
    scene2DCanvasPipeline,
    createCanvasTextureResolvers(webCanvasRenderSurfaceCreator),
  );
  // The rasterizer draws into its own canvas, so it opens its own pass over it and keeps it open for the
  // life of the state — every fill it paints happens inside that bracket.
  beginCanvasRenderPass(
    resolverState,
    createCanvasScreenRenderTarget(createCanvasRenderSurface(webCanvasRenderSurfaceCreator, canvas)),
  );
  registerCanvasBitmapTextureResolver(webHostImage, getCanvasRenderStateTextureResolvers(resolverState));
  registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(resolverState));
  registerCanvasRenderTextureResolver(getCanvasRenderStateTextureResolvers(resolverState), resolverState);
  return createCanvasShapeRasterizer(getCanvasRenderStateTextureResolvers(resolverState));
}
