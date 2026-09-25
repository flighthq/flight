import type { SwfTagParseState, SwfTagReader } from '@flighthq/types/contract';

import { mergeSwfRectangles, readSwfRectangle } from './swfPrimitive.ts';

// The header every bounded definition tag opens with — a character id and one or two RECTs — shared by
// the shape and text families, which own different halves of that tag range and would otherwise each
// carry their own copy of the prologue.

// Reads the character id and authored extent a bounded definition declares, recording both on the parse
// state, and returns the id. Returns 0 for a record that is truncated, unnumbered, or redefines a
// character already read, which is the caller's signal to abort the stream.
//
// `hasEndBounds` is true for the morph forms, which declare their two endpoints' boxes rather than one.
// The merged box is what everything that only needs an extent reads; a morph additionally keeps its two
// endpoints, because its own box moves with its ratio.
export function readSwfBoundedDefinitionHeader(
  body: SwfTagReader,
  state: SwfTagParseState,
  hasEndBounds: boolean,
): number {
  const characterId = body.readUint16();
  const startBounds = readSwfRectangle(body);
  const endBounds = hasEndBounds ? readSwfRectangle(body) : null;
  if (
    !body.valid ||
    characterId === 0 ||
    startBounds === null ||
    (hasEndBounds && endBounds === null) ||
    state.definedCharacters.has(characterId)
  ) {
    return 0;
  }
  state.definedCharacters.add(characterId);
  state.characterBounds.set(characterId, endBounds === null ? startBounds : mergeSwfRectangles(startBounds, endBounds));
  if (endBounds !== null) state.morphBounds.set(characterId, { end: endBounds, start: startBounds });
  return characterId;
}
