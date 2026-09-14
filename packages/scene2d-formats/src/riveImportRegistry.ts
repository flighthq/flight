import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  DisplayObject,
  EntityConstruction,
  ImportDiagnostic,
  RiveArtboardGraph,
  RiveArtboardImportContext,
  RiveCoreObject,
  RiveCoreObjectHandler,
  RiveDocumentImportContext,
  RiveImportRegistry,
} from '@flighthq/types/contract';

import { getRiveCoreTypeParent } from './riveCoreTypes';

/**
 * Runs every registered artboard pass, once each, in registration order.
 *
 * A family may register one importer object under several type keys — a paint family covers fills,
 * strokes, gradients and their stops with the same handler — so passes are run per distinct importer
 * rather than per key, and registering a wider family never runs its pass twice.
 */
export function applyRiveArtboardHandlers(context: RiveArtboardImportContext): void {
  const applied = new Set<RiveCoreObjectHandler>();
  for (const importer of context.registry.handlers.values()) {
    if (importer.applyArtboard === undefined || applied.has(importer)) continue;
    applied.add(importer);
    importer.applyArtboard(context);
  }
}

/** Runs every registered document pass, once each, in registration order. */
export function applyRiveDocumentHandlers(context: RiveDocumentImportContext): void {
  const applied = new Set<RiveCoreObjectHandler>();
  for (const importer of context.registry.handlers.values()) {
    if (importer.applyDocument === undefined || applied.has(importer)) continue;
    applied.add(importer);
    importer.applyDocument(context);
  }
}

export function createRiveArtboardImportContext(
  registry: RiveImportRegistry,
  artboard: RiveArtboardGraph,
  objects: readonly Readonly<RiveCoreObject>[],
  root: DisplayObject,
  fontNames: readonly string[],
  diagnostics?: ImportDiagnostic[],
): RiveArtboardImportContext {
  const out = allocateEntity<RiveArtboardImportContext>();
  initializeRiveArtboardImportContext(out, registry, artboard, objects, root, fontNames, diagnostics);
  return finishEntity(out);
}

export function createRiveDocumentImportContext(
  registry: RiveImportRegistry,
  objects: readonly Readonly<RiveCoreObject>[],
  diagnostics?: ImportDiagnostic[],
): RiveDocumentImportContext {
  const out = allocateEntity<RiveDocumentImportContext>();
  initializeRiveDocumentImportContext(out, registry, objects, diagnostics);
  return finishEntity(out);
}

export function createRiveImportRegistry(): RiveImportRegistry {
  const out = allocateEntity<RiveImportRegistry>();
  initializeRiveImportRegistry(out);
  return finishEntity(out);
}

/**
 * The importer for `typeKey`, or for the nearest type it inherits from, or `null` when the file's
 * type is one this registry does not understand.
 *
 * Resolving up the chain is the whole point of keying by type: a `Star` is a `Polygon` is a
 * `ParametricPath` is a `Path`, so one registration for `Path` imports every parametric shape the
 * editor can author, including ones added after this code was written. The nearest registration wins,
 * which is what lets a narrower family — `Text` among drawables — override a wider one.
 */
export function getRiveCoreObjectHandler(
  registry: Readonly<RiveImportRegistry>,
  typeKey: number,
): RiveCoreObjectHandler | null {
  let current: number | undefined = typeKey;
  while (current !== undefined && current !== RIVE_NO_PARENT) {
    const importer = registry.handlers.get(current);
    if (importer !== undefined) return importer;
    current = getRiveCoreTypeParent(current);
  }
  return null;
}

/**
 * The importer for a core type that is read by the object above it and becomes no display object of
 * its own — a fill, a gradient stop, a clipping shape, a bone, a draw rule.
 *
 * Registering one of these is not a no-op even though it contributes nothing: an object with no
 * importer at all is reported as a type this import does not read, and these are read.
 */
export function importRiveCoreObjectAsData(): null {
  return null;
}

export function initializeRiveArtboardImportContext(
  out: EntityConstruction<RiveArtboardImportContext>,
  registry: RiveImportRegistry,
  artboard: RiveArtboardGraph,
  objects: readonly Readonly<RiveCoreObject>[],
  root: DisplayObject,
  fontNames: readonly string[],
  diagnostics?: ImportDiagnostic[],
): void {
  out.advancedBlends = [];
  out.artboard = artboard;
  out.diagnostics = diagnostics;
  out.fontNames = fontNames;
  out.layouts = [];
  out.nodes = [root];
  out.objects = objects;
  out.rebuilds = new Map<number, () => void>();
  out.registry = registry;
  out.root = root;
  out.shapePaths = new Map();
  out.skeleton = null;
  out.stateMachines = [];
}

export function initializeRiveDocumentImportContext(
  out: EntityConstruction<RiveDocumentImportContext>,
  registry: RiveImportRegistry,
  objects: readonly Readonly<RiveCoreObject>[],
  diagnostics?: ImportDiagnostic[],
): void {
  out.assets = [];
  out.diagnostics = diagnostics;
  out.objects = objects;
  out.registry = registry;
}

export function initializeRiveImportRegistry(out: EntityConstruction<RiveImportRegistry>): void {
  out.handlers = new Map<number, RiveCoreObjectHandler>();
}

/**
 * Installs one importer for a core type and every type derived from it.
 *
 * Last registration for a key wins, and a key registered again keeps its original position in the
 * pass order, so replacing one family's handler does not reshuffle the sequence around it. A caller
 * adding support for a type Flight does not read registers it here rather than editing this package.
 */
export function registerRiveCoreObjectHandler(
  registry: RiveImportRegistry,
  typeKey: number,
  importer: RiveCoreObjectHandler,
): void {
  registry.handlers.set(typeKey, importer);
}

const RIVE_NO_PARENT = -1;
