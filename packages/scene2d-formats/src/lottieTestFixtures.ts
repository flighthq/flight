import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import type { LottieDocument, LottieLayer, LottieShapePath, Node2D } from '@flighthq/types/contract';

export function animatedLottieTestScalar(start: number, end: number) {
  return {
    a: 1 as const,
    k: [
      { s: start, t: 0 },
      { s: end, t: 30 },
    ],
  };
}

export function animatedLottieTestVector(
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

/**
 * The Lottie document fixtures every per-feature test builds on.
 *
 * ★ SHARED BECAUSE THE TESTS SPLIT UP, NOT BECAUSE THEY WERE ALWAYS SHARED. These builders lived at the bottom of one
 * 1,300-line test file that covered every layer and shape item. Now that each feature has its own test beside its own
 * module, the builders have many owners — and a copy per test file is how two fixtures drift apart and make a real
 * disagreement look like a parser bug.
 */
export function createLottieTestDocument(layers: LottieLayer[]): LottieDocument {
  return { fr: 30, h: 100, ip: 0, layers, op: 60, w: 100 };
}

export function findLottieTestNodeByKind(root: Node2D, kind: string): Node2D | null {
  if (root.kind === kind) return root;
  for (let index = 0; index < getNodeChildCount(root); index++) {
    const found = findLottieTestNodeByKind(getNodeChildAt(root, index) as Node2D, kind);
    if (found !== null) return found;
  }
  return null;
}

export function findLottieTestNodeByName(root: Node2D, name: string): Node2D | null {
  if (root.name === name) return root;
  for (let index = 0; index < getNodeChildCount(root); index++) {
    const found = findLottieTestNodeByName(getNodeChildAt(root, index) as Node2D, name);
    if (found !== null) return found;
  }
  return null;
}

export function lottieTestShapeLayer(ind: number, name: string): LottieLayer {
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

export function lottieTestSquarePath(x: number, y: number, size: number): LottieShapePath {
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
