import { webCanvasRenderSurfaceCreator, webGraphicsHost } from '@flighthq/host-web';
import type { Node2D, ShapeRasterizer } from '@flighthq/sdk';
import {
  createCanvasRenderState,
  createCanvasRenderSurface,
  createCanvasShapeRasterizer,
  createCanvasTextureResolvers,
  createDomRenderState,
  defaultCanvasShapeCommands,
  defaultCanvasTextureShapeCommands,
  defaultDomRichTextRenderer,
  defaultDomScale9ShapeRenderer,
  defaultDomShapeRenderer,
  defaultDomSpriteRenderer,
  defaultDomTextLabelRenderer,
  enableDomBlendModeSupport,
  enableDomClipSupport,
  enableDomRenderCache,
  enableFlightDiagnostics,
  getCanvasRenderStateTextureResolvers,
  invalidateNodeLocalTransform,
  prepareScene2DRender,
  registerCanvasBitmapTextureResolver,
  registerCanvasImageTextureResolver,
  registerCanvasRenderTextureResolver,
  registerCanvasShapeCommands,
  registerDomBitmapTextureResolver,
  registerDomImageTextureResolver,
  registerDomShapeRasterizer,
  registerRenderer,
  renderDomBackground,
  renderDomScene2D,
  scene2dCanvasPipeline,
  RichTextKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
} from '@flighthq/sdk';
import { registerFunctionalTarget } from '@ft/verify';

import type { FunctionalDomTarget, FunctionalTargetOptions } from './target';

export function createDomTarget(options: Readonly<FunctionalTargetOptions>): FunctionalDomTarget {
  const { width, height } = options;

  // DOM has no backing store and needs no device transform — the browser rasterizes DOM elements at
  // device resolution itself, so the scene is authored in logical units and scale stays 1.
  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  document.body.appendChild(container);

  const state = createDomRenderState(container, {
    backgroundColor: options.background,
    sceneGraphSyncPolicy: options.syncPolicy,
  });

  enableFlightDiagnostics(state);
  registerDomBitmapTextureResolver(webGraphicsHost, state);
  registerDomImageTextureResolver(state);
  for (const kind of options.kinds ?? []) {
    if (kind === ShapeKind) {
      registerRenderer(state, ShapeKind, defaultDomShapeRenderer);
      registerDomShapeRasterizer(state, createHarnessShapeRasterizer());
      // The DOM shape renderer rasterizes paths through the canvas shape commands.
      registerCanvasShapeCommands(state, [...defaultCanvasShapeCommands, ...defaultCanvasTextureShapeCommands]);
    } else if (kind === RichTextKind) {
      registerRenderer(state, RichTextKind, defaultDomRichTextRenderer);
    } else if (kind === TextLabelKind) {
      registerRenderer(state, TextLabelKind, defaultDomTextLabelRenderer);
    } else if (kind === SpriteKind) {
      registerRenderer(state, SpriteKind, defaultDomSpriteRenderer);
    } else if (kind === Scale9ShapeKind) {
      registerRenderer(state, Scale9ShapeKind, defaultDomScale9ShapeRenderer);
      registerDomShapeRasterizer(state, createHarnessShapeRasterizer());
      registerCanvasShapeCommands(state, [...defaultCanvasShapeCommands, ...defaultCanvasTextureShapeCommands]);
    }
  }

  if (options.clip) enableDomClipSupport(state);
  if (options.cache) enableDomRenderCache(state);
  if (options.blend) enableDomBlendModeSupport(state);

  return registerFunctionalTarget({
    kind: 'dom',
    state,
    width,
    height,
    scale: 1,
    render(root: Node2D): void {
      if (!prepareScene2DRender(state, root)) return;
      renderDomBackground(state);
      renderDomScene2D(state, root);
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
