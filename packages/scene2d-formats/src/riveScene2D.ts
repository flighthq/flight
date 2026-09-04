import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createMatrix } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { RAD_TO_DEG } from '@flighthq/math/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import { clearShapeCommands, createShape } from '@flighthq/shape/contract';
import type {
  DisplayObject,
  ImportDiagnostic,
  Matrix,
  RiveAdvancedBlend,
  RiveArtboardGraph,
  RiveArtboardImport,
  RiveCoreObject,
  RiveDocumentImportResult,
  RivePathRecord,
  Shape,
} from '@flighthq/types/contract';
import { AdvancedBlendMode, BlendMode, ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { createRiveAnimationClips } from './riveAnimation';
import { createRiveFileAssets } from './riveAssets';
import { applyRiveClipping } from './riveClipping';
import { isRiveCoreTypeDerivedFrom } from './riveCoreTypes';
import { parseRiveDocument } from './riveDocument';
import { applyRiveDrawOrder } from './riveDrawOrder';
import { createRiveLayoutImports } from './riveLayout';
import { createRiveObjectGraph } from './riveObjectGraph';
import { createRiveImageSprite, markRiveNestedArtboard } from './riveScene2DDocument';
import { appendRiveShapePaint } from './riveShapePaint';
import { createRivePath } from './riveShapePath';
import { createRiveSkeleton2D } from './riveSkeleton';
import { applyRiveSolo } from './riveSolo';
import { createRiveStateMachines } from './riveStateMachine';
import { createRiveRichText } from './riveText';

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
  if (document === null)
    return (() => {
      const out = allocateEntity<RiveDocumentImportResult>();
      out.artboards = [];
      out.assets = [];
      return finishEntity(out);
    })();

  const graph = createRiveObjectGraph(document, diagnostics);
  const assets = createRiveFileAssets(document.objects, diagnostics);
  // A text style names its typeface by a position in the asset list, the same space an image
  // drawable's assetId indexes, so the names are resolved once here rather than per drawable.
  const fontNames = assets.map((asset) => asset.name);
  const out = allocateEntity<RiveDocumentImportResult>();
  out.artboards = graph.artboards.map((artboard) =>
    createRiveArtboardImport(artboard, document.objects, fontNames, diagnostics),
  );
  out.assets = assets;
  return finishEntity(out);
}

function createRiveArtboardImport(
  artboard: Readonly<RiveArtboardGraph>,
  objects: readonly Readonly<RiveCoreObject>[],
  fontNames: readonly string[],
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
  const advancedBlends: RiveAdvancedBlend[] = [];
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
    const node = createRiveDisplayNode(object, artboard, index, fontNames, diagnostics);
    applyRiveTransform(node, object);
    applyRiveBlendMode(node, object, advancedBlends);
    nodes.push(node);
    addNodeChild(findRiveDisplayParent(nodes, artboard.parentIndices, index) ?? root, node);
  }

  applyRiveClipping(nodes, artboard, shapePaths, diagnostics);
  applyRiveDrawOrder(nodes, artboard, root, diagnostics);
  applyRiveSolo(nodes, artboard, diagnostics);

  // Every reader here reads from the core object's own properties, so animating geometry or paint is
  // a matter of mutating those properties and running the shape's builder again. Capturing the
  // rebuild per shape is what lets one binder serve vertices, radii, colours and stroke widths alike.
  const rebuilds = new Map<number, () => void>();
  for (const shapeIndex of shapePaths.keys()) {
    const shape = nodes[shapeIndex];
    if (shape === null || shape === undefined) continue;
    const rebuild = (): void => rebuildRiveShape(shape as Shape, artboard, shapeIndex, shapePaths, undefined);
    rebuilds.set(shapeIndex, rebuild);
    // The stored closure and the first build are the same work but not the same call: only this one
    // carries the sink. The closure runs again per animated frame, so a sink passed there would report
    // the same substitution once per frame — diagnostics describe the import, not the playback.
    rebuildRiveShape(shape as Shape, artboard, shapeIndex, shapePaths, diagnostics);
  }

  const span = { end: artboard.streamEnd, start: artboard.streamStart };
  // The rig is flattened before the clips because bone channels bind against its setup pose — a Rive
  // keyframe states an absolute value and the skeleton binder composes a delta, so the setup rotation
  // has to exist before a channel can be expressed relative to it.
  const skeleton = createRiveSkeleton2D(artboard);
  const animations = createRiveAnimationClips(objects, span, nodes, artboard, rebuilds, skeleton);
  const layouts = createRiveLayoutImports(artboard, nodes, diagnostics);
  const stateMachines = createRiveStateMachines(objects, span, diagnostics);
  return { advancedBlends, animations, height, layouts, name, root, skeleton, stateMachines, width };
}

// A shape carries a command stream and a text drawable carries a label; everything else is a plain
// container.
function createRiveDisplayNode(
  object: Readonly<RiveCoreObject>,
  artboard: Readonly<RiveArtboardGraph>,
  index: number,
  fontNames: readonly string[],
  diagnostics: ImportDiagnostic[] | undefined,
): DisplayObject {
  const name = readRiveText(object, RIVE_NAME, '');
  if (object.typeKey === RIVE_TEXT_TYPE_KEY) {
    const label = createRiveRichText(artboard, index, fontNames, diagnostics);
    label.name = name;
    return label;
  }
  // An image drawable stands up a sprite waiting on its asset; a nested artboard marks a slot site.
  // Both are recorded for the document layer, which is what turns them into resource references and
  // slots — the display tree itself stays ignorant of the format.
  if (object.typeKey === RIVE_IMAGE_TYPE_KEY) {
    return createRiveImageSprite(name, readRiveNumber(object, RIVE_IMAGE_ASSET_ID, -1));
  }
  // Derived-from rather than equality: NestedArtboardLeaf and NestedArtboardLayout are nested
  // artboards and carry the same slot semantics, so an equality test marks neither and they arrive at
  // the unsupported-drawable arm instead of becoming slots. Behaviour is inherited in this object
  // model, which is what the core type table exists to express.
  if (isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_NESTED_ARTBOARD_TYPE_KEY)) {
    const node = createDisplayObject({ name });
    markRiveNestedArtboard(node, readRiveNumber(object, RIVE_NESTED_ARTBOARD_ID, -1));
    return node;
  }
  if (isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_SHAPE_TYPE_KEY)) return createShape({ name });
  // A nine-sliced node scales a child with fixed corners; imported as a plain container it keeps the
  // child and loses the slicing. At the authored size the two are identical, which is what hides it —
  // the difference only appears once a layout resizes the node, and then the corners stretch. It is a
  // Node rather than a Drawable, so the drawable check below cannot see it.
  if (isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_NSLICED_NODE_TYPE_KEY)) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'rive.nine-slice-substituted',
      'createRiveDisplayNode',
      { substitutedAs: 'container', typeKey: object.typeKey },
    );
    return createDisplayObject({ name });
  }
  // A plain node IS a container, so reaching here is ordinary and silent. A DRAWABLE reaching here is
  // not: the file authored something that paints, and it becomes an empty container that still holds
  // its name, transform and children. The tree keeps its shape, the artboard keeps its object count,
  // and only the pixels are missing — so nothing downstream can notice. Layout components are excluded
  // because a layout component is a container by design and draws nothing of its own.
  if (
    isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_DRAWABLE_TYPE_KEY) &&
    !isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_LAYOUT_COMPONENT_TYPE_KEY)
  ) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'rive.drawable-kind-unsupported',
      'createRiveDisplayNode',
      { typeKey: object.typeKey },
    );
  }
  return createDisplayObject({ name });
}

// Regenerates one shape's whole command stream from the current property values.
function rebuildRiveShape(
  shape: Shape,
  artboard: Readonly<RiveArtboardGraph>,
  shapeIndex: number,
  shapePaths: Map<number, RivePathRecord[]>,
  diagnostics: ImportDiagnostic[] | undefined,
): void {
  const records: RivePathRecord[] = [];
  for (const pathIndex of shapePaths.get(shapeIndex)?.map((record) => record.pathIndex) ?? []) {
    // No sink here on purpose. This regenerates a shape from current property values on update, so it
    // runs again per animated frame — passing the sink would report the same unsupported path once per
    // rebuild. The import-time call above carries it.
    const record = createRivePathRecord(artboard, pathIndex, undefined);
    if (record !== null) records.push(record);
  }
  shapePaths.set(shapeIndex, records);
  clearShapeCommands(shape);
  appendRiveShapePaint(shape, artboard, shapeIndex, records, diagnostics);
}

function collectRivePathGeometry(
  shapePaths: Map<number, RivePathRecord[]>,
  artboard: Readonly<RiveArtboardGraph>,
  index: number,
  diagnostics: ImportDiagnostic[] | undefined,
): void {
  // A path is always a shape's direct child: the shape owns the paint and the fill rule, so a path
  // with no shape ancestor has nothing to draw it. That makes this a malformed file rather than a
  // shape of the format. It still crumbs instead of vanishing, because the geometry leaves no trace.
  const owner = findRiveShapeOwner(artboard, index);
  if (owner < 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'rive.path-outside-shape',
      'collectRivePathGeometry',
      { index },
    );
    return;
  }
  const record = createRivePathRecord(artboard, index, diagnostics);
  if (record === null) return;
  const records = shapePaths.get(owner) ?? [];
  records.push(record);
  shapePaths.set(owner, records);
}

// One path's geometry in its owning shape's space. Read fresh each time so an animated vertex,
// radius or size shows up without any cached state to invalidate.
function createRivePathRecord(
  artboard: Readonly<RiveArtboardGraph>,
  index: number,
  diagnostics: ImportDiagnostic[] | undefined,
): RivePathRecord | null {
  const source = artboard.objects[index];
  const path = createRivePath(source, artboard, index, diagnostics);
  // An empty result is the file's own doing: a points path may legitimately state no vertices.
  if (path === null || path.commands.length === 0) return null;

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
  return { commands: path.commands.slice(), data, pathIndex: index, winding: path.winding };
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

/**
 * Splits a drawable's blend mode across the two tiers Flight deliberately keeps apart.
 *
 * `BlendMode` is the fixed-function set that folds into blend state. The destination-reading and
 * non-separable modes cannot, so they are `AdvancedBlendMode` realized through a `BlendEffect` that
 * bounces through an offscreen. Assigning one to `node.blendMode` and getting a silent Normal is
 * precisely the bug that split exists to prevent, so those modes are reported for the caller to apply
 * rather than quietly dropped — import never attaches an effect itself.
 */
function applyRiveBlendMode(
  target: DisplayObject,
  source: Readonly<RiveCoreObject>,
  advanced: RiveAdvancedBlend[],
): void {
  if (!isRiveCoreTypeDerivedFrom(source.typeKey, RIVE_DRAWABLE_TYPE_KEY)) return;
  const value = readRiveNumber(source, RIVE_BLEND_MODE, RIVE_BLEND_SRC_OVER);
  const fixed = RIVE_FIXED_BLEND_MODES.get(value);
  if (fixed !== undefined) {
    target.blendMode = fixed;
    return;
  }
  target.blendMode = BlendMode.Normal;
  const mode = RIVE_ADVANCED_BLEND_MODES.get(value);
  if (mode !== undefined) advanced.push({ mode, node: target });
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
const RIVE_DRAWABLE_TYPE_KEY = 13;
const RIVE_LAYOUT_COMPONENT_TYPE_KEY = 409;
const RIVE_NSLICED_NODE_TYPE_KEY = 508;
const RIVE_TEXT_TYPE_KEY = 134;
const RIVE_IMAGE_TYPE_KEY = 100;
const RIVE_NESTED_ARTBOARD_TYPE_KEY = 92;
const RIVE_IMAGE_ASSET_ID = 206;
const RIVE_NESTED_ARTBOARD_ID = 197;
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
const RIVE_BLEND_MODE = 23;
const RIVE_BLEND_SRC_OVER = 3;

// The modes that fold into blend state.
const RIVE_FIXED_BLEND_MODES = new Map<number, string>([
  [3, BlendMode.Normal],
  [14, BlendMode.Screen],
  [16, BlendMode.Darken],
  [17, BlendMode.Lighten],
  [24, BlendMode.Multiply],
]);

// The modes that must bounce through an offscreen, keyed by Rive's own numbering.
const RIVE_ADVANCED_BLEND_MODES = new Map<number, string>([
  [15, AdvancedBlendMode.Overlay],
  [18, AdvancedBlendMode.ColorDodge],
  [19, AdvancedBlendMode.ColorBurn],
  [20, AdvancedBlendMode.HardLight],
  [21, AdvancedBlendMode.SoftLight],
  [22, AdvancedBlendMode.Difference],
  [23, AdvancedBlendMode.Exclusion],
  [25, AdvancedBlendMode.Hue],
  [26, AdvancedBlendMode.Saturation],
  [27, AdvancedBlendMode.Color],
  [28, AdvancedBlendMode.Luminosity],
]);
