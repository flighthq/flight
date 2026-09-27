import { LottieLayerKind, LottieShapeItemKind } from './LottieRegistry.ts';

// ★ THESE TABLES ARE THE FORMAT'S NUMBERS, NOT FLIGHT'S CHOICE. A Lottie layer declares its type as `ty: 4`, and a
// shape item as `ty: 'rc'`; getting one wrong routes a document to the wrong handler with no error anywhere, because
// every value is a legal value of its own type. Pinning them is the only place a transposed pair is caught.
describe('LottieLayerKind', () => {
  it('carries the format layer-type numbers', () => {
    expect(LottieLayerKind).toEqual({
      Image: 2,
      Null: 3,
      Precomposition: 0,
      Shape: 4,
      Solid: 1,
      Text: 5,
    });
  });

  it('gives every kind a distinct value, since a collision silently merges two families', () => {
    expect(new Set(Object.values(LottieLayerKind)).size).toBe(Object.keys(LottieLayerKind).length);
  });
});

describe('LottieShapeItemKind', () => {
  it('carries the format shape-item codes', () => {
    expect(LottieShapeItemKind).toEqual({
      Ellipse: 'el',
      Fill: 'fl',
      GradientFill: 'gf',
      GradientStroke: 'gs',
      Path: 'sh',
      Polystar: 'sr',
      Rectangle: 'rc',
      Stroke: 'st',
      TrimPath: 'tm',
    });
  });

  it('gives every kind a distinct value, since a collision silently merges two families', () => {
    expect(new Set(Object.values(LottieShapeItemKind)).size).toBe(Object.keys(LottieShapeItemKind).length);
  });
});
