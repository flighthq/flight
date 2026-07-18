import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createDomRenderState,
  defaultCanvasShapeCommands,
  defaultDomBitmapRenderer,
  defaultDomRichTextRenderer,
  defaultDomScale9ShapeRenderer,
  defaultDomShapeRenderer,
  defaultDomTextLabelRenderer,
  defaultDomVideoRenderer,
  enableDomBlendModeSupport,
  enableDomClipSupport,
  enableDomRenderCache,
  prepareDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderDomBackground,
  renderDomDisplayObject,
  RichTextKind,
  Scale9ShapeKind,
  ShapeKind,
  TextLabelKind,
  VideoKind,
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

  for (const kind of options.kinds ?? []) {
    if (kind === ShapeKind) {
      registerRenderer(state, ShapeKind, defaultDomShapeRenderer);
      // The DOM shape renderer rasterizes paths through the canvas shape commands.
      registerCanvasShapeCommands(defaultCanvasShapeCommands);
    } else if (kind === BitmapKind) {
      registerRenderer(state, BitmapKind, defaultDomBitmapRenderer);
    } else if (kind === RichTextKind) {
      registerRenderer(state, RichTextKind, defaultDomRichTextRenderer);
    } else if (kind === TextLabelKind) {
      registerRenderer(state, TextLabelKind, defaultDomTextLabelRenderer);
    } else if (kind === Scale9ShapeKind) {
      registerRenderer(state, Scale9ShapeKind, defaultDomScale9ShapeRenderer);
      registerCanvasShapeCommands(defaultCanvasShapeCommands);
    } else if (kind === VideoKind) {
      registerRenderer(state, VideoKind, defaultDomVideoRenderer);
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
    render(root: DisplayObject): void {
      if (!prepareDisplayObjectRender(state, root)) return;
      renderDomBackground(state);
      renderDomDisplayObject(state, root);
    },
  });
}
