import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createMatrix,
  createWgpuCanvasElement,
  createWgpuRenderState,
  defaultWgpuBitmapRenderer,
  defaultWgpuRichTextRenderer,
  defaultWgpuShapeCommands,
  defaultWgpuShapeRenderer,
  enableWgpuClipSupport,
  enableWgpuFrameCapture,
  enableWgpuRenderCache,
  prepareDisplayObjectRender,
  registerDefaultWgpuMaterial,
  registerRenderer,
  registerWgpuShapeCommands,
  renderWgpuBackground,
  renderWgpuDisplayObject,
  RichTextKind,
  ShapeKind,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

import type { FunctionalTargetOptions, FunctionalWgpuTarget } from './target';
import { registerFunctionalTarget } from './verify';

export async function createWgpuTarget(options: Readonly<FunctionalTargetOptions>): Promise<FunctionalWgpuTarget> {
  const { width, height } = options;
  const pixelRatio = window.devicePixelRatio || 1;

  const canvas = createWgpuCanvasElement(width, height, pixelRatio);
  document.body.appendChild(canvas);

  const state = await createWgpuRenderState(canvas, {
    pixelRatio,
    backgroundColor: options.background,
    sceneGraphSyncPolicy: options.syncPolicy,
  });

  state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

  registerDefaultWgpuMaterial(state);
  // Frame capture lets the verifier read the rendered frame back from the GPU; canvas presentation is
  // unavailable on the headless/software adapter, so this is the only path to the pixels.
  enableWgpuFrameCapture(state);
  for (const kind of options.kinds ?? []) {
    if (kind === ShapeKind) {
      registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
      registerWgpuShapeCommands(defaultWgpuShapeCommands);
    } else if (kind === BitmapKind) {
      registerRenderer(state, BitmapKind, defaultWgpuBitmapRenderer);
    } else if (kind === RichTextKind) {
      registerRenderer(state, RichTextKind, defaultWgpuRichTextRenderer);
    }
  }

  if (options.clip) enableWgpuClipSupport(state);
  if (options.cache) enableWgpuRenderCache(state);

  return registerFunctionalTarget({
    kind: 'webgpu',
    state,
    width,
    height,
    scale: pixelRatio,
    render(root: DisplayObject): void {
      if (!prepareDisplayObjectRender(state, root)) return;
      renderWgpuBackground(state);
      renderWgpuDisplayObject(state, root);
      submitWgpuRenderPass(state);
    },
  });
}
