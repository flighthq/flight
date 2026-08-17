import { computeRenderTargetSize, computeScene2DRenderTargetTransform } from '@flighthq/render/contract';
import { isCanvasRenderTextureReady, setCanvasRenderTransform2D } from '@flighthq/scene2d-canvas/contract';
import type { Bitmap, RenderEffect, RenderTexture } from '@flighthq/sdk';
import {
  ShapeKind,
  SpriteKind,
  acquireCanvasRenderTexture,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  applyCanvasRenderEffectsToRenderTexture,
  computeNodeRootLocalBoundsRectangle,
  computeRenderEffectPadding,
  createBlurEffect,
  createCanvasOffscreenRenderState,
  createCanvasRenderTexturePool,
  createDisplayObject,
  createMatrix,
  createRectangle,
  createShape,
  createSprite,
  getBitmapPixelRgb,
  getNodeParent,
  getTextureHeight,
  getTextureWidth,
  invalidateNodeLocalTransform,
  prepareScene2DRender,
  registerBlurEffectPaddingResolver,
  registerCanvasBlurEffect,
  releaseCanvasRenderTexture,
  renderCanvasScene2D,
  renderIntoCanvasRenderTexture,
  withCanvasRenderTextures,
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
if (target.kind !== 'canvas') throw new Error('per-node-effect-lane requires Canvas');
const { render, state, width } = target;

const offscreenState = createCanvasOffscreenRenderState(state);
const pool = createCanvasRenderTexturePool();
registerCanvasBlurEffect(offscreenState);
registerBlurEffectPaddingResolver(offscreenState);
const effects: ReadonlyArray<Readonly<RenderEffect>> = [createBlurEffect({ blurX: 8, blurY: 6 })];
const padding = computeRenderEffectPadding(offscreenState, effects);

// The selected subtree stays detached from the displayed graph. Root-local capture cancels its own
// dramatic transform while retaining the child scale changed between captures.
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
releaseCanvasRenderTexture(state, pool, first.destTexture);

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
if (!isCanvasRenderTextureReady(state, second.destTexture)) {
  throw new Error('[per-node-effect-lane] the final effect destination was not published');
}
if (source.visible !== sourceVisible || getNodeParent(source) !== null) {
  throw new Error('[per-node-effect-lane] capture mutated source visibility or attached it to the displayed graph');
}
if (pool.leased.size !== 1 || !pool.leased.has(second.destTexture)) {
  throw new Error('[per-node-effect-lane] source and scratch leases escaped their capture bracket');
}
if (offscreenState.canvas === state.canvas) {
  throw new Error('[per-node-effect-lane] offscreen capture did not restore its independent canvas');
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
  const destTexture = acquireCanvasRenderTexture(state, pool, descriptor);
  let sourceTexture!: RenderTexture;
  let scratchTexture!: RenderTexture;
  try {
    withCanvasRenderTextures(state, pool, [descriptor, descriptor], (textures) => {
      [sourceTexture, scratchTexture] = textures;
      const transform = createMatrix();
      computeScene2DRenderTargetTransform(transform, source, bounds, padding.left, padding.top);
      renderIntoCanvasRenderTexture(offscreenState, sourceTexture, (captureState) => {
        setCanvasRenderTransform2D(captureState, transform);
        prepareScene2DRender(captureState, source);
        renderCanvasScene2D(captureState, source);
      });
      if (
        !applyCanvasRenderEffectsToRenderTexture(
          offscreenState,
          pool,
          sourceTexture,
          destTexture,
          scratchTexture,
          effects,
        )
      ) {
        throw new Error('[per-node-effect-lane] the registered blur effect did not run');
      }
    });
  } catch (error) {
    releaseCanvasRenderTexture(state, pool, destTexture);
    throw error;
  }
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
