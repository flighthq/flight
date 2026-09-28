import { getNodeChildAt } from '@flighthq/node/contract';
import type { Matrix, Node2D, XmlElement } from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';
import { describe, expect, it } from 'vitest';

import { createScene2DFromSvgDocument } from './svgImport.ts';
import {
  applySvgTransform,
  assignSvgTransform,
  createSvgViewBoxMatrix,
  createSvgViewportMatrix,
  multiplySvgMatrices,
  parseSvgTransform,
} from './svgTransform.ts';

// ★ MATRICES ARE COMPARED FIELD BY FIELD, NOT BY `toEqual`. A Matrix is entity-backed, so two matrices holding the same
// six numbers are not deeply equal — they carry different runtime identity — and an equality assertion here fails for a
// reason that has nothing to do with the transform.
describe('applySvgTransform', () => {
  // Asserted through the importer because what it has to do is put the matrix where the scene graph reads it, and a
  // node's transform is only observable once something has been imported onto it.
  it('lands an element transform on the imported node', () => {
    const group = firstChild('<svg><g transform="translate(5,7)"><rect width="1" height="1"/></g></svg>');
    expect(group.x).toBe(5);
    expect(group.y).toBe(7);
  });
});

describe('assignSvgTransform', () => {
  // The decomposed path: a rotation cannot be expressed as x/y, so it has to arrive as rotation on the node — in
  // DEGREES, since `node.rotation` is the authoring layer.
  it('lands a rotation as the node rotation rather than as a position', () => {
    const group = firstChild('<svg><g transform="rotate(90)"><rect width="1" height="1"/></g></svg>');
    expect(group.rotation).toBe(90);
    expect(group.x).toBe(0);
    expect(group.y).toBe(0);
  });
});

describe('createSvgViewBoxMatrix', () => {
  // ★ THE THREE `preserveAspectRatio` MODES DIFFER, AND THE DEFAULT IS THE ONE THAT LETTERBOXES. Measured on a 10x5
  // viewBox in a 20x20 viewport: `meet` scales uniformly by 2 and centres the spare height, `none` stretches to 2x4,
  // and `slice` scales by 4 and overflows horizontally.
  it('fits meet, none and slice differently', () => {
    const viewport = { height: 20, width: 20, x: 0, y: 0 };
    expectMatrix(createSvgViewBoxMatrix([0, 0, 10, 5], viewport, 'xMidYMid meet'), [2, 0, 0, 2, 0, 5]);
    expectMatrix(createSvgViewBoxMatrix([0, 0, 10, 5], viewport, 'none'), [2, 0, 0, 4, 0, 0]);
    expectMatrix(createSvgViewBoxMatrix([0, 0, 10, 5], viewport, 'xMidYMid slice'), [4, 0, 0, 4, -10, 0]);
  });
});

describe('createSvgViewportMatrix', () => {
  it('scales a viewBox down into the declared width and height', () => {
    expectMatrix(
      createSvgViewportMatrix(element('<svg width="100" height="50" viewBox="0 0 200 100"/>'))!,
      [0.5, 0, 0, 0.5, 0, 0],
    );
  });
});

describe('multiplySvgMatrices', () => {
  // ★ THE ORDER IS THE WHOLE REASON THIS EXISTS. SVG composes a child's transform under its parent's, so the product of
  // a parent translate and a child scale scales by the child and translates by the parent — not the other way round,
  // which would scale the parent's translation too.
  it('composes the second matrix under the first', () => {
    expectMatrix(
      multiplySvgMatrices(parseSvgTransform('translate(1,2)')!, parseSvgTransform('scale(3)')!),
      [3, 0, 0, 3, 1, 2],
    );
  });
});

describe('parseSvgTransform', () => {
  it('reads the transform functions and answers null for an absent attribute', () => {
    expectMatrix(parseSvgTransform('translate(3,4)')!, [1, 0, 0, 1, 3, 4]);
    expectMatrix(parseSvgTransform('scale(2)')!, [2, 0, 0, 2, 0, 0]);
    expect(parseSvgTransform(null)).toBeNull();
  });

  // ★ AN UNREADABLE TRANSFORM IS THE IDENTITY, NOT NULL. Null means "no transform attribute", which a caller uses to
  // skip composing entirely; a transform naming a function SVG does not define has still been asked for, so it composes
  // as a no-op rather than disappearing.
  it('reads an unknown function as the identity, which is not the same as absent', () => {
    expectMatrix(parseSvgTransform('bogus(1)')!, [1, 0, 0, 1, 0, 0]);
  });
});

function element(xml: string): Readonly<XmlElement> {
  const document = parseXmlDocument(xml);
  expect(document).not.toBeNull();
  return document!;
}

function expectMatrix(matrix: Readonly<Matrix>, expected: readonly number[]): void {
  expect([matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty]).toEqual(expected);
}

function firstChild(xml: string): Node2D {
  const child = getNodeChildAt(createScene2DFromSvgDocument(xml), 0) as Node2D | null;
  expect(child).not.toBeNull();
  return child!;
}
