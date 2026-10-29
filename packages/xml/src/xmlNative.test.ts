import { describe, expect, it } from 'vitest';

import { parseXmlAttributes, parseXmlDocument } from './contract.ts';

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
