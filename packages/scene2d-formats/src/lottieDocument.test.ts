import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import type {
  Node2D,
  ImportDiagnostic,
  LottieDocument,
  LottieLayer,
  LottieShapePath,
  Shape,
} from '@flighthq/types/contract';
import { SpriteKind, ShapeKind, TextLabelKind } from '@flighthq/types/contract';

import {
  applyAnimationClipToLottieDocument,
  createScene2DFromLottieDocument,
  initializeLottieDocumentImportResult,
} from './lottieDocument';
import { createReadyImageResourceForTest } from './testHelper';

describe('applyAnimationClipToLottieDocument', () => {
  it('applies the imported target-bound clip', () => {
    const result = createScene2DFromLottieDocument(
      createDocument([{ ind: 1, ip: 0, ks: { p: animatedVector([0, 0], [10, 20]) }, nm: 'node', op: 60, ty: 3 }]),
    );
    applyAnimationClipToLottieDocument(result.clip, 0.5);
    expect(findByName(result.root, 'node')).toMatchObject({ x: 5, y: 10 });
  });
});

describe('createScene2DFromLottieDocument', () => {
  it('returns the display subtree and target-bound clip', () => {
    const result = createScene2DFromLottieDocument(createDocument([shapeLayer(1, 'shape')]));
    expect(findByName(result.root, 'shape')).not.toBeNull();
    expect(result.clip.duration).toBe(2);
  });
});

function createDocument(layers: LottieLayer[]): LottieDocument {
  return { fr: 30, h: 100, ip: 0, layers, op: 60, w: 100 };
}

function shapeLayer(ind: number, name: string): LottieLayer {
  return {
    ind,
    ip: 0,
    nm: name,
    op: 60,
    shapes: [
      { p: { k: [5, 5] }, r: { k: 0 }, s: { k: [10, 10] }, ty: 'rc' },
      { c: { k: [1, 0, 0] }, o: { k: 100 }, ty: 'fl' },
    ],
    ty: 4,
  };
}

function animatedVector(
  start: number[],
  end: number[],
  ox: number[] = [0.333],
  oy: number[] = [0],
  ix: number[] = [0.667],
  iy: number[] = [1],
) {
  return {
    a: 1 as const,
    k: [
      { o: { x: ox, y: oy }, s: start, t: 0 },
      { i: { x: ix, y: iy }, s: end, t: 30 },
    ],
  };
}

function animatedScalar(start: number, end: number) {
  return {
    a: 1 as const,
    k: [
      { s: start, t: 0 },
      { s: end, t: 30 },
    ],
  };
}

function squarePath(x: number, y: number, size: number): LottieShapePath {
  return {
    c: true,
    i: [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    o: [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    v: [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
    ],
  };
}

function findByName(root: Node2D, name: string): Node2D | null {
  if (root.name === name) return root;
  for (let index = 0; index < getNodeChildCount(root); index++) {
    const found = findByName(getNodeChildAt(root, index) as Node2D, name);
    if (found !== null) return found;
  }
  return null;
}

function findFirstKind(root: Node2D, kind: string): Node2D | null {
  if (root.kind === kind) return root;
  for (let index = 0; index < getNodeChildCount(root); index++) {
    const found = findFirstKind(getNodeChildAt(root, index) as Node2D, kind);
    if (found !== null) return found;
  }
  return null;
}
describe('initializeLottieDocumentImportResult', () => {
  it('is the construction initializer of createLottieDocumentImportResult', () => {
    expect(typeof initializeLottieDocumentImportResult).toBe('function');
  });
});
