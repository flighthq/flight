import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Awd2BlockDispatch,
  Awd2BlockHandler,
  Awd2ParseState,
  EntityConstruction,
  ImportDiagnostic,
  Scene3DDocument,
} from '@flighthq/types/contract';

// Expanding a handler array into the table the block walk runs on. This module imports no handler,
// which is what makes the boundary structural rather than a favour from a tree shaker: the importer
// reaches only this file, so a build that names its own handlers has no handler it did not name anywhere
// in its module graph. `awd2AllBlockHandlers`, which does name all six families, is in a file of its own
// for exactly that reason.

// The empty state one import fills. Every named handler writes into the same object, because the
// format's cross-references are between families: a mesh instance names a geometry and a material block,
// a pose names a skeleton. A handler that was not named leaves its map empty and those lookups resolve
// to nothing, which is the same miss an absent block produces.
export function createAwd2ParseState(
  document: Scene3DDocument,
  source: Uint8Array,
  view: DataView,
  diagnostics: ImportDiagnostic[] | undefined,
): Awd2ParseState {
  const out = allocateEntity<Awd2ParseState>();
  initializeAwd2ParseState(out, document, source, view, diagnostics);
  return finishEntity(out);
}

// Expands a handler array into the flat block-type table the walk dispatches through. Built once per
// import rather than per block, so the per-block cost is a single lookup however many handlers are
// named. A block type claimed by more than one handler resolves to the last one named, which lets a
// caller override a stock handler by appending their own.
export function expandAwd2BlockDispatch(blocks: readonly Awd2BlockHandler[]): Awd2BlockDispatch {
  const dispatch = new Map<number, Readonly<Awd2BlockHandler>>();
  for (const handler of blocks) {
    for (const blockType of handler.blockTypes) dispatch.set(blockType, handler);
  }
  return dispatch;
}

export function initializeAwd2ParseState(
  out: EntityConstruction<Awd2ParseState>,
  document: Scene3DDocument,
  source: Uint8Array,
  view: DataView,
  diagnostics: ImportDiagnostic[] | undefined,
): void {
  Object.assign(out, {
    cameras: new Map(),
    containers: new Map(),
    diagnostics,
    document,
    geometries: new Map(),
    lightPickers: new Map(),
    lights: new Map(),
    materials: new Map(),
    meshInstances: new Map(),
    nodeIndexForBlock: new Map(),
    resolveMaterial: null,
    skeletonAnimations: new Map(),
    skeletonJointNodeIndices: [],
    skeletonPoses: new Map(),
    skeletons: new Map(),
    skinIndex: undefined,
    source,
    textures: new Map(),
    view,
  });
}
