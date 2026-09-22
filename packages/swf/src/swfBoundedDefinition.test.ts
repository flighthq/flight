import { readSwfBoundedDefinitionHeader } from './swfBoundedDefinition';
import { SwfReader } from './swfReader';
import { createRectangle, createSwfTestParseState, joinBytes, uint16 } from './swfTagStreamTestHelper';

describe('readSwfBoundedDefinitionHeader', () => {
  it('records the character and its authored extent, and returns the id', () => {
    const state = createSwfTestParseState();
    const body = reader(joinBytes(uint16(7), createRectangle(0, 400, 0, 200)));

    expect(readSwfBoundedDefinitionHeader(body, state, false)).toBe(7);
    expect(state.characterBounds.get(7)).toEqual({ height: 10, width: 20, x: 0, y: 0 });
    expect(state.definedCharacters.has(7)).toBe(true);
    expect(state.morphBounds.has(7)).toBe(false);
  });

  // A morph's own box moves with its ratio, so both endpoints are kept beside the merged extent that
  // everything needing only a size reads.
  it('keeps both endpoints for a morph, and merges them for the shared extent', () => {
    const state = createSwfTestParseState();
    const body = reader(joinBytes(uint16(3), createRectangle(0, 200, 0, 200), createRectangle(0, 400, 0, 400)));

    expect(readSwfBoundedDefinitionHeader(body, state, true)).toBe(3);
    expect(state.characterBounds.get(3)).toEqual({ height: 20, width: 20, x: 0, y: 0 });
    expect(state.morphBounds.get(3)).toEqual({
      end: { height: 20, width: 20, x: 0, y: 0 },
      start: { height: 10, width: 10, x: 0, y: 0 },
    });
  });

  it('refuses character 0, which the format reserves', () => {
    const state = createSwfTestParseState();
    expect(
      readSwfBoundedDefinitionHeader(reader(joinBytes(uint16(0), createRectangle(0, 1, 0, 1))), state, false),
    ).toBe(0);
    expect(state.characterBounds.size).toBe(0);
  });

  it('refuses a second definition of a character already read', () => {
    const state = createSwfTestParseState();
    const first = joinBytes(uint16(5), createRectangle(0, 200, 0, 200));
    expect(readSwfBoundedDefinitionHeader(reader(first), state, false)).toBe(5);
    expect(readSwfBoundedDefinitionHeader(reader(first), state, false)).toBe(0);
  });

  it('refuses a record truncated before its extent', () => {
    const state = createSwfTestParseState();
    expect(readSwfBoundedDefinitionHeader(reader(uint16(9)), state, false)).toBe(0);
    expect(state.definedCharacters.has(9)).toBe(false);
  });

  // A morph declaring only its start box is a truncated record, not a static shape: reading it as one
  // would leave every later record in the stream misaligned.
  it('refuses a morph record missing its second extent', () => {
    const state = createSwfTestParseState();
    const body = reader(joinBytes(uint16(4), createRectangle(0, 200, 0, 200)));
    expect(readSwfBoundedDefinitionHeader(body, state, true)).toBe(0);
  });
});

function reader(bytes: Uint8Array): SwfReader {
  return new SwfReader(bytes, 0, bytes.length);
}
