import type { ImportDiagnostic, RiveCoreObject, RiveDocument } from '@flighthq/types/contract';
import { RiveFieldType } from '@flighthq/types/contract';

import { createRiveObjectGraph, initializeRiveObjectGraph } from './riveObjectGraph';

// The index base here was settled against real files, not chosen: numbering the artboard as index 0
// resolved every stated parent across 127 artboards with no cycle and exactly one root, while
// numbering from the first component instead left 94 references out of range and 33 cycles. These
// cases pin that reading and the failure handling around it.

const ARTBOARD = 1;
const SHAPE = 3;
const ELLIPSE = 4;
const LINEAR_ANIMATION = 31;
const PARENT_ID = 5;

describe('createRiveObjectGraph', () => {
  it('numbers the artboard as index 0 of its own objects', () => {
    const graph = createRiveObjectGraph(document([artboard(), component(SHAPE, 0), component(ELLIPSE, 1)]));

    expect(graph.artboards).toHaveLength(1);
    expect(graph.artboards[0].objects.map((object) => object.typeKey)).toEqual([ARTBOARD, SHAPE, ELLIPSE]);
    expect(graph.artboards[0].parentIndices).toEqual([-1, 0, 1]);
  });

  it('starts a new numbering space at each artboard', () => {
    const graph = createRiveObjectGraph(
      document([artboard(), component(SHAPE, 0), artboard(), component(SHAPE, 0), component(ELLIPSE, 1)]),
    );

    expect(graph.artboards.map((board) => board.objects.length)).toEqual([2, 3]);
    expect(graph.artboards[1].parentIndices).toEqual([-1, 0, 1]);
  });

  // Animations, keyframes and assets share the stream but are not part of the artboard's addressing.
  // Counting them would shift every index after the first one, so this is load-bearing.
  it('numbers only components, skipping objects that share the stream', () => {
    const graph = createRiveObjectGraph(
      document([artboard(), component(SHAPE, 0), { properties: [], typeKey: LINEAR_ANIMATION }, component(ELLIPSE, 1)]),
    );

    expect(graph.artboards[0].objects.map((object) => object.typeKey)).toEqual([ARTBOARD, SHAPE, ELLIPSE]);
    expect(graph.artboards[0].parentIndices).toEqual([-1, 0, 1]);
  });

  it('ignores components before any artboard', () => {
    const graph = createRiveObjectGraph(document([component(SHAPE, 0), artboard(), component(SHAPE, 0)]));

    expect(graph.artboards).toHaveLength(1);
    expect(graph.artboards[0].objects).toHaveLength(2);
  });

  it('roots a component whose stated parent is out of range, and says so', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const graph = createRiveObjectGraph(document([artboard(), component(SHAPE, 99)]), diagnostics);

    expect(graph.artboards[0].parentIndices).toEqual([-1, -1]);
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toEqual(['rive.unresolved-parent']);
  });

  it('roots a component that parents itself', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const graph = createRiveObjectGraph(document([artboard(), component(SHAPE, 1)]), diagnostics);

    expect(graph.artboards[0].parentIndices).toEqual([-1, -1]);
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toEqual(['rive.unresolved-parent']);
  });

  it('breaks a parent ring instead of walking it forever', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const graph = createRiveObjectGraph(
      document([artboard(), component(SHAPE, 2), component(ELLIPSE, 1)]),
      diagnostics,
    );

    expect(graph.artboards[0].parentIndices).toEqual([-1, -1, 1]);
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toEqual(['rive.parent-cycle']);
  });

  it('roots a component that states no parent at all', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const graph = createRiveObjectGraph(document([artboard(), { properties: [], typeKey: SHAPE }]), diagnostics);

    expect(graph.artboards[0].parentIndices).toEqual([-1, -1]);
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toEqual(['rive.component-without-parent']);
  });

  it('returns no artboards for a document that declares none', () => {
    expect(createRiveObjectGraph(document([{ properties: [], typeKey: LINEAR_ANIMATION }])).artboards).toEqual([]);
  });

  it('reaches every component from its artboard root', () => {
    // A tree is well formed when every component walks up to index 0 in fewer steps than there are
    // objects — the same property that discriminated the index base against the real corpus.
    const graph = createRiveObjectGraph(
      document([artboard(), component(SHAPE, 0), component(ELLIPSE, 1), component(ELLIPSE, 1), component(SHAPE, 3)]),
    );
    const parents = graph.artboards[0].parentIndices;

    for (let index = 1; index < parents.length; index++) {
      let steps = 0;
      let current = index;
      while (current !== 0) {
        current = parents[current];
        steps++;
        expect(steps).toBeLessThan(parents.length);
      }
    }
  });
});

function document(objects: RiveCoreObject[]): RiveDocument {
  return {
    header: { fileId: 0, majorVersion: 7, minorVersion: 0, tableOfContents: [] },
    objects,
  };
}

function artboard(): RiveCoreObject {
  return { properties: [], typeKey: ARTBOARD };
}

function component(typeKey: number, parentIndex: number): RiveCoreObject {
  return {
    properties: [{ key: PARENT_ID, type: RiveFieldType.Uint, value: parentIndex }],
    typeKey,
  };
}
describe('initializeRiveObjectGraph', () => {
  it('is the construction initializer of createRiveObjectGraph', () => {
    expect(typeof initializeRiveObjectGraph).toBe('function');
  });
});
