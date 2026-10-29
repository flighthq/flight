// Generated from crates/flight-xml/tests/xml_parse_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { parseXmlAttributes, parseXmlDocument } from './contract.ts';

function repeated(value: string, count: number): string {
  let result = '';
  let index: number = 0;
  while (index < count) {
    result += value;
    index += 1;
  }
  return result;
}

describe('parseXmlAttributes', () => {
  it('parses double quoted attributes', () => {
    const attrs = parseXmlAttributes('name="hero" x="10" y="20"');
    expect(attrs['name']).toEqual('hero');
    expect(attrs['x']).toEqual('10');
    expect(attrs['y']).toEqual('20');
  });
  it('parses single quoted attributes', () => {
    const attrs = parseXmlAttributes("name='hero' x='10'");
    expect(attrs['name']).toEqual('hero');
    expect(attrs['x']).toEqual('10');
  });
  it('decodes xml entity amp', () => {
    const attrs = parseXmlAttributes('name="a&amp;b"');
    expect(attrs['name']).toEqual('a&b');
  });
  it('decodes xml entity lt and gt', () => {
    const attrs = parseXmlAttributes('name="a&lt;b&gt;c"');
    expect(attrs['name']).toEqual('a<b>c');
  });
  it('decodes xml entity quot', () => {
    const attrs = parseXmlAttributes("name='say &quot;hi&quot;'");
    expect(attrs['name']).toEqual('say "hi"');
  });
  it('decodes xml entity apos', () => {
    const attrs = parseXmlAttributes('name="it&apos;s"');
    expect(attrs['name']).toEqual("it's");
  });
  it('decodes numeric character references', () => {
    const attrs = parseXmlAttributes('name="&#65;"');
    expect(attrs['name']).toEqual('A');
  });
  it('preserves out of range numeric references without panicking', () => {
    const attrs = parseXmlAttributes('decimal="&#1114112;" hex="&#x110000;"');
    expect(attrs['decimal']).toEqual('&#1114112;');
    expect(attrs['hex']).toEqual('&#x110000;');
  });
  it('returns empty map for empty string', () => {
    expect(parseXmlAttributes('').length === 0).toBe(true);
  });
});

describe('parseXmlDocument', () => {
  it('returns the first top level element as the root', () => {
    const root = parseXmlDocument('<TextureAtlas imagePath="sheet.png"></TextureAtlas>')!;
    expect(root.name).toEqual('TextureAtlas');
    expect(root.attributes['imagePath']).toEqual('sheet.png');
    expect(root.children.length === 0).toBe(true);
  });
  it('parses multiple attributes on a single element', () => {
    const root = parseXmlDocument('<sub x="10" y="20" width="32" height="64"/>')!;
    expect(root.attributes['x']).toEqual('10');
    expect(root.attributes['y']).toEqual('20');
    expect(root.attributes['width']).toEqual('32');
    expect(root.attributes['height']).toEqual('64');
  });
  it('accepts both single and double quoted attribute values', () => {
    const root = parseXmlDocument('<node a=\'single\' b="double"/>')!;
    expect(root.attributes['a']).toEqual('single');
    expect(root.attributes['b']).toEqual('double');
  });
  it('nests children under their parent open tag', () => {
    const xml =
      '<TextureAtlas imagePath="s.png"><SubTexture name="a" x="0" y="0"/><SubTexture name="b" x="8" y="8"/></TextureAtlas>';
    const root = parseXmlDocument(xml)!;
    expect(root.name).toEqual('TextureAtlas');
    expect(root.children.length).toEqual(2);
    expect(root.children[0]!.name).toEqual('SubTexture');
    expect(root.children[0]!.attributes['name']).toEqual('a');
    expect(root.children[1]!.attributes['name']).toEqual('b');
  });
  it('treats self closing tags as leaves rather than opening a scope', () => {
    const xml = '<root><leaf/><sibling/></root>';
    const root = parseXmlDocument(xml)!;
    const names: string[] = root.children.map((c) => c!.name);
    expect(names).toEqual(['leaf', 'sibling']);
  });
  it('supports deep nesting across multiple levels', () => {
    const xml = '<a><b><c value="deep"/></b></a>';
    const root = parseXmlDocument(xml)!;
    expect(root.name).toEqual('a');
    const b = root.children[0]!;
    expect(b.name).toEqual('b');
    const c = b.children[0]!;
    expect(c.name).toEqual('c');
    expect(c.attributes['value']).toEqual('deep');
  });
  it('accepts element nesting with broad margin for authored documents', () => {
    const depth = 128;
    const xml = repeated('<node>', depth) + '<leaf/>' + repeated('</node>', depth);
    expect(parseXmlDocument(xml) !== undefined).toBe(true);
  });
  it('returns none instead of exhausting the call stack on excessive element nesting', () => {
    const depth = 300;
    const xml = repeated('<node>', depth) + '<leaf/>' + repeated('</node>', depth);
    expect(parseXmlDocument(xml) === undefined).toBe(true);
  });
  it('returns none when the input contains no recognizable element', () => {
    expect(parseXmlDocument('') === undefined).toBe(true);
    expect(parseXmlDocument('   just text, no tags   ') === undefined).toBe(true);
  });
  it('tolerates unbalanced close tags without underflowing the stack', () => {
    const root = parseXmlDocument('<a></a></b>')!;
    expect(root.name).toEqual('a');
  });
  it('returns the first element when several share the top level', () => {
    const root = parseXmlDocument('<first/><second/>')!;
    expect(root.name).toEqual('first');
  });
  it('allows dots hyphens and underscores in tag and attribute names', () => {
    const root = parseXmlDocument('<my-tag.v2 data_key="x"/>')!;
    expect(root.name).toEqual('my-tag.v2');
    expect(root.attributes['data_key']).toEqual('x');
  });
  it('strips xml comments', () => {
    const xml = '<root><!-- This is a comment --><child/></root>';
    const doc = parseXmlDocument(xml)!;
    expect(doc.children.length).toEqual(1);
    expect(doc.children[0]!.name).toEqual('child');
  });
  it('strips the xml declaration', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><root/>';
    const doc = parseXmlDocument(xml)!;
    expect(doc.name).toEqual('root');
  });
  it('parses text content', () => {
    const xml = '<root><key>hello</key></root>';
    const doc = parseXmlDocument(xml)!;
    expect(doc.children[0]!.text).toEqual('hello');
  });
  it('keeps a gt inside a quoted attribute value as data not tag end', () => {
    const root = parseXmlDocument('<node attr="a>b"/>')!;
    expect(root.name).toEqual('node');
    expect(root.attributes['attr']).toEqual('a>b');
    expect(root.children.length === 0).toBe(true);
  });
  it('keeps a gt inside a single quoted attribute value and still parses children', () => {
    const root = parseXmlDocument("<root><child path='x>y'/></root>")!;
    expect(root.children.length).toEqual(1);
    expect(root.children[0]!.attributes['path']).toEqual('x>y');
  });
  it('strips a doctype that carries an internal subset', () => {
    const xml =
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ' +
      '"http://www.apple.com/DTDs/PropertyList-1.0.dtd" [ <!ENTITY x "y"> ]>' +
      '<plist version="1.0"/>';
    const doc = parseXmlDocument(xml)!;
    expect(doc.name).toEqual('plist');
    expect(doc.attributes['version']).toEqual('1.0');
  });
  it('strips an internal subset when an entity value contains bracket and gt', () => {
    const xml = '<!DOCTYPE root [<!ENTITY tricky "a ] > b"><!ELEMENT root (#PCDATA)>]>' + '<root value="ok"/>';
    const doc = parseXmlDocument(xml)!;
    expect(doc.name).toEqual('root');
    expect(doc.attributes['value']).toEqual('ok');
  });
  it('strips a doctype when its external identifier contains gt', () => {
    const xml = '<!DOCTYPE root SYSTEM "https://example.invalid/a>b.dtd"><root/>';
    const doc = parseXmlDocument(xml)!;
    expect(doc.name).toEqual('root');
  });
});

describe('parseXmlDocumentInternalDtdEntities', () => {
  function doctype(subset: string, body: string): string {
    return `<?xml version="1.0"?><!DOCTYPE root [${subset}]><root>${body}</root>`;
  }
  it('expands an entity whose replacement is an element', () => {
    const xml = doctype('<!ENTITY dot "<circle r=\'4\'/>">', '&dot;');
    const root = parseXmlDocument(xml)!;
    expect(root.children.length).toEqual(1);
    expect(root.children[0]!.name).toEqual('circle');
    expect(root.children[0]!.attributes['r']).toEqual('4');
  });
  it('expands the same entity at every reference', () => {
    const xml = doctype('<!ENTITY dot "<circle/>">', '&dot;&dot;&dot;');
    const root = parseXmlDocument(xml)!;
    expect(root.children.length).toEqual(3);
  });
  it('expands an entity declared with single quotes', () => {
    const xml = doctype("<!ENTITY dot '<circle/>'>", '&dot;');
    const root = parseXmlDocument(xml)!;
    expect(root.children[0]!.name).toEqual('circle');
  });
  it('expands an entity that references another entity', () => {
    const subset = '<!ENTITY inner "<circle/>"><!ENTITY outer "<g>&inner;</g>">';
    const xml = doctype(subset, '&outer;');
    const root = parseXmlDocument(xml)!;
    const outer = root.children[0]!;
    expect(outer.name).toEqual('g');
    expect(outer.children[0]!.name).toEqual('circle');
  });
  it('expands an entity used as an attribute value', () => {
    const xml = doctype('<!ENTITY w "40">', '<rect width="&w;"/>');
    const root = parseXmlDocument(xml)!;
    expect(root.children[0]!.attributes['width']).toEqual('40');
  });
  it('leaves an undeclared reference alone rather than dropping it', () => {
    const xml = doctype('<!ENTITY dot "<circle/>">', '&missing;');
    const root = parseXmlDocument(xml)!;
    expect(root.text).toEqual('&missing;');
  });
  it('still decodes the predefined entities which no subset needs to declare', () => {
    const xml = doctype('<!ENTITY dot "<circle/>">', 'a &amp; b');
    const root = parseXmlDocument(xml)!;
    expect(root.text).toEqual('a & b');
  });
  it('does not honor external system entity', () => {
    const xml = doctype('<!ENTITY x SYSTEM "/etc/passwd">', '&x;');
    const root = parseXmlDocument(xml)!;
    expect(root.children.length === 0).toBe(true);
    expect(root.text).toEqual('&x;');
  });
  it('does not honor external public entity', () => {
    const xml = doctype('<!ENTITY x PUBLIC "-//X//EN" "http://example.test/x">', '&x;');
    const root = parseXmlDocument(xml)!;
    expect(root.children.length === 0).toBe(true);
    expect(root.text).toEqual('&x;');
  });
  it('does not honor parameter entity', () => {
    const xml = doctype('<!ENTITY % x "<circle/>">', '&x;');
    const root = parseXmlDocument(xml)!;
    expect(root.children.length === 0).toBe(true);
    expect(root.text).toEqual('&x;');
  });
  it('does not expand a nested entity without bound', () => {
    let subset = String.from('<!ENTITY e0 "aaaaaaaaaa">');
    for (let level = 1; level <= 6; level += 1) {
      const prevRef = `&e${level - 1};`;
      const references = repeated(prevRef, 10);
      subset += `<!ENTITY e${level} "${references}">`;
    }
    const xml = doctype(subset, '&e6;');
    const root = parseXmlDocument(xml)!;
    expect(root.text.length < 200_000).toBe(true);
  });
  it('terminates on an entity that references itself', () => {
    const xml = doctype('<!ENTITY loop "&loop;">', '&loop;');
    const root = parseXmlDocument(xml);
    expect(root !== undefined).toBe(true);
  });
});
