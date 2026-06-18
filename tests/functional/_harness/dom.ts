import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createDOMRenderState,
  defaultCanvasShapeCommands,
  defaultDOMBitmapRenderer,
  defaultDOMRichTextRenderer,
  defaultDOMShapeRenderer,
  enableDOMClipRectangleSupport,
  prepareDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderDOMBackground,
  renderDOMDisplayObject,
  RichTextKind,
  ShapeKind,
} from '@flighthq/sdk';

import type { FunctionalTarget, FunctionalTargetOptions } from './target';

export function createDOMTarget(options: Readonly<FunctionalTargetOptions>): FunctionalTarget {
  const { width, height } = options;

  // DOM has no backing store and needs no device transform — the browser rasterizes DOM elements at
  // device resolution itself, so the scene is authored in logical units and scale stays 1.
  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  document.body.appendChild(container);

  const state = createDOMRenderState(container, {
    backgroundColor: options.background,
    sceneGraphSyncPolicy: options.syncPolicy,
  });

  for (const kind of options.kinds ?? []) {
    if (kind === ShapeKind) {
      registerRenderer(state, ShapeKind, defaultDOMShapeRenderer);
      // The DOM shape renderer rasterizes paths through the canvas shape commands.
      registerCanvasShapeCommands(defaultCanvasShapeCommands);
    } else if (kind === BitmapKind) {
      registerRenderer(state, BitmapKind, defaultDOMBitmapRenderer);
    } else if (kind === RichTextKind) {
      registerRenderer(state, RichTextKind, defaultDOMRichTextRenderer);
    }
  }

  if (options.clip) enableDOMClipRectangleSupport(state);

  return {
    state,
    width,
    height,
    render(root: DisplayObject): void {
      if (!prepareDisplayObjectRender(state, root)) return;
      renderDOMBackground(state);
      renderDOMDisplayObject(state, root);
    },
  };
}
