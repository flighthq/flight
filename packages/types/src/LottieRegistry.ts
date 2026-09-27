import type { AdvancedBlendMode } from './AdvancedBlendMode.ts';
import type { AnimationChannel } from './AnimationChannel.ts';
import type { DisplayObject } from './DisplayObject.ts';
import type { ImageResource } from './ImageResource.ts';
import type { ImportDiagnostic } from './ImportDiagnostic.ts';
import type {
  LottieAsset,
  LottieDocument,
  LottieImageAsset,
  LottieLayer,
  LottieMask,
  LottieShapeItem,
} from './LottieDocument.ts';
import type { Node2D } from './Node2D.ts';
import type { Path } from './Path.ts';
import type { Shape } from './Shape.ts';

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

/**
 * The mask composition modes the format declares.
 *
 * ★ A MASK BELONGS TO NO LAYER KIND, which is why it is a family of its own rather than part of one. A null, solid,
 * image, text or shape layer may all carry masks, so the walk has to ask every layer — and while the reading lived in
 * the document core, every build paid for the clip region and the bezier path reader even when nothing was masked.
 */
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

export interface LottieAdvancedBlend {
  mode: AdvancedBlendMode;
  node: DisplayObject;
}

export interface LottieFillPaint {
  color: number[];
  kind: 'fill';
  opacity: number;
  winding: 'evenOdd' | 'nonZero';
}

export interface LottieStrokePaint {
  caps: 'none' | 'round' | 'square';
  color: number[];
  dash: number[];
  dashOffset: number;
  joints: 'bevel' | 'miter' | 'round';
  kind: 'stroke';
  miterLimit: number;
  opacity: number;
  width: number;
}

export interface LottieGradientPaint {
  caps: 'none' | 'round' | 'square';
  count: number;
  dash: number[];
  dashOffset: number;
  end: number[];
  joints: 'bevel' | 'miter' | 'round';
  kind: 'gradient';
  miterLimit: number;
  opacity: number;
  shape: 1 | 2;
  start: number[];
  type: 'gf' | 'gs';
  values: number[];
  width: number;
  winding: 'evenOdd' | 'nonZero';
}

export type LottiePaint = LottieFillPaint | LottieGradientPaint | LottieStrokePaint;

export interface LottieImportContext {
  advancedBlends: LottieAdvancedBlend[];
  assets: Map<string, LottieAsset>;
  channels: AnimationChannel[];
  diagnostics: ImportDiagnostic[] | undefined;
  document: Readonly<LottieDocument>;
  frameOffset: number;
  frameScale: number;
  registry: Readonly<LottieRegistry>;
  resolveImageResource: ((asset: Readonly<LottieImageAsset>) => ImageResource | null) | undefined;
  resolvingPrecompositions: Set<string>;
}

export interface LottieLayerContext {
  container: DisplayObject;
  import: LottieImportContext;
  layer: Readonly<LottieLayer>;
}

export type LottieLayerHandler = (context: LottieLayerContext) => void;

export interface LottieLayerHandlerEntry {
  handle: LottieLayerHandler;
  kind: LottieLayerKind;
}

export interface LottieMaskContext {
  import: LottieImportContext;
  /** The layer's masks with the disabled ones already dropped, in document order. */
  masks: readonly Readonly<LottieMask>[];
  target: Node2D;
}

export type LottieMaskHandler = (context: LottieMaskContext) => void;

export interface LottieMaskHandlerEntry {
  handle: LottieMaskHandler;
  kind: LottieMaskKind;
}

/** The seam a feature module binds a keyframed value through; the sample is owned by the track, never retained. */
export interface LottieMutableAnimationTarget {
  lottieApply(sample: Readonly<number[] | Float32Array>, time: number): void;
}

export interface LottieShapeItemContext {
  import: LottieImportContext;
  item: Readonly<LottieShapeItem>;
  paints: LottiePaint[];
  paths: Path[];
  rerender: () => void;
  shape: Shape;
}

export type LottieShapeItemHandler = (context: LottieShapeItemContext) => void;

export interface LottieShapeItemHandlerEntry {
  handle: LottieShapeItemHandler;
  kind: LottieShapeItemKind;
}

export interface LottieRegistry {
  layerHandlers: LottieLayerHandlerEntry[];
  maskHandlers: LottieMaskHandlerEntry[];
  shapeItemHandlers: LottieShapeItemHandlerEntry[];
}
