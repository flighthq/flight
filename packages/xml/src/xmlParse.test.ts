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
  it('returns the first top-level element as the root', () => {
    const root = parseXmlDocument('<TextureAtlas imagePath="sheet.png"></TextureAtlas>');
    expect(root).not.toBeNull();
    expect(root?.name).toBe('TextureAtlas');
    expect(root?.attributes.imagePath).toBe('sheet.png');
    expect(root?.children).toEqual([]);
  });

  it('parses multiple attributes on a single element', () => {
    const root = parseXmlDocument('<sub x="10" y="20" width="32" height="64"/>');
    expect(root?.attributes).toEqual({ x: '10', y: '20', width: '32', height: '64' });
  });

  it('accepts both single and double quoted attribute values', () => {
    const root = parseXmlDocument(`<node a='single' b="double"/>`);
    expect(root?.attributes).toEqual({ a: 'single', b: 'double' });
  });

  it('nests children under their parent open tag', () => {
    const xml =
      '<TextureAtlas imagePath="s.png">' +
      '<SubTexture name="a" x="0" y="0"/>' +
      '<SubTexture name="b" x="8" y="8"/>' +
      '</TextureAtlas>';
    const root = parseXmlDocument(xml);
    expect(root?.name).toBe('TextureAtlas');
    expect(root?.children.length).toBe(2);
    expect(root?.children[0].name).toBe('SubTexture');
    expect(root?.children[0].attributes.name).toBe('a');
    expect(root?.children[1].attributes.name).toBe('b');
  });

  it('treats self-closing tags as leaves rather than opening a scope', () => {
    const xml = '<root><leaf/><sibling/></root>';
    const root = parseXmlDocument(xml);
    // Both leaf and sibling are direct children of root, not nested.
    expect(root?.children.map((c) => c.name)).toEqual(['leaf', 'sibling']);
  });

  it('supports deep nesting across multiple levels', () => {
    const xml = '<a><b><c value="deep"/></b></a>';
    const root = parseXmlDocument(xml);
    expect(root?.name).toBe('a');
    const b = root?.children[0];
    expect(b?.name).toBe('b');
    const c = b?.children[0];
    expect(c?.name).toBe('c');
    expect(c?.attributes.value).toBe('deep');
  });

  it('returns null when the input contains no recognizable element', () => {
    expect(parseXmlDocument('')).toBeNull();
    expect(parseXmlDocument('   just text, no tags   ')).toBeNull();
  });

  it('tolerates unbalanced close tags without underflowing the stack', () => {
    // An extra close tag must not pop past the implicit root or throw.
    const root = parseXmlDocument('<a></a></b>');
    expect(root?.name).toBe('a');
  });

  it('returns the first element when several share the top level', () => {
    const root = parseXmlDocument('<first/><second/>');
    expect(root?.name).toBe('first');
  });

  it('allows dots, hyphens, and underscores in tag and attribute names', () => {
    const root = parseXmlDocument('<my-tag.v2 data_key="x"/>');
    expect(root?.name).toBe('my-tag.v2');
    expect(root?.attributes.data_key).toBe('x');
  });

  it('strips XML comments', () => {
    const xml = '<root><!-- This is a comment --><child/></root>';
    const doc = parseXmlDocument(xml);
    expect(doc?.children).toHaveLength(1);
    expect(doc?.children[0]?.name).toBe('child');
  });

  it('strips the XML declaration', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><root/>';
    const doc = parseXmlDocument(xml);
    expect(doc?.name).toBe('root');
  });

  it('parses text content', () => {
    const xml = '<root><key>hello</key></root>';
    const doc = parseXmlDocument(xml);
    expect(doc?.children[0]?.text).toBe('hello');
  });

  it('keeps a > inside a quoted attribute value as data, not tag-end', () => {
    const root = parseXmlDocument('<node attr="a>b"/>');
    expect(root?.name).toBe('node');
    expect(root?.attributes.attr).toBe('a>b');
    expect(root?.children).toEqual([]);
  });

  it('keeps a > inside a single-quoted attribute value and still parses children', () => {
    const root = parseXmlDocument(`<root><child path='x>y'/></root>`);
    expect(root?.children.length).toBe(1);
    expect(root?.children[0].attributes.path).toBe('x>y');
  });

  it('strips a DOCTYPE that carries an internal subset', () => {
    const xml =
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ' +
      '"http://www.apple.com/DTDs/PropertyList-1.0.dtd" [ <!ENTITY x "y"> ]>' +
      '<plist version="1.0"/>';
    const doc = parseXmlDocument(xml);
    expect(doc?.name).toBe('plist');
    expect(doc?.attributes.version).toBe('1.0');
  });
});
