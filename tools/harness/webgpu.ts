import { enableHostWebWgpuRenderSurface, webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import type { Node2D, ShapeRasterizer } from '@flighthq/sdk';
import {
  createCanvasRenderState,
  createCanvasRenderSurface,
  createCanvasShapeRasterizer,
  createCanvasTextureResolvers,
  createMatrix,
  createWgpuCanvasElement,
  createWgpuRenderStateFromCanvasElement,
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
  enableWgpuBlendModeSupport,
  enableWgpuClipSupport,
  enableWgpuFrameCapture,
  enableWgpuRenderCache,
  enableWgpuRenderEffectGuards,
  enableWgpuStrokePathTessellation,
  getCanvasRenderStateTextureResolvers,
  invalidateNodeLocalTransform,
  ParticleEmitter2DKind,
  prepareScene2DRender,
  QuadBatchKind,
  registerCanvasBitmapTextureResolver,
  registerCanvasImageTextureResolver,
  registerCanvasRenderTextureResolver,
  registerRenderer,
  registerStandardWgpuTextureResolvers,
  registerWgpuShapeCommands,
  registerWgpuShapeRasterizer,
  registerWgpuStandardMaterial,
  renderWgpuBackground,
  renderWgpuScene2D,
  scene2dCanvasPipeline,
  RichTextKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
  submitWgpuRenderPass,
  TextLabelKind,
  TilemapKind,
} from '@flighthq/sdk';
import { registerFunctionalTarget } from '@ft/verify';

import type { FunctionalTargetOptions, FunctionalWgpuTarget } from './target';

export async function createWgpuTarget(options: Readonly<FunctionalTargetOptions>): Promise<FunctionalWgpuTarget> {
  const { width, height } = options;
  const pixelRatio = window.devicePixelRatio || 1;

  enableHostWebWgpuRenderSurface();
  const canvas = createWgpuCanvasElement(width, height, pixelRatio);
  document.body.appendChild(canvas);

  const state = await createWgpuRenderStateFromCanvasElement(canvas, {
    pixelRatio,
    backgroundColor: options.background,
    sceneGraphSyncPolicy: options.syncPolicy,
  });

  state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

  enableFlightDiagnostics(state);
  // enableFlightDiagnostics lives in @flighthq/debug and cannot reach a backend package, so the WGPU
  // effect guards are wired here so a requested sample count outside WGPU's supported 1/4 values is
  // reported together with the applied substitution.
  enableWgpuRenderEffectGuards(state);
  registerStandardWgpuTextureResolvers(state);
  registerWgpuStandardMaterial(state);
  // Frame capture lets the verifier read the rendered frame back from the GPU; canvas presentation is
  // unavailable on the headless/software adapter, so this is the only path to the pixels.
  enableWgpuFrameCapture(state);
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
    state,
    width,
    height,
    scale: pixelRatio,
    render(root: Node2D): void {
      if (!prepareScene2DRender(state, root)) return;
      renderWgpuBackground(state);
      renderWgpuScene2D(state, root);
      submitWgpuRenderPass(state);
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
  registerCanvasBitmapTextureResolver(getCanvasRenderStateTextureResolvers(resolverState));
  registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(resolverState));
  registerCanvasRenderTextureResolver(getCanvasRenderStateTextureResolvers(resolverState), resolverState);
  return createCanvasShapeRasterizer(getCanvasRenderStateTextureResolvers(resolverState));
}
