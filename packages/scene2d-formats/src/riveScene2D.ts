import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { RAD_TO_DEG } from '@flighthq/math/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  DisplayObject,
  EntityConstruction,
  HostPathBooleanProvider,
  ImportDiagnostic,
  RiveAdvancedBlend,
  RiveArtboardGraph,
  RiveArtboardImport,
  RiveArtboardImportContext,
  RiveCoreObject,
  RiveDocumentImportResult,
  RiveImportRegistry,
} from '@flighthq/types/contract';
import { AdvancedBlendMode, BlendMode, ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { createRiveAnimationClips } from './riveAnimation';
import { isRiveCoreTypeDerivedFrom } from './riveCoreTypes';
import { parseRiveDocument } from './riveDocument';
import { registerAllRiveHandlers } from './riveHandlers';
import {
  applyRiveArtboardHandlers,
  applyRiveDocumentHandlers,
  createRiveArtboardImportContext,
  createRiveDocumentImportContext,
  createRiveImportRegistry,
  getRiveCoreObjectHandler,
} from './riveImportRegistry';
import { createRiveObjectGraph } from './riveObjectGraph';

/**
 * Imports a `.riv` into one display subtree per artboard, reading exactly the core types `registry`
 * understands.
 *
 * A Rive file holds several artboards and names none of them "the" one, so import returns them side
 * by side and leaves the choice to the caller. What each object in the stream becomes is the
 * registry's answer rather than this function's: only a registered type contributes, and a type with
 * no handler is reported instead of quietly becoming an empty container. That is what lets a caller
 * import geometry without paint, or a document without its state machines, and pay for neither.
 */
export function createRiveDocumentImportResult(
  registry: RiveImportRegistry,
  source: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
): RiveDocumentImportResult {
  const out = allocateEntity<RiveDocumentImportResult>();
  const document = parseRiveDocument(source, diagnostics);
  if (document === null) {
    initializeRiveDocumentImportResult(out, [], []);
    return finishEntity(out);
  }

  const graph = createRiveObjectGraph(document, diagnostics);
  const file = createRiveDocumentImportContext(registry, document.objects, diagnostics);
  applyRiveDocumentHandlers(file);
  // A text style names its typeface by a position in the asset list, the same space an image
  // drawable's assetId indexes, so the names are resolved once here rather than per drawable.
  const fontNames = file.assets.map((asset) => asset.name);
  initializeRiveDocumentImportResult(
    out,
    graph.artboards.map((artboard) =>
      createRiveArtboardImport(registry, artboard, document.objects, fontNames, diagnostics),
    ),
    file.assets,
  );
  return finishEntity(out);
}

/**
 * Imports a `.riv` with every family this package reads — the whole format, in one call.
 *
 * This is the zero-configuration path and it costs the whole importer by construction. Building the
 * registry directly and registering only the families you need is the same import with the rest shaken
 * out; see `registerAllRiveHandlers` for what this installs and in what order.
 */
export function createScene2DFromRiveDocument(
  pathBoolean: Readonly<HostPathBooleanProvider>,
  source: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
): RiveDocumentImportResult {
  const registry = createRiveImportRegistry();
  registerAllRiveHandlers(pathBoolean, registry);
  return createRiveDocumentImportResult(registry, source, diagnostics);
}

export function initializeRiveDocumentImportResult(
  out: EntityConstruction<RiveDocumentImportResult>,
  artboards: RiveDocumentImportResult['artboards'],
  assets: RiveDocumentImportResult['assets'],
): void {
  out.artboards = artboards;
  out.assets = assets;
}

function createRiveArtboardImport(
  registry: RiveImportRegistry,
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

  const context = createRiveArtboardImportContext(registry, artboard, objects, root, fontNames, diagnostics);
  // Index 0 is the artboard itself, already standing as the root.
  for (let index = 1; index < artboard.objects.length; index++) context.nodes.push(importRiveComponent(context, index));
  applyRiveArtboardHandlers(context);

  const span = { end: artboard.streamEnd, start: artboard.streamStart };
  const animations = createRiveAnimationClips(
    objects,
    span,
    context.nodes,
    artboard,
    context.rebuilds,
    context.skeleton,
  );
  return {
    advancedBlends: context.advancedBlends,
    animations,
    height,
    layouts: context.layouts,
    name,
    root,
    skeleton: context.skeleton,
    stateMachines: context.stateMachines,
    width,
  };
}

/**
 * Turns one component into whatever the registry says it is, and places it in the display tree.
 *
 * A node is attached to its nearest ancestor that also became a node; components in between, such as
 * a Shape's paint, hold no place in the display tree. Transform and blend mode are applied here
 * rather than by each handler, because they are properties of the component itself and every node
 * carries them whatever kind it is.
 */
function importRiveComponent(context: RiveArtboardImportContext, index: number): DisplayObject | null {
  const object = context.artboard.objects[index];
  const handler = getRiveCoreObjectHandler(context.registry, object.typeKey);
  const node =
    handler === null
      ? createRiveUnregisteredNode(context, object)
      : (handler.importComponent?.(context, index) ?? null);
  if (node === null) return null;
  applyRiveTransform(node, object);
  applyRiveBlendMode(node, object, context.advancedBlends);
  addNodeChild(findRiveDisplayParent(context.nodes, context.artboard.parentIndices, index) ?? context.root, node);
  return node;
}

/**
 * What becomes of a component no registered family claims.
 *
 * A Node with no handler is still a container, and containers are what plain nodes are, so it imports
 * silently and keeps its name, transform and children. Anything else is a gap worth naming: a
 * DRAWABLE reaching here authored something that paints and becomes an empty container that still
 * holds its place, so the tree keeps its shape and only the pixels are missing — nothing downstream
 * can notice. A component that is not a node at all carried data — a constraint, a mesh, a binding —
 * that this import read nothing of, and it vanishes without even an empty node to mark it.
 */
function createRiveUnregisteredNode(
  context: RiveArtboardImportContext,
  object: Readonly<RiveCoreObject>,
): DisplayObject | null {
  if (!isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_NODE_TYPE_KEY)) {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Skip,
      'rive.core-type-unregistered',
      'createRiveUnregisteredNode',
      { typeKey: object.typeKey },
    );
    return null;
  }
  if (isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_DRAWABLE_TYPE_KEY)) {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'rive.drawable-kind-unsupported',
      'createRiveUnregisteredNode',
      { typeKey: object.typeKey },
    );
  }
  return createDisplayObject({ name: readRiveText(object, RIVE_NAME, '') });
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
const RIVE_DRAWABLE_TYPE_KEY = 13;

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
