import { RAD_TO_DEG } from '@flighthq/math/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  DisplayObject,
  ImportDiagnostic,
  RiveArtboardGraph,
  RiveArtboardImport,
  RiveCoreObject,
  RiveDocumentImportResult,
} from '@flighthq/types/contract';

import { isRiveCoreTypeDerivedFrom } from './riveCoreTypes';
import { parseRiveDocument } from './riveDocument';
import { createRiveObjectGraph } from './riveObjectGraph';

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
  return { artboards: graph.artboards.map((artboard) => createRiveArtboardImport(artboard)) };
}

function createRiveArtboardImport(artboard: Readonly<RiveArtboardGraph>): RiveArtboardImport {
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
  for (let index = 1; index < artboard.objects.length; index++) {
    const object = artboard.objects[index];
    if (!isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_NODE_TYPE_KEY)) {
      nodes.push(null);
      continue;
    }
    const node = createDisplayObject({ name: readRiveText(object, RIVE_NAME, '') });
    applyRiveTransform(node, object);
    nodes.push(node);
    addNodeChild(findRiveDisplayParent(nodes, artboard.parentIndices, index) ?? root, node);
  }
  return { height, name, root, width };
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
