import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createMatrix,
  createWgpuCanvasElement,
  createWgpuRenderState,
  defaultWgpuBitmapRenderer,
  defaultWgpuParticleEmitter2DRenderer,
  defaultWgpuQuadBatchRenderer,
  defaultWgpuRichTextRenderer,
  defaultWgpuScale9ShapeRenderer,
  defaultWgpuShapeCommands,
  defaultWgpuShapeRenderer,
  defaultWgpuSpriteRenderer,
  defaultWgpuTextLabelRenderer,
  defaultWgpuTilemapRenderer,
  defaultWgpuVideoRenderer,
  enableWgpuBlendModeSupport,
  enableWgpuClipSupport,
  enableWgpuFrameCapture,
  enableWgpuRenderCache,
  invalidateNodeLocalTransform,
  ParticleEmitter2DKind,
  prepareDisplayObjectRender,
  QuadBatchKind,
  registerDefaultWgpuMaterial,
  registerRenderer,
  registerWgpuShapeCommands,
  renderWgpuBackground,
  renderWgpuDisplayObject,
  RichTextKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
  submitWgpuRenderPass,
  TextLabelKind,
  TilemapKind,
  VideoKind,
} from '@flighthq/sdk';
import { registerFunctionalTarget } from '@ft/verify';

import type { FunctionalTargetOptions, FunctionalWgpuTarget } from './target';

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
      registerWgpuShapeCommands(defaultWgpuShapeCommands);
    } else if (kind === VideoKind) {
      registerRenderer(state, VideoKind, defaultWgpuVideoRenderer);
    }
  }

  if (options.clip) enableWgpuClipSupport(state);
  if (options.cache) enableWgpuRenderCache(state);
  if (options.blend) enableWgpuBlendModeSupport(state);

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
    benchmark(root: DisplayObject): void {
      invalidateNodeLocalTransform(root);
      this.render(root);
    },
  });
}
