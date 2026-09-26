import { RequirementFacet } from '@flighthq/types/contract';

import { parseRiveRequirements, RIVE_REQUIREMENT_KEY_NAMESPACE } from './riveRequirements.ts';

// Core type keys from the shipped object model: Artboard 1, Node 2, Shape 3, Rectangle 7, Path 12,
// SolidColor 18, StateMachine 53, Text 134.
const ARTBOARD = 1;
const NODE = 2;
const SHAPE = 3;
const RECTANGLE = 7;
const PATH = 12;
const SOLID_COLOR = 18;
const TEXT = 134;

describe('parseRiveRequirements', () => {
  it('emits one namespaced document.format requirement per family the file resolves to', () => {
    expect(parseRiveRequirements(riveFile([SHAPE])).requirements).toEqual([
      { facet: RequirementFacet.DocumentFormat, key: 'riv.Shape' },
    ]);
  });

  // ★ THE CASE THE WHOLE KEY SHAPE EXISTS FOR, and the chain is not the one most readers would guess.
  // Rectangle -> ParametricPath -> Path, so a file of Rectangles is read by the PATH family. Emitting
  // `riv.Rectangle` would name something no registrar claims, so a correctly-handled file would report as a
  // gap. Asserted with the inherited type ALONE, so nothing else could be supplying the key.
  it('resolves an inherited type to the family that actually reads it', () => {
    const keys = keysOf(riveFile([RECTANGLE]));
    expect(keys).toEqual(['riv.Path']);
    expect(keys).not.toContain('riv.Rectangle');
  });

  it('names each family once, however many objects resolve to it', () => {
    expect(keysOf(riveFile([PATH, RECTANGLE, PATH]))).toEqual(['riv.Path']);
  });

  it('emits every distinct family a mixed document needs', () => {
    expect(keysOf(riveFile([TEXT, SOLID_COLOR, SHAPE]))).toEqual(['riv.Shape', 'riv.SolidColor', 'riv.Text']);
  });

  // ★ A TYPE NO FAMILY READS MUST STAY VISIBLE. Node's whole chain — Node -> TransformComponent ->
  // WorldTransformComponent -> ContainerComponent -> Component — contains no registered key, so it keeps its
  // own name and surfaces as a gap. Resolving it to some nearby family would claim an implementation that
  // would not in fact have read the object.
  it('keeps the type name for a defined type that reaches no registered family', () => {
    expect(keysOf(riveFile([NODE]))).toEqual(['riv.Node']);
  });

  // The counterpart, and a second inherited case worth pinning because the answer is not obvious: an Artboard
  // IS a LayoutComponent (Artboard -> LayoutComponent -> Drawable -> Node -> ...), so the layout family reads
  // it. I asserted `riv.Artboard` here first and the chain said otherwise.
  it('resolves an Artboard to the layout family that reads it', () => {
    expect(keysOf(riveFile([ARTBOARD]))).toEqual(['riv.LayoutComponent']);
  });

  it('labels a key this object model does not define, rather than dropping it', () => {
    expect(keysOf(riveFile([9999]))).toEqual(['riv.Unknown(9999)']);
  });

  it('emits nothing for a readable document that declares no objects', () => {
    expect(parseRiveRequirements(riveFile([])).requirements).toEqual([]);
  });

  // A file this reader cannot traverse requires nothing it can name — and the caller distinguishes that from an
  // empty document through the readability probe, not through this set.
  it('emits nothing for a file it cannot read', () => {
    expect(parseRiveRequirements(new Uint8Array([0x4e, 0x4f, 0x50, 0x45])).requirements).toEqual([]);
  });

  it('covers the document.format facet, so a build knows the question was asked', () => {
    expect(parseRiveRequirements(riveFile([SHAPE])).covers).toEqual([RequirementFacet.DocumentFormat]);
  });

  it('namespaces every key, since Shape and Text are names other formats reuse', () => {
    for (const key of keysOf(riveFile([SHAPE, TEXT]))) {
      expect(key.startsWith(`${RIVE_REQUIREMENT_KEY_NAMESPACE}.`)).toBe(true);
    }
  });
});

function keysOf(bytes: Uint8Array): readonly string[] {
  return parseRiveRequirements(bytes).requirements.map((requirement) => requirement.key);
}

// A `.riv` container: 'RIVE', varuint major/minor/fileId, a terminated (here empty) property table of contents,
// then one varuint type key per object each terminated by a zero property key.
function riveFile(typeKeys: readonly number[]): Uint8Array {
  const bytes: number[] = [0x52, 0x49, 0x56, 0x45];
  bytes.push(...varUint(7), ...varUint(0), ...varUint(0));
  bytes.push(0);
  for (const typeKey of typeKeys) bytes.push(...varUint(typeKey), 0);
  return new Uint8Array(bytes);
}

function varUint(value: number): number[] {
  const out: number[] = [];
  let remaining = value;
  while (remaining > 0x7f) {
    out.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  out.push(remaining);
  return out;
}
