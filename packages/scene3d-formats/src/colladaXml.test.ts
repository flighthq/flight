import { parseXmlDocument } from '@flighthq/xml/contract';
import { describe, expect, it } from 'vitest';

import { child, children, descendants, idOf, localName, numbers, parseFloats, text, walk } from './colladaXml.ts';

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

describe('child', () => {
  it('matches a plain name and a namespace-prefixed one', () => {
    expect(child(PLAIN, 'asset')).toBeDefined();
    expect(child(NAMESPACED, 'asset')).toBeDefined();
  });

  it('answers undefined for a missing child and for no element at all', () => {
    expect(child(PLAIN, 'library_geometries')).toBeUndefined();
    expect(child(undefined, 'asset')).toBeUndefined();
  });

  // The suffix match is on `:name`, so a longer name ending in the same letters is NOT a match.
  it('does not match a name that merely ends with the same letters', () => {
    const document = parseXmlDocument('<COLLADA><subasset/></COLLADA>')!;
    expect(child(document, 'asset')).toBeUndefined();
  });
});

describe('children', () => {
  it('returns every match in document order, and an empty list for none', () => {
    expect(children(PLAIN, 'node')).toHaveLength(2);
    expect(children(child(NAMESPACED, 'library_geometries'), 'geometry')).toHaveLength(2);
    expect(children(PLAIN, 'geometry')).toEqual([]);
    expect(children(undefined, 'node')).toEqual([]);
  });
});

describe('descendants', () => {
  it('finds matches at any depth, where children only looks one level down', () => {
    expect(descendants(NAMESPACED, 'geometry')).toHaveLength(2);
    expect(children(NAMESPACED, 'geometry')).toEqual([]);
    expect(descendants(NAMESPACED, 'mesh')).toHaveLength(1);
  });
});

describe('idOf', () => {
  it('reads the id attribute and answers null when there is none', () => {
    expect(idOf(descendants(NAMESPACED, 'geometry')[0])).toBe('g1');
    expect(idOf(child(PLAIN, 'asset')!)).toBeNull();
  });
});

describe('localName', () => {
  it('strips a namespace prefix and leaves an unprefixed name alone', () => {
    expect(localName(NAMESPACED)).toBe('COLLADA');
    expect(localName(PLAIN)).toBe('COLLADA');
  });
});

describe('numbers', () => {
  it('reads whitespace-separated numbers from an element, and nothing from none', () => {
    const document = parseXmlDocument('<root><float_array>1 2.5  -3\n4</float_array></root>')!;
    expect(numbers(child(document, 'float_array'))).toEqual([1, 2.5, -3, 4]);
    expect(numbers(undefined)).toEqual([]);
  });
});

describe('parseFloats', () => {
  it('splits on any whitespace run and keeps sign, fraction and exponent', () => {
    expect(parseFloats(' 1  -2.5\t3e2\n')).toEqual([1, -2.5, 300]);
  });

  it('drops a non-numeric token rather than yielding NaN', () => {
    expect(parseFloats('1 x 2')).toEqual([1, 2]);
  });

  // ★ MEASURED, NOT ASSUMED, AND NOT CHANGED. Whitespace-only input yields `[0]`, not `[]`: the trim leaves an
  // empty string, split produces one empty token, and `Number('')` is 0, which is finite. I expected `[]` and the
  // test said otherwise. It stays as it is because this function feeds every transform and animation sampler in
  // the importer and a decomposition is the wrong place to change what a document parses to — recorded here so the
  // next reader knows the behaviour is known rather than merely undocumented.
  it('yields a single zero for whitespace-only input, which is the shipped behaviour', () => {
    expect(parseFloats('   ')).toEqual([0]);
  });
});

describe('text', () => {
  it('trims the child text and answers null when the child or its text is absent', () => {
    expect(text(child(NAMESPACED, 'asset'), 'up_axis')).toBe('Z_UP');
    expect(text(child(PLAIN, 'asset'), 'up_axis')).toBe('Y_UP');
    expect(text(child(PLAIN, 'asset'), 'copyright')).toBeNull();
  });

  // Empty text reads as null rather than as the empty string: a `<copyright/>` element says nothing, and a
  // caller checking for absence should not have to check for both.
  it('reads empty text as null', () => {
    const document = parseXmlDocument('<asset><copyright>   </copyright></asset>')!;
    expect(text(document, 'copyright')).toBeNull();
  });
});

describe('walk', () => {
  it('visits the element itself and every descendant, parents before children', () => {
    const seen: string[] = [];
    walk(PLAIN, (element) => seen.push(localName(element)));
    expect(seen[0]).toBe('COLLADA');
    expect(seen).toContain('up_axis');
    expect(seen.indexOf('asset')).toBeLessThan(seen.indexOf('up_axis'));
  });
});
