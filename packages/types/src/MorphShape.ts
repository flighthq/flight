import type { Path } from './Path';
import type { PathMorph } from './PathMorph';
import type { Shape, ShapeData, ShapeRuntime } from './Shape';

// A retained Shape binding over one prepared PathMorph. `path` is the stable, mutable sample whose
// command/data arrays may be referenced by any number of drawPath commands. Backend MorphShape
// renderers reuse the ordinary Shape command-stream implementation under this distinct node kind.
export interface MorphShapeData extends ShapeData {
  readonly morph: Readonly<PathMorph>;
  readonly path: Path;
  progress: number;
}

export interface MorphShapeRuntime extends ShapeRuntime {}

export interface MorphShape extends Shape {
  data: MorphShapeData;
}

export const MorphShapeKind = 'MorphShape';
