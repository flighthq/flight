import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Awd2BlockDispatch,
  Awd2BlockHandler,
  Awd2BlockRegistry,
  Awd2ParseState,
  EntityConstruction,
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

// A registry carrying exactly the handlers the caller names, expanded into its flat table at
// construction. Slots left out stay empty, and everything behind them is absent from the build.
export function createAwd2BlockRegistry(handlers: Readonly<Partial<Awd2BlockRegistry>> = {}): Awd2BlockRegistry {
  const out = allocateEntity<Awd2BlockRegistry>();
  initializeAwd2BlockRegistry(out, handlers);
  return finishEntity(out);
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
  const out = allocateEntity<Awd2ParseState>();
  initializeAwd2ParseState(out, document, source, view, diagnostics);
  return finishEntity(out);
}

// The flat block-type table this registry was expanded into when it was built.
export function getAwd2BlockDispatch(registry: Readonly<Awd2BlockRegistry>): Awd2BlockDispatch {
  return registry.dispatch;
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

export function initializeAwd2BlockRegistry(
  out: EntityConstruction<Awd2BlockRegistry>,
  handlers: Readonly<Partial<Awd2BlockRegistry>>,
): void {
  const dispatch = new Map<number, Readonly<Awd2BlockHandler>>();
  for (const slot of AWD2_BLOCK_BUILD_ORDER) {
    const handler = handlers[slot] ?? null;
    out[slot] = handler;
    // Expanding here rather than per import is what makes "the table is built once" a property of the
    // registry rather than a convention every caller has to keep. A family resolves to its PARTS, so the
    // walk dispatches to the primitive that owns a block type and reads that part's own `deferred` flag.
    if (handler !== null) {
      for (const part of handler.parts ?? [handler]) {
        for (const blockType of part.blockTypes) dispatch.set(blockType, part);
      }
    }
  }
  out.dispatch = dispatch;
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
