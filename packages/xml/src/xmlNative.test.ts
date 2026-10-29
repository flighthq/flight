import { describe, expect, it } from 'vitest';

import { parseXmlAttributes, parseXmlDocument } from './contract.ts';
import {
  createXmlRecord,
  createXmlScanner,
  decodeXmlEntitiesNative,
  expandXmlEntitiesNative,
  getXmlRecordValue,
  parseXmlAttributesNative,
  parseXmlNumberNative,
  prepareXmlDocumentNative,
  pushXmlElementContent,
  pushXmlTextContent,
  setXmlRecordValue,
  xmlIsWhitespace,
  xmlRecordIsEmpty,
  xmlScannerFind,
  xmlScannerLength,
  xmlScannerStartsWith,
  xmlScannerUnitAt,
  xmlStringFromCodePoint,
  xmlTrim,
  xmlUtf16Slice,
} from './xmlNative.ts';

describe('createXmlRecord', () => {
  it('creates an empty record', () => {
    expect(createXmlRecord()).toEqual({});
  });
});

describe('createXmlScanner', () => {
  it('preserves the source used by scanner operations', () => {
    const scanner = createXmlScanner('<root/>');
    expect(xmlScannerLength(scanner)).toBe(7);
  });
});

describe('decodeXmlEntitiesNative', () => {
  it('decodes named, decimal, and hexadecimal entities', () => {
    expect(decodeXmlEntitiesNative('&lt;&#65;&#x42;')).toBe('<AB');
  });
});

describe('expandXmlEntitiesNative', () => {
  it('expands nested document entities', () => {
    expect(expandXmlEntitiesNative('&outer;', { inner: 'value', outer: '&inner;' })).toBe('value');
  });
});

describe('getXmlRecordValue', () => {
  it('distinguishes stored values from missing keys', () => {
    expect(getXmlRecordValue({ present: '' }, 'present')).toBe('');
    expect(getXmlRecordValue({ present: '' }, 'missing')).toBeNull();
  });
});

describe('parseXmlAttributesNative', () => {
  it('parses quoted attributes and decodes their values', () => {
    expect(parseXmlAttributesNative(`first="&lt;" second='value'`)).toEqual({ first: '<', second: 'value' });
  });
});

describe('parseXmlNumberNative', () => {
  it('uses JavaScript number parsing with an explicit invalid result', () => {
    expect(parseXmlNumberNative('12.5')).toBe(12.5);
    expect(parseXmlNumberNative('not-a-number')).toBeNull();
  });
});

describe('prepareXmlDocumentNative', () => {
  it('normalizes markup and collects internal entities', () => {
    const entities = createXmlRecord();
    const xml = '<?xml version="1.0"?><!DOCTYPE root [<!ENTITY value "ok">]><!-- note --><root/>';
    expect(prepareXmlDocumentNative(xml, entities)).toBe('<root/>');
    expect(entities.value).toBe('ok');
  });
});

describe('pushXmlElementContent', () => {
  it('preserves element identity in mixed content', () => {
    const element = parseXmlDocument('<child/>')!;
    const content: typeof element.content = [];
    pushXmlElementContent(content, element);
    expect(content[0]).toBe(element);
  });
});

describe('pushXmlTextContent', () => {
  it('appends text to mixed content', () => {
    const element = parseXmlDocument('<root/>')!;
    const content: typeof element.content = [];
    pushXmlTextContent(content, 'text');
    expect(content).toEqual(['text']);
  });
});

describe('setXmlRecordValue', () => {
  it('sets and replaces record values', () => {
    const record = createXmlRecord();
    setXmlRecordValue(record, 'name', 'first');
    setXmlRecordValue(record, 'name', 'second');
    expect(record).toEqual({ name: 'second' });
  });
});

describe('XML target representations', () => {
  it('creates an empty attribute record for empty input', () => {
    expect(Object.keys(parseXmlAttributes(''))).toEqual([]);
  });

  it('shares the same child between children and content', () => {
    const document = parseXmlDocument('<root><child/></root>')!;
    expect(document.content[0]).toBe(document.children[0]);
  });

  it('observes child updates through both projections', () => {
    const document = parseXmlDocument('<root><child/></root>')!;
    document.children[0].name = 'renamed';
    expect((document.content[0] as { name: string }).name).toBe('renamed');
  });

  it('preserves the order of mixed text and child elements', () => {
    const document = parseXmlDocument('<text>Hello <tspan>world</tspan>!</text>')!;
    expect(document.content[0]).toBe('Hello ');
    expect((document.content[1] as { name: string }).name).toBe('tspan');
    expect(document.content[2]).toBe('!');
    expect(document.text).toBe('Hello!');
  });

  it('preserves markup and comment syntax inside CDATA as text', () => {
    const document = parseXmlDocument('<root><![CDATA[<tag>&amp;<!-- literal -->]]><child/>tail</root>')!;
    expect(document.children.map((child) => child.name)).toEqual(['child']);
    expect(document.content[0]).toBe('<tag>&amp;<!-- literal -->');
    expect(document.text).toBe('<tag>&amp;<!-- literal -->tail');
  });

  it('preserves attribute insertion order and duplicate position', () => {
    const attributes = parseXmlAttributes('z="first" a="second" z="updated"');
    expect(Object.keys(attributes)).toEqual(['z', 'a']);
    expect(attributes.z).toBe('updated');
  });
});

describe('xmlIsWhitespace', () => {
  it('classifies UTF-16 code units with JavaScript whitespace semantics', () => {
    expect(xmlIsWhitespace('\n'.charCodeAt(0))).toBe(true);
    expect(xmlIsWhitespace('x'.charCodeAt(0))).toBe(false);
  });
});

describe('xmlRecordIsEmpty', () => {
  it('detects own enumerable keys', () => {
    expect(xmlRecordIsEmpty({})).toBe(true);
    expect(xmlRecordIsEmpty({ present: '' })).toBe(false);
  });
});

describe('xmlScannerFind', () => {
  it('returns UTF-16 offsets and null for missing patterns', () => {
    const scanner = createXmlScanner('a😀tail');
    expect(xmlScannerFind(scanner, 'tail', 0)).toBe(3);
    expect(xmlScannerFind(scanner, 'missing', 0)).toBeNull();
  });
});

describe('xmlScannerLength', () => {
  it('measures UTF-16 code units', () => {
    expect(xmlScannerLength(createXmlScanner('a😀'))).toBe(3);
  });
});

describe('xmlScannerStartsWith', () => {
  it('matches a pattern at the requested offset', () => {
    const scanner = createXmlScanner('<root/>');
    expect(xmlScannerStartsWith(scanner, 1, 'root')).toBe(true);
    expect(xmlScannerStartsWith(scanner, 2, 'root')).toBe(false);
  });
});

describe('xmlScannerUnitAt', () => {
  it('reads a UTF-16 code unit at the requested offset', () => {
    expect(xmlScannerUnitAt(createXmlScanner('<root/>'), 0)).toBe('<'.charCodeAt(0));
  });
});

describe('xmlStringFromCodePoint', () => {
  it('rejects invalid Unicode scalar values', () => {
    expect(xmlStringFromCodePoint(0x1f600)).toBe('😀');
    expect(xmlStringFromCodePoint(0xd800)).toBeNull();
    expect(xmlStringFromCodePoint(0x110000)).toBeNull();
  });
});

describe('xmlTrim', () => {
  it('trims JavaScript whitespace', () => {
    expect(xmlTrim(' \nvalue\t')).toBe('value');
  });
});

describe('xmlUtf16Slice', () => {
  it('slices by UTF-16 code-unit offsets', () => {
    expect(xmlUtf16Slice('a😀b', 1, 3)).toBe('😀');
  });
});
