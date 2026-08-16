import { createRectangle } from '@flighthq/geometry/contract';
import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import { getShapeBounds } from '@flighthq/shape/contract';
import type { Node2D, ImportDiagnostic, RichText, Shape } from '@flighthq/types/contract';
import { ShapeKind } from '@flighthq/types/contract';

import { createScene2DFromSvgDocument } from './svgDocument';
import { createReadyImageResourceForTest } from './testHelper';

describe('SVG conformance matrix', () => {
  it.each([
    {
      element: '<rect x="3" width="10" height="10" transform="translate(10 5)"/>',
      expectedY: 5,
      kind: 'shape',
    },
    {
      element: '<image href="asset.png" x="3" width="10" height="10" transform="translate(10 5)"/>',
      expectedY: 5,
      kind: 'image',
    },
    {
      element: '<text x="3" y="15" font-size="10" transform="translate(10 5)">T</text>',
      expectedY: 10,
      kind: 'text',
    },
    {
      element: '<g transform="translate(10 5)"><rect x="3" width="10" height="10"/></g>',
      expectedY: 5,
      kind: 'group',
    },
    {
      element: '<use href="#mark" x="3" transform="translate(10 5)"/>',
      expectedY: 5,
      kind: 'use',
    },
    {
      element: '<use href="#symbol" x="3" width="10" height="10" transform="translate(10 5)"/>',
      expectedY: 5,
      kind: 'symbol',
    },
    {
      element: '<use href="#nested" x="3" transform="translate(10 5)"/>',
      expectedY: 5,
      kind: 'nested-use',
    },
  ])('composes geometry before transforms for $kind', ({ element, expectedY, kind }) => {
    const image = createReadyImageResourceForTest(10, 10);
    const root = createScene2DFromSvgDocument(
      `
        <svg>
          <defs>
            <g id="mark"><rect width="1" height="1"/></g>
            <symbol id="symbol" viewBox="0 0 10 10"><rect width="10" height="10"/></symbol>
            <g id="nested"><use href="#mark"/></g>
          </defs>
          ${element}
        </svg>
      `,
      undefined,
      { resolveImageResource: () => image },
    );
    const target = getNodeChildAt(root, 0)!;
    const shape = findFirstShape(target);

    if (kind === 'image' || kind === 'text' || kind === 'use' || kind === 'symbol' || kind === 'nested-use') {
      expect(target.x).toBe(13);
    } else {
      expect(target.x + getShapeLocalX(shape!)).toBe(13);
    }
    expect(target.y).toBe(expectedY);
  });

  it.each([
    { kind: 'shape', target: '<rect width="200" height="100" clip-path="url(#half)"/>', width: 100 },
    { kind: 'image', target: '<image href="asset.png" width="200" height="100" clip-path="url(#half)"/>', width: 10 },
    {
      kind: 'group',
      target: '<g clip-path="url(#half)"><rect width="200" height="100"/></g>',
      width: 100,
    },
    {
      kind: 'use',
      target: '<use href="#panel" width="200" height="100" clip-path="url(#half)"/>',
      width: 100,
    },
    {
      kind: 'nested-use',
      target: '<use href="#nestedPanel" clip-path="url(#half)"/>',
      width: 100,
    },
  ])('maps objectBoundingBox clip units for $kind', ({ target, width }) => {
    const image = createReadyImageResourceForTest(20, 10);
    const root = createScene2DFromSvgDocument(
      `
        <svg>
          <defs>
            <clipPath id="half" clipPathUnits="objectBoundingBox"><rect width=".5" height="1"/></clipPath>
            <symbol id="panel" viewBox="0 0 20 10" preserveAspectRatio="none">
              <rect width="20" height="10"/>
            </symbol>
            <g id="panelGeometry"><rect width="200" height="100"/></g>
            <g id="nestedPanel"><use href="#panelGeometry"/></g>
          </defs>
          ${target}
        </svg>
      `,
      undefined,
      { resolveImageResource: () => image },
    );

    expect(getNodeChildAt(root, 0)?.clip?.rect.width).toBe(width);
  });

  it('diagnoses objectBoundingBox clips when text bounds cannot be measured honestly', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const root = createScene2DFromSvgDocument(
      `
        <svg>
          <defs>
            <clipPath id="half" clipPathUnits="objectBoundingBox"><rect width=".5" height="1"/></clipPath>
          </defs>
          <text clip-path="url(#half)">Text</text>
        </svg>
      `,
      diagnostics,
    );

    expect(getNodeChildAt(root, 0)?.clip).toBeNull();
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toContain(
      'svg.object-bounding-box-clip-unmeasurable-bounds',
    );
  });

  it('instantiates path, symbol, and nested-use geometry inside clip paths', () => {
    const root = createScene2DFromSvgDocument(`
      <svg>
        <defs>
          <path id="clipPathShape" d="M0 0 H10 V10 H0 Z"/>
          <symbol id="clipSymbol" viewBox="0 0 10 10" preserveAspectRatio="none">
            <rect width="10" height="10"/>
          </symbol>
          <g id="clipNested"><use href="#clipPathShape" x="5"/></g>
          <clipPath id="pathUse"><use href="#clipPathShape"/></clipPath>
          <clipPath id="symbolUse"><use href="#clipSymbol" width="20" height="30"/></clipPath>
          <clipPath id="nestedUse"><use href="#clipNested"/></clipPath>
        </defs>
        <rect width="40" height="40" clip-path="url(#pathUse)"/>
        <rect width="40" height="40" clip-path="url(#symbolUse)"/>
        <rect width="40" height="40" clip-path="url(#nestedUse)"/>
      </svg>
    `);

    expect(getNodeChildAt(root, 0)?.clip?.rect).toMatchObject({ height: 10, width: 10, x: 0, y: 0 });
    expect(getNodeChildAt(root, 1)?.clip?.rect).toMatchObject({ height: 30, width: 20, x: 0, y: 0 });
    expect(getNodeChildAt(root, 2)?.clip?.rect).toMatchObject({ height: 10, width: 10, x: 5, y: 0 });
  });

  it.each([
    { kind: 'shape', target: '<rect width="200" height="100" mask="url(#halfMask)"/>', width: 100 },
    { kind: 'image', target: '<image href="asset.png" width="200" height="100" mask="url(#halfMask)"/>', width: 10 },
    {
      kind: 'group',
      target: '<g mask="url(#halfMask)"><rect width="200" height="100"/></g>',
      width: 100,
    },
    {
      kind: 'use',
      target: '<use href="#panel" width="200" height="100" mask="url(#halfMask)"/>',
      width: 100,
    },
  ])('maps objectBoundingBox mask content for $kind', ({ target, width }) => {
    const diagnostics: ImportDiagnostic[] = [];
    const image = createReadyImageResourceForTest(20, 10);
    const root = createScene2DFromSvgDocument(
      `
        <svg>
          <defs>
            <mask id="halfMask" maskContentUnits="objectBoundingBox"><rect width=".5" height="1"/></mask>
            <symbol id="panel" viewBox="0 0 20 10" preserveAspectRatio="none">
              <rect width="20" height="10"/>
            </symbol>
          </defs>
          ${target}
        </svg>
      `,
      diagnostics,
      { resolveImageResource: () => image },
    );

    expect(getNodeChildAt(root, 0)?.clip?.rect.width).toBe(width);
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toContain('svg.mask-as-hard-clip');
  });

  it('shares use resolution and display suppression between masks and clip paths', () => {
    const root = createScene2DFromSvgDocument(`
      <svg>
        <defs>
          <path id="maskShape" d="M0 0 H10 V10 H0 Z"/>
          <mask id="usedMask">
            <rect width="10" height="10" display="none"/>
            <use href="#maskShape" x="10"/>
          </mask>
        </defs>
        <rect width="30" height="20" mask="url(#usedMask)"/>
      </svg>
    `);

    expect(getNodeChildAt(root, 0)?.clip?.rect).toMatchObject({ height: 10, width: 10, x: 10, y: 0 });
  });

  it('treats a resolved display-none clip definition as an empty clip', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const root = createScene2DFromSvgDocument(
      `
        <svg>
          <defs><clipPath id="empty"><rect width="10" height="10" display="none"/></clipPath></defs>
          <rect width="20" height="20" clip-path="url(#empty)"/>
        </svg>
      `,
      diagnostics,
    );

    expect(getNodeChildAt(root, 0)?.clip?.rect).toMatchObject({ height: 0, width: 0 });
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).not.toContain('svg.unresolved-clip-reference');
  });

  it('keeps an empty hidden mask as a hard clip and reports the recovery', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const root = createScene2DFromSvgDocument(
      `
        <svg>
          <defs><mask id="empty"><rect width="10" height="10" visibility="hidden"/></mask></defs>
          <rect width="20" height="20" mask="url(#empty)"/>
        </svg>
      `,
      diagnostics,
    );

    expect(getNodeChildAt(root, 0)?.clip?.rect).toMatchObject({ height: 0, width: 0 });
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toContain('svg.mask-as-hard-clip');
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).not.toContain('svg.unresolved-clip-reference');
  });

  it('diagnoses unsupported clip text while preserving empty-clip semantics', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const root = createScene2DFromSvgDocument(
      `
        <svg>
          <defs><clipPath id="text"><text>Clip</text></clipPath></defs>
          <rect width="20" height="20" clip-path="url(#text)"/>
        </svg>
      `,
      diagnostics,
    );

    expect(getNodeChildAt(root, 0)?.clip?.rect).toMatchObject({ height: 0, width: 0 });
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toContain('svg.unsupported-clip-text');
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).not.toContain('svg.unresolved-clip-reference');
  });

  it('intersects clip-path references on clip definitions and their children', () => {
    const root = createScene2DFromSvgDocument(`
      <svg>
        <defs>
          <clipPath id="narrow"><rect width="10" height="20"/></clipPath>
          <clipPath id="definition" clip-path="url(#narrow)"><rect width="20" height="20"/></clipPath>
          <clipPath id="child"><rect width="20" height="20" clip-path="url(#narrow)"/></clipPath>
        </defs>
        <rect width="30" height="30" clip-path="url(#definition)"/>
        <rect width="30" height="30" clip-path="url(#child)"/>
      </svg>
    `);

    expect(getNodeChildAt(root, 0)?.clip?.rect.width).toBe(10);
    expect(getNodeChildAt(root, 1)?.clip?.rect.width).toBe(10);
  });

  it('honestly skips a transformed objectBoundingBox nested clip intersection', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const root = createScene2DFromSvgDocument(
      `
        <svg>
          <defs>
            <clipPath id="half" clipPathUnits="objectBoundingBox"><rect width=".5" height="1"/></clipPath>
            <clipPath id="translated">
              <rect width="10" height="10" transform="translate(10)" clip-path="url(#half)"/>
            </clipPath>
          </defs>
          <rect width="30" height="20" clip-path="url(#translated)"/>
        </svg>
      `,
      diagnostics,
    );

    expect(getNodeChildAt(root, 0)?.clip?.rect).toMatchObject({ height: 10, width: 10, x: 10, y: 0 });
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toContain('svg.clip-nested-intersection-unsupported');
  });

  it('inherits clip-rule from a clip definition ancestor, not its referencing target', () => {
    const root = createScene2DFromSvgDocument(`
      <svg>
        <defs>
          <g clip-rule="evenodd">
            <clipPath id="ancestorRule"><path d="M0 0 H20 V20 H0 Z M5 5 H15 V15 H5 Z"/></clipPath>
          </g>
        </defs>
        <rect clip-rule="nonzero" width="20" height="20" clip-path="url(#ancestorRule)"/>
      </svg>
    `);

    expect(getNodeChildAt(root, 0)?.clip?.winding).toBe('evenOdd');
  });

  it('keeps fill and clip winding properties independently inherited', () => {
    const root = createScene2DFromSvgDocument(`
      <svg>
        <defs>
          <clipPath id="fillOnly" fill-rule="evenodd"><path d="M0 0 H10 V10 H0 Z"/></clipPath>
          <clipPath id="clipOnly" clip-rule="evenodd"><path d="M0 0 H10 V10 H0 Z"/></clipPath>
        </defs>
        <g fill-rule="evenodd"><path d="M0 0 H10 V10 H0 Z"/></g>
        <rect width="10" height="10" clip-path="url(#fillOnly)"/>
        <rect width="10" height="10" clip-path="url(#clipOnly)"/>
      </svg>
    `);

    const fillShape = findFirstShape(getNodeChildAt(root, 0)!);
    expect(getShapePathWinding(fillShape!)).toBe('evenOdd');
    expect(getNodeChildAt(root, 1)?.clip?.winding).toBe('nonZero');
    expect(getNodeChildAt(root, 2)?.clip?.winding).toBe('evenOdd');
  });

  it.each([
    {
      expected: 0xffa500ff,
      kind: 'shape',
      target: '<rect class="accent" fill="blue" width="10" height="10"/>',
    },
    {
      expected: 0xff0000ff,
      kind: 'group inheritance',
      target: '<g class="theme"><rect width="10" height="10"/></g>',
    },
    {
      expected: 0xff0000ff,
      kind: 'use inheritance',
      target: '<use href="#mark" class="theme"/>',
    },
    {
      expected: 0xff0000ff,
      kind: 'symbol inheritance',
      target: '<use href="#symbol" class="theme"/>',
    },
  ])('applies CSS cascade and presentation inheritance for $kind', ({ expected, target }) => {
    const root = createScene2DFromSvgDocument(`
      <svg>
        <style>
          .accent { fill: red }
          .accent { fill: orange }
          .theme { fill: red }
        </style>
        <defs>
          <g id="mark"><rect width="10" height="10"/></g>
          <symbol id="symbol"><rect width="10" height="10"/></symbol>
        </defs>
        ${target}
      </svg>
    `);
    const shape = findFirstShape(getNodeChildAt(root, 0)!)!;

    expect(getShapeFillColor(shape)).toBe(expected);
  });

  it('applies stylesheet cascade to text and tspan runs', () => {
    const root = createScene2DFromSvgDocument(`
      <svg>
        <style>
          text { fill: red }
          .accent { fill: blue }
        </style>
        <text fill="green">A<tspan class="accent">B</tspan></text>
      </svg>
    `);
    const text = getNodeChildAt(root, 0) as RichText;

    expect(text.data.textFormat.color).toBe(0xff0000ff);
    expect(text.data.textFormatRanges[0].format.color).toBe(0x0000ffff);
  });

  it('keeps fill-none text transparent while a painted tspan remains visible', () => {
    const root = createScene2DFromSvgDocument('<svg><text fill="none">A<tspan fill="red">B</tspan></text></svg>');
    const text = getNodeChildAt(root, 0) as RichText;

    expect(text.data.text).toBe('AB');
    expect(text.data.textFormat.color).toBe(0x00000000);
    expect(text.data.textFormatRanges[0].format.color).toBe(0xff0000ff);
  });

  it('omits hidden tspan content while permitting a visible descendant override', () => {
    const root = createScene2DFromSvgDocument(
      '<svg><text>A<tspan visibility="hidden">B<tspan visibility="visible">C</tspan></tspan>' +
        '<tspan display="none">D<tspan display="inline">E</tspan></tspan>F</text></svg>',
    );
    const text = getNodeChildAt(root, 0) as RichText;

    expect(text.data.text).toBe('ACF');
  });

  it('composes nested tspan opacity without applying the text opacity twice', () => {
    const root = createScene2DFromSvgDocument(
      '<svg><text opacity=".8">A<tspan opacity=".5">B<tspan opacity=".5">C</tspan></tspan></text></svg>',
    );
    const text = getNodeChildAt(root, 0) as RichText;

    expect(text.data.text).toBe('ABC');
    expect(text.alpha).toBeCloseTo(0.8);
    expect(text.data.textFormat.color).toBe(0x000000ff);
    expect(text.data.textFormatRanges).toEqual([
      expect.objectContaining({ end: 2, format: expect.objectContaining({ color: 0x00000080 }), start: 1 }),
      expect.objectContaining({ end: 3, format: expect.objectContaining({ color: 0x00000040 }), start: 2 }),
    ]);
  });

  it('suppresses display none while allowing visibility descendants to override', () => {
    const root = createScene2DFromSvgDocument(`
      <svg>
        <g display="none"><rect width="10" height="10" display="inline"/></g>
        <g visibility="hidden">
          <rect width="10" height="10"/>
          <rect x="20" width="10" height="10" visibility="visible"/>
        </g>
      </svg>
    `);
    const displayGroup = getNodeChildAt(root, 0)!;
    const visibilityGroup = getNodeChildAt(root, 1)!;

    expect(displayGroup.visible).toBe(false);
    expect(getNodeChildAt(displayGroup, 0)?.visible).toBe(true);
    expect(visibilityGroup.visible).toBe(true);
    expect(getNodeChildAt(visibilityGroup, 0)?.visible).toBe(false);
    expect(getNodeChildAt(visibilityGroup, 1)?.visible).toBe(true);
  });

  it('keeps display at its initial value on descendants of a display-none ancestor', () => {
    const root = createScene2DFromSvgDocument(`
      <svg><g display="none"><rect width="10" height="10"/></g></svg>
    `);
    const group = getNodeChildAt(root, 0)!;

    expect(group.visible).toBe(false);
    expect(getNodeChildAt(group, 0)?.visible).toBe(true);
  });

  it.each([
    { kind: 'shape', path: [0], target: '<rect width="10" height="10" display="none"/>' },
    { kind: 'image', path: [0], target: '<image href="asset.png" display="none"/>' },
    { kind: 'text', path: [0], target: '<text display="none">T</text>' },
    { kind: 'group', path: [0], target: '<g display="none"><rect width="10" height="10"/></g>' },
    { kind: 'use', path: [0], target: '<use href="#mark" display="none"/>' },
    { kind: 'symbol', path: [0, 0], target: '<use href="#hiddenSymbol"/>' },
    { kind: 'nested-use', path: [0, 0], target: '<use href="#hiddenNested"/>' },
  ])('suppresses display none for $kind', ({ path, target }) => {
    const image = createReadyImageResourceForTest(10, 10);
    const root = createScene2DFromSvgDocument(
      `
        <svg>
          <defs>
            <g id="mark"><rect width="10" height="10"/></g>
            <symbol id="hiddenSymbol" display="none"><rect width="10" height="10"/></symbol>
            <g id="hiddenNested" display="none"><use href="#mark"/></g>
          </defs>
          ${target}
        </svg>
      `,
      undefined,
      { resolveImageResource: () => image },
    );

    expect(getDescendant(root, path).visible).toBe(false);
  });

  it('excludes hidden clip graphics and permits descendant visibility overrides', () => {
    const root = createScene2DFromSvgDocument(`
      <svg>
        <defs>
          <clipPath id="visibility">
            <rect width="10" height="10" display="none"/>
            <g visibility="hidden">
              <rect x="10" width="10" height="10"/>
              <rect x="20" width="10" height="10" visibility="visible"/>
            </g>
          </clipPath>
        </defs>
        <rect width="40" height="40" clip-path="url(#visibility)"/>
      </svg>
    `);

    expect(getNodeChildAt(root, 0)?.clip?.rect).toMatchObject({ height: 10, width: 10, x: 20, y: 0 });
  });

  it.each([
    {
      expected: { scaleX: 4, scaleY: 2, x: 0 },
      kind: 'root SVG',
      source: '<svg width="200" height="100" viewBox="0 0 50 50" preserveAspectRatio="none"/>',
      target: 'root',
    },
    {
      expected: { scaleX: 2, scaleY: 3, x: 5 },
      kind: 'nested SVG',
      source: '<svg><svg x="5" width="20" height="30" viewBox="0 0 10 10" preserveAspectRatio="none"/></svg>',
      target: 'child',
    },
    {
      expected: { scaleX: 2, scaleY: 3, x: 0 },
      kind: 'symbol viewport',
      source:
        '<svg><defs><symbol id="s" viewBox="0 0 10 10" preserveAspectRatio="none"/></defs><use href="#s" width="20" height="30"/></svg>',
      target: 'symbol',
    },
  ])('maps viewBox and viewport sizing for $kind', ({ expected, source, target }) => {
    const root = createScene2DFromSvgDocument(source);
    const node =
      target === 'root'
        ? root
        : target === 'child'
          ? getNodeChildAt(root, 0)!
          : getNodeChildAt(getNodeChildAt(root, 0)!, 0)!;

    expect(node).toMatchObject(expected);
  });
});

function findFirstShape(target: Node2D): Shape | null {
  if (target.kind === ShapeKind) return target as Shape;
  const count = getNodeChildCount(target);
  for (let index = 0; index < count; index++) {
    const child = getNodeChildAt(target, index) as Node2D | null;
    if (child === null) continue;
    const shape = findFirstShape(child);
    if (shape !== null) return shape;
  }
  return null;
}

function getShapeFillColor(shape: Shape): number | null {
  const index = shape.data.commands.indexOf('beginFill');
  return index === -1 ? null : (shape.data.commands[index + 2] as number);
}

// Asserts the sentinel rather than reading `bounds.x` regardless. `getShapeBounds` returns false when it
// could not compute a complete box, and a freshly created rectangle is already x=0 — so discarding the
// return makes "bounds were never registered" and "bounds start at x=0" the SAME observation. That is
// what once disguised a missing bounds registration as an ordinary arithmetic mismatch (expected 13, got
// 10), sending the reader after the wrong quantity entirely.
function getShapeLocalX(shape: Shape): number {
  const bounds = createRectangle();
  expect(getShapeBounds(bounds, shape), 'shape bounds could not be computed').toBe(true);
  return bounds.x;
}

function getShapePathWinding(shape: Shape): unknown {
  const index = shape.data.commands.indexOf('drawPath');
  return index === -1 ? null : shape.data.commands[index + 4];
}

function getDescendant(root: Node2D, path: number[]): Node2D {
  let node = root;
  for (const index of path) node = getNodeChildAt(node, index) as Node2D;
  return node;
}

// `inherit` is legal on every presentation attribute and is what the W3C's own conformance suite
// uses to test the color property. Read as a paint value it yields no fill and no stroke, which
// silently deletes the element's geometry rather than reporting anything.
describe('SVG inherit keyword', () => {
  it.each([
    { declaration: 'fill="inherit"', from: 'fill="#ff0000"', name: 'fill' },
    { declaration: 'style="fill:inherit"', from: 'fill="#ff0000"', name: 'fill through a style attribute' },
    { declaration: 'stroke="inherit" fill="none" stroke-width="2"', from: 'stroke="#ff0000"', name: 'stroke' },
  ])('takes the parent value for an inherited $name', ({ declaration, from }) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><g ${from}><rect width="10" height="10" ${declaration}/></g></svg>`;

    expect(firstShapeCommands(svg)).toContain(0xff0000ff);
  });

  it('resolves currentColor against a color that itself inherits', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><g color="#008000"><g color="inherit">' +
      '<rect width="10" height="10" fill="currentColor"/></g></g></svg>';

    expect(firstShapeCommands(svg)).toContain(0x008000ff);
  });

  // opacity is not inherited, so `inherit` is the one way to ask for the parent's value rather than
  // the initial 1. Dropping the declaration instead would silently render this fully opaque.
  it('takes the parent value for opacity, which does not inherit on its own', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><g opacity="0.5">' +
      '<rect width="10" height="10" fill="#ff0000" opacity="inherit"/></g></svg>';

    expect(firstShape(svg).alpha).toBe(0.5);
  });

  it('leaves an unparented inherit at the initial value rather than dropping the geometry', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" opacity="inherit"/></svg>';

    expect(firstShape(svg).alpha).toBe(1);
    expect(firstShapeCommands(svg).length).toBeGreaterThan(0);
  });
});

// An SVG document may declare markup as a general entity in its DOCTYPE's internal subset and expand
// it by reference. Expansion happens in `@flighthq/xml` before the tree is built, so the importer sees
// ordinary markup; this pins that the two spellings import identically.
describe('SVG internal DTD entities', () => {
  const inner = "<g><circle cx='15' cy='15' r='10' fill='yellow'/><rect width='4' height='4'/></g>";

  it('imports an entity-expanded document the same as the literal markup', () => {
    const literal = `<svg xmlns="http://www.w3.org/2000/svg">${inner}${inner}</svg>`;
    const entity =
      `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY S "${inner}">]>` +
      '<svg xmlns="http://www.w3.org/2000/svg">&S;&S;</svg>';

    expect(countSvgDrawPaths(entity)).toBe(countSvgDrawPaths(literal));
    expect(countSvgDrawPaths(entity)).toBeGreaterThan(0);
  });
});

function countSvgDrawPaths(svg: string): number {
  const root = createScene2DFromSvgDocument(svg);
  let count = 0;
  const walk = (node: Node2D): void => {
    if (node.kind === ShapeKind) {
      for (const command of (node as Shape).data.commands) if (command === 'drawPath') count++;
    }
    for (let index = 0; index < getNodeChildCount(node); index++) walk(getNodeChildAt(node, index) as Node2D);
  };
  walk(root);
  return count;
}

function firstShape(svg: string): Shape {
  const root = createScene2DFromSvgDocument(svg);
  let found: Shape | null = null;
  const walk = (node: Node2D): void => {
    if (found === null && node.kind === ShapeKind) found = node as Shape;
    for (let index = 0; index < getNodeChildCount(node); index++) walk(getNodeChildAt(node, index) as Node2D);
  };
  walk(root);
  if (found === null) throw new Error('no shape was imported');
  return found;
}

function firstShapeCommands(svg: string): readonly unknown[] {
  return firstShape(svg).data.commands;
}
