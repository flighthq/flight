import { createClipRegionFromPath } from '@flighthq/clip/contract';
import { createMatrix, inverseMatrix, multiplyMatrix } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createPath } from '@flighthq/path/contract';
import type {
  DisplayObject,
  ImportDiagnostic,
  Matrix,
  RiveArtboardGraph,
  RiveCoreObject,
  RivePathRecord,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { isRiveCoreTypeDerivedFrom } from './riveCoreTypes';

/**
 * Applies each node's clipping shapes.
 *
 * The coordinate space is the whole problem here. A clipping shape names a *source* shape elsewhere
 * in the artboard, and that source's geometry sits in the source's own transform chain — while
 * Flight rasterizes a clip under the **clipped** node's transform. So the geometry has to cross from
 * one chain to the other: `inverse(clippedRelative) * sourceRelative` applied to the source's points.
 * Both chains are measured from the artboard root, whose own transform is common to the two and
 * therefore cancels, which is what keeps the artboard's pivot out of the arithmetic.
 */
export function applyRiveClipping(
  nodes: ReadonlyArray<DisplayObject | null>,
  artboard: Readonly<RiveArtboardGraph>,
  shapePaths: ReadonlyMap<number, RivePathRecord[]>,
  diagnostics: ImportDiagnostic[] | undefined,
): void {
  const relative = createRiveRelativeTransforms(artboard);
  for (let index = 1; index < artboard.objects.length; index++) {
    const object = artboard.objects[index];
    if (object.typeKey !== RIVE_CLIPPING_SHAPE) continue;
    if (!readRiveFlag(object, RIVE_CLIP_IS_VISIBLE, true)) continue;

    const owner = artboard.parentIndices[index];
    const target = owner >= 0 ? nodes[owner] : null;
    if (target === null || target === undefined) continue;
    if (target.clip !== null) {
      // Rive intersects several clips; Flight carries one region per node, and intersecting contour
      // sets is a path-boolean job rather than something to fake by keeping the last one.
      reportRiveClipDrop(diagnostics, 'rive.multiple-clipping-shapes', { index });
      continue;
    }

    const source = readRiveNumber(object, RIVE_CLIP_SOURCE_ID, -1);
    const paths = shapePaths.get(source);
    if (paths === undefined || paths.length === 0) {
      reportRiveClipDrop(diagnostics, 'rive.unresolved-clipping-source', { index, source });
      continue;
    }
    target.clip = createRiveClipRegion(paths, relative[owner], relative[source], object);
  }
}

function createRiveClipRegion(
  paths: readonly RivePathRecord[],
  clipped: Readonly<Matrix>,
  source: Readonly<Matrix>,
  clipping: Readonly<RiveCoreObject>,
) {
  const into = createMatrix();
  const combined = createMatrix();
  // A degenerate clipped transform leaves the source where it is rather than collapsing it.
  if (inverseMatrix(into, clipped)) multiplyMatrix(combined, into, source);
  else multiplyMatrix(combined, createMatrix(), source);

  const path = createPath(readRiveNumber(clipping, RIVE_CLIP_FILL_RULE, 0) === 1 ? 'evenOdd' : 'nonZero');
  for (const record of paths) {
    for (const command of record.commands) path.commands.push(command);
    for (let offset = 0; offset + 1 < record.data.length; offset += 2) {
      const x = record.data[offset];
      const y = record.data[offset + 1];
      path.data.push(combined.a * x + combined.c * y + combined.tx, combined.b * x + combined.d * y + combined.ty);
    }
  }
  return createClipRegionFromPath(path);
}

/**
 * Each component's transform measured from the artboard root. The root itself is the identity here
 * on purpose: it is an ancestor of every component, so whatever it carries cancels between any two
 * of them.
 */
function createRiveRelativeTransforms(artboard: Readonly<RiveArtboardGraph>): Matrix[] {
  const transforms: Matrix[] = [createMatrix()];
  for (let index = 1; index < artboard.objects.length; index++) {
    const object = artboard.objects[index];
    const parent = artboard.parentIndices[index];
    const inherited = parent >= 0 ? transforms[parent] : transforms[0];
    if (!isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_NODE_TYPE_KEY)) {
      // A non-node component holds no transform, so it passes its parent's through unchanged.
      transforms.push(inherited);
      continue;
    }
    const local = createRiveLocalMatrix(object);
    const world = createMatrix();
    multiplyMatrix(world, inherited, local);
    transforms.push(world);
  }
  return transforms;
}

function createRiveLocalMatrix(source: Readonly<RiveCoreObject>): Matrix {
  const rotation = readRiveNumber(source, RIVE_ROTATION, 0);
  const scaleX = readRiveNumber(source, RIVE_SCALE_X, 1);
  const scaleY = readRiveNumber(source, RIVE_SCALE_Y, 1);
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return createMatrix(
    cosine * scaleX,
    sine * scaleX,
    -sine * scaleY,
    cosine * scaleY,
    readRiveNumber(source, RIVE_X, readRiveNumber(source, RIVE_X_LEGACY, 0)),
    readRiveNumber(source, RIVE_Y, readRiveNumber(source, RIVE_Y_LEGACY, 0)),
  );
}

function reportRiveClipDrop(
  diagnostics: ImportDiagnostic[] | undefined,
  kind: string,
  detail: Readonly<Record<string, number>>,
): void {
  reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, kind, 'createScene2DFromRiveDocument', detail);
}

function readRiveNumber(source: Readonly<RiveCoreObject>, key: number, fallback: number): number {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'number' ? fallback : property.value;
}

function readRiveFlag(source: Readonly<RiveCoreObject>, key: number, fallback: boolean): boolean {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'number' ? fallback : property.value !== 0;
}

const RIVE_NODE_TYPE_KEY = 2;
const RIVE_CLIPPING_SHAPE = 42;
const RIVE_X_LEGACY = 9;
const RIVE_Y_LEGACY = 10;
const RIVE_X = 13;
const RIVE_Y = 14;
const RIVE_ROTATION = 15;
const RIVE_SCALE_X = 16;
const RIVE_SCALE_Y = 17;
const RIVE_CLIP_SOURCE_ID = 92;
const RIVE_CLIP_FILL_RULE = 93;
const RIVE_CLIP_IS_VISIBLE = 94;
