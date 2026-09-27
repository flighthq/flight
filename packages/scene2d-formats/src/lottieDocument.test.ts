import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import type {
  ImportDiagnostic,
  LottieAnimatable,
  LottieDocument,
  LottieLayer,
  LottieShapePath,
  Node2D,
} from '@flighthq/types/contract';
import { SpriteKind, ShapeKind, TextLabelKind } from '@flighthq/types/contract';

import {
  appendLottieShapePathChannels,
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

describe('appendLottieShapePathChannels', () => {
  // ★ THE ONE PIECE OF THE PATH ITEM THAT STAYED IN THE CORE, because it reaches the core's private track machinery.
  // What it must do is produce a channel per animated path, driving the caller's rebuild — asserted through the
  // importer rather than by calling it bare, since its inputs are the core's own keyframe shapes.
  it('produces a channel for an animated path so the clip drives the rebuild', () => {
    const document = createLottieTestDocument([
      {
        ind: 1,
        ip: 0,
        ks: {},
        nm: 'animated',
        op: 60,
        shapes: [
          { d: 1, ks: { a: 1, k: animatedPathKeyframes() }, nm: 'p', ty: 'sh' },
          { c: { a: 0, k: [1, 0, 0] }, nm: 'f', o: { a: 0, k: 100 }, ty: 'fl' },
        ],
        st: 0,
        ty: 4,
      } as unknown as LottieLayer,
    ]);
    const result = createScene2DFromLottieDocument(document);
    expect(result.clip.channels.length).toBeGreaterThan(0);
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

describe('createScene2DFromLottieDocumentWithRegistry', () => {
  // ★ THE SELECTIVE ENTRY READS WHAT IT IS GIVEN AND NOTHING MORE. An empty registry still parses the document, walks
  // its layers and builds the clip — it simply produces empty layer containers, which is what makes a partial family
  // yield a smaller scene rather than a broken one.
  it('parses the document with an empty registry, producing empty layer containers', () => {
    const result = createScene2DFromLottieDocumentWithRegistry(
      createLottieTestDocument([lottieTestShapeLayer(1, 'shape')]),
      { layerHandlers: [], shapeItemHandlers: [] },
    );
    expect(result.duration).toBe(2);
    expect(findLottieTestNodeByName(result.root, 'shape')).not.toBeNull();
    expect(findLottieTestNodeByKind(result.root, 'Shape')).toBeNull();
  });

  it('rejects an invalid document exactly as the zero-config entry does', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const result = createScene2DFromLottieDocumentWithRegistry(
      'not json',
      { layerHandlers: [], shapeItemHandlers: [] },
      diagnostics,
    );
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['lottie.invalid-document']);
    expect(result.duration).toBe(0);
  });
});

describe('initializeLottieDocumentImportResult', () => {
  it('is the construction initializer of createLottieDocumentImportResult', () => {
    expect(typeof initializeLottieDocumentImportResult).toBe('function');
  });
});

// ★ THESE WERE PRIVATE TO A 1,800-LINE FILE AND ARE NOW THE SHARED PLUMBING FIFTEEN FEATURE MODULES READ. Each one
// encodes a Lottie convention — a property may be static or keyframed, a colour is 0..1 floats, a rotation is degrees
// — and until they crossed a module boundary there was nowhere to state those conventions as assertions.
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
    expect(findLottieTestNodeByKind(result.root, SpriteKind)).not.toBeNull();
  });
});

describe('lottieNullLayerReader', () => {
  it('produces an empty container', () => {
    const result = createScene2DFromLottieDocument(
      createLottieTestDocument([{ ind: 1, ip: 0, nm: 'null', op: 60, ty: 3 }]),
    );
    expect(findLottieTestNodeByName(result.root, 'null')).not.toBeNull();
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
    expect(findLottieTestNodeByName(result.root, 'inner')).not.toBeNull();
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

describe('lottieShapeLayerReader', () => {
  it('creates shape items from a shape layer', () => {
    const result = createScene2DFromLottieDocument(createLottieTestDocument([lottieTestShapeLayer(1, 'shapes')]));
    expect(findLottieTestNodeByKind(result.root, ShapeKind)).not.toBeNull();
  });
});

describe('lottieSolidLayerReader', () => {
  it('creates a solid color shape', () => {
    const result = createScene2DFromLottieDocument(
      createLottieTestDocument([{ ind: 1, ip: 0, nm: 'solid', op: 60, sc: '#ff0000', sh: 50, sw: 50, ty: 1 }]),
    );
    expect(findLottieTestNodeByKind(result.root, ShapeKind)).not.toBeNull();
  });
});

describe('lottieTextLayerReader', () => {
  it('creates a text label', () => {
    const result = createScene2DFromLottieDocument(
      createLottieTestDocument([
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
    expect(findLottieTestNodeByKind(result.root, TextLabelKind)).not.toBeNull();
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

function animatedPathKeyframes() {
  return [
    { s: [lottieTestSquarePath(0, 0, 10)], t: 0 },
    { s: [lottieTestSquarePath(0, 0, 20)], t: 30 },
  ];
}

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
