import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Awd2BlockHandler, Awd2ParseState } from '@flighthq/types/contract';

import { expandAwd2BlockDispatch, createAwd2ParseState, initializeAwd2ParseState } from './awd2BlockDispatch';
import { awd2AllBlockHandlers } from './awd2BlockRegistry';

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

describe('expandAwd2BlockDispatch', () => {
  it('maps every block type a handler claims to that handler', () => {
    const geometry = handler([1, 2], 'geometry');
    const camera = handler([3], 'camera');
    const dispatch = expandAwd2BlockDispatch([geometry, camera]);
    expect(dispatch.get(1)).toBe(geometry);
    expect(dispatch.get(2)).toBe(geometry);
    expect(dispatch.get(3)).toBe(camera);
  });

  it('claims nothing for an empty handler array', () => {
    expect(expandAwd2BlockDispatch([]).size).toBe(0);
  });

  it('leaves a block type nobody claims absent, which is what the walk skips on', () => {
    expect(expandAwd2BlockDispatch([handler([1], 'geometry')]).has(99)).toBe(false);
  });

  it('resolves a contested block type to the last handler named, so a caller can override by appending', () => {
    const stock = handler([5], 'stock');
    const override = handler([5], 'override');
    expect(expandAwd2BlockDispatch([stock, override]).get(5)).toBe(override);
    // ...and the reverse order proves the rule is order, not a preference for the custom handler.
    expect(expandAwd2BlockDispatch([override, stock]).get(5)).toBe(stock);
  });

  it('expands the full preset with no block type claimed twice', () => {
    const claimed = awd2AllBlockHandlers.flatMap((entry) => [...entry.blockTypes]);
    expect(new Set(claimed).size).toBe(claimed.length);
    expect(expandAwd2BlockDispatch(awd2AllBlockHandlers).size).toBe(claimed.length);
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
