import {
  webHostCanvas,
  webHostGl,
  webHostImage,
  appendWebSurface,
  webHostSurfaceDisplay,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web';
import type { Node2D, ShapeRasterizer } from '@flighthq/sdk';
import {
  beginCanvasRenderPass,
  createCanvasRenderState,
  createCanvasSurfaceFromNativeHandle,
  createCanvasScreenRenderTarget,
  createCanvasShapeRasterizer,
  createCanvasTextureResolvers,
  createGlRenderState,
  createGlSurface,
  createMatrix,
  glParticleEmitter2DRenderer,
  glQuadBatchRenderer,
  glRichTextRenderer,
  glScale9ShapeRenderer,
  canvasShapeCommands,
  glShapeRenderer,
  glSpriteRenderer,
  glTextLabelRenderer,
  canvasTextureShapeCommands,
  glTilemapRenderer,
  enableFlightDiagnostics,
  enableGlBlendModeSupport,
  enableGlClipSupport,
  enableGlRenderCache,
  enableGlEffectGuards,
  enableGlStrokePathTessellation,
  getCanvasRenderStateTextureResolvers,
  invalidateNodeLocalTransform,
  ParticleEmitter2DKind,
  prepareScene2DRender,
  QuadBatchKind,
  registerCanvasBitmapTextureResolver,
  registerCanvasImageTextureResolver,
  registerCanvasRenderTextureResolver,
  registerCanvasShapeCommands,
  registerGlShapeRasterizer,
  registerNodeRenderer,
  renderGlScene2D,
  RichTextKind,
  Scale9ShapeKind,
  canvasScene2DRenderPreset,
  glScene3DRenderPreset,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  TilemapKind,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
  setSurfaceDisplaySize,
  createAppWindow,
  openWindow,
} from '@flighthq/sdk';
import { registerFunctionalTarget } from '@ft/verify';

import type { FunctionalGlTarget, FunctionalTargetOptions } from './target';

export function createGlTarget(options: Readonly<FunctionalTargetOptions>): FunctionalGlTarget {
  const { width, height } = options;
  const pixelRatio = window.devicePixelRatio || 1;

  const appWindow = createAppWindow();
  openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});

  const glSurface = createGlSurface(webHostGl, appWindow, width * pixelRatio, height * pixelRatio, {
    contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true, ...options.contextAttributes },
  });
  if (glSurface === null) throw new Error('createGlTarget: failed to acquire WebGL2 context');
  setSurfaceDisplaySize(webHostSurfaceDisplay, glSurface, width, height);
  appendWebSurface(glSurface, document.body);

  const state = createGlRenderState(glSurface.context, {
    ...glScene3DRenderPreset,
    pixelRatio,
    canvasHost: webHostCanvas,
    imageHost: webHostImage,
    sceneGraphSyncPolicy: options.syncPolicy,
  });
  const screenTarget = createGlScreenRenderTarget(state.gl);
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
  enableGlEffectGuards(state);
  for (const kind of options.kinds ?? []) {
    if (kind === ShapeKind) {
      registerNodeRenderer(state, ShapeKind, glShapeRenderer);
      registerGlShapeRasterizer(state, createHarnessShapeRasterizer());
      registerCanvasShapeCommands(state, [...canvasShapeCommands, ...canvasTextureShapeCommands]);
    } else if (kind === RichTextKind) {
      registerNodeRenderer(state, RichTextKind, glRichTextRenderer);
    } else if (kind === TextLabelKind) {
      registerNodeRenderer(state, TextLabelKind, glTextLabelRenderer);
    } else if (kind === SpriteKind) {
      registerNodeRenderer(state, SpriteKind, glSpriteRenderer);
    } else if (kind === ParticleEmitter2DKind) {
      registerNodeRenderer(state, ParticleEmitter2DKind, glParticleEmitter2DRenderer);
    } else if (kind === QuadBatchKind) {
      registerNodeRenderer(state, QuadBatchKind, glQuadBatchRenderer);
    } else if (kind === TilemapKind) {
      registerNodeRenderer(state, TilemapKind, glTilemapRenderer);
    } else if (kind === Scale9ShapeKind) {
      registerNodeRenderer(state, Scale9ShapeKind, glScale9ShapeRenderer);
      registerGlShapeRasterizer(state, createHarnessShapeRasterizer());
      registerCanvasShapeCommands(state, [...canvasShapeCommands, ...canvasTextureShapeCommands]);
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
      const pass = beginGlRenderPass(state, screenTarget, screenClear);
      renderGlScene2D(pass, root, dpiTransform);
      endGlRenderPass(pass);
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
  const surface = createCanvasSurfaceFromNativeHandle(webHostCanvas, canvas);
  if (surface === null) throw new Error('Failed to create Canvas surface from element.');
  // The rasterizer draws into its own canvas, so it opens its own pass over it and keeps it open for the
  // life of the state — every fill it paints happens inside that bracket.
  beginCanvasRenderPass(resolverState, createCanvasScreenRenderTarget(surface));
  registerCanvasBitmapTextureResolver(webHostImage, getCanvasRenderStateTextureResolvers(resolverState));
  registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(resolverState));
  registerCanvasRenderTextureResolver(getCanvasRenderStateTextureResolvers(resolverState), resolverState);
  return createCanvasShapeRasterizer(getCanvasRenderStateTextureResolvers(resolverState));
}
