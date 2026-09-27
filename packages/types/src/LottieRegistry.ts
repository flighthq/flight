import type { AdvancedBlendMode } from './AdvancedBlendMode.ts';
import type { AnimationChannel } from './AnimationChannel.ts';
import type { DisplayObject } from './DisplayObject.ts';
import type { ImageResource } from './ImageResource.ts';
import type { ImportDiagnostic } from './ImportDiagnostic.ts';
import type { LottieAsset, LottieDocument, LottieImageAsset, LottieLayer, LottieShapeItem } from './LottieDocument.ts';
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
  shapeItemHandlers: LottieShapeItemHandlerEntry[];
}
