import { createImageResource } from '@flighthq/image/contract';
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

import { applyAnimationClipToLottieDocument, createScene2DFromLottieDocument } from './lottieDocument';

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

describe('Lottie document conformance census', () => {
  it('rejects malformed JSON and structurally invalid documents', () => {
    for (const source of ['{', JSON.stringify({ fr: 0, layers: [] })]) {
      const diagnostics: ImportDiagnostic[] = [];
      const result = createScene2DFromLottieDocument(source, diagnostics);
      expect(getNodeChildCount(result.root)).toBe(0);
      expect(diagnostics.map((diagnostic) => diagnostic.kind)).toContain('lottie.invalid-document');
    }
  });

  it('imports the common layer families and resolves explicit images', () => {
    const image = createImageResource(globalThis.document.createElement('canvas'));
    image.width = 12;
    image.height = 8;
    const document = createDocument([
      shapeLayer(1, 'shape'),
      { ind: 2, ip: 0, nm: 'solid', op: 60, sc: '#ff0000', sh: 20, sw: 30, ty: 1 },
      { ind: 3, ip: 0, nm: 'image', op: 60, refId: 'imageAsset', ty: 2 },
      { ind: 4, ip: 0, nm: 'null', op: 60, ty: 3 },
      {
        ind: 5,
        ip: 0,
        nm: 'text',
        op: 60,
        t: { d: { k: [{ s: { fc: [0, 0, 1], s: 18, t: 'Hello' }, t: 0 }] } },
        ty: 5,
      },
      { ind: 6, ip: 0, nm: 'precomp', op: 60, refId: 'precompAsset', ty: 0 },
    ]);
    document.assets = [
      { h: 8, id: 'imageAsset', p: 'pixel.png', w: 12 },
      { id: 'precompAsset', layers: [shapeLayer(7, 'nested')] },
    ];

    const result = createScene2DFromLottieDocument(document, undefined, {
      resolveImageResource: () => image,
    });

    expect(findByName(result.root, 'shape')).not.toBeNull();
    expect(findFirstKind(findByName(result.root, 'shape')!, ShapeKind)).not.toBeNull();
    expect(findFirstKind(findByName(result.root, 'solid')!, ShapeKind)).not.toBeNull();
    expect(findFirstKind(findByName(result.root, 'image')!, SpriteKind)).not.toBeNull();
    expect(findByName(result.root, 'null')).not.toBeNull();
    expect(findFirstKind(findByName(result.root, 'text')!, TextLabelKind)).not.toBeNull();
    expect(findByName(result.root, 'nested')).not.toBeNull();
  });

  it('builds parent hierarchy and applies static transform and opacity values', () => {
    const parent: LottieLayer = {
      ind: 1,
      ip: 0,
      ks: {
        a: { k: [1, 2] },
        o: { k: 50 },
        p: { k: [10, 20] },
        r: { k: 90 },
        s: { k: [200, 300] },
      },
      nm: 'parent',
      op: 60,
      ty: 3,
    };
    const child: LottieLayer = { ind: 2, ip: 0, nm: 'child', op: 60, parent: 1, ty: 3 };
    const result = createScene2DFromLottieDocument(createDocument([parent, child]));
    const parentNode = findByName(result.root, 'parent')!;
    const childNode = findByName(result.root, 'child')!;

    expect(parentNode).toMatchObject({
      alpha: 0.5,
      pivotX: 1,
      pivotY: 2,
      rotation: Math.PI / 2,
      scaleX: 2,
      scaleY: 3,
      x: 10,
      y: 20,
    });
    expect(getNodeChildAt(parentNode, 0)).toBe(childNode);
  });

  it('maps uniform vector easing to one channel and component-specific easing to scalar channels', () => {
    const uniform = animatedVector([0, 0], [10, 20], [0.42], [0], [1], [1]);
    const split = animatedVector([0, 0], [10, 20], [0.42, 0], [0, 0], [1, 1], [1, 1]);
    const result = createScene2DFromLottieDocument(
      createDocument([
        { ind: 1, ip: 0, ks: { p: uniform }, nm: 'uniform', op: 60, ty: 3 },
        { ind: 2, ip: 0, ks: { p: split }, nm: 'split', op: 60, ty: 3 },
      ]),
    );
    const positionPaths = result.clip.channels
      .map((channel) => (channel.targetRef as { path?: string }).path)
      .filter((path) => path === 'Position' || path === 'X' || path === 'Y');

    expect(positionPaths).toEqual(expect.arrayContaining(['Position', 'X', 'Y']));
    applyAnimationClipToLottieDocument(result.clip, 0.5);
    expect(findByName(result.root, 'uniform')!.x).toBeLessThan(5);
    expect(findByName(result.root, 'split')!.x).toBeLessThan(5);
    expect(findByName(result.root, 'split')!.y).toBeCloseTo(10);
  });

  it('imports JSON strings, separated position, hold segments, and layer in/out visibility', () => {
    const document = createDocument([
      {
        ind: 1,
        ip: 15,
        ks: {
          p: {
            s: true,
            x: {
              a: 1,
              k: [
                { h: 1, s: 0, t: 0 },
                { s: 20, t: 30 },
              ],
            },
            y: animatedScalar(0, 10),
          },
        },
        nm: 'timed',
        op: 45,
        ty: 3,
      },
    ]);
    const result = createScene2DFromLottieDocument(JSON.stringify(document));
    const node = findByName(result.root, 'timed')!;

    applyAnimationClipToLottieDocument(result.clip, 0.25);
    expect(node.visible).toBe(false);
    expect(node.x).toBe(0);
    applyAnimationClipToLottieDocument(result.clip, 0.75);
    expect(node.visible).toBe(true);
    expect(node.x).toBe(0);
    expect(node.y).toBeCloseTo(7.5);
  });

  it('imports bezier, rectangle, ellipse, and polystar geometry with fill, stroke, and gradient paint', () => {
    const items = [
      { ks: { k: squarePath(0, 0, 10) }, ty: 'sh' },
      { p: { k: [20, 20] }, r: { k: 0 }, s: { k: [10, 12] }, ty: 'rc' },
      { p: { k: [40, 20] }, s: { k: [10, 12] }, ty: 'el' },
      { ir: { k: 4 }, or: { k: 8 }, os: { k: 0 }, p: { k: [60, 20] }, pt: { k: 5 }, r: { k: 0 }, sy: 1, ty: 'sr' },
      { c: { k: [1, 0, 0] }, o: { k: 80 }, r: 1, ty: 'fl' },
      { c: { k: [0, 0, 1] }, o: { k: 100 }, ty: 'st', w: { k: 2 } },
    ] as LottieLayer['shapes'];
    const gradientItems = [
      { p: { k: [0, 0] }, r: { k: 0 }, s: { k: [20, 20] }, ty: 'rc' },
      {
        e: { k: [20, 0] },
        g: { k: { k: [0, 1, 0, 0, 1, 0, 0, 1] }, p: 2 },
        o: { k: 100 },
        s: { k: [0, 0] },
        t: 1,
        ty: 'gf',
      },
    ] as LottieLayer['shapes'];
    const result = createScene2DFromLottieDocument(
      createDocument([
        { ind: 1, ip: 0, nm: 'paint', op: 60, shapes: items, ty: 4 },
        { ind: 2, ip: 0, nm: 'gradient', op: 60, shapes: gradientItems, ty: 4 },
      ]),
    );
    const paint = findFirstKind(findByName(result.root, 'paint')!, ShapeKind) as Shape;
    const gradient = findFirstKind(findByName(result.root, 'gradient')!, ShapeKind) as Shape;

    expect(paint.data.commands.filter((command) => command === 'drawPath')).toHaveLength(4);
    expect(paint.data.commands).toContain('beginFill');
    expect(paint.data.commands).toContain('lineStyle');
    expect(gradient.data.commands).toContain('beginGradientFill');
  });

  it('updates animated path, fill, stroke, gradient, and hard-mask content through the format binder', () => {
    const animatedPath = {
      a: 1 as const,
      k: [
        { s: squarePath(0, 0, 10), t: 0 },
        { s: squarePath(20, 0, 10), t: 30 },
      ],
    };
    const animatedColor = {
      a: 1 as const,
      k: [
        { s: [1, 0, 0], t: 0 },
        { s: [0, 0, 1], t: 30 },
      ],
    };
    const layer: LottieLayer = {
      ind: 1,
      ip: 0,
      masksProperties: [{ mode: 'a', o: { k: 100 }, pt: animatedPath }],
      nm: 'animated-paint',
      op: 60,
      shapes: [
        { ks: animatedPath, ty: 'sh' },
        { c: animatedColor, o: { k: 100 }, ty: 'fl' },
        { c: animatedColor, o: { k: 100 }, ty: 'st', w: animatedScalar(1, 5) },
      ],
      ty: 4,
    };
    const gradientLayer: LottieLayer = {
      ind: 2,
      ip: 0,
      nm: 'animated-gradient',
      op: 60,
      shapes: [
        { p: { k: [10, 10] }, r: { k: 0 }, s: { k: [20, 20] }, ty: 'rc' },
        {
          e: { k: [20, 0] },
          g: {
            k: {
              a: 1,
              k: [
                { s: [0, 1, 0, 0, 1, 0, 0, 1], t: 0 },
                { s: [0, 0, 1, 0, 1, 1, 1, 0], t: 30 },
              ],
            },
            p: 2,
          },
          o: { k: 100 },
          s: { k: [0, 0] },
          t: 1,
          ty: 'gf',
        },
      ],
      ty: 4,
    };
    const result = createScene2DFromLottieDocument(createDocument([layer, gradientLayer]));
    const node = findByName(result.root, 'animated-paint')!;
    const shape = findFirstKind(node, ShapeKind) as Shape;
    const gradientShape = findFirstKind(findByName(result.root, 'animated-gradient')!, ShapeKind) as Shape;
    const before = JSON.stringify(shape.data.commands);
    const gradientBefore = JSON.stringify(gradientShape.data.commands);

    applyAnimationClipToLottieDocument(result.clip, 0.5);

    expect(JSON.stringify(shape.data.commands)).not.toBe(before);
    expect(JSON.stringify(gradientShape.data.commands)).not.toBe(gradientBefore);
    expect(node.clip?.rect.x).toBeCloseTo(10);
  });

  it('folds precomposition start/stretch into root time and emits markers as clip events', () => {
    const child: LottieLayer = {
      ind: 2,
      ip: 0,
      ks: { p: animatedVector([0, 0], [20, 0]) },
      nm: 'timed-child',
      op: 30,
      ty: 3,
    };
    const document = createDocument([{ ind: 1, ip: 0, nm: 'precomp', op: 60, refId: 'pc', sr: 2, st: 10, ty: 0 }]);
    document.assets = [{ id: 'pc', layers: [child] }];
    document.markers = [{ cm: 'beat', dr: 5, tm: 15 }];
    const result = createScene2DFromLottieDocument(document);
    const position = result.clip.channels.find(
      (channel) => (channel.targetRef as { path?: string }).path === 'Position',
    )!;

    expect(Array.from(position.track.times)[0]).toBeCloseTo(1 / 3);
    expect(Array.from(position.track.times)[1]).toBeCloseTo(7 / 3);
    expect(result.clip.events[0]).toMatchObject({ name: 'beat', time: 0.5 });
    applyAnimationClipToLottieDocument(result.clip, 4 / 3);
    expect(findByName(result.root, 'timed-child')!.x).toBeCloseTo(10);
  });

  it('applies static trim paths and diagnoses the predeclared exotic set', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const layer = shapeLayer(1, 'trimmed');
    layer.ddd = 1;
    layer.bm = 7;
    layer.ef = [{ nm: 'blur' }];
    layer.tm = animatedScalar(0, 1);
    layer.tt = 1;
    layer.shapes!.push({ e: { k: 50 }, m: 1, o: { k: 0 }, s: { k: 0 }, ty: 'tm' });
    layer.ks = { p: { k: [0, 0], x: 'wiggle(1, 2)' } };
    const result = createScene2DFromLottieDocument(createDocument([layer]), diagnostics);
    const kinds = diagnostics.map((diagnostic) => diagnostic.kind);
    const shape = findFirstKind(result.root, ShapeKind) as Shape;

    expect(kinds).toEqual(
      expect.arrayContaining([
        'lottie.unsupported-3d-layer',
        'lottie.unsupported-blend-mode',
        'lottie.unsupported-effect',
        'lottie.unsupported-expression',
        'lottie.unsupported-matte',
        'lottie.unsupported-time-remap',
      ]),
    );
    expect(shape.data.commands).toContain('drawPath');
  });

  it('diagnoses unresolved assets, soft/composed masks, and unsupported media layers', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const masked = shapeLayer(1, 'masked');
    masked.masksProperties = [
      { f: { k: [2, 2] }, mode: 'a', o: { k: 100 }, pt: { k: squarePath(0, 0, 10) } },
      { mode: 's', o: { k: 100 }, pt: { k: squarePath(2, 2, 4) } },
    ];
    createScene2DFromLottieDocument(
      createDocument([
        masked,
        { ind: 2, ip: 0, nm: 'missing', op: 60, refId: 'absent', ty: 2 },
        { ind: 3, ip: 0, nm: 'audio', op: 60, ty: 6 },
        { ind: 4, ip: 0, nm: 'camera', op: 60, ty: 13 },
      ]),
      diagnostics,
    );

    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toEqual(
      expect.arrayContaining([
        'lottie.unresolved-asset',
        'lottie.unsupported-audio-layer',
        'lottie.unsupported-camera-layer',
        'lottie.unsupported-mask-composition',
      ]),
    );
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
