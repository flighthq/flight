import type { FlightDocumentRefusalReason } from '@flighthq/types/contract';
import { expectTypeOf } from 'vitest';

import { parseSceneDocumentYamlSubset } from './sceneDocumentYamlSubset';

describe('parseSceneDocumentYamlSubset', () => {
  it('types every emitted refusal as a subset of the public taxonomy', () => {
    type Refusal = Extract<ReturnType<typeof parseSceneDocumentYamlSubset>, { readonly ok: false }>;
    expectTypeOf<Refusal['kind']>().toMatchTypeOf<FlightDocumentRefusalReason>();
  });

  it('parses block sequences together with block and flow mappings', () => {
    expect(
      parseSceneDocumentYamlSubset(`scene:
  kind: Scene2D
  position: { x: 1, y: -2, metadata: { visible: true } }
  children:
    - kind: Sprite
      name: hero
    - { kind: Shape, visible: false }
`),
    ).toEqual({
      ok: true,
      value: {
        scene: {
          kind: 'Scene2D',
          position: { x: 1, y: -2, metadata: { visible: true } },
          children: [
            { kind: 'Sprite', name: 'hero' },
            { kind: 'Shape', visible: false },
          ],
        },
      },
    });
  });

  it('applies explicit scalar rules without YAML 1.1 implicit typing', () => {
    expect(
      parseSceneDocumentYamlSubset(`nullValue: null
trueValue: true
falseValue: false
integer: -12
decimal: 1.25
exponent: -1.25e2
color: 0x3366ccff
legacyNo: no
legacyOff: off
leadingZero: 012
sexagesimal: 1:20
quoted: "line\\nvalue\\u0021"
singleQuoted: 'Flight''s subset'
`),
    ).toEqual({
      ok: true,
      value: {
        nullValue: null,
        trueValue: true,
        falseValue: false,
        integer: -12,
        decimal: 1.25,
        exponent: -125,
        color: 0x3366ccff,
        legacyNo: 'no',
        legacyOff: 'off',
        leadingZero: '012',
        sexagesimal: '1:20',
        quoted: 'line\nvalue!',
        singleQuoted: "Flight's subset",
      },
    });
  });

  it('uses one token-aware scan for quoted, plain, escaped, and commented indicators', () => {
    expect(
      parseSceneDocumentYamlSubset(`quoted: "&anchor *alias !!tag --- ... [ ] { } , # literal"
escaped: "escaped quote: \\" [still scalar]"
single: 'it''s [scalar] &not-anchor'
ampersand: rock&roll
bang: bang!value
apostrophe: don't
url: https://host/a#fragment
# &anchor *alias !!tag --- ... [ ] { } ,
`),
    ).toEqual({
      ok: true,
      value: {
        quoted: '&anchor *alias !!tag --- ... [ ] { } , # literal',
        escaped: 'escaped quote: " [still scalar]',
        single: "it's [scalar] &not-anchor",
        ampersand: 'rock&roll',
        bang: 'bang!value',
        apostrophe: "don't",
        url: 'https://host/a#fragment',
      },
    });
  });

  it.each([
    ['value: &root { child: true }', 'flight-document.unsupported.anchor'],
    ['value: *root', 'flight-document.unsupported.alias'],
    ['value: !!str text', 'flight-document.unsupported.tag'],
    ['value: !local text', 'flight-document.unsupported.tag'],
    ['---\nvalue: true', 'flight-document.unsupported.document-separator'],
    ['...\n', 'flight-document.unsupported.document-separator'],
  ])('names the out-of-subset refusal for %s', (source, kind) => {
    const refusal = expectRefusal(source, kind);
    expect(refusal.limit).toBeNull();
    expect(refusal.actual).toBeNull();
  });

  it('recovers lexical state before refusing a real indicator after plain apostrophes and escapes', () => {
    expectRefusal("value: don't &root", 'flight-document.unsupported.anchor');
    expectRefusal('value: "quoted \\" value" &root', 'flight-document.unsupported.anchor');
  });

  it('names malformed and ambiguous constructs instead of guessing', () => {
    expectRefusal('items: [one, two]', 'flight-document.unsupported.flow-sequence');
    expectRefusal('value: |\n  text', 'flight-document.unsupported.block-scalar');
    expectRefusal('value: 1\nvalue: 2', 'flight-document.syntax.duplicate-key');
    expectRefusal('value: 1e999', 'flight-document.scalar.number-out-of-range');
    expectRefusal('value: "bad\\q"', 'flight-document.syntax.invalid-escape');
  });

  it('accepts exactly 4,194,304 document code units and refuses the next code unit first', () => {
    const atLimit = `#${'x'.repeat(4_194_303)}`;
    expect(atLimit.length).toBe(4_194_304);
    expect(parseSceneDocumentYamlSubset(atLimit)).toEqual({ ok: true, value: null });

    const refusal = expectRefusal(`${atLimit}x`, 'flight-document.limit.document-code-units');
    expect(refusal).toMatchObject({ limit: 4_194_304, actual: 4_194_305, offset: 4_194_304 });

    const crlfRefusal = expectRefusal('\r\n'.repeat(2_097_153), 'flight-document.limit.document-code-units');
    expect(crlfRefusal).toMatchObject({
      limit: 4_194_304,
      actual: 4_194_306,
      offset: 4_194_304,
      line: 2_097_153,
      column: 1,
    });

    const astralRefusal = expectRefusal('😀'.repeat(2_097_153), 'flight-document.limit.document-code-units');
    expect(astralRefusal).toMatchObject({ limit: 4_194_304, actual: 4_194_306, offset: 4_194_304 });
  });

  it('accepts exactly 64 nested collections and refuses collection 65', () => {
    expect(parseSceneDocumentYamlSubset(createNestedFlowMapping(64)).ok).toBe(true);

    const refusal = expectRefusal(createNestedFlowMapping(65), 'flight-document.limit.nesting-depth');
    expect(refusal).toMatchObject({ limit: 64, actual: 65 });
  });

  it('accepts exactly 65,536 sequence items and refuses item 65,537 before append', () => {
    const atLimit = Array.from({ length: 65_536 }, () => '- 0').join('\n');
    const result = parseSceneDocumentYamlSubset(atLimit);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(65_536);

    const refusal = expectRefusal(`${atLimit}\n- 0`, 'flight-document.limit.collection-entries');
    expect(refusal).toMatchObject({ limit: 65_536, actual: 65_537 });
  });

  it('accepts exactly 65,536 mapping pairs and refuses pair 65,537 before insertion', () => {
    const atLimit = createBlockMapping(65_536);
    expect(parseSceneDocumentYamlSubset(atLimit).ok).toBe(true);

    const refusal = expectRefusal(`${atLimit}\nk65536: 0`, 'flight-document.limit.collection-entries');
    expect(refusal).toMatchObject({ limit: 65_536, actual: 65_537 });
  });

  it('accepts exactly 65,536 decoded scalar code units and refuses code unit 65,537', () => {
    const atLimit = 'x'.repeat(65_536);
    expect(parseSceneDocumentYamlSubset(atLimit)).toEqual({ ok: true, value: atLimit });

    const refusal = expectRefusal(`${atLimit}x`, 'flight-document.limit.scalar-code-units');
    expect(refusal).toMatchObject({ limit: 65_536, actual: 65_537 });
  });

  it('counts escaped and astral scalar content by decoded UTF-16 code units', () => {
    const escapedAtLimit = `"${'\\u0061'.repeat(65_536)}"`;
    const escapedResult = parseSceneDocumentYamlSubset(escapedAtLimit);
    expect(escapedResult.ok).toBe(true);
    if (escapedResult.ok) expect((escapedResult.value as string).length).toBe(65_536);
    const escapedRefusal = expectRefusal(`"${'\\u0061'.repeat(65_537)}"`, 'flight-document.limit.scalar-code-units');
    expect(escapedRefusal).toMatchObject({ limit: 65_536, actual: 65_537 });

    const astralAtLimit = '😀'.repeat(32_768);
    expect(astralAtLimit.length).toBe(65_536);
    expect(parseSceneDocumentYamlSubset(astralAtLimit).ok).toBe(true);
    const astralRefusal = expectRefusal(`${astralAtLimit}😀`, 'flight-document.limit.scalar-code-units');
    expect(astralRefusal).toMatchObject({ limit: 65_536, actual: 65_537 });
  });

  it('accepts exactly 256 decoded key code units and refuses key code unit 257 before lookup', () => {
    const plainAtLimit = 'k'.repeat(256);
    expect(parseSceneDocumentYamlSubset(`${plainAtLimit}: true`).ok).toBe(true);
    const plainRefusal = expectRefusal(`${plainAtLimit}k: true`, 'flight-document.limit.key-code-units');
    expect(plainRefusal).toMatchObject({ limit: 256, actual: 257 });

    const quotedAtLimit = `${'k'.repeat(255)}"`;
    expect(parseSceneDocumentYamlSubset(`"${'k'.repeat(255)}\\"": true`).ok).toBe(true);
    expect(quotedAtLimit.length).toBe(256);
    const quotedRefusal = expectRefusal(`"${'k'.repeat(256)}\\"": true`, 'flight-document.limit.key-code-units');
    expect(quotedRefusal).toMatchObject({ limit: 256, actual: 257 });
  });

  it('accepts exactly 262,144 total nodes and refuses node 262,145 before allocation', () => {
    expect(parseSceneDocumentYamlSubset(createNodeBoundDocument(65_531)).ok).toBe(true);

    const refusal = expectRefusal(createNodeBoundDocument(65_532), 'flight-document.limit.total-nodes');
    expect(refusal).toMatchObject({ limit: 262_144, actual: 262_145 });
  });
});

function createBlockMapping(size: number): string {
  return Array.from({ length: size }, (_, index) => `k${index}: 0`).join('\n');
}

function createNestedFlowMapping(depth: number): string {
  return `${'{ value: '.repeat(depth)}null${' }'.repeat(depth)}`;
}

function createNodeBoundDocument(lastCollectionSize: number): string {
  return [65_536, 65_536, 65_536, lastCollectionSize]
    .map((size) => `-\n${Array.from({ length: size }, () => '  - 0').join('\n')}`)
    .join('\n');
}

function expectRefusal(source: string, kind: string) {
  const result = parseSceneDocumentYamlSubset(source);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error(`Expected ${kind}, received a parsed value`);
  expect(result.kind).toBe(kind);
  expect(result.offset).toBeGreaterThanOrEqual(0);
  expect(result.line).toBeGreaterThan(0);
  expect(result.column).toBeGreaterThan(0);
  return result;
}
