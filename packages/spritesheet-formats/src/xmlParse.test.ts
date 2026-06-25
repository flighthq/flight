import { parseXmlAttributes, parseXmlDocument } from './xmlParse';

describe('parseXmlAttributes', () => {
  it('parses double-quoted attributes', () => {
    const attrs = parseXmlAttributes('name="hero" x="10" y="20"');
    expect(attrs['name']).toBe('hero');
    expect(attrs['x']).toBe('10');
    expect(attrs['y']).toBe('20');
  });
  it('parses single-quoted attributes', () => {
    const attrs = parseXmlAttributes("name='hero' x='10'");
    expect(attrs['name']).toBe('hero');
    expect(attrs['x']).toBe('10');
  });
  it('decodes XML entity &amp;', () => {
    const attrs = parseXmlAttributes('name="a&amp;b"');
    expect(attrs['name']).toBe('a&b');
  });
  it('decodes XML entity &lt; and &gt;', () => {
    const attrs = parseXmlAttributes('name="a&lt;b&gt;c"');
    expect(attrs['name']).toBe('a<b>c');
  });
  it('decodes XML entity &quot;', () => {
    const attrs = parseXmlAttributes("name='say &quot;hi&quot;'");
    expect(attrs['name']).toBe('say "hi"');
  });
  it('decodes XML entity &apos;', () => {
    const attrs = parseXmlAttributes('name="it&apos;s"');
    expect(attrs['name']).toBe("it's");
  });
  it('decodes numeric character references', () => {
    const attrs = parseXmlAttributes('name="&#65;"');
    expect(attrs['name']).toBe('A');
  });
  it('returns empty object for empty string', () => {
    expect(parseXmlAttributes('')).toEqual({});
  });
});

describe('parseXmlDocument', () => {
  it('parses a minimal self-closing element', () => {
    const doc = parseXmlDocument('<Foo bar="1"/>');
    expect(doc?.name).toBe('Foo');
    expect(doc?.attributes['bar']).toBe('1');
    expect(doc?.children).toHaveLength(0);
  });
  it('parses a document with children', () => {
    const xml = '<root><child name="a"/><child name="b"/></root>';
    const doc = parseXmlDocument(xml);
    expect(doc?.name).toBe('root');
    expect(doc?.children).toHaveLength(2);
    expect(doc?.children[0]?.attributes['name']).toBe('a');
    expect(doc?.children[1]?.attributes['name']).toBe('b');
  });
  it('strips XML comments', () => {
    const xml = '<root><!-- This is a comment --><child/></root>';
    const doc = parseXmlDocument(xml);
    expect(doc?.children).toHaveLength(1);
    expect(doc?.children[0]?.name).toBe('child');
  });
  it('strips XML declaration', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><root/>';
    const doc = parseXmlDocument(xml);
    expect(doc?.name).toBe('root');
  });
  it('parses text content', () => {
    const xml = '<root><key>hello</key></root>';
    const doc = parseXmlDocument(xml);
    expect(doc?.children[0]?.text).toBe('hello');
  });
  it('handles single-quoted attributes', () => {
    const xml = "<root name='test'/>";
    const doc = parseXmlDocument(xml);
    expect(doc?.attributes['name']).toBe('test');
  });
  it('parses a TextureAtlas with SubTexture elements', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TextureAtlas imagePath="atlas.png">
  <SubTexture name="hero" x="0" y="0" width="64" height="64"/>
</TextureAtlas>`;
    const doc = parseXmlDocument(xml);
    expect(doc?.name).toBe('TextureAtlas');
    expect(doc?.attributes['imagePath']).toBe('atlas.png');
    expect(doc?.children[0]?.name).toBe('SubTexture');
    expect(doc?.children[0]?.attributes['name']).toBe('hero');
  });
  it('returns null for empty string', () => {
    expect(parseXmlDocument('')).toBeNull();
  });
});
