import {
  copyMatrix,
  copyRectangle,
  createMatrix,
  createRectangle,
  isEmptyRectangle,
} from '@flighthq/geometry/contract';
import { computeNodeRootLocalBoundsRectangle } from '@flighthq/node/contract';
import { computeRenderTargetSize, computeScene2DRenderTargetTransform } from '@flighthq/render/contract';
import type { Node2D, Effect, EffectCaptureGeometry, EffectPadding, RenderState } from '@flighthq/types/contract';

import { computeEffectPadding } from './effectPadding';

export function computeEffectCaptureGeometry(
  out: EffectCaptureGeometry,
  state: RenderState,
  source: Node2D,
  effects: Readonly<Effect> | ReadonlyArray<Readonly<Effect>>,
): boolean {
  computeNodeRootLocalBoundsRectangle(_bounds, source);
  if (isEmptyRectangle(_bounds)) return false;

  computeEffectPadding(state, effects, _padding);
  computeRenderTargetSize(_targetSize, _bounds, _padding);
  computeScene2DRenderTargetTransform(_captureTransform, source, _bounds, _padding.left, _padding.top);

  copyRectangle(out.bounds, _bounds);
  copyPadding(out.padding, _padding);
  copyMatrix(out.captureTransform, _captureTransform);
  out.targetHeight = _targetSize.height;
  out.targetWidth = _targetSize.width;
  return true;
}

function copyPadding(out: EffectPadding, source: Readonly<EffectPadding>): void {
  out.bottom = source.bottom;
  out.left = source.left;
  out.right = source.right;
  out.top = source.top;
}

const _bounds = createRectangle();
const _captureTransform = createMatrix();
const _padding: EffectPadding = { bottom: 0, left: 0, right: 0, top: 0 };
const _targetSize = { height: 0, width: 0 };
