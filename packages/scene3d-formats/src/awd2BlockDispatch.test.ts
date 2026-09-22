import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Awd2BlockHandler, Awd2BlockRegistry, Awd2ParseState } from '@flighthq/types/contract';

import {
  AWD2_BLOCK_BUILD_ORDER,
  composeAwd2BlockHandlers,
  createAwd2BlockRegistry,
  createAwd2ParseState,
  getAwd2BlockDispatch,
  getAwd2BlockHandlers,
  initializeAwd2BlockRegistry,
  initializeAwd2ParseState,
} from './awd2BlockDispatch';

describe('AWD2_BLOCK_BUILD_ORDER', () => {
  // The order is load-bearing, unlike a mere slot listing: materials install the resolver scene structure
  // reads, the skeleton builds the joints and skin meshes bind to, and scene structure creates the nodes
  // lighting and camera parent themselves to. Pinning it here is what makes a reorder a test failure
  // rather than a document with unparented lights.
  it('builds materials and the skeleton before scene structure, and placements after it', () => {
    const at = (slot: string): number => AWD2_BLOCK_BUILD_ORDER.indexOf(slot as never);
    expect(at('materials')).toBeLessThan(at('sceneStructure'));
    expect(at('skeleton')).toBeLessThan(at('sceneStructure'));
    expect(at('geometry')).toBeLessThan(at('sceneStructure'));
    expect(at('sceneStructure')).toBeLessThan(at('lighting'));
    expect(at('sceneStructure')).toBeLessThan(at('camera'));
  });

  it('names each of the six slots exactly once', () => {
    expect([...AWD2_BLOCK_BUILD_ORDER].sort()).toEqual([
      'camera',
      'geometry',
      'lighting',
      'materials',
      'sceneStructure',
      'skeleton',
    ]);
  });
});

describe('composeAwd2BlockHandlers', () => {
  it('claims the union of its parts block types', () => {
    const family = composeAwd2BlockHandlers(handler([1], 'a'), handler([2, 3], 'b'));
    expect([...family.blockTypes].sort()).toEqual([1, 2, 3]);
    expect(family.parts).toHaveLength(2);
  });

  it('routes a block to the part that claims its type', () => {
    const seen: string[] = [];
    const family = composeAwd2BlockHandlers(handler([1], 'a', seen), handler([2], 'b', seen));
    family.parse(state(), block(2));
    expect(seen).toEqual(['b']);
  });

  it('runs every part build, in order', () => {
    const built: string[] = [];
    const first: Awd2BlockHandler = { blockTypes: [1], parse: () => {}, build: () => built.push('a') };
    const second: Awd2BlockHandler = { blockTypes: [2], parse: () => {}, build: () => built.push('b') };
    composeAwd2BlockHandlers(first, second).build!(state());
    expect(built).toEqual(['a', 'b']);
  });

  it('ignores a block type none of its parts claims', () => {
    const seen: string[] = [];
    const family = composeAwd2BlockHandlers(handler([1], 'a', seen));
    expect(() => family.parse(state(), block(99))).not.toThrow();
    expect(seen).toEqual([]);
  });
});

describe('createAwd2BlockRegistry', () => {
  it('keeps the handlers it was given and leaves the rest empty', () => {
    const geometry = handler([1], 'geometry');
    const registry = createAwd2BlockRegistry({ geometry });
    expect(registry.geometry).toBe(geometry);
    expect(registry.camera).toBeNull();
    expect(registry.skeleton).toBeNull();
  });

  it('declares every slot, so an empty one reads as absent rather than as missing', () => {
    const registry = createAwd2BlockRegistry();
    for (const slot of AWD2_BLOCK_BUILD_ORDER) {
      expect(slot in registry, slot).toBe(true);
      expect(registry[slot], slot).toBeNull();
    }
  });

  // A family resolves to its PARTS, which is what lets `deferred` stay a plain per-handler flag: the
  // walk dispatches to the primitive that owns a block type and reads that part's own flag.
  it('expands a family to its parts rather than to the family', () => {
    const first = handler([1], 'a');
    const second = handler([2], 'b');
    const registry = createAwd2BlockRegistry({ skeleton: composeAwd2BlockHandlers(first, second) });
    expect(registry.dispatch.get(1)).toBe(first);
    expect(registry.dispatch.get(2)).toBe(second);
  });

  it('expands the table when the registry is built, not when it is first used', () => {
    const registry = createAwd2BlockRegistry({ geometry: handler([1, 2], 'geometry') });
    expect(registry.dispatch.size).toBe(2);
    expect(getAwd2BlockDispatch(registry)).toBe(registry.dispatch);
  });
});

describe('createAwd2ParseState', () => {
  it('starts every block map empty and every build slot unset', () => {
    const parseState = state();
    expect(parseState.geometries.size).toBe(0);
    expect(parseState.meshInstances.size).toBe(0);
    expect(parseState.nodeIndexForBlock.size).toBe(0);
    expect(parseState.resolveMaterial).toBeNull();
    expect(parseState.skinIndex).toBeUndefined();
    expect(parseState.skeletonJointNodeIndices).toEqual([]);
  });
});

describe('getAwd2BlockDispatch', () => {
  it('returns the table the registry was expanded into', () => {
    const registry = createAwd2BlockRegistry({ geometry: handler([7], 'geometry') });
    expect(getAwd2BlockDispatch(registry)).toBe(registry.dispatch);
  });
});

describe('getAwd2BlockHandlers', () => {
  it('returns the registered handlers in build order, skipping empty slots', () => {
    const geometry = handler([1], 'geometry');
    const camera = handler([2], 'camera');
    // Given in the opposite order to the build order, so a pass-through would fail this.
    expect(getAwd2BlockHandlers(createAwd2BlockRegistry({ camera, geometry }))).toEqual([geometry, camera]);
  });

  it('returns nothing for an empty registry', () => {
    expect(getAwd2BlockHandlers(createAwd2BlockRegistry())).toEqual([]);
  });
});

describe('initializeAwd2BlockRegistry', () => {
  it('is the construction initializer createAwd2BlockRegistry composes', () => {
    const geometry = handler([4], 'geometry');
    const out = allocateEntity<Awd2BlockRegistry>();
    initializeAwd2BlockRegistry(out, { geometry });
    const registry = finishEntity(out);
    expect(registry.geometry).toBe(geometry);
    expect(registry.dispatch.get(4)).toBe(geometry);
  });
});

describe('initializeAwd2ParseState', () => {
  it('is the construction initializer createAwd2ParseState composes', () => {
    const document = emptyDocument();
    const source = new Uint8Array(8);
    const out = allocateEntity<Awd2ParseState>();
    initializeAwd2ParseState(out, document, source, new DataView(source.buffer), undefined);
    const parseState = finishEntity(out);
    expect(parseState.document).toBe(document);
    expect(parseState.source).toBe(source);
  });
});

function block(blockType: number) {
  const source = new Uint8Array(4);
  return {
    blockId: 1,
    blockType,
    dataEnd: 4,
    dataStart: 0,
    geometryWide: false,
    matrixWide: false,
    source,
    view: new DataView(source.buffer),
  };
}

// A distinct object per handler, so a test asserting which one answered cannot be satisfied by another.
function handler(blockTypes: readonly number[], name: string, seen?: string[]): Awd2BlockHandler {
  return {
    blockTypes,
    parse: () => {
      seen?.push(name);
    },
  };
}

function emptyDocument() {
  return {
    animations: [],
    cameras: [],
    lights: [],
    materials: [],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [{ rootNodes: [] }],
    skins: [],
  };
}

function state(): Awd2ParseState {
  const source = new Uint8Array(8);
  return createAwd2ParseState(emptyDocument(), source, new DataView(source.buffer), undefined);
}
