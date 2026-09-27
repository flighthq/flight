import { parseXmlDocument } from '@flighthq/xml/contract';
import { describe, expect, it } from 'vitest';

import {
  colladaChild,
  colladaChildren,
  colladaDescendants,
  colladaIdOf,
  colladaLocalName,
  colladaNumbers,
  parseColladaFloats,
  colladaText,
  walkColladaElement,
} from './colladaXml.ts';

// ★ THESE PRIMITIVES WERE PRIVATE AND UNTESTED, and they carry the one COLLADA rule every reader depends on:
// a namespaced document writes `<c:geometry>`, so every lookup matches on the LOCAL name. Nine functions, one
// rule, and until they were their own module there was nowhere to state it.
const NAMESPACED = parseXmlDocument(
  '<c:COLLADA xmlns:c="http://www.collada.org/2005/11/COLLADASchema">' +
    '<c:asset><c:up_axis>  Z_UP  </c:up_axis></c:asset>' +
    '<c:library_geometries><c:geometry id="g1"><c:mesh/></c:geometry><c:geometry id="g2"/></c:library_geometries>' +
    '</c:COLLADA>',
)!;

const PLAIN = parseXmlDocument('<COLLADA><asset><up_axis>Y_UP</up_axis></asset><node id="n"/><node/></COLLADA>')!;

describe('colladaChild', () => {
  it('matches a plain name and a namespace-prefixed one', () => {
    expect(colladaChild(PLAIN, 'asset')).toBeDefined();
    expect(colladaChild(NAMESPACED, 'asset')).toBeDefined();
  });

  it('answers undefined for a missing child and for no element at all', () => {
    expect(colladaChild(PLAIN, 'library_geometries')).toBeUndefined();
    expect(colladaChild(undefined, 'asset')).toBeUndefined();
  });

  // The suffix match is on `:name`, so a longer name ending in the same letters is NOT a match.
  it('does not match a name that merely ends with the same letters', () => {
    const document = parseXmlDocument('<COLLADA><subasset/></COLLADA>')!;
    expect(colladaChild(document, 'asset')).toBeUndefined();
  });
});

describe('colladaChildren', () => {
  it('returns every match in document order, and an empty list for none', () => {
    expect(colladaChildren(PLAIN, 'node')).toHaveLength(2);
    expect(colladaChildren(colladaChild(NAMESPACED, 'library_geometries'), 'geometry')).toHaveLength(2);
    expect(colladaChildren(PLAIN, 'geometry')).toEqual([]);
    expect(colladaChildren(undefined, 'node')).toEqual([]);
  });
});

describe('colladaDescendants', () => {
  it('finds matches at any depth, where children only looks one level down', () => {
    expect(colladaDescendants(NAMESPACED, 'geometry')).toHaveLength(2);
    expect(colladaChildren(NAMESPACED, 'geometry')).toEqual([]);
    expect(colladaDescendants(NAMESPACED, 'mesh')).toHaveLength(1);
  });
});

describe('colladaIdOf', () => {
  it('reads the id attribute and answers null when there is none', () => {
    expect(colladaIdOf(colladaDescendants(NAMESPACED, 'geometry')[0])).toBe('g1');
    expect(colladaIdOf(colladaChild(PLAIN, 'asset')!)).toBeNull();
  });
});

describe('colladaLocalName', () => {
  it('strips a namespace prefix and leaves an unprefixed name alone', () => {
    expect(colladaLocalName(NAMESPACED)).toBe('COLLADA');
    expect(colladaLocalName(PLAIN)).toBe('COLLADA');
  });
});

describe('colladaNumbers', () => {
  it('reads whitespace-separated numbers from an element, and nothing from none', () => {
    const document = parseXmlDocument('<root><float_array>1 2.5  -3\n4</float_array></root>')!;
    expect(colladaNumbers(colladaChild(document, 'float_array'))).toEqual([1, 2.5, -3, 4]);
    expect(colladaNumbers(undefined)).toEqual([]);
  });
});

describe('colladaText', () => {
  it('trims the child text and answers null when the child or its text is absent', () => {
    expect(colladaText(colladaChild(NAMESPACED, 'asset'), 'up_axis')).toBe('Z_UP');
    expect(colladaText(colladaChild(PLAIN, 'asset'), 'up_axis')).toBe('Y_UP');
    expect(colladaText(colladaChild(PLAIN, 'asset'), 'copyright')).toBeNull();
  });

  // Empty text reads as null rather than as the empty string: a `<copyright/>` element says nothing, and a
  // caller checking for absence should not have to check for both.
  it('reads empty text as null', () => {
    const document = parseXmlDocument('<asset><copyright>   </copyright></asset>')!;
    expect(colladaText(document, 'copyright')).toBeNull();
  });
});

describe('parseColladaFloats', () => {
  it('splits on any whitespace run and keeps sign, fraction and exponent', () => {
    expect(parseColladaFloats(' 1  -2.5\t3e2\n')).toEqual([1, -2.5, 300]);
  });

  it('drops a non-numeric token rather than yielding NaN', () => {
    expect(parseColladaFloats('1 x 2')).toEqual([1, 2]);
  });

  // ★ MEASURED, NOT ASSUMED, AND NOT CHANGED. Whitespace-only input yields `[0]`, not `[]`: the trim leaves an
  // empty string, split produces one empty token, and `Number('')` is 0, which is finite. I expected `[]` and the
  // test said otherwise. It stays as it is because this function feeds every transform and animation sampler in
  // the importer and a decomposition is the wrong place to change what a document parses to — recorded here so the
  // next reader knows the behaviour is known rather than merely undocumented.
  it('yields a single zero for whitespace-only input, which is the shipped behaviour', () => {
    expect(parseColladaFloats('   ')).toEqual([0]);
  });
});

describe('walkColladaElement', () => {
  it('visits the element itself and every descendant, parents before children', () => {
    const seen: string[] = [];
    walkColladaElement(PLAIN, (element) => seen.push(colladaLocalName(element)));
    expect(seen[0]).toBe('COLLADA');
    expect(seen).toContain('up_axis');
    expect(seen.indexOf('asset')).toBeLessThan(seen.indexOf('up_axis'));
  });
});
