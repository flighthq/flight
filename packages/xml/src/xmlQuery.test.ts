import { parseXmlDocument } from './xmlParse';
import {
  getXmlElementAttribute,
  getXmlElementAttributeNumber,
  getXmlElementChildByName,
  getXmlElementChildrenByName,
} from './xmlQuery';

describe('getXmlElementAttribute', () => {
  it('returns the attribute value when present', () => {
    const root = parseXmlDocument('<node name="hero" x="10"/>');
    expect(getXmlElementAttribute(root!, 'name')).toBe('hero');
  });

  it('returns null when the attribute is absent', () => {
    const root = parseXmlDocument('<node name="hero"/>');
    expect(getXmlElementAttribute(root!, 'missing')).toBeNull();
  });

  it('returns an empty-string attribute rather than null', () => {
    const root = parseXmlDocument('<node label=""/>');
    expect(getXmlElementAttribute(root!, 'label')).toBe('');
  });
});

describe('getXmlElementAttributeNumber', () => {
  it('parses a numeric attribute', () => {
    const root = parseXmlDocument('<node x="10" scale="1.5"/>');
    expect(getXmlElementAttributeNumber(root!, 'x')).toBe(10);
    expect(getXmlElementAttributeNumber(root!, 'scale')).toBe(1.5);
  });

  it('returns null when the attribute is absent', () => {
    const root = parseXmlDocument('<node x="10"/>');
    expect(getXmlElementAttributeNumber(root!, 'missing')).toBeNull();
  });

  it('returns null when the value is not a finite number', () => {
    const root = parseXmlDocument('<node x="abc" y=""/>');
    expect(getXmlElementAttributeNumber(root!, 'x')).toBeNull();
    expect(getXmlElementAttributeNumber(root!, 'y')).toBeNull();
  });
});

describe('getXmlElementChildByName', () => {
  it('returns the first matching child element', () => {
    const root = parseXmlDocument('<root><a id="1"/><b/><a id="2"/></root>');
    expect(getXmlElementChildByName(root!, 'a')?.attributes.id).toBe('1');
  });

  it('returns null when no child matches', () => {
    const root = parseXmlDocument('<root><a/></root>');
    expect(getXmlElementChildByName(root!, 'z')).toBeNull();
  });
});

describe('getXmlElementChildrenByName', () => {
  it('returns all matching children in document order', () => {
    const root = parseXmlDocument('<root><a id="1"/><b/><a id="2"/></root>');
    const matches = getXmlElementChildrenByName(root!, 'a');
    expect(matches.map((c) => c.attributes.id)).toEqual(['1', '2']);
  });

  it('returns an empty array when no child matches', () => {
    const root = parseXmlDocument('<root><a/></root>');
    expect(getXmlElementChildrenByName(root!, 'z')).toEqual([]);
  });
});
