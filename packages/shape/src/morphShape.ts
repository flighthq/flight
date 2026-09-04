import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { invalidateContent } from '@flighthq/node/contract';
import { createPath, samplePathMorph } from '@flighthq/path/contract';
import { createNode2D, getNode2DRuntime } from '@flighthq/scene2d/contract';
import type {
  MorphShape,
  MorphShapeData,
  MorphShapeRuntime,
  PartialNode,
  Path,
  PathMorph,
  EntityConstruction,
} from '@flighthq/types/contract';
import { MorphShapeKind } from '@flighthq/types/contract';

import { sampleMorphShapePaintBindings } from './morphShapePaint';
import { createShapeRuntime } from './shape';
import { appendShapePath } from './shapeCommands';

// Adds a stable sampled path at the current point in the retained command stream. Omitting `morph` uses
// the primary compatibility binding; passing another prepared morph creates or reuses an independent
// live path, allowing one MorphShape to retain multiple fill/stroke regions without child nodes.
export function appendMorphShapePath(shape: MorphShape, morph: Readonly<PathMorph> = shape.data.morph): Path {
  let binding = shape.data.pathBindings.find((candidate) => candidate.morph === morph);
  if (binding === undefined) {
    const path = createPath(morph.winding);
    samplePathMorph(path, morph, shape.data.progress);
    binding = { morph, path };
    shape.data.pathBindings.push(binding);
  }
  const path = binding.path;
  appendShapePath(shape, path.commands, path.data, path.winding);
  return path;
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
  const out = allocateEntity<MorphShapeData>();
  initializeMorphShapeData(out, morph, data);
  return out;
}

export function createMorphShapeRuntime(): MorphShapeRuntime {
  return createShapeRuntime() as MorphShapeRuntime;
}

export function getMorphShapeRuntime(source: Readonly<MorphShape>): Readonly<MorphShapeRuntime> {
  return getNode2DRuntime(source) as MorphShapeRuntime;
}

export function initializeMorphShapeData(
  out: EntityConstruction<MorphShapeData>,
  morph: Readonly<PathMorph>,
  data?: Readonly<Partial<MorphShapeData>>,
): void {
  const progress = data?.progress ?? 0;
  const path = data?.path ?? createPath(morph.winding);
  const pathBindings = [{ morph, path }];
  const inputPathBindings = data?.pathBindings ?? [];
  for (let i = 0; i < inputPathBindings.length; i++) {
    const binding = inputPathBindings[i];
    if (binding.morph !== morph && binding.path !== path) pathBindings.push(binding);
  }
  for (let i = 0; i < pathBindings.length; i++) {
    samplePathMorph(pathBindings[i].path, pathBindings[i].morph, progress);
  }
  out.commands = data?.commands ?? [];
  out.morph = morph;
  out.paintBindings = [...(data?.paintBindings ?? [])];
  out.path = path;
  out.pathBindings = pathBindings;
  out.progress = progress;
  finishEntity(out);
  sampleMorphShapePaintBindings(out, progress);
}

// Samples changed progress into every stable path and paint value retained by the command stream, then
// invalidates Shape content once so bounds and every backend observe one atomic state change. Reapplying
// the same value is a no-op; progress remains unclamped to preserve deliberate easing overshoot.
export function setMorphShapeProgress(shape: MorphShape, progress: number): void {
  if (shape.data.progress === progress) return;
  shape.data.progress = progress;
  for (let i = 0; i < shape.data.pathBindings.length; i++) {
    const binding = shape.data.pathBindings[i];
    samplePathMorph(binding.path, binding.morph, progress);
  }
  sampleMorphShapePaintBindings(shape.data, progress);
  invalidateContent(shape);
}
