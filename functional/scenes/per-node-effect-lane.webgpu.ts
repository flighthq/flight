import {
  getWgpuRenderStateRuntime,
  isWgpuRenderTextureReady,
  setWgpuRenderTransform2D,
} from '@flighthq/render-wgpu/contract';
import { computeRenderTargetSize, computeScene2DRenderTargetTransform } from '@flighthq/render/contract';
import type { Bitmap, RenderEffect, RenderTexture } from '@flighthq/sdk';
import {
  ShapeKind,
  SpriteKind,
  acquireWgpuRenderTexture,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  applyWgpuRenderEffectsToRenderTexture,
  beginWgpuFrame,
  computeNodeRootLocalBoundsRectangle,
  computeRenderEffectPadding,
  createBlurEffect,
  createDisplayObject,
  createMatrix,
  createRectangle,
  createShape,
  createSprite,
  createWgpuOffscreenRenderState,
  createWgpuRenderTexturePool,
  getBitmapPixelRgb,
  getNodeParent,
  getTextureHeight,
  getTextureWidth,
  invalidateNodeLocalTransform,
  prepareScene2DRender,
  registerBlurEffectPaddingResolver,
  registerWgpuBlurEffect,
  releaseWgpuRenderTexture,
  renderIntoWgpuRenderTexture,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;
const RESULT_X = 287;
const RESULT_Y = 223;
const SOURCE_HALF_WIDTH = 52;
const SOURCE_HALF_HEIGHT = 34;
const FINAL_SCALE_X = 1.7;
const FINAL_SCALE_Y = 1.45;

export const minCoverage = 0;

const target = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x111522ff,
  kinds: [ShapeKind, SpriteKind],
  expectedImageDescription:
    'An 800x600 field on a very dark blue-black background carrying one dark purple backing panel, and ' +
    'on top of it a single bright cyan block whose top-left corner is near x 287, y 223 and which is ' +
    'roughly 176x99 — a 104x68 source scaled by about 1.7 across and 1.45 down. ' +
    'The block is BLURRED, not sharp: its centre is solid cyan, but its edges fade outward, and just ' +
    'beyond the left edge of the solid area the purple backing is visibly lightened toward cyan rather ' +
    'than left at its plain tone. A crisp-edged rectangle with no spill at all is one failure. The other ' +
    'is the opposite: the blur must NOT reach the far left of its own padding — a point a couple of ' +
    'pixels inside x 287 is still plain purple backing, not cyan. Only one cyan block appears, the ' +
    'backing is otherwise flat, and outside the panel the field is the dark blue-black background.',
});
if (target.kind !== 'webgpu') throw new Error('per-node-effect-lane requires WebGPU');
const { render, state, width } = target;

const offscreenState = createWgpuOffscreenRenderState(state);
const pool = createWgpuRenderTexturePool();
registerWgpuBlurEffect(offscreenState);
registerBlurEffectPaddingResolver(offscreenState);
const effects: ReadonlyArray<Readonly<RenderEffect>> = [createBlurEffect({ blurX: 8, blurY: 6 })];
const padding = computeRenderEffectPadding(offscreenState, effects);

// The selected subtree is a detached root of the offscreen pipeline. Its dramatic root transform is
// cancelled by root-local capture while the changed descendant scale remains visible in pass two.
const source = createDisplayObject();
source.x = 690;
source.y = 75;
source.rotation = 31;
invalidateNodeLocalTransform(source);
const sourceVisible = source.visible;

const sourceShape = createShape();
appendShapeBeginFill(sourceShape, 0x4de7f2ff, 1);
appendShapeRectangle(
  sourceShape,
  -SOURCE_HALF_WIDTH,
  -SOURCE_HALF_HEIGHT,
  SOURCE_HALF_WIDTH * 2,
  SOURCE_HALF_HEIGHT * 2,
);
appendShapeEndFill(sourceShape);
addNodeChild(source, sourceShape);

const first = captureSubtree();
const firstSourceHandle = first.sourceTexture;
const firstWidth = getTextureWidth(firstSourceHandle);
const firstHeight = getTextureHeight(firstSourceHandle);
releaseWgpuRenderTexture(state, pool, first.destTexture);
releaseWgpuRenderTexture(state, pool, first.scratchTexture);
releaseWgpuRenderTexture(state, pool, first.sourceTexture);

sourceShape.scaleX = FINAL_SCALE_X;
sourceShape.scaleY = FINAL_SCALE_Y;
invalidateNodeLocalTransform(sourceShape);

const second = captureSubtree();
if (second.sourceTexture !== firstSourceHandle) {
  throw new Error('[per-node-effect-lane] the released source handle was not reused');
}
if (getTextureWidth(second.sourceTexture) <= firstWidth || getTextureHeight(second.sourceTexture) <= firstHeight) {
  throw new Error('[per-node-effect-lane] the reused source handle did not resize for the second capture');
}
if (!isWgpuRenderTextureReady(state, second.destTexture)) {
  throw new Error('[per-node-effect-lane] the final effect destination was not published');
}
if (source.visible !== sourceVisible || getNodeParent(source) !== null) {
  throw new Error('[per-node-effect-lane] capture mutated source visibility or attached it to the displayed graph');
}

releaseWgpuRenderTexture(state, pool, second.scratchTexture);
releaseWgpuRenderTexture(state, pool, second.sourceTexture);
if (getWgpuRenderStateRuntime(offscreenState).commandEncoder !== null) {
  throw new Error('[per-node-effect-lane] offscreen capture/effect passes were not submitted');
}

const displayRoot = createDisplayObject();
const backing = createShape();
appendShapeBeginFill(backing, 0x292440ff, 1);
appendShapeRectangle(backing, 235, 170, 330, 240);
appendShapeEndFill(backing);
addNodeChild(displayRoot, backing);

const result = createSprite({ data: { texture: second.destTexture } });
result.x = RESULT_X;
result.y = RESULT_Y;
invalidateNodeLocalTransform(result);
addNodeChild(displayRoot, result);
render(displayRoot);

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * scale), Math.round(y * scale));

  const contentLeft = RESULT_X + padding.left;
  const contentTop = RESULT_Y + padding.top;
  const contentWidth = SOURCE_HALF_WIDTH * 2 * FINAL_SCALE_X;
  const contentHeight = SOURCE_HALF_HEIGHT * 2 * FINAL_SCALE_Y;
  const center = at(contentLeft + contentWidth / 2, contentTop + contentHeight / 2);
  if (!isCyan(center, 145)) {
    throw new Error(`[per-node-effect-lane] effected center is not cyan — got #${hex(center)}`);
  }

  const glow = at(contentLeft - 6, contentTop + contentHeight / 2);
  const outerPadding = at(RESULT_X + 2, contentTop + contentHeight / 2);
  const backingOnly = at(250, 185);
  if (channel(glow, 8) < channel(backingOnly, 8) + 35 || channel(glow, 0) < channel(backingOnly, 0) + 35) {
    throw new Error(
      `[per-node-effect-lane] blur did not occupy its left padding — glow #${hex(glow)}, backing #${hex(backingOnly)}`,
    );
  }
  if (isCyan(outerPadding, 120)) {
    throw new Error(
      `[per-node-effect-lane] second capture reused the first transform instead of preserving left padding — got #${hex(outerPadding)}`,
    );
  }
}

function captureSubtree(): {
  destTexture: RenderTexture;
  scratchTexture: RenderTexture;
  sourceTexture: RenderTexture;
} {
  const bounds = createRectangle();
  computeNodeRootLocalBoundsRectangle(bounds, source);
  const size = computeRenderTargetSize(bounds, padding);
  const descriptor = {
    clearColors: [0x00000000],
    depth: 'none' as const,
    height: size.height,
    width: size.width,
  };
  const sourceTexture = acquireWgpuRenderTexture(state, pool, descriptor);
  const destTexture = acquireWgpuRenderTexture(state, pool, descriptor);
  const scratchTexture = acquireWgpuRenderTexture(state, pool, descriptor);
  const transform = createMatrix();
  computeScene2DRenderTargetTransform(transform, source, bounds, padding.left, padding.top);
  beginWgpuFrame(offscreenState);
  renderIntoWgpuRenderTexture(offscreenState, sourceTexture, (captureState) => {
    setWgpuRenderTransform2D(captureState, transform);
    prepareScene2DRender(captureState, source);
    renderWgpuScene2D(captureState, source);
  });
  if (
    !applyWgpuRenderEffectsToRenderTexture(offscreenState, pool, sourceTexture, destTexture, scratchTexture, effects)
  ) {
    throw new Error('[per-node-effect-lane] the registered blur effect did not run');
  }
  submitWgpuRenderPass(offscreenState);
  return { destTexture, scratchTexture, sourceTexture };
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}

function hex(rgb: number): string {
  return (rgb & 0xffffffff).toString(16).padStart(6, '0');
}

function isCyan(rgb: number, minimum: number): boolean {
  return channel(rgb, 16) < 100 && channel(rgb, 8) > minimum && channel(rgb, 0) > minimum;
}
