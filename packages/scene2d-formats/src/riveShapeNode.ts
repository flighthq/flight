import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import { clearShapeCommands, createShape } from '@flighthq/shape/contract';
import type {
  DisplayObject,
  ImportDiagnostic,
  RiveArtboardImportContext,
  RiveCoreObject,
  RiveImportRegistry,
  RivePathRecord,
  Shape,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { getRiveCoreObjectHandler, registerRiveCoreObjectHandler } from './riveImportRegistry.ts';
import { appendRiveShapeGeometry, appendRiveShapePaint } from './riveShapePaint.ts';
import { createRivePathRecord } from './riveShapePath.ts';

/**
 * A nine-sliced node scales a child with fixed corners; imported as a plain container it keeps the
 * child and loses the slicing.
 *
 * At the authored size the two are identical, which is what hides it — the difference only appears
 * once a layout resizes the node, and then the corners stretch.
 */
export function importRiveNSlicedNodeComponent(
  context: RiveArtboardImportContext,
  index: number,
): DisplayObject | null {
  const object = context.artboard.objects[index];
  reportImportDiagnostic(
    context.diagnostics,
    ImportDiagnosticSeverity.Recover,
    'rive.nine-slice-substituted',
    'importRiveNSlicedNodeComponent',
    { substitutedAs: 'container', typeKey: object.typeKey },
  );
  return createDisplayObject({ name: readRiveShapeName(object) });
}

/** A shape carries its children's geometry as one command stream, filled once the artboard is read. */
export function importRiveShapeComponent(context: RiveArtboardImportContext, index: number): DisplayObject | null {
  return createShape({ name: readRiveShapeName(context.artboard.objects[index]) });
}

/**
 * Builds every shape's command stream, and stores how to build it again.
 *
 * This runs after the artboard's components have been walked because a shape's paths and paints are
 * its children: the path list is only complete once the subtree has been read. Each shape keeps its
 * rebuild as a closure over the same readers, which is what lets one animation binder serve vertices,
 * radii, colours and stroke widths alike — an animated property is written onto the core object and
 * the shape is built again from it, with nothing cached in between to invalidate.
 */
export function rebuildRiveShapes(context: RiveArtboardImportContext): void {
  for (const shapeIndex of context.shapePaths.keys()) {
    const shape = context.nodes[shapeIndex];
    if (shape === null || shape === undefined) continue;
    context.rebuilds.set(shapeIndex, (): void => rebuildRiveShape(context, shapeIndex, shape as Shape, undefined));
    // The stored closure and the first build are the same work but not the same call: only this one
    // carries the sink. The closure runs again per animated frame, so a sink passed there would report
    // the same substitution once per frame — diagnostics describe the import, not the playback.
    rebuildRiveShape(context, shapeIndex, shape as Shape, context.diagnostics);
  }
}

/**
 * Registers the drawable nodes that carry their own geometry: `Shape`, and the nine-sliced node that
 * substitutes for one.
 *
 * The shape family also owns the pass that fills those shapes in, so registering it without the path
 * family produces shapes with no geometry, and without the paint family produces geometry with no
 * paint. Parametric shapes — rectangles, ellipses, stars — are not registered here: in Rive's object
 * model they are paths, and they belong to the path family.
 */
export function registerRiveShapeHandlers(registry: RiveImportRegistry): void {
  registerRiveCoreObjectHandler(registry, RIVE_SHAPE, {
    applyArtboard: rebuildRiveShapes,
    importComponent: importRiveShapeComponent,
  });
  registerRiveCoreObjectHandler(registry, RIVE_NSLICED_NODE, { importComponent: importRiveNSlicedNodeComponent });
}

// Regenerates one shape's whole command stream from the current property values.
function rebuildRiveShape(
  context: RiveArtboardImportContext,
  shapeIndex: number,
  shape: Shape,
  diagnostics: ImportDiagnostic[] | undefined,
): void {
  const records: RivePathRecord[] = [];
  for (const pathIndex of context.shapePaths.get(shapeIndex)?.map((record) => record.pathIndex) ?? []) {
    // No sink here on purpose: this reads the paths again on every rebuild, so a sink would report the
    // same unsupported path once per animated frame. The import-time call carries it.
    const record = createRivePathRecord(context.artboard, pathIndex, undefined);
    if (record !== null) records.push(record);
  }
  context.shapePaths.set(shapeIndex, records);
  clearShapeCommands(shape);
  // Paint is a family of its own, so a caller that registered geometry alone gets geometry alone
  // rather than a shape that silently draws nothing.
  if (getRiveCoreObjectHandler(context.registry, RIVE_SHAPE_PAINT) === null) {
    appendRiveShapeGeometry(shape, records);
    return;
  }
  appendRiveShapePaint(shape, context.artboard, shapeIndex, records, diagnostics);
}

function readRiveShapeName(source: Readonly<RiveCoreObject>): string {
  const property = source.properties.find((candidate) => candidate.key === RIVE_NAME);
  return property === undefined || typeof property.value !== 'string' ? '' : property.value;
}

const RIVE_SHAPE = 3;
const RIVE_SHAPE_PAINT = 21;
const RIVE_NSLICED_NODE = 508;

const RIVE_NAME = 4;
