import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import type { LottieDocument, LottieLayer, LottieShapePath, Node2D } from '@flighthq/types/contract';
import { SpriteKind, ShapeKind, TextLabelKind } from '@flighthq/types/contract';

import {
  applyAnimationClipToLottieDocument,
  createScene2DFromLottieDocument,
  initializeLottieDocumentImportResult,
} from './lottieDocument.ts';
import { registerAllLottieHandlers } from './lottieHandlers.ts';
import { createLottieRegistry } from './lottieRegistry.ts';
import { createReadyImageResourceForTest } from './testHelper.ts';

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

  it('produces identical output with registry-populated handlers and zero-config defaults', () => {
    const doc = createDocument([
      shapeLayer(1, 'shape'),
      { ind: 2, ip: 0, nm: 'null', op: 60, ty: 3 },
      { ind: 3, ip: 0, nm: 'solid', op: 60, sc: '#ff0000', sh: 50, sw: 50, ty: 1 },
    ]);
    const defaultResult = createScene2DFromLottieDocument(doc);
    const registry = createLottieRegistry();
    registerAllLottieHandlers(registry);
    const registryResult = createScene2DFromLottieDocument(doc, undefined, {
      layerHandlers: registry.layerHandlers,
      shapeItemHandlers: registry.shapeItemHandlers,
    });
    expect(JSON.parse(JSON.stringify(registryResult))).toEqual(JSON.parse(JSON.stringify(defaultResult)));
  });

  it('produces empty layer containers when no handlers are registered', () => {
    const doc = createDocument([shapeLayer(1, 'shape')]);
    const defaultResult = createScene2DFromLottieDocument(doc);
    const emptyResult = createScene2DFromLottieDocument(doc, undefined, {
      layerHandlers: [],
      shapeItemHandlers: [],
    });
    expect(getNodeChildCount(emptyResult.root)).toBe(1);
    expect(getNodeChildCount(getNodeChildAt(emptyResult.root, 0)!)).toBe(0);
    expect(getNodeChildCount(getNodeChildAt(defaultResult.root, 0)!)).toBeGreaterThan(0);
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

describe('lottieEllipseShapeItemReader', () => {
  it('is exercised through createScene2DFromLottieDocument shape layer dispatch', () => {
    const result = createScene2DFromLottieDocument(
      createDocument([
        {
          ind: 1,
          ip: 0,
          nm: 'ellipse',
          op: 60,
          shapes: [
            { p: { k: [10, 10] }, s: { k: [20, 20] }, ty: 'el' },
            { c: { k: [1, 0, 0] }, o: { k: 100 }, ty: 'fl' },
          ],
          ty: 4,
        },
      ]),
    );
    const shape = findFirstKind(result.root, ShapeKind);
    expect(shape).not.toBeNull();
  });
});

describe('lottieFillShapeItemReader', () => {
  it('creates a fill paint from a fl shape item', () => {
    const result = createScene2DFromLottieDocument(createDocument([shapeLayer(1, 'fill')]));
    expect(findFirstKind(result.root, ShapeKind)).not.toBeNull();
  });
});

describe('lottieGradientFillShapeItemReader', () => {
  it('creates a gradient fill paint', () => {
    const result = createScene2DFromLottieDocument(
      createDocument([
        {
          ind: 1,
          ip: 0,
          nm: 'gfill',
          op: 60,
          shapes: [
            { p: { k: [10, 10] }, r: { k: 0 }, s: { k: [20, 20] }, ty: 'rc' },
            {
              e: { k: [100, 0] },
              g: { k: { k: [0, 1, 0, 0, 1, 0, 0, 1] }, p: 2 },
              s: { k: [0, 0] },
              t: 1,
              ty: 'gf',
            },
          ],
          ty: 4,
        },
      ]),
    );
    expect(findFirstKind(result.root, ShapeKind)).not.toBeNull();
  });
});

describe('lottieGradientStrokeShapeItemReader', () => {
  it('creates a gradient stroke paint', () => {
    const result = createScene2DFromLottieDocument(
      createDocument([
        {
          ind: 1,
          ip: 0,
          nm: 'gstroke',
          op: 60,
          shapes: [
            { p: { k: [10, 10] }, r: { k: 0 }, s: { k: [20, 20] }, ty: 'rc' },
            {
              e: { k: [100, 0] },
              g: { k: { k: [0, 1, 0, 0, 1, 0, 0, 1] }, p: 2 },
              o: { k: 100 },
              s: { k: [0, 0] },
              t: 1,
              ty: 'gs',
              w: { k: 2 },
            },
          ],
          ty: 4,
        },
      ]),
    );
    expect(findFirstKind(result.root, ShapeKind)).not.toBeNull();
  });
});

describe('lottieImageLayerReader', () => {
  it('creates a sprite for an image layer', () => {
    const image = createReadyImageResourceForTest();
    const result = createScene2DFromLottieDocument(
      {
        assets: [{ h: 10, id: 'img_0', p: 'test.png', u: '', w: 10 }],
        fr: 30,
        h: 100,
        ip: 0,
        layers: [{ ind: 1, ip: 0, nm: 'img', op: 60, refId: 'img_0', ty: 2 }],
        op: 60,
        w: 100,
      },
      undefined,
      { resolveImageResource: () => image },
    );
    expect(findFirstKind(result.root, SpriteKind)).not.toBeNull();
  });
});

describe('lottieNullLayerReader', () => {
  it('produces an empty container', () => {
    const result = createScene2DFromLottieDocument(createDocument([{ ind: 1, ip: 0, nm: 'null', op: 60, ty: 3 }]));
    expect(findByName(result.root, 'null')).not.toBeNull();
  });
});

describe('lottiePathShapeItemReader', () => {
  it('creates a path from a sh shape item', () => {
    const result = createScene2DFromLottieDocument(
      createDocument([
        {
          ind: 1,
          ip: 0,
          nm: 'path',
          op: 60,
          shapes: [
            { ks: { k: squarePath(0, 0, 10) }, ty: 'sh' },
            { c: { k: [1, 0, 0] }, o: { k: 100 }, ty: 'fl' },
          ],
          ty: 4,
        },
      ]),
    );
    expect(findFirstKind(result.root, ShapeKind)).not.toBeNull();
  });
});

describe('lottiePolystarShapeItemReader', () => {
  it('creates a polystar path', () => {
    const result = createScene2DFromLottieDocument(
      createDocument([
        {
          ind: 1,
          ip: 0,
          nm: 'star',
          op: 60,
          shapes: [
            { or: { k: 50 }, p: { k: [50, 50] }, pt: { k: 5 }, r: { k: 0 }, sy: 1, ir: { k: 25 }, ty: 'sr' },
            { c: { k: [1, 0, 0] }, o: { k: 100 }, ty: 'fl' },
          ],
          ty: 4,
        },
      ]),
    );
    expect(findFirstKind(result.root, ShapeKind)).not.toBeNull();
  });
});

describe('lottiePrecompositionLayerReader', () => {
  it('resolves a precomposition asset', () => {
    const result = createScene2DFromLottieDocument({
      assets: [{ id: 'comp_0', layers: [{ ind: 1, ip: 0, nm: 'inner', op: 60, ty: 3 }] }],
      fr: 30,
      h: 100,
      ip: 0,
      layers: [{ ind: 1, ip: 0, nm: 'precomp', op: 60, refId: 'comp_0', ty: 0 }],
      op: 60,
      w: 100,
    });
    expect(findByName(result.root, 'inner')).not.toBeNull();
  });
});

describe('lottieRectangleShapeItemReader', () => {
  it('creates a rectangle path', () => {
    const result = createScene2DFromLottieDocument(createDocument([shapeLayer(1, 'rect')]));
    expect(findFirstKind(result.root, ShapeKind)).not.toBeNull();
  });
});

describe('lottieShapeLayerReader', () => {
  it('creates shape items from a shape layer', () => {
    const result = createScene2DFromLottieDocument(createDocument([shapeLayer(1, 'shapes')]));
    expect(findFirstKind(result.root, ShapeKind)).not.toBeNull();
  });
});

describe('lottieSolidLayerReader', () => {
  it('creates a solid color shape', () => {
    const result = createScene2DFromLottieDocument(
      createDocument([{ ind: 1, ip: 0, nm: 'solid', op: 60, sc: '#ff0000', sh: 50, sw: 50, ty: 1 }]),
    );
    expect(findFirstKind(result.root, ShapeKind)).not.toBeNull();
  });
});

describe('lottieStrokeShapeItemReader', () => {
  it('creates a stroke paint from a st shape item', () => {
    const result = createScene2DFromLottieDocument(
      createDocument([
        {
          ind: 1,
          ip: 0,
          nm: 'stroke',
          op: 60,
          shapes: [
            { p: { k: [10, 10] }, r: { k: 0 }, s: { k: [20, 20] }, ty: 'rc' },
            { c: { k: [0, 0, 1] }, o: { k: 100 }, ty: 'st', w: { k: 2 } },
          ],
          ty: 4,
        },
      ]),
    );
    expect(findFirstKind(result.root, ShapeKind)).not.toBeNull();
  });
});

describe('lottieTextLayerReader', () => {
  it('creates a text label', () => {
    const result = createScene2DFromLottieDocument(
      createDocument([
        {
          ind: 1,
          ip: 0,
          nm: 'text',
          op: 60,
          t: { d: { k: [{ s: { f: 'Arial', fc: [0, 0, 0], s: 12, t: 'Hello' }, t: 0 }] } },
          ty: 5,
        },
      ]),
    );
    expect(findFirstKind(result.root, TextLabelKind)).not.toBeNull();
  });
});

describe('lottieTrimPathShapeItemReader', () => {
  it('applies static trim to paths', () => {
    const result = createScene2DFromLottieDocument(
      createDocument([
        {
          ind: 1,
          ip: 0,
          nm: 'trim',
          op: 60,
          shapes: [
            { ks: { k: squarePath(0, 0, 10) }, ty: 'sh' },
            { c: { k: [1, 0, 0] }, o: { k: 100 }, ty: 'fl' },
            { e: { k: 50 }, o: { k: 0 }, s: { k: 0 }, ty: 'tm' },
          ],
          ty: 4,
        },
      ]),
    );
    expect(findFirstKind(result.root, ShapeKind)).not.toBeNull();
  });
});
