// Generated from crates/flight-xml/tests/xml_query_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  getXmlElementAttribute,
  getXmlElementAttributeNumber,
  getXmlElementChildByName,
  getXmlElementChildrenByName,
  parseXmlDocument,
} from './contract.ts';

describe('getXmlElementAttribute', () => {
  it('returns the attribute value when present', () => {
    const root = parseXmlDocument('<node name="hero" x="10"/>')!;
    expect(getXmlElementAttribute(root, 'name')).toEqual('hero');
  });
  it('returns none when the attribute is absent', () => {
    const root = parseXmlDocument('<node name="hero"/>')!;
    expect(getXmlElementAttribute(root, 'missing') === null).toBe(true);
  });
  it('returns an empty string attribute rather than none', () => {
    const root = parseXmlDocument('<node label=""/>')!;
    expect(getXmlElementAttribute(root, 'label')).toEqual('');
  });
});

describe('getXmlElementAttributeNumber', () => {
  it('parses a numeric attribute', () => {
    const root = parseXmlDocument('<node x="10" scale="1.5"/>')!;
    expect(getXmlElementAttributeNumber(root, 'x')).toEqual(10.0);
    expect(getXmlElementAttributeNumber(root, 'scale')).toEqual(1.5);
  });
  it('returns none when the attribute is absent', () => {
    const root = parseXmlDocument('<node x="10"/>')!;
    expect(getXmlElementAttributeNumber(root, 'missing') === null).toBe(true);
  });
  it('returns none when the value is not a finite number', () => {
    const root = parseXmlDocument('<node x="abc" y=""/>')!;
    expect(getXmlElementAttributeNumber(root, 'x') === null).toBe(true);
    expect(getXmlElementAttributeNumber(root, 'y') === null).toBe(true);
  });
});

describe('getXmlElementChildByName', () => {
  it('returns the first matching child element', () => {
    const root = parseXmlDocument('<root><a id="1"/><b/><a id="2"/></root>')!;
    const child = getXmlElementChildByName(root, 'a')!;
    expect(child!.attributes['id']).toEqual('1');
  });
  it('returns none when no child matches', () => {
    const root = parseXmlDocument('<root><a/></root>')!;
    expect(getXmlElementChildByName(root, 'z') === null).toBe(true);
  });
});

describe('getXmlElementChildrenByName', () => {
  it('returns all matching children in document order', () => {
    const root = parseXmlDocument('<root><a id="1"/><b/><a id="2"/></root>')!;
    const matches = getXmlElementChildrenByName(root, 'a');
    const ids: string[] = matches.map((c) => c!.attributes['id']);
    expect(ids).toEqual(['1', '2']);
  });
  it('returns an empty vec when no child matches', () => {
    const root = parseXmlDocument('<root><a/></root>')!;
    expect(getXmlElementChildrenByName(root, 'z').length === 0).toBe(true);
  });
});
