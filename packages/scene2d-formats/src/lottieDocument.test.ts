import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import type {
  ImportDiagnostic,
  LottieAnimatable,
  LottieDocument,
  LottieLayer,
  LottieShapePath,
  Node2D,
} from '@flighthq/types/contract';
import { LottieLayerKind, ShapeKind, SpriteKind, TextLabelKind } from '@flighthq/types/contract';

import {
  applyAnimationClipToLottieDocument,
  bindMutableLottieNumericProperty,
  createScene2DFromLottieDocumentWithRegistry,
  initialLottieValue,
  initializeLottieDocumentImportResult,
  isAnimatedLottieProperty,
  lottieClamp,
  lottieDegreesToRadians,
  lottieNumericValue,
  lottieRgba,
} from './lottieDocument.ts';
import { registerAllLottieHandlers } from './lottieHandlers.ts';
import { createScene2DFromLottieDocument } from './lottieImport.ts';
import { lottieNullLayerHandler } from './lottieNullLayer.ts';
import { createLottieRegistry } from './lottieRegistry.ts';
import {
  animatedLottieTestVector,
  createLottieTestDocument,
  findLottieTestNodeByKind,
  findLottieTestNodeByName,
  lottieTestShapeLayer,
  lottieTestSquarePath,
} from './lottieTestFixtures.ts';
import { createReadyImageResourceForTest } from './testHelper.ts';

describe('appendLottieLayers', () => {
  // ★ THE WALK IS WHERE THE FORMAT'S ORDER MEETS FLIGHT'S. Bodymovin writes the topmost layer first; Flight draws
  // children back to front, so the first layer in the document has to become the LAST child. Both assertions read the
  // built tree rather than the walk's internals, because the order is the whole observable contract.
  it('reverses document order so the first layer draws on top, and reparents by layer index', () => {
    const stacked = createScene2DFromLottieDocument(
      createLottieTestDocument([
        { ind: 1, ip: 0, nm: 'top', op: 60, ty: 3 },
        { ind: 2, ip: 0, nm: 'bottom', op: 60, ty: 3 },
      ]),
    );
    expect(childNames(stacked.root)).toEqual(['bottom', 'top']);

    const parented = createScene2DFromLottieDocument(
      createLottieTestDocument([
        { ind: 1, ip: 0, nm: 'child', op: 60, parent: 2, ty: 3 },
        { ind: 2, ip: 0, nm: 'parent', op: 60, ty: 3 },
      ]),
    );
    expect(childNames(parented.root)).toEqual(['parent']);
    expect(childNames(getNodeChildAt(parented.root, 0) as Node2D)).toEqual(['child']);
  });
});

describe('applyAnimationClipToLottieDocument', () => {
  it('applies the imported target-bound clip', () => {
    const result = createScene2DFromLottieDocument(
      createLottieTestDocument([
        { ind: 1, ip: 0, ks: { p: animatedLottieTestVector([0, 0], [10, 20]) }, nm: 'node', op: 60, ty: 3 },
      ]),
    );
    applyAnimationClipToLottieDocument(result.clip, 0.5);
    expect(findLottieTestNodeByName(result.root, 'node')).toMatchObject({ x: 5, y: 10 });
  });
});

describe('applyLottieMaskFamily', () => {
  // ★ THE WALK ONLY PICKS THE KEY. With the additive handler registered a masked layer gets a clip region; with an
  // empty mask family the SAME document produces no clip and no diagnostic — which is what makes masks omittable
  // rather than broken, and is exactly how an uncarried composition behaved before masks were a family.
  it('clips through the registered family and leaves the layer unmasked with none', () => {
    const document = createLottieTestDocument([maskedNullLayer()]);
    const withFamily = createScene2DFromLottieDocument(document);
    expect(findLottieTestNodeByName(withFamily.root, 'masked')?.clip).not.toBeNull();

    // The null layer handler stays registered so masks are the ONLY difference between the two runs — an empty
    // `layerHandlers` would also report `lottie.unsupported-layer`, and the silence asserted below would be measuring
    // the wrong thing.
    const diagnostics: ImportDiagnostic[] = [];
    const withoutFamily = createScene2DFromLottieDocumentWithRegistry(
      document,
      {
        layerHandlers: [{ handle: lottieNullLayerHandler, kind: LottieLayerKind.Null }],
        maskHandlers: [],
        shapeItemHandlers: [],
      },
      diagnostics,
    );
    expect(findLottieTestNodeByName(withoutFamily.root, 'masked')?.clip).toBeNull();
    expect(diagnostics).toEqual([]);
  });

  it('ignores disabled masks, since mode n is the format saying this is not a mask', () => {
    const layer = maskedNullLayer();
    layer.masksProperties = [{ mode: 'n', o: { k: 100 }, pt: { k: lottieTestSquarePath(0, 0, 10) } }];
    const result = createScene2DFromLottieDocument(createLottieTestDocument([layer]));
    expect(findLottieTestNodeByName(result.root, 'masked')?.clip).toBeNull();
  });
});

describe('applyLottieTransform', () => {
  // Shared by layers and by a shape group's own `tr` item, which is why it is the core's and not a layer's. Rotation
  // stays in DEGREES here: Lottie authors degrees and `node.rotation` is the authoring layer, so no conversion is
  // correct at this seam — `lottieDegreesToRadians` exists for the places that do need radians.
  it('writes position and rotation onto the node, rotation still in degrees', () => {
    const result = createScene2DFromLottieDocument(
      createLottieTestDocument([
        { ind: 1, ip: 0, ks: { p: { a: 0, k: [12, 34] }, r: { a: 0, k: 90 } }, nm: 'placed', op: 60, ty: 3 },
      ]),
    );
    expect(findLottieTestNodeByName(result.root, 'placed')).toMatchObject({ rotation: 90, x: 12, y: 34 });
  });
});

describe('bindMutableLottieNumericProperty', () => {
  // ★ THIS BINDS SHAPE-ITEM PROPERTIES, NOT LAYER TRANSFORMS. A layer's own position channel is appended by the
  // transform reader, so a null layer with an animated `ks.p` gains a channel with this function disabled entirely —
  // the pair below animates a rectangle's size instead, which is a property only this function can reach.
  // The counts are absolute because a layer already contributes one channel for its in/out visibility range:
  // measured 1 static, 2 animated, the difference being the one property that changed.
  it('adds a channel for an animated shape property that a static one does not', () => {
    const staticSize = createScene2DFromLottieDocument(
      createLottieTestDocument([rectangleLayerWithSize({ a: 0, k: [10, 10] })]),
    );
    const animatedSize = createScene2DFromLottieDocument(
      createLottieTestDocument([rectangleLayerWithSize(animatedLottieTestVector([10, 10], [40, 40]))]),
    );
    expect(staticSize.clip.channels).toHaveLength(1);
    expect(animatedSize.clip.channels).toHaveLength(2);
  });
});

describe('createLottieTrack', () => {
  // ★ SHARED PLUMBING THE FEATURE MODULES READ. It is exported because the path-channel builder lives outside the core
  // now; what it owns is the frame-to-second mapping and the per-segment easing, so the check is that a two-keyframe
  // property samples to its midpoint at the midpoint of the document — which no feature module could assert alone.
  it('maps document frames to seconds so a linear property samples at its midpoint', () => {
    const result = createScene2DFromLottieDocument(
      createLottieTestDocument([
        { ind: 1, ip: 0, ks: { p: animatedLottieTestVector([0, 0], [10, 20]) }, nm: 'node', op: 60, ty: 3 },
      ]),
    );
    applyAnimationClipToLottieDocument(result.clip, 0.5);
    expect(findLottieTestNodeByName(result.root, 'node')).toMatchObject({ x: 5, y: 10 });
  });
});

describe('createScene2DFromLottieDocumentWithRegistry', () => {
  // ★ THE SELECTIVE ENTRY READS WHAT IT IS GIVEN AND NOTHING MORE. An empty registry still parses the document, walks
  // its layers and builds the clip — it simply produces empty layer containers, which is what makes a partial family
  // yield a smaller scene rather than a broken one.
  it('parses the document with an empty registry, producing empty layer containers', () => {
    const result = createScene2DFromLottieDocumentWithRegistry(
      createLottieTestDocument([lottieTestShapeLayer(1, 'shape')]),
      { layerHandlers: [], maskHandlers: [], shapeItemHandlers: [] },
    );
    expect(result.duration).toBe(2);
    expect(findLottieTestNodeByName(result.root, 'shape')).not.toBeNull();
    expect(findLottieTestNodeByKind(result.root, 'Shape')).toBeNull();
  });

  it('rejects an invalid document exactly as the zero-config entry does', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const result = createScene2DFromLottieDocumentWithRegistry(
      'not json',
      { layerHandlers: [], maskHandlers: [], shapeItemHandlers: [] },
      diagnostics,
    );
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['lottie.invalid-document']);
    expect(result.duration).toBe(0);
  });
});

// ★ THESE WERE PRIVATE TO A 1,800-LINE FILE AND ARE NOW THE SHARED PLUMBING FIFTEEN FEATURE MODULES READ. Each one
// encodes a Lottie convention — a property may be static or keyframed, a colour is 0..1 floats, a rotation is degrees
// — and until they crossed a module boundary there was nowhere to state those conventions as assertions.
describe('hasComponentSpecificLottieEasing', () => {
  // A Lottie keyframe may carry PER-COMPONENT easing handles — `o.x` as an array rather than one number — and a single
  // track cannot express that, so the track machinery splits into one channel per component. The two documents below
  // differ only in whether the handles are per-component, and the channel count is how that decision shows.
  it('splits an unevenly eased vector into one channel per component', () => {
    const shared = createScene2DFromLottieDocument(
      createLottieTestDocument([positionLayer(animatedLottieTestVector([0, 0], [10, 20]))]),
    );
    const perComponent = createScene2DFromLottieDocument(
      createLottieTestDocument([
        positionLayer(animatedLottieTestVector([0, 0], [10, 20], [0.1, 0.9], [0, 0], [0.9, 0.1], [1, 1])),
      ]),
    );
    expect(shared.clip.channels).toHaveLength(2);
    expect(perComponent.clip.channels).toHaveLength(3);
  });
});

describe('initializeLottieDocumentImportResult', () => {
  it('is the construction initializer of createLottieDocumentImportResult', () => {
    expect(typeof initializeLottieDocumentImportResult).toBe('function');
  });
});

describe('initialLottieValue', () => {
  it('reads a static value directly and a keyframed one from its first keyframe', () => {
    expect(initialLottieValue({ a: 0, k: 5 })).toBe(5);
    expect(initialLottieValue({ a: 1, k: [{ s: [7], t: 0 }] })).toEqual([7]);
  });

  it('answers undefined for an absent property, which is how optional fields arrive', () => {
    expect(initialLottieValue(undefined)).toBeUndefined();
  });
});

describe('isAnimatedLottieProperty', () => {
  // ★ MEASURED: IT READS THE KEYFRAMES, NOT THE `a` FLAG. I expected the flag to decide, and it does not — a property
  // is animated when `k` is a non-empty array whose entries carry a frame time `t`. That is the more robust reading:
  // real exports ship `a: 1` with an empty `k`, and a handler that trusted the flag would bind a channel with no
  // keyframes in it. A property is never `undefined` here; the callers always hold one.
  it('reads the keyframe list rather than the animated flag', () => {
    expect(isAnimatedLottieProperty({ a: 1, k: [{ s: [0], t: 0 }] })).toBe(true);
    expect(isAnimatedLottieProperty({ a: 0, k: 5 })).toBe(false);
    expect(isAnimatedLottieProperty({ a: 1, k: [] })).toBe(false);
    expect(isAnimatedLottieProperty({ a: 1, k: [0, 1] as never })).toBe(false);
  });
});

describe('lottieClamp', () => {
  it('bounds a value into the range, ends included', () => {
    expect(lottieClamp(-1, 0, 1)).toBe(0);
    expect(lottieClamp(2, 0, 1)).toBe(1);
    expect(lottieClamp(0.5, 0, 1)).toBe(0.5);
  });
});

describe('lottieDegreesToRadians', () => {
  it('converts at the authoring-layer boundary, where Lottie states degrees', () => {
    expect(lottieDegreesToRadians(180)).toBeCloseTo(Math.PI, 10);
    expect(lottieDegreesToRadians(0)).toBe(0);
  });
});

describe('lottieNumericValue', () => {
  // ★ THE COMPONENT COUNT IS THE POINT. Lottie writes a scalar as a number OR a one-element array, and a vector as an
  // array that may be shorter than the components a reader needs. Every handler depends on getting exactly `components`
  // numbers back, because it indexes them positionally straight afterwards.
  it('returns exactly the requested component count, from either encoding', () => {
    expect(lottieNumericValue(5, 1)).toEqual([5]);
    expect(lottieNumericValue([1, 2], 2)).toEqual([1, 2]);
    expect(lottieNumericValue([1, 2, 3], 2)).toHaveLength(2);
  });

  // ★ MEASURED: A SHORT VALUE BROADCASTS ITS FIRST COMPONENT, it does not pad with zeros. I expected zeros, and the
  // format is why the code is right: Lottie writes a uniform scale or a greyscale colour as a single number, so
  // `[2]` asked for as three components means (2,2,2) — padding would have made it (2,0,0) and collapsed the shape.
  it('broadcasts the first component when the value is shorter than requested', () => {
    expect(lottieNumericValue([1], 3)).toEqual([1, 1, 1]);
    expect(lottieNumericValue(7, 2)).toEqual([7, 7]);
  });

  it('answers zeros for an absent or non-finite value', () => {
    expect(lottieNumericValue(undefined, 2)).toEqual([0, 0]);
    expect(lottieNumericValue(Number.NaN, 2)).toEqual([0, 0]);
  });
});

describe('lottieRgba', () => {
  // Lottie colours are 0..1 floats; the SDK packs RGBA into one integer with alpha in the low byte.
  it('packs unit floats into an opaque packed colour', () => {
    expect(lottieRgba([1, 0, 0])).toBe(0xff0000ff);
    expect(lottieRgba([0, 0, 0])).toBe(0x000000ff);
    expect(lottieRgba([1, 1, 1])).toBe(0xffffffff);
  });
});

describe('reportLottieDrop', () => {
  it('records a drop diagnostic a caller can read back', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const result = createScene2DFromLottieDocument('{"broken":true}', diagnostics);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(result.duration).toBe(0);
  });
});

describe('reportLottieExpression', () => {
  // Expressions are code, not data, and Flight evaluates none of them. The walk reaches every nested object of a
  // property, so an `x` on a transform sub-property is found — reporting it is what stops a file from appearing to
  // import cleanly while a driven value silently holds still.
  it('reports an expression found anywhere inside a property tree', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createScene2DFromLottieDocument(
      createLottieTestDocument([
        { ind: 1, ip: 0, ks: { o: { a: 0, k: 100, x: 'value*2' } }, nm: 'driven', op: 60, ty: 3 },
      ] as unknown as LottieLayer[]),
      diagnostics,
    );
    expect(diagnostics.map((entry) => entry.kind)).toContain('lottie.unsupported-expression');
  });
});

describe('reportLottieSkip', () => {
  // A skip is the format saying something Flight does not read; it must be reported rather than silently ignored, so a
  // build knows the scene is missing something the file asked for.
  it('records a skip for a shape item no handler claims', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createScene2DFromLottieDocument(
      createLottieTestDocument([
        {
          ind: 1,
          ip: 0,
          ks: {},
          nm: 'shape',
          op: 60,
          shapes: [{ nm: 'unknown', ty: 'zz' }],
          st: 0,
          ty: 4,
        } as unknown as LottieLayer,
      ]),
      diagnostics,
    );
    expect(diagnostics.map((entry) => entry.kind)).toContain('lottie.unsupported-shape-item');
  });
});

function rectangleLayerWithSize(s: LottieAnimatable<number[]>): LottieLayer {
  return {
    ind: 1,
    ip: 0,
    nm: 'shape',
    op: 60,
    shapes: [
      { p: { k: [5, 5] }, r: { k: 0 }, s, ty: 'rc' },
      { c: { k: [1, 0, 0] }, o: { k: 100 }, ty: 'fl' },
    ],
    ty: 4,
  };
}

function childNames(node: Node2D): string[] {
  const names: string[] = [];
  for (let index = 0; index < getNodeChildCount(node); index++) {
    names.push((getNodeChildAt(node, index) as Node2D).name ?? '');
  }
  return names;
}

function maskedNullLayer(): LottieLayer {
  return {
    ind: 1,
    ip: 0,
    masksProperties: [{ mode: 'a', o: { k: 100 }, pt: { k: lottieTestSquarePath(0, 0, 10) } }],
    nm: 'masked',
    op: 60,
    ty: 3,
  };
}

function positionLayer(p: LottieAnimatable<number[]>): LottieLayer {
  return { ind: 1, ip: 0, ks: { p }, nm: 'eased', op: 60, ty: 3 };
}
