// Compatibility wrapper: Scene2D Formats owns the Lottie registry contracts.
export type {
  LottieAdvancedBlend,
  LottieFillPaint,
  LottieGradientPaint,
  LottieImportContext,
  LottieLayerContext,
  LottieLayerHandler,
  LottieLayerHandlerEntry,
  LottieMaskContext,
  LottieMaskHandler,
  LottieMaskHandlerEntry,
  LottieMutableAnimationTarget,
  LottiePaint,
  LottieRegistry,
  LottieShapeItemContext,
  LottieShapeItemHandler,
  LottieShapeItemHandlerEntry,
  LottieShapeModifier,
  LottieShapePainter,
  LottieStrokePaint,
} from '@flighthq/scene2d-formats/contract';

/** @deprecated Import Lottie contracts from `@flighthq/scene2d-formats/contract`. These runtime
 * values stay duplicated because @flighthq/types may re-export owner contracts only as types. */
export const LottieLayerKind = {
  Image: 2,
  Null: 3,
  Precomposition: 0,
  Shape: 4,
  Solid: 1,
  Text: 5,
} as const;

export type LottieLayerKind = number;

export const LottieShapeItemKind = {
  Ellipse: 'el',
  Fill: 'fl',
  GradientFill: 'gf',
  GradientStroke: 'gs',
  Path: 'sh',
  Polystar: 'sr',
  Rectangle: 'rc',
  Stroke: 'st',
  TrimPath: 'tm',
} as const;

export type LottieShapeItemKind = string;

export const LottieMaskKind = {
  Additive: 'a',
  Darken: 'd',
  Difference: 'f',
  Intersect: 'i',
  Lighten: 'l',
  None: 'n',
  Subtract: 's',
} as const;

export type LottieMaskKind = string;
