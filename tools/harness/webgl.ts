import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createGlCanvasElement,
  createGlRenderState,
  createMatrix,
  defaultGlBitmapRenderer,
  defaultGlParticleEmitterRenderer,
  defaultGlQuadBatchRenderer,
  defaultGlRichTextRenderer,
  defaultGlScale9ShapeRenderer,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  defaultGlSpriteRenderer,
  defaultGlTextLabelRenderer,
  defaultGlTilemapRenderer,
  defaultGlVideoRenderer,
  enableGlBlendModeSupport,
  enableGlClipSupport,
  enableGlRenderCache,
  ParticleEmitterKind,
  prepareDisplayObjectRender,
  QuadBatchKind,
  registerDefaultGlMaterial,
  registerGlShapeCommands,
  registerRenderer,
  renderGlBackground,
  renderGlDisplayObject,
  RichTextKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  TilemapKind,
  VideoKind,
} from '@flighthq/sdk';

import type { FunctionalGlTarget, FunctionalTargetOptions } from './target';
import { registerFunctionalTarget } from './verify';

export function createGlTarget(options: Readonly<FunctionalTargetOptions>): FunctionalGlTarget {
  const { width, height } = options;
  const pixelRatio = window.devicePixelRatio || 1;

  const canvas = createGlCanvasElement(width, height, pixelRatio);
  document.body.appendChild(canvas);

  const state = createGlRenderState(canvas, {
    pixelRatio,
    backgroundColor: options.background,
    // preserveDrawingBuffer so the verifier (and the differential/fingerprint runner) can read the
    // frame back after rendering — harmless for tests, where throughput does not matter.
    contextAttributes: { alpha: false, preserveDrawingBuffer: true, ...options.contextAttributes },
    sceneGraphSyncPolicy: options.syncPolicy,
  });

  // Device transform carries DPI: the scene is authored in logical units, scaled to the backing
  // store here. See ../README.md for why this lives in renderTransform2D rather than the scene.
  state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

  registerDefaultGlMaterial(state);
  for (const kind of options.kinds ?? []) {
    if (kind === ShapeKind) {
      registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
      registerGlShapeCommands(defaultGlShapeCommands);
    } else if (kind === BitmapKind) {
      registerRenderer(state, BitmapKind, defaultGlBitmapRenderer);
    } else if (kind === RichTextKind) {
      registerRenderer(state, RichTextKind, defaultGlRichTextRenderer);
    } else if (kind === TextLabelKind) {
      registerRenderer(state, TextLabelKind, defaultGlTextLabelRenderer);
    } else if (kind === SpriteKind) {
      registerRenderer(state, SpriteKind, defaultGlSpriteRenderer);
    } else if (kind === ParticleEmitterKind) {
      registerRenderer(state, ParticleEmitterKind, defaultGlParticleEmitterRenderer);
    } else if (kind === QuadBatchKind) {
      registerRenderer(state, QuadBatchKind, defaultGlQuadBatchRenderer);
    } else if (kind === TilemapKind) {
      registerRenderer(state, TilemapKind, defaultGlTilemapRenderer);
    } else if (kind === Scale9ShapeKind) {
      registerRenderer(state, Scale9ShapeKind, defaultGlScale9ShapeRenderer);
      registerGlShapeCommands(defaultGlShapeCommands);
    } else if (kind === VideoKind) {
      registerRenderer(state, VideoKind, defaultGlVideoRenderer);
    }
  }

  if (options.clip) enableGlClipSupport(state);
  if (options.cache) enableGlRenderCache(state);
  if (options.blend) enableGlBlendModeSupport(state);

  return registerFunctionalTarget({
    kind: 'webgl',
    state,
    width,
    height,
    scale: pixelRatio,
    render(root: DisplayObject): void {
      if (!prepareDisplayObjectRender(state, root)) return;
      renderGlBackground(state);
      renderGlDisplayObject(state, root);
    },
  });
}
