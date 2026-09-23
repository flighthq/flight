import {
  webHostWgpuContext,
  webHostCanvas,
  webHostImage,
  appendWebSurface,
  webHostSurfaceDisplay,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web';
import type { Node2D, ShapeRasterizer } from '@flighthq/sdk';
import {
  beginCanvasRenderPass,
  beginWgpuRenderPass,
  createCanvasRenderState,
  createCanvasSurfaceFromNativeHandle,
  createCanvasScreenRenderTarget,
  createCanvasShapeRasterizer,
  createCanvasTextureResolvers,
  createMatrix,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  wgpuParticleEmitter2DRenderer,
  wgpuQuadBatchRenderer,
  wgpuRichTextRenderer,
  wgpuScale9ShapeRenderer,
  canvasShapeCommands,
  wgpuShapeRenderer,
  wgpuSpriteRenderer,
  wgpuTextLabelRenderer,
  canvasTextureShapeCommands,
  wgpuTilemapRenderer,
  enableFlightDiagnostics,
  enableWgpuBlendModeSupport,
  enableWgpuClipSupport,
  enableWgpuRenderCache,
  enableWgpuEffectGuards,
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
  registerNodeRenderer,
  registerCanvasShapeCommands,
  registerWgpuShapeRasterizer,
  renderWgpuScene2D,
  RichTextKind,
  Scale9ShapeKind,
  canvasScene2DRenderPreset,
  wgpuScene3DRenderPreset,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  TilemapKind,
  createWgpuSurface,
  setSurfaceDisplaySize,
  createAppWindow,
  openWindow,
} from '@flighthq/sdk';
import { registerFunctionalTarget } from '@ft/verify';

import type { FunctionalTargetOptions, FunctionalWgpuTarget } from './target';

export async function createWgpuTarget(options: Readonly<FunctionalTargetOptions>): Promise<FunctionalWgpuTarget> {
  const { width, height } = options;
  const pixelRatio = window.devicePixelRatio || 1;

  const appWindow = createAppWindow();
  openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});

  const wgpuSurface = await createWgpuSurface(webHostWgpuContext, appWindow, width * pixelRatio, height * pixelRatio);
  if (wgpuSurface === null) throw new Error('createWgpuTarget: this environment has no WebGPU adapter');
  setSurfaceDisplaySize(webHostSurfaceDisplay, wgpuSurface, width, height);
  appendWebSurface(wgpuSurface, document.body);
  const acquisition = wgpuSurface.acquisition;
  const screen = createWgpuScreenRenderTarget(webHostWgpuContext, acquisition.device, wgpuSurface, {
    format: acquisition.format,
  });
  const state = createWgpuRenderState(acquisition.device, {
    ...wgpuScene3DRenderPreset,
    format: acquisition.format,
    pixelRatio,
    canvasHost: webHostCanvas,
    imageHost: webHostImage,
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

  const dpiTransform = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

  enableFlightDiagnostics(state);
  // enableFlightDiagnostics lives in @flighthq/debug and cannot reach a backend package, so the WGPU
  // effect guards are wired here so a requested sample count outside WGPU's supported 1/4 values is
  // reported together with the applied substitution.
  enableWgpuEffectGuards(state);
  // Frame capture lets the verifier read the rendered frame back from the GPU; canvas presentation is
  // unavailable on the headless/software adapter, so this is the only path to the pixels.
  enableWgpuScreenRenderTargetCapture(screen);
  for (const kind of options.kinds ?? []) {
    if (kind === ShapeKind) {
      registerNodeRenderer(state, ShapeKind, wgpuShapeRenderer);
      registerWgpuShapeRasterizer(state, createHarnessShapeRasterizer());
      registerCanvasShapeCommands(state, [...canvasShapeCommands, ...canvasTextureShapeCommands]);
    } else if (kind === RichTextKind) {
      registerNodeRenderer(state, RichTextKind, wgpuRichTextRenderer);
    } else if (kind === TextLabelKind) {
      registerNodeRenderer(state, TextLabelKind, wgpuTextLabelRenderer);
    } else if (kind === SpriteKind) {
      registerNodeRenderer(state, SpriteKind, wgpuSpriteRenderer);
    } else if (kind === ParticleEmitter2DKind) {
      registerNodeRenderer(state, ParticleEmitter2DKind, wgpuParticleEmitter2DRenderer);
    } else if (kind === QuadBatchKind) {
      registerNodeRenderer(state, QuadBatchKind, wgpuQuadBatchRenderer);
    } else if (kind === TilemapKind) {
      registerNodeRenderer(state, TilemapKind, wgpuTilemapRenderer);
    } else if (kind === Scale9ShapeKind) {
      registerNodeRenderer(state, Scale9ShapeKind, wgpuScale9ShapeRenderer);
      registerWgpuShapeRasterizer(state, createHarnessShapeRasterizer());
      registerCanvasShapeCommands(state, [...canvasShapeCommands, ...canvasTextureShapeCommands]);
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
      renderWgpuScene2D(pass, root, dpiTransform);
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
  const resolverState = createCanvasRenderState(canvasScene2DRenderPreset, createCanvasTextureResolvers(webHostCanvas));
  // The rasterizer draws into its own canvas, so it opens its own pass over it and keeps it open for the
  // life of the state — every fill it paints happens inside that bracket.
  beginCanvasRenderPass(
    resolverState,
    createCanvasScreenRenderTarget(createCanvasSurfaceFromNativeHandle(webHostCanvas, canvas)),
  );
  registerCanvasBitmapTextureResolver(webHostImage, getCanvasRenderStateTextureResolvers(resolverState));
  registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(resolverState));
  registerCanvasRenderTextureResolver(getCanvasRenderStateTextureResolvers(resolverState), resolverState);
  return createCanvasShapeRasterizer(getCanvasRenderStateTextureResolvers(resolverState));
}
