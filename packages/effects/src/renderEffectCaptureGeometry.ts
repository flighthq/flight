import {
  copyMatrix,
  copyRectangle,
  createMatrix,
  createRectangle,
  isEmptyRectangle,
} from '@flighthq/geometry/contract';
import { computeNodeRootLocalBoundsRectangle, getNodeRuntime } from '@flighthq/node/contract';
import { computeRenderTargetSize, computeScene2DRenderTargetTransform } from '@flighthq/render/contract';
import type {
  Node2D,
  NodeAny,
  RenderEffect,
  RenderEffectCaptureGeometry,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';
import { Node2DTraitsKey } from '@flighthq/types/contract';

import { computeRenderEffectPadding } from './renderEffectPadding';

/**
 * Writes the substrate-independent geometry needed to capture a 2D subtree for an effect chain.
 * Returns false without touching out when source is not a Node2D or its root-local bounds are empty.
 */
export function computeRenderEffectCaptureGeometry(
  out: RenderEffectCaptureGeometry,
  state: RenderState,
  source: NodeAny,
  effects: Readonly<RenderEffect> | ReadonlyArray<Readonly<RenderEffect>>,
): boolean {
  if (getNodeRuntime(source).traits !== Node2DTraitsKey) return false;

  computeNodeRootLocalBoundsRectangle(_bounds, source as Node2D);
  if (isEmptyRectangle(_bounds)) return false;

  computeRenderEffectPadding(state, effects, _padding);
  computeRenderTargetSize(_targetSize, _bounds, _padding);
  computeScene2DRenderTargetTransform(_captureTransform, source as Node2D, _bounds, _padding.left, _padding.top);

  copyRectangle(out.bounds, _bounds);
  copyPadding(out.padding, _padding);
  copyMatrix(out.captureTransform, _captureTransform);
  out.targetHeight = _targetSize.height;
  out.targetWidth = _targetSize.width;
  return true;
}

function copyPadding(out: RenderEffectPadding, source: Readonly<RenderEffectPadding>): void {
  out.bottom = source.bottom;
  out.left = source.left;
  out.right = source.right;
  out.top = source.top;
}

const _bounds = createRectangle();
const _captureTransform = createMatrix();
const _padding: RenderEffectPadding = { bottom: 0, left: 0, right: 0, top: 0 };
const _targetSize = { height: 0, width: 0 };
