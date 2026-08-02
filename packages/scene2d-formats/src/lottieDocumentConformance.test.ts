import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import type {
  Node2D,
  ImportDiagnostic,
  LottieDocument,
  LottieLayer,
  LottieShapePath,
  Shape,
} from '@flighthq/types/contract';
import { PathCommand, SpriteKind, ShapeKind, TextLabelKind } from '@flighthq/types/contract';

import { applyAnimationClipToLottieDocument, createScene2DFromLottieDocument } from './lottieDocument';
import { createReadyImageResourceForTest } from './testHelper';

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
    const image = createReadyImageResourceForTest(12, 8);
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

    // 3D layers, effect layers, mattes, and time remapping are uncarried coverage gaps, so they are
    // project facts recorded in agents/scene2d-format-coverage.md and must NOT crumb. The blend mode
    // and the expression stay: each is contingent on an author choice with a next action.
    expect(kinds).toEqual(expect.arrayContaining(['lottie.unsupported-blend-mode', 'lottie.unsupported-expression']));
    expect(kinds).not.toContain('lottie.unsupported-3d-layer');
    expect(kinds).not.toContain('lottie.unsupported-effect');
    expect(kinds).not.toContain('lottie.unsupported-matte');
    expect(kinds).not.toContain('lottie.unsupported-time-remap');
    expect(shape.data.commands).toContain('drawPath');
  });

  it('crumbs an unresolved asset while staying silent about uncarried layer kinds and masks', () => {
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

    // A dangling refId is an asset fact the caller can act on. Audio/camera layers and composed or
    // feathered masks are coverage gaps that would fire on every idiomatic export carrying them, so
    // the only crumb here is the unresolved asset.
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toEqual(['lottie.unresolved-asset']);
  });
});

// The format's own relation, not a table of numbers this parser produced: Bodymovin's temporal Bezier
// handles shape the curve BETWEEN keyframes, so at a keyframe's own time the property equals that
// keyframe's stated value exactly, whatever the easing. Frame f maps to (f - ip) / fr seconds. Every
// expectation below is read back out of the fixture's keyframe array, so the assertion cannot echo an
// assumption the importer made about interpolation.
describe('Lottie keyframe time/value fidelity', () => {
  const FRAME_RATE = 30;
  const IN_POINT = 0;

  const CASES = [
    {
      keyframes: [
        { s: [0, 0], t: 0 },
        { o: { x: [0.9], y: [0] }, i: { x: [0.1], y: [1] }, s: [40, 80], t: 20 },
        { o: { x: [0.2], y: [0] }, i: { x: [0.8], y: [1] }, s: [-15, 5], t: 45 },
      ],
      name: 'position with strong asymmetric easing',
      property: 'p',
      read: (node: Node2D) => [node.x, node.y],
      convert: (value: number[]) => value,
    },
    {
      keyframes: [
        { s: [0, 0], t: 0 },
        { o: { x: [0.6, 0.1], y: [0, 0] }, i: { x: [0.4, 0.9], y: [1, 1] }, s: [30, 60], t: 25 },
      ],
      name: 'position with component-specific easing',
      property: 'p',
      read: (node: Node2D) => [node.x, node.y],
      convert: (value: number[]) => value,
    },
    {
      keyframes: [
        { h: 1, s: [5, 5], t: 0 },
        { s: [50, 25], t: 18 },
        { h: 1, s: [7, 90], t: 36 },
      ],
      name: 'position across hold segments',
      property: 'p',
      read: (node: Node2D) => [node.x, node.y],
      convert: (value: number[]) => value,
    },
    {
      keyframes: [
        { s: [100, 100], t: 0 },
        { o: { x: [0.75], y: [0] }, i: { x: [0.25], y: [1] }, s: [250, 40], t: 30 },
      ],
      name: 'scale, which the format states in percent',
      property: 's',
      read: (node: Node2D) => [node.scaleX, node.scaleY],
      convert: (value: number[]) => value.map((component) => component / 100),
    },
  ] as const;

  it.each(CASES)('reproduces every stated keyframe value for $name', ({ keyframes, property, read, convert }) => {
    const result = createScene2DFromLottieDocument(
      createDocument([
        { ind: 1, ip: 0, ks: { [property]: { a: 1, k: keyframes } }, nm: 'sampled', op: 60, ty: 3 },
      ] as LottieLayer[]),
    );
    const node = findByName(result.root, 'sampled')!;

    for (const keyframe of keyframes) {
      applyAnimationClipToLottieDocument(result.clip, (keyframe.t - IN_POINT) / FRAME_RATE);
      const expected = convert([...keyframe.s]);
      read(node).forEach((actual, component) => expect(actual).toBeCloseTo(expected[component], 5));
    }
  });

  it('reproduces stated values for scalar rotation and opacity, in the units the format declares', () => {
    const rotationKeys = [
      { s: 0, t: 0 },
      { o: { x: [0.8], y: [0] }, i: { x: [0.2], y: [1] }, s: 270, t: 24 },
    ];
    const opacityKeys = [
      { s: 100, t: 0 },
      { o: { x: [0.3], y: [0] }, i: { x: [0.7], y: [1] }, s: 20, t: 24 },
    ];
    const result = createScene2DFromLottieDocument(
      createDocument([
        {
          ind: 1,
          ip: 0,
          ks: { o: { a: 1, k: opacityKeys }, r: { a: 1, k: rotationKeys } },
          nm: 'sampled',
          op: 60,
          ty: 3,
        },
      ] as LottieLayer[]),
    );
    const node = findByName(result.root, 'sampled')!;

    for (const keyframe of rotationKeys) {
      applyAnimationClipToLottieDocument(result.clip, (keyframe.t - IN_POINT) / FRAME_RATE);
      expect(node.rotation).toBeCloseTo((keyframe.s * Math.PI) / 180, 5);
    }
    for (const keyframe of opacityKeys) {
      applyAnimationClipToLottieDocument(result.clip, (keyframe.t - IN_POINT) / FRAME_RATE);
      expect(node.alpha).toBeCloseTo(keyframe.s / 100, 5);
    }
  });

  it('holds a hold-segment value for the whole segment, not merely at its endpoints', () => {
    const keyframes = [
      { h: 1, s: [11, 22], t: 0 },
      { s: [99, 88], t: 30 },
    ];
    const result = createScene2DFromLottieDocument(
      createDocument([
        { ind: 1, ip: 0, ks: { p: { a: 1, k: keyframes } }, nm: 'held', op: 60, ty: 3 },
      ] as LottieLayer[]),
    );
    const node = findByName(result.root, 'held')!;

    // A hold keyframe steps: every time strictly inside the segment still reads the segment's start.
    for (const frame of [1, 7, 15, 29]) {
      applyAnimationClipToLottieDocument(result.clip, (frame - IN_POINT) / FRAME_RATE);
      expect(node.x).toBeCloseTo(11, 5);
      expect(node.y).toBeCloseTo(22, 5);
    }
  });
});

// Roundness is pinned by a relation the format states rather than by a curve this parser chose: a
// polygon at 100% outer roundness IS the circumscribed circle. Sampling the emitted curve and
// measuring its distance from the center tests that relation directly, so the assertion cannot echo
// the handle-length formula the builder used.
describe('Lottie polystar roundness', () => {
  const CENTER = [30, 40];
  const RADIUS = 12;
  const CIRCLE_AREA_TOLERANCE = 0.5;

  it('emits a circle of the outer radius when a polygon is fully round', () => {
    const shape = importPolystar({ os: { k: 100 }, sy: 2 });
    const distances = sampleShapeOutline(shape).map((point) => Math.hypot(point[0] - CENTER[0], point[1] - CENTER[1]));

    expect(distances.length).toBeGreaterThan(20);
    for (const distance of distances) expect(distance).toBeCloseTo(RADIUS, 1);
  });

  it('keeps every vertex on its radius and bows the edges outward as roundness rises', () => {
    const sharpArea = shapeOutlineArea(importPolystar({ os: { k: 0 }, sy: 2 }));
    const halfArea = shapeOutlineArea(importPolystar({ os: { k: 50 }, sy: 2 }));
    const roundArea = shapeOutlineArea(importPolystar({ os: { k: 100 }, sy: 2 }));

    // The inscribed polygon is the smallest, the circumscribed circle the largest, and roundness
    // interpolates between them monotonically.
    expect(sharpArea).toBeLessThan(halfArea);
    expect(halfArea).toBeLessThan(roundArea);
    // The sampler flattens each cubic into CURVE_SAMPLES chords, so the measured area is that of an
    // inscribed polygon and sits just under the true circle.
    expect(Math.PI * RADIUS * RADIUS - roundArea).toBeLessThan(CIRCLE_AREA_TOLERANCE);
  });

  it('never moves a star vertex off its stated radius, whatever the roundness', () => {
    const INNER = 5;
    for (const overrides of [
      { ir: { k: INNER }, is: { k: 0 }, os: { k: 0 }, sy: 1 },
      { ir: { k: INNER }, is: { k: 100 }, os: { k: 0 }, sy: 1 },
      { ir: { k: INNER }, is: { k: 40 }, os: { k: 90 }, sy: 1 },
    ]) {
      // Roundness bows the edges; the anchors themselves must stay exactly on the authored radii, so
      // every on-curve point is at either the outer or the inner radius.
      for (const anchor of pathAnchorsOf(importPolystar(overrides))) {
        const distance = Math.hypot(anchor[0] - CENTER[0], anchor[1] - CENTER[1]);
        expect(Math.min(Math.abs(distance - RADIUS), Math.abs(distance - INNER))).toBeCloseTo(0, 6);
      }
    }
  });

  it('changes a star outline when inner roundness changes', () => {
    const sharp = importPolystar({ ir: { k: 5 }, is: { k: 0 }, os: { k: 0 }, sy: 1 });
    const rounded = importPolystar({ ir: { k: 5 }, is: { k: 100 }, os: { k: 0 }, sy: 1 });

    expect(JSON.stringify(rounded.data.commands)).not.toBe(JSON.stringify(sharp.data.commands));
  });

  it('emits straight edges when roundness is absent or zero', () => {
    const absent = importPolystar({ sy: 2 });
    const zero = importPolystar({ os: { k: 0 }, sy: 2 });

    expect(pathVerbsOf(absent)).not.toContain(PathCommand.CUBIC_CURVE_TO);
    expect(JSON.stringify(zero.data.commands)).toBe(JSON.stringify(absent.data.commands));
  });

  function importPolystar(overrides: Record<string, unknown>): Shape {
    const result = createScene2DFromLottieDocument(
      createDocument([
        {
          ind: 1,
          ip: 0,
          nm: 'star',
          op: 60,
          shapes: [
            { or: { k: RADIUS }, p: { k: CENTER }, pt: { k: 6 }, r: { k: 0 }, ty: 'sr', ...overrides },
            { c: { k: [1, 0, 0] }, o: { k: 100 }, ty: 'fl' },
          ],
          ty: 4,
        },
      ] as unknown as LottieLayer[]),
    );
    return findFirstKind(result.root, ShapeKind) as Shape;
  }
});

// A shape stores 'drawPath' followed by its arity, the nested path verb stream, and the path data
// stream. Flattening the cubics here means the outline assertions read the curve Flight will actually
// draw rather than the control points that describe it.
const CURVE_SAMPLES = 32;

function sampleShapeOutline(shape: Shape): number[][] {
  const points: number[][] = [];
  const tokens = shape.data.commands as unknown[];
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index] !== 'drawPath') continue;
    const verbs = tokens[index + 2] as number[];
    const data = tokens[index + 3] as number[];
    let cursor = 0;
    let current: number[] = [0, 0];
    for (const verb of verbs) {
      if (verb === PathCommand.MOVE_TO || verb === PathCommand.LINE_TO) {
        current = [data[cursor], data[cursor + 1]];
        points.push(current);
        cursor += 2;
      } else if (verb === PathCommand.CUBIC_CURVE_TO) {
        const [c1x, c1y, c2x, c2y, x, y] = data.slice(cursor, cursor + 6);
        for (let step = 1; step <= CURVE_SAMPLES; step++) {
          const t = step / CURVE_SAMPLES;
          const inverse = 1 - t;
          points.push([
            inverse ** 3 * current[0] + 3 * inverse ** 2 * t * c1x + 3 * inverse * t ** 2 * c2x + t ** 3 * x,
            inverse ** 3 * current[1] + 3 * inverse ** 2 * t * c1y + 3 * inverse * t ** 2 * c2y + t ** 3 * y,
          ]);
        }
        current = [x, y];
        cursor += 6;
      } else if (verb === PathCommand.CURVE_TO) {
        cursor += 4;
      } else if (verb === PathCommand.WIDE_MOVE_TO || verb === PathCommand.WIDE_LINE_TO) {
        cursor += 4;
      }
    }
  }
  return points;
}

// The on-curve anchors only — control points excluded, since roundness is allowed to move those.
function pathAnchorsOf(shape: Shape): number[][] {
  const anchors: number[][] = [];
  const tokens = shape.data.commands as unknown[];
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index] !== 'drawPath') continue;
    const verbs = tokens[index + 2] as number[];
    const data = tokens[index + 3] as number[];
    let cursor = 0;
    for (const verb of verbs) {
      if (verb === PathCommand.MOVE_TO || verb === PathCommand.LINE_TO) {
        anchors.push([data[cursor], data[cursor + 1]]);
        cursor += 2;
      } else if (verb === PathCommand.CUBIC_CURVE_TO) {
        anchors.push([data[cursor + 4], data[cursor + 5]]);
        cursor += 6;
      } else if (verb === PathCommand.CURVE_TO) {
        anchors.push([data[cursor + 2], data[cursor + 3]]);
        cursor += 4;
      }
    }
  }
  return anchors;
}

function pathVerbsOf(shape: Shape): number[] {
  const tokens = shape.data.commands as unknown[];
  const verbs: number[] = [];
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index] === 'drawPath') verbs.push(...(tokens[index + 2] as number[]));
  }
  return verbs;
}

function shapeOutlineArea(shape: Shape): number {
  const points = sampleShapeOutline(shape);
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

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
