import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import type { ImportDiagnostic, Node2D, SvgRegistry } from '@flighthq/types/contract';
import { SvgElementKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { svgContainerElementHandler } from './svgContainerElement.ts';
import { createScene2DFromSvgDocumentWithRegistry } from './svgDocument.ts';
import { svgGeometryElementHandler } from './svgGeometryElement.ts';
import { createScene2DFromSvgDocument } from './svgImport.ts';
import { createSvgRegistry, registerSvgElementHandler } from './svgRegistry.ts';

const MIXED = '<svg><g><rect width="4" height="4"/></g><text>hi</text></svg>';

describe('appendSvgChildren', () => {
  // ★ DOCUMENT ORDER IS PAINT ORDER IN SVG, and unlike Lottie it is not reversed: the first element is drawn first and
  // therefore sits underneath. The walk's only job is to keep that, so the assertion is the child sequence.
  it('keeps document order, which is SVG paint order', () => {
    expect(
      childKinds(createScene2DFromSvgDocument('<svg><rect width="1" height="1"/><circle r="1"/><text>t</text></svg>')),
    ).toEqual(['Shape', 'Shape', 'TextLabel']);
  });
});

describe('applySvgElementAppearance', () => {
  it('lands group opacity on the node alpha', () => {
    const group = getNodeChildAt(
      createScene2DFromSvgDocument('<svg><g opacity="0.5"><rect width="4" height="4"/></g></svg>'),
      0,
    ) as Node2D;
    expect(group.alpha).toBe(0.5);
  });
});

describe('createScene2DFromSvgDocumentWithRegistry', () => {
  // ★ THE SELECTIVE ENTRY READS WHAT IT IS GIVEN AND NOTHING MORE. An empty registry still parses and validates the
  // document — it simply produces no children, and reports each element it could not claim — which is what makes a
  // partial family yield a smaller scene rather than a broken one.
  it('produces no children for an empty registry, and says so per element', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const root = createScene2DFromSvgDocumentWithRegistry(MIXED, createSvgRegistry(), diagnostics);
    expect(childKinds(root)).toEqual([]);
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['svg.unknown-element', 'svg.unknown-element']);
  });

  // The middle case is the one that matters: registering two families reads those and reports only the rest, so cost
  // and coverage move together.
  it('reads exactly the registered families and reports only the unclaimed ones', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const root = createScene2DFromSvgDocumentWithRegistry(MIXED, containerAndGeometry(), diagnostics);
    expect(childKinds(root)).toEqual(['DisplayObject']);
    expect(getNodeChildCount(getNodeChildAt(root, 0) as Node2D)).toBe(1);
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['svg.unknown-element']);
  });

  it('rejects a document that is not SVG at all, exactly as the zero-config entry does', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const root = createScene2DFromSvgDocumentWithRegistry('<html/>', containerAndGeometry(), diagnostics);
    expect(childKinds(root)).toEqual([]);
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['svg.invalid-document']);
  });
});

describe('createSvgElementNode', () => {
  // The dispatch: an element whose NAME maps to no kind is unknown, and one whose kind has no handler is also unknown —
  // two different causes with the same honest answer, since either way nothing can read it.
  it('reports an element no registered family claims', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createScene2DFromSvgDocumentWithRegistry(
      '<svg><rect width="1" height="1"/></svg>',
      createSvgRegistry(),
      diagnostics,
    );
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['svg.unknown-element']);
  });
});

describe('reportRemainingUnsupportedSvgElements', () => {
  // ★ REPORTED ONCE PER ELEMENT NAME THE IMPORTER NEVER REACHED. These are features SVG defines and Flight does not
  // read, and they are found by sweeping the document rather than by the walk, because the walk never visits them.
  it('names each unsupported feature the document declares', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createScene2DFromSvgDocument('<svg><filter id="f"/><foreignObject/></svg>', diagnostics);
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['svg.unsupported-filter', 'svg.unsupported-foreignObject']);
  });
});

function childKinds(root: Readonly<Node2D>): string[] {
  const kinds: string[] = [];
  for (let index = 0; index < getNodeChildCount(root); index++) {
    kinds.push((getNodeChildAt(root, index) as Node2D).kind);
  }
  return kinds;
}

function containerAndGeometry(): SvgRegistry {
  const registry = createSvgRegistry();
  registerSvgElementHandler(registry, SvgElementKind.Container, svgContainerElementHandler);
  registerSvgElementHandler(registry, SvgElementKind.Geometry, svgGeometryElementHandler);
  return registry;
}
