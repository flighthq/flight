import { webHostCanvas, webHostImage } from '@flighthq/host-web';
import type { Node2D, ShapeRasterizer } from '@flighthq/sdk';
import {
  beginCanvasRenderPass,
  createCanvasRenderState,
  createCanvasSurfaceFromNativeHandle,
  createCanvasScreenRenderTarget,
  createCanvasShapeRasterizer,
  createDomRenderState,
  canvasShapeCommands,
  canvasTextureShapeCommands,
  domRichTextRenderer,
  domScale9ShapeRenderer,
  domShapeRenderer,
  domSpriteRenderer,
  domTextLabelRenderer,
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
  registerNodeRenderer,
  renderDomScene2D,
  RichTextKind,
  Scale9ShapeKind,
  canvasScene2DRenderPreset,
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

  const state = createDomRenderState(container, { sceneGraphSyncPolicy: options.syncPolicy });
  // DOM has no pass and no clear: the background of a DOM scene is a CSS property on the element the
  // caller already holds, set once here rather than reapplied through a render function every frame.
  const background = options.background ?? 0x00000000;
  container.style.backgroundColor =
    (background & 0xff) === 0 ? '' : `#${(background >>> 8).toString(16).padStart(6, '0')}`;

  enableFlightDiagnostics(state);
  registerDomBitmapTextureResolver(webHostImage, state);
  registerDomImageTextureResolver(state);
  for (const kind of options.kinds ?? []) {
    if (kind === ShapeKind) {
      registerNodeRenderer(state, ShapeKind, domShapeRenderer);
      registerDomShapeRasterizer(state, createHarnessShapeRasterizer());
      // The DOM shape renderer rasterizes paths through the canvas shape commands.
      registerCanvasShapeCommands(state, [...canvasShapeCommands, ...canvasTextureShapeCommands]);
    } else if (kind === RichTextKind) {
      registerNodeRenderer(state, RichTextKind, domRichTextRenderer);
    } else if (kind === TextLabelKind) {
      registerNodeRenderer(state, TextLabelKind, domTextLabelRenderer);
    } else if (kind === SpriteKind) {
      registerNodeRenderer(state, SpriteKind, domSpriteRenderer);
    } else if (kind === Scale9ShapeKind) {
      registerNodeRenderer(state, Scale9ShapeKind, domScale9ShapeRenderer);
      registerDomShapeRasterizer(state, createHarnessShapeRasterizer());
      registerCanvasShapeCommands(state, [...canvasShapeCommands, ...canvasTextureShapeCommands]);
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
  const resolverState = createCanvasRenderState({ ...canvasScene2DRenderPreset, canvasHost: webHostCanvas });
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
