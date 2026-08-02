import { invalidateContent } from '@flighthq/node/contract';
import { createPath, samplePathMorph } from '@flighthq/path/contract';
import { createNode2D, getNode2DRuntime } from '@flighthq/scene2d/contract';
import type { MorphShape, MorphShapeData, MorphShapeRuntime, PartialNode, PathMorph } from '@flighthq/types/contract';
import { MorphShapeKind } from '@flighthq/types/contract';

import { createShapeRuntime } from './shape';
import { appendShapePath } from './shapeCommands';

// Adds the MorphShape's stable sampled path at the current point in its retained command stream. This
// composes with the ordinary beginFill/lineStyle/endFill commands: callers author styling exactly as
// they do for Shape, then insert the live morph geometry wherever it belongs.
export function appendMorphShapePath(shape: MorphShape): void {
  const path = shape.data.path;
  appendShapePath(shape, path.commands, path.data, path.winding);
}

// Creates a retained MorphShape entity around a prepared path morph. The command stream starts empty,
// like createShape; use appendMorphShapePath after the desired fill/stroke commands. Playback is
// intentionally absent—animation/timeline code drives setMorphShapeProgress explicitly. Backends expose
// their default MorphShape renderer as an explicit alias of their Shape command-stream renderer.
export function createMorphShape(morph: Readonly<PathMorph>, obj?: Readonly<PartialNode<MorphShape>>): MorphShape {
  return createNode2D(
    MorphShapeKind,
    obj,
    (data) => createMorphShapeData(morph, data),
    createMorphShapeRuntime,
  ) as MorphShape;
}

export function createMorphShapeData(
  morph: Readonly<PathMorph>,
  data?: Readonly<Partial<MorphShapeData>>,
): MorphShapeData {
  const progress = data?.progress ?? 0;
  const path = createPath(morph.winding);
  samplePathMorph(path, morph, progress);
  return {
    commands: data?.commands ?? [],
    morph,
    path,
    progress,
  };
}

export function createMorphShapeRuntime(): MorphShapeRuntime {
  return createShapeRuntime() as MorphShapeRuntime;
}

export function getMorphShapeRuntime(source: Readonly<MorphShape>): Readonly<MorphShapeRuntime> {
  return getNode2DRuntime(source) as MorphShapeRuntime;
}

// Samples changed progress into the stable Path arrays retained by drawPath commands, then invalidates
// Shape content so bounds and every backend rebuild from the new coordinates. Reapplying the same value
// is a no-op; progress remains unclamped to preserve the path layer's deliberate easing-overshoot contract.
export function setMorphShapeProgress(shape: MorphShape, progress: number): void {
  if (shape.data.progress === progress) return;
  shape.data.progress = progress;
  samplePathMorph(shape.data.path, shape.data.morph, progress);
  invalidateContent(shape);
}
