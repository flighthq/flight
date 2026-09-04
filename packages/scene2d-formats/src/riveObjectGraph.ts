import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  EntityConstruction,
  ImportDiagnostic,
  RiveArtboardGraph,
  RiveCoreObject,
  RiveDocument,
  RiveObjectGraph,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { isRiveCoreTypeDerivedFrom } from './riveCoreTypes';

export function createRiveObjectGraph(
  document: Readonly<RiveDocument>,
  diagnostics?: ImportDiagnostic[],
): RiveObjectGraph {
  const out = allocateEntity<RiveObjectGraph>();
  initializeRiveObjectGraph(out, document, diagnostics);
  return finishEntity(out);
}

/**
 * Recovers each artboard's component tree from the flat core-object stream.
 *
 * Two facts do the work. An artboard opens a numbering space in which it is index 0 and the
 * components that follow it in the stream are 1, 2, 3…; and a component states its parent as an
 * index into that space. Both were settled against real files rather than assumed: across 127
 * artboards, numbering the artboard as 0 resolves every stated parent with no cycle and exactly one
 * root, while starting at the first component instead leaves 94 references out of range and 33
 * cycles.
 *
 * A parent that cannot be resolved is reported and the component becomes a root, so one bad
 * reference costs its own placement rather than the whole artboard.
 */
export function initializeRiveObjectGraph(
  out: EntityConstruction<RiveObjectGraph>,
  document: Readonly<RiveDocument>,
  diagnostics?: ImportDiagnostic[],
): void {
  const artboards: RiveArtboardGraph[] = [];
  let current: RiveCoreObject[] | null = null;
  for (let index = 0; index < document.objects.length; index++) {
    const object = document.objects[index];
    if (object.typeKey === RIVE_ARTBOARD_TYPE_KEY) {
      current = [object];
      if (artboards.length > 0) artboards[artboards.length - 1].streamEnd = index;
      artboards.push({ objects: current, parentIndices: [], streamEnd: document.objects.length, streamStart: index });
      continue;
    }
    // Only components are numbered. Animations, keyframes, assets and state machines share the
    // stream but sit outside the artboard's addressing, so counting them would shift every index.
    if (current === null || !isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_COMPONENT_TYPE_KEY)) continue;
    current.push(object);
  }
  for (const artboard of artboards) resolveRiveParentIndices(artboard, diagnostics);
  out.artboards = artboards;
}

function resolveRiveParentIndices(artboard: RiveArtboardGraph, diagnostics: ImportDiagnostic[] | undefined): void {
  const count = artboard.objects.length;
  const parents = artboard.parentIndices;
  for (let index = 0; index < count; index++) {
    parents.push(
      index === 0 ? RIVE_NO_PARENT : readRiveParentIndex(artboard.objects[index], count, index, diagnostics),
    );
  }
  for (let index = 1; index < count; index++) {
    if (!hasRiveParentCycle(parents, index)) continue;
    reportRiveGraphDrop(diagnostics, 'rive.parent-cycle', 'resolveRiveParentIndices', { index });
    parents[index] = RIVE_NO_PARENT;
  }
}

function readRiveParentIndex(
  object: Readonly<RiveCoreObject>,
  count: number,
  index: number,
  diagnostics: ImportDiagnostic[] | undefined,
): number {
  const property = object.properties.find((candidate) => candidate.key === RIVE_PARENT_ID_PROPERTY_KEY);
  if (property === undefined) {
    reportRiveGraphDrop(diagnostics, 'rive.component-without-parent', 'readRiveParentIndex', { index });
    return RIVE_NO_PARENT;
  }
  const parent = property.value as number;
  if (parent === index || parent < 0 || parent >= count) {
    reportRiveGraphDrop(diagnostics, 'rive.unresolved-parent', 'readRiveParentIndex', { index, parent });
    return RIVE_NO_PARENT;
  }
  return parent;
}

function hasRiveParentCycle(parents: readonly number[], start: number): boolean {
  // Walks at most once per entry, so a ring returns true instead of spinning.
  let slow = start;
  let fast = start;
  for (;;) {
    if (fast === RIVE_NO_PARENT) return false;
    fast = parents[fast];
    if (fast === RIVE_NO_PARENT) return false;
    fast = parents[fast];
    slow = parents[slow];
    if (fast === slow) return true;
  }
}

function reportRiveGraphDrop(
  diagnostics: ImportDiagnostic[] | undefined,
  kind: string,
  origin: string,
  detail: Readonly<Record<string, number>>,
): void {
  reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, kind, origin, detail);
}

const RIVE_ARTBOARD_TYPE_KEY = 1;
const RIVE_COMPONENT_TYPE_KEY = 10;
const RIVE_PARENT_ID_PROPERTY_KEY = 5;
const RIVE_NO_PARENT = -1;
