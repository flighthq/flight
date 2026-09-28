import { clamp } from '@flighthq/math/contract';
import type { XmlElement } from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';
import { describe, expect, it } from 'vitest';

import {
  svgAttribute,
  svgFirstNumber,
  svgLocalName,
  svgNumberAttribute,
  svgOptionalNumberAttribute,
  parseSvgCssNumber,
  parseSvgCoordinate,
  parseSvgLength,
  parseSvgNumberList,
  parseUrlReference,
  visitSvgElements,
} from './svgXml.ts';

describe('parseSvgCoordinate', () => {
  // A percentage coordinate is a FRACTION here: the caller multiplies it by whichever extent it is relative to, which
  // the coordinate itself cannot know.
  it('reads a coordinate, turning a percentage into a fraction', () => {
    expect(parseSvgCoordinate('10', 0)).toBe(10);
    expect(parseSvgCoordinate('50%', 0)).toBe(0.5);
    expect(parseSvgCoordinate(null, 4)).toBe(4);
  });
});

describe('parseSvgCssNumber', () => {
  it('reads a CSS number, falling back for undefined and for nonsense', () => {
    expect(parseSvgCssNumber('2.5', 0)).toBe(2.5);
    expect(parseSvgCssNumber(undefined, 9)).toBe(9);
    expect(parseSvgCssNumber('x', 9)).toBe(9);
  });
});

describe('parseSvgLength', () => {
  it('reads a length, ignoring the unit suffix SVG allows', () => {
    expect(parseSvgLength('10px', 0)).toBe(10);
    expect(parseSvgLength('2em', 0)).toBe(2);
    expect(parseSvgLength(null, 5)).toBe(5);
  });
});

describe('parseSvgNumberList', () => {
  it('splits on whitespace and commas alike, which SVG treats as the same separator', () => {
    expect(parseSvgNumberList('1 2,3  -4')).toEqual([1, 2, 3, -4]);
    expect(parseSvgNumberList('')).toEqual([]);
  });
});

describe('parseUrlReference', () => {
  // ★ ONLY THE `url(#id)` FORM IS A REFERENCE. A bare `#id` is not what SVG's `fill`, `clip-path` and `mask` take, and
  // treating it as one would resolve a document the specification says has no reference there.
  it('reads the url form only, and answers null for anything else', () => {
    expect(parseUrlReference('url(#a)')).toBe('a');
    expect(parseUrlReference('#a')).toBeNull();
    expect(parseUrlReference(null)).toBeNull();
  });
});

// ★ EVERY ONE OF THESE HAS A FALLBACK, AND THE FALLBACK IS THE POINT. SVG attributes are optional and frequently
// malformed, and an importer that threw or produced NaN on `width="banana"` would fail a whole document over one
// attribute. So each case below asserts the good value AND what an absent or unreadable one produces.
describe('svgAttribute', () => {
  it('reads an attribute and answers null for one the element does not carry', () => {
    const rect = element('<rect x="3"/>');
    expect(svgAttribute(rect, 'x')).toBe('3');
    expect(svgAttribute(rect, 'y')).toBeNull();
  });
});

describe('svgFirstNumber', () => {
  // `x` and `dx` on a `<text>` are LISTS — one number per glyph — and Flight lays out a run rather than glyphs, so the
  // first entry is the one that positions it.
  it('takes the first entry of a number list, falling back for an absent or unreadable one', () => {
    expect(svgFirstNumber('3 4 5', 0)).toBe(3);
    expect(svgFirstNumber(null, 7)).toBe(7);
    expect(svgFirstNumber('bad', 7)).toBe(7);
  });
});

describe('svgLocalName', () => {
  it('drops a namespace prefix, since SVG in the wild is written both ways', () => {
    expect(svgLocalName('svg:rect')).toBe('rect');
    expect(svgLocalName('rect')).toBe('rect');
  });
});

describe('svgNumberAttribute', () => {
  it('reads a numeric attribute and falls back when it is absent', () => {
    const rect = element('<rect x="3"/>');
    expect(svgNumberAttribute(rect, 'x', -1)).toBe(3);
    expect(svgNumberAttribute(rect, 'y', -1)).toBe(-1);
  });
});

describe('svgOptionalNumberAttribute', () => {
  // ★ NULL AND A FALLBACK ARE DIFFERENT ANSWERS. A `<svg>` with no `width` inherits its parent viewport, which is not
  // the same as having width 0 — so the two readers exist side by side and the caller picks by what absence means.
  it('distinguishes an absent attribute from a zero one', () => {
    expect(svgOptionalNumberAttribute(element('<rect x="3"/>'), 'x')).toBe(3);
    expect(svgOptionalNumberAttribute(element('<rect x="3"/>'), 'y')).toBeNull();
    expect(svgOptionalNumberAttribute(element('<rect y="0"/>'), 'y')).toBe(0);
  });
});

describe('visitSvgElements', () => {
  it('visits the element and every descendant', () => {
    const seen: string[] = [];
    visitSvgElements(element('<svg><g><rect/></g><text/></svg>'), (node) => seen.push(svgLocalName(node.name)));
    expect(seen).toEqual(['svg', 'g', 'rect', 'text']);
  });
});

function element(xml: string): Readonly<XmlElement> {
  const document = parseXmlDocument(xml);
  expect(document).not.toBeNull();
  return document!;
}
