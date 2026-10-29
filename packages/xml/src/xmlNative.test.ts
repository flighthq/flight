import { describe, expect, it } from 'vitest';

import { parseXmlAttributes, parseXmlDocument } from './contract.ts';
import {
  createXmlRecord,
  getXmlRecordValue,
  parseXmlNumberNative,
  pushXmlElementContent,
  pushXmlTextContent,
  setXmlRecordValue,
  xmlIsWhitespace,
  xmlRecordIsEmpty,
  xmlStringFromCodePoint,
  xmlTrim,
  xmlUtf16Slice,
} from './xmlNative.ts';

describe('createXmlRecord', () => {
  it('creates an empty record', () => {
    expect(createXmlRecord()).toEqual({});
  });
});

describe('getXmlRecordValue', () => {
  it('distinguishes stored values from missing keys', () => {
    expect(getXmlRecordValue({ present: '' }, 'present')).toBe('');
    expect(getXmlRecordValue({ present: '' }, 'missing')).toBeNull();
  });
});

describe('parseXmlNumberNative', () => {
  it('uses JavaScript number parsing with an explicit invalid result', () => {
    expect(parseXmlNumberNative('12.5')).toBe(12.5);
    expect(parseXmlNumberNative('not-a-number')).toBeNull();
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
