import type { Matrix } from './Matrix';
import type { Path } from './Path';
import type { PathMorph } from './PathMorph';
import type { Shape, ShapeData, ShapeRuntime } from './Shape';

export interface MorphShapePathBinding {
  readonly morph: Readonly<PathMorph>;
  readonly path: Path;
}

export interface MorphShapeColorEndpoint {
  readonly alpha?: number;
  // Packed RGBA (`0xRRGGBBAA`).
  readonly color: number;
}

export interface MorphShapeGradientEndpoint {
  readonly alphas: readonly number[];
  // Packed RGBA (`0xRRGGBBAA`).
  readonly colors: readonly number[];
  readonly focalPointRatio?: number;
  readonly matrix?: Readonly<Matrix> | null;
  readonly ratios: readonly number[];
}

export interface MorphShapeGradientEndpointExplanation {
  readonly endStopCount: number;
  readonly reason: MorphShapeGradientEndpointReason;
  readonly startStopCount: number;
  readonly supported: boolean;
}

export type MorphShapeGradientEndpointReason =
  | 'empty-gradient'
  | 'end-stop-component-count-mismatch'
  | 'ok'
  | 'start-stop-component-count-mismatch'
  | 'stop-count-mismatch';

export interface MorphShapeLineEndpoint extends MorphShapeColorEndpoint {
  readonly thickness: number;
}

export interface MorphShapeColorPaintBinding {
  readonly commandIndex: number;
  readonly endAlpha: number;
  readonly endColor: number;
  readonly kind: 'color';
  readonly startAlpha: number;
  readonly startColor: number;
}

export interface MorphShapeGradientPaintBinding {
  readonly commandIndex: number;
  readonly commandKey: 'beginGradientFill' | 'lineGradientStyle';
  readonly endAlphas: readonly number[];
  readonly endColors: readonly number[];
  readonly endFocalPointRatio: number;
  readonly endMatrix: Readonly<Matrix> | null;
  readonly endRatios: readonly number[];
  readonly kind: 'gradient';
  readonly startAlphas: readonly number[];
  readonly startColors: readonly number[];
  readonly startFocalPointRatio: number;
  readonly startMatrix: Readonly<Matrix> | null;
  readonly startRatios: readonly number[];
}

export interface MorphShapeLinePaintBinding {
  readonly commandIndex: number;
  readonly endAlpha: number;
  readonly endColor: number;
  readonly endThickness: number;
  readonly kind: 'line';
  readonly startAlpha: number;
  readonly startColor: number;
  readonly startThickness: number;
}

export interface MorphShapeTexturePaintBinding {
  readonly commandIndex: number;
  readonly commandKey: 'beginTextureFill' | 'lineTextureStyle';
  readonly endMatrix: Readonly<Matrix>;
  readonly kind: 'texture';
  readonly startMatrix: Readonly<Matrix>;
}

export type MorphShapePaintBinding =
  | MorphShapeColorPaintBinding
  | MorphShapeGradientPaintBinding
  | MorphShapeLinePaintBinding
  | MorphShapeTexturePaintBinding;

// A retained Shape binding over prepared path and paint morphs. `morph`/`path` are the primary pair;
// `pathBindings` contains that pair plus independently sampled paths. Paint bindings address commands
// appended by the MorphShape paint helpers and are discarded when that command stream is cleared or
// replaced. Every live value is retained by ordinary Shape commands, so renderers need no morph branch.
export interface MorphShapeData extends ShapeData {
  readonly morph: Readonly<PathMorph>;
  readonly path: Path;
  readonly paintBindings: MorphShapePaintBinding[];
  readonly pathBindings: MorphShapePathBinding[];
  progress: number;
}

export interface MorphShapeRuntime extends ShapeRuntime {}

export interface MorphShape extends Shape {
  data: MorphShapeData;
}

export const MorphShapeKind = 'MorphShape';
