import { createMatrix } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { RAD_TO_DEG } from '@flighthq/math/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import { createShape } from '@flighthq/shape/contract';
import type {
  DisplayObject,
  ImportDiagnostic,
  Matrix,
  RiveArtboardGraph,
  RiveArtboardImport,
  RiveCoreObject,
  RiveDocumentImportResult,
  RivePathRecord,
  Shape,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { isRiveCoreTypeDerivedFrom } from './riveCoreTypes';
import { parseRiveDocument } from './riveDocument';
import { createRiveObjectGraph } from './riveObjectGraph';
import { appendRiveShapePaint } from './riveShapePaint';
import { createRivePath } from './riveShapePath';

/**
 * Imports a `.riv` into one display subtree per artboard.
 *
 * A Rive file holds several artboards and names none of them "the" one, so import returns them side
 * by side and leaves the choice to the caller. Only components that are Nodes become display
 * objects; a Fill or a GradientStop is data belonging to the shape above it, not a node of its own.
 */
export function createScene2DFromRiveDocument(
  source: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
): RiveDocumentImportResult {
  const document = parseRiveDocument(source, diagnostics);
  if (document === null) return { artboards: [] };

  const graph = createRiveObjectGraph(document, diagnostics);
  return { artboards: graph.artboards.map((artboard) => createRiveArtboardImport(artboard, diagnostics)) };
}

function createRiveArtboardImport(
  artboard: Readonly<RiveArtboardGraph>,
  diagnostics: ImportDiagnostic[] | undefined,
): RiveArtboardImport {
  const source = artboard.objects[0];
  const width = readRiveNumber(source, RIVE_WIDTH, 0);
  const height = readRiveNumber(source, RIVE_HEIGHT, 0);
  const name = readRiveText(source, RIVE_NAME, '');
  const root = createDisplayObject({ name });
  applyRiveTransform(root, source);
  // The artboard's origin is stated in normalized coordinates, so 0.5 means its centre. That is a
  // pivot in Flight's vocabulary, which is why it converts to one rather than to a translation.
  root.pivotX = readRiveNumber(source, RIVE_ORIGIN_X, 0) * width;
  root.pivotY = readRiveNumber(source, RIVE_ORIGIN_Y, 0) * height;

  // A node is attached to its nearest ancestor that also became a node; components in between, such
  // as a Shape's paint, hold no place in the display tree.
  const nodes: Array<DisplayObject | null> = [root];
  // Paths accumulate per shape rather than drawing as they are met, because a paint covers every
  // path of its shape and the paint list is only complete once the shape's children have been read.
  const shapePaths = new Map<number, RivePathRecord[]>();
  for (let index = 1; index < artboard.objects.length; index++) {
    const object = artboard.objects[index];
    // A path contributes geometry to the shape above it rather than a node of its own. Rive combines
    // a shape's paths into one figure — that is how a hole cuts its parent — so splitting them into
    // separate nodes would break the compositing the format states.
    if (isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_PATH_TYPE_KEY)) {
      nodes.push(null);
      collectRivePathGeometry(shapePaths, artboard, index, diagnostics);
      continue;
    }
    if (!isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_NODE_TYPE_KEY)) {
      nodes.push(null);
      continue;
    }
    const node = isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_SHAPE_TYPE_KEY)
      ? createShape({ name: readRiveText(object, RIVE_NAME, '') })
      : createDisplayObject({ name: readRiveText(object, RIVE_NAME, '') });
    applyRiveTransform(node, object);
    nodes.push(node);
    addNodeChild(findRiveDisplayParent(nodes, artboard.parentIndices, index) ?? root, node);
  }

  for (const [shapeIndex, paths] of shapePaths) {
    const shape = nodes[shapeIndex];
    if (shape === null || shape === undefined) continue;
    appendRiveShapePaint(shape as Shape, artboard, shapeIndex, paths);
  }
  return { height, name, root, width };
}

function collectRivePathGeometry(
  shapePaths: Map<number, RivePathRecord[]>,
  artboard: Readonly<RiveArtboardGraph>,
  index: number,
  diagnostics: ImportDiagnostic[] | undefined,
): void {
  // A path belongs to a shape — every one of the 3,776 paths in the reference corpus is a shape's
  // direct child — so this is a malformed file rather than a shape of the format. It still crumbs
  // instead of vanishing, because the geometry would otherwise leave no trace.
  const owner = findRiveShapeOwner(artboard, index);
  if (owner < 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'rive.path-outside-shape',
      'createScene2DFromRiveDocument',
      { index },
    );
    return;
  }
  const source = artboard.objects[index];
  const path = createRivePath(source, artboard, index);
  // An empty result is the file's own doing: a points path may legitimately state no vertices.
  if (path === null || path.commands.length === 0) return;

  // A path carries its own transform, and it is no longer a node of its own, so that transform is
  // baked into the geometry the shape receives.
  const local = createRivePathMatrix(source);
  const data = path.data.slice();
  for (let offset = 0; offset + 1 < data.length; offset += 2) {
    const x = data[offset];
    const y = data[offset + 1];
    data[offset] = local.a * x + local.c * y + local.tx;
    data[offset + 1] = local.b * x + local.d * y + local.ty;
  }
  const records = shapePaths.get(owner) ?? [];
  records.push({ commands: path.commands.slice(), data, winding: path.winding });
  shapePaths.set(owner, records);
}

// The nearest ancestor that is a Shape component, in artboard numbering.
function findRiveShapeOwner(artboard: Readonly<RiveArtboardGraph>, index: number): number {
  let parent = artboard.parentIndices[index];
  while (parent > 0) {
    if (isRiveCoreTypeDerivedFrom(artboard.objects[parent].typeKey, RIVE_SHAPE_TYPE_KEY)) return parent;
    parent = artboard.parentIndices[parent];
  }
  return -1;
}

function createRivePathMatrix(source: Readonly<RiveCoreObject>): Matrix {
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

function findRiveDisplayParent(
  nodes: ReadonlyArray<DisplayObject | null>,
  parentIndices: readonly number[],
  index: number,
): DisplayObject | null {
  let parent = parentIndices[index];
  while (parent >= 0) {
    const node = nodes[parent];
    if (node !== undefined && node !== null) return node;
    parent = parentIndices[parent];
  }
  return null;
}

function applyRiveTransform(target: DisplayObject, source: Readonly<RiveCoreObject>): void {
  // x and y carry a retired alternate key that files still write, so both are accepted.
  target.x = readRiveNumber(source, RIVE_X, readRiveNumber(source, RIVE_X_LEGACY, 0));
  target.y = readRiveNumber(source, RIVE_Y, readRiveNumber(source, RIVE_Y_LEGACY, 0));
  // Rive states rotation in radians; Node2D's authoring rotation is degrees.
  target.rotation = readRiveNumber(source, RIVE_ROTATION, 0) * RAD_TO_DEG;
  target.scaleX = readRiveNumber(source, RIVE_SCALE_X, 1);
  target.scaleY = readRiveNumber(source, RIVE_SCALE_Y, 1);
  target.alpha = readRiveNumber(source, RIVE_OPACITY, 1);
}

// A property absent from the stream is at its documented initial value, which is why every read
// carries the format's default rather than treating absence as zero.
function readRiveNumber(source: Readonly<RiveCoreObject>, key: number, fallback: number): number {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'number' ? fallback : property.value;
}

function readRiveText(source: Readonly<RiveCoreObject>, key: number, fallback: string): string {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'string' ? fallback : property.value;
}

const RIVE_NODE_TYPE_KEY = 2;
const RIVE_SHAPE_TYPE_KEY = 3;
const RIVE_PATH_TYPE_KEY = 12;
const RIVE_NAME = 4;
const RIVE_WIDTH = 7;
const RIVE_HEIGHT = 8;
const RIVE_X_LEGACY = 9;
const RIVE_Y_LEGACY = 10;
const RIVE_ORIGIN_X = 11;
const RIVE_ORIGIN_Y = 12;
const RIVE_X = 13;
const RIVE_Y = 14;
const RIVE_ROTATION = 15;
const RIVE_SCALE_X = 16;
const RIVE_SCALE_Y = 17;
const RIVE_OPACITY = 18;
