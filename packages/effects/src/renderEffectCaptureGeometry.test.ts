import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createMatrix, createRectangle, setRectangle } from '@flighthq/geometry/contract';
import {
  addNodeChild,
  createNode,
  getNodeRuntime,
  initBoundsRectangleRuntimeTrait,
  initBoundsRectangleTrait,
  initTransform2DRuntimeTrait,
  initTransform2DTrait,
  invalidateNodeLocalBounds,
} from '@flighthq/node/contract';
import { computeNodeRootLocalBoundsRectangle } from '@flighthq/node/contract';
import {
  computeRenderTargetSize,
  computeScene2DRenderTargetTransform,
  createRenderState,
} from '@flighthq/render/contract';
import type {
  HasBoundsRectangleRuntime,
  HasTransform2DRuntime,
  Node2D,
  Node2DRuntime,
  NodeAny,
  MatrixLike,
  Rectangle,
  RenderEffect,
  RenderEffectCaptureGeometry,
} from '@flighthq/types/contract';
import { Node2DTraitsKey } from '@flighthq/types/contract';

import { computeRenderEffectCaptureGeometry } from './renderEffectCaptureGeometry';
import { computeRenderEffectPadding, registerRenderEffectPaddingResolver } from './renderEffectPadding';

function createCaptureNode(bounds: Readonly<Rectangle>): Node2D {
  const node = createNode('CaptureGeometryTest') as Node2D;
  const runtime = getNodeRuntime(node) as Node2DRuntime;
  runtime.traits = Node2DTraitsKey;
  initBoundsRectangleTrait(node);
  initBoundsRectangleRuntimeTrait(runtime as HasBoundsRectangleRuntime, {
    computeLocalBoundsRectangle(out) {
      setRectangle(out, bounds.x, bounds.y, bounds.width, bounds.height);
    },
  });
  initTransform2DTrait(node);
  initTransform2DRuntimeTrait(runtime as HasTransform2DRuntime);
  invalidateNodeLocalBounds(node);
  return node;
}

function createOut(): RenderEffectCaptureGeometry {
  return {
    bounds: createRectangle(),
    captureTransform: createMatrix(),
    padding: { bottom: 0, left: 0, right: 0, top: 0 },
    targetHeight: 0,
    targetWidth: 0,
  };
}

function captureOutValues(out: Readonly<RenderEffectCaptureGeometry>): number[] {
  return [
    out.bounds.x,
    out.bounds.y,
    out.bounds.width,
    out.bounds.height,
    out.padding.bottom,
    out.padding.left,
    out.padding.right,
    out.padding.top,
    out.captureTransform.a,
    out.captureTransform.b,
    out.captureTransform.c,
    out.captureTransform.d,
    out.captureTransform.tx,
    out.captureTransform.ty,
    out.targetWidth,
    out.targetHeight,
  ];
}

function expectMatrixToBeCloseTo(actual: Readonly<MatrixLike>, expected: Readonly<MatrixLike>): void {
  expect(actual.a).toBeCloseTo(expected.a);
  expect(actual.b).toBeCloseTo(expected.b);
  expect(actual.c).toBeCloseTo(expected.c);
  expect(actual.d).toBeCloseTo(expected.d);
  expect(actual.tx).toBeCloseTo(expected.tx);
  expect(actual.ty).toBeCloseTo(expected.ty);
}

describe('computeRenderEffectCaptureGeometry', () => {
  it('returns false and preserves every output field for empty root-local bounds', () => {
    const state = createRenderState();
    const source = createCaptureNode(createRectangle(3, 4, 0, 9));
    const out = createOut();
    setRectangle(out.bounds, 10, 20, 30, 40);
    Object.assign(out.padding, { bottom: 1, left: 2, right: 3, top: 4 });
    Object.assign(out.captureTransform, { a: 5, b: 6, c: 7, d: 8, tx: 9, ty: 10 });
    out.targetWidth = 11;
    out.targetHeight = 12;
    const before = captureOutValues(out);

    expect(computeRenderEffectCaptureGeometry(out, state, source, [])).toBe(false);
    expect(captureOutValues(out)).toEqual(before);
  });

  it('writes asymmetric padding, target dimensions, and the matching Scene2D capture transform', () => {
    const state = createRenderState();
    const effect = allocateEntity<Node2D>();
    effect.kind = 'acme.Asymmetric';
    const source = createCaptureNode(createRectangle(-10, 6, 20.4, 11.2));
    source.x = 50;
    source.y = -30;
    source.rotation = 27;
    const out = createOut();

    expect(computeRenderEffectCaptureGeometry(out, state, source, effect)).toBe(true);
    expect(out.bounds).toMatchObject({ height: 11.2, width: 20.4, x: -10, y: 6 });
    expect(out.padding).toEqual({ bottom: 7, left: 2, right: 5, top: 3 });
    expect(out.targetWidth).toBe(28);
    expect(out.targetHeight).toBe(22);

    const expectedTransform = createMatrix();
    computeScene2DRenderTargetTransform(expectedTransform, source, out.bounds, 2, 3);
    expectMatrixToBeCloseTo(out.captureTransform, expectedTransform);
  });

  it('matches the existing bounds, padding, target-size, and capture-transform primitives', () => {
    const state = createRenderState();
    const first = allocateEntity<Node2D>();
    first.kind = 'acme.First';
    const second = allocateEntity<Node2D>();
    second.kind = 'acme.Second';
    registerRenderEffectPaddingResolver(state, first.kind, () => ({ bottom: 1, left: 2, right: 3, top: 4 }));
    registerRenderEffectPaddingResolver(state, second.kind, () => ({ bottom: 5, left: 6, right: 7, top: 8 }));
    const source = createCaptureNode(createRectangle(-2, -3, 10.25, 20.75));
    const child = createCaptureNode(createRectangle(0, 0, 4, 6));
    child.x = 30;
    child.y = 12;
    addNodeChild(source, child);
    const effects = [first, second];
    const out = createOut();

    expect(computeRenderEffectCaptureGeometry(out, state, source, effects)).toBe(true);

    const bounds = createRectangle();
    computeNodeRootLocalBoundsRectangle(bounds, source);
    const padding = computeRenderEffectPadding(state, effects);
    const targetSize = { height: 0, width: 0 };
    computeRenderTargetSize(targetSize, bounds, padding);
    const captureTransform = createMatrix();
    computeScene2DRenderTargetTransform(captureTransform, source, bounds, padding.left, padding.top);
    expect(out.bounds).toMatchObject(bounds);
    expect(out.padding).toEqual(padding);
    expectMatrixToBeCloseTo(out.captureTransform, captureTransform);
    expect(out.targetHeight).toBe(targetSize.height);
    expect(out.targetWidth).toBe(targetSize.width);
  });

  it('reuses the caller-owned bounds, padding, and transform objects across writes', () => {
    const state = createRenderState();
    const source = createCaptureNode(createRectangle(1, 2, 3, 4));
    const out = createOut();
    const bounds = out.bounds;
    const padding = out.padding;
    const captureTransform = out.captureTransform;

    expect(computeRenderEffectCaptureGeometry(out, state, source, [])).toBe(true);
    source.x = 17;
    expect(computeRenderEffectCaptureGeometry(out, state, source, [])).toBe(true);
    expect(out.bounds).toBe(bounds);
    expect(out.padding).toBe(padding);
    expect(out.captureTransform).toBe(captureTransform);
  });

  it('accepts a Node2D through NodeAny and refuses a non-2D node without mutation', () => {
    const state = createRenderState();
    const source: NodeAny = createCaptureNode(createRectangle(0, 0, 8, 9));
    const out = createOut();
    expect(computeRenderEffectCaptureGeometry(out, state, source, [])).toBe(true);

    const non2D: NodeAny = createNode('Non2D');
    const before = captureOutValues(out);
    expect(computeRenderEffectCaptureGeometry(out, state, non2D, [])).toBe(false);
    expect(captureOutValues(out)).toEqual(before);
  });
});
