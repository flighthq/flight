import type {
  Awd2BlockDispatch,
  Awd2BlockHandler,
  Awd2BlockRegistry,
  Awd2ParseState,
  ImportDiagnostic,
  Scene3DDocument,
} from '@flighthq/types/contract';

// Turning a registry into the table the block walk runs on, and the order its phases run in. This module
// imports no handler, which is what makes the boundary structural rather than a favour from a tree
// shaker: the importer reaches only this file, so a build that assembles its own registry has no handler
// it did not name anywhere in its module graph. `createAwd2DefaultBlockRegistry`, which does name all
// six, is in a file of its own for exactly that reason.

// The order handlers are consulted in, and the order their build phases run.
//
// This order is load-bearing, unlike the SWF families' — AWD2's build phases genuinely depend on each
// other. Materials install the resolver scene structure reads. The skeleton builds its joint nodes and
// skin before mesh instances can bind to them. Scene structure creates the document nodes that lighting
// and camera parent themselves to. Reordering it silently produces a document with unparented lights or
// unskinned meshes, so it lives here as one declaration rather than as an emergent property of six files.
export const AWD2_BLOCK_BUILD_ORDER = [
  'materials',
  'skeleton',
  'geometry',
  'sceneStructure',
  'lighting',
  'camera',
] as const satisfies readonly (keyof Awd2BlockRegistry)[];

// Composes several block-type primitives into one family for a registry slot. The family claims the union
// of their block types and runs each part's build in order; the walk still dispatches to the parts.
export function composeAwd2BlockHandlers(...parts: readonly Awd2BlockHandler[]): Awd2BlockHandler {
  return {
    blockTypes: parts.flatMap((part) => [...part.blockTypes]),
    parts,
    parse(state, block) {
      for (const part of parts) {
        if (part.blockTypes.includes(block.blockType)) {
          part.parse(state, block);
          return;
        }
      }
    },
    build(state) {
      for (const part of parts) part.build?.(state);
    },
  };
}

// Expands every registered handler's block-type list into one flat table, once per import, so the
// per-block cost of the walk is a single lookup however many handlers are registered.
//
// A family resolves to its PARTS rather than to itself, so the walk dispatches to the primitive that owns
// a block type. That is what keeps `deferred` a plain per-handler flag: the skeleton family holds one
// handler read on the first pass and two read on the second, and the walk reads each part's own flag.
export function createAwd2BlockDispatch(registry: Readonly<Awd2BlockRegistry>): Awd2BlockDispatch {
  const dispatch = new Map<number, Readonly<Awd2BlockHandler>>();
  for (const handler of getAwd2BlockHandlers(registry)) {
    for (const part of handler.parts ?? [handler]) {
      for (const blockType of part.blockTypes) dispatch.set(blockType, part);
    }
  }
  return dispatch;
}

// The empty state one import fills. Every registered handler writes into the same object, because the
// format's cross-references are between families: a mesh instance names a geometry and a material block,
// a pose names a skeleton. A family that was not registered leaves its map empty and those lookups
// resolve to nothing, which is the same miss an absent block produces.
export function createAwd2ParseState(
  document: Scene3DDocument,
  source: Uint8Array,
  view: DataView,
  diagnostics: ImportDiagnostic[] | undefined,
): Awd2ParseState {
  return {
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
  };
}

// The registered handlers, in build order. Skipping the empty slots here is what keeps every later phase
// a plain iteration.
export function getAwd2BlockHandlers(registry: Readonly<Awd2BlockRegistry>): Readonly<Awd2BlockHandler>[] {
  const handlers: Readonly<Awd2BlockHandler>[] = [];
  for (const slot of AWD2_BLOCK_BUILD_ORDER) {
    const handler = registry[slot];
    if (handler !== undefined && handler !== null) handlers.push(handler);
  }
  return handlers;
}
