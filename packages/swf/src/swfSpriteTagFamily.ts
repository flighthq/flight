import type { SwfTagFamily } from '@flighthq/types/contract';

import { SwfReader } from './swfReader';
import { readSwfTimeline } from './swfTimelineParse';

// Nested timelines. A sprite body is a tag stream in its own right, walked with the very registry the
// root was given, so a family absent from the document is absent from every symbol inside it too.

// The tag codes this family claims. Declared above the family value rather than at the foot of
// the file because the value reads them when the module initializes.
const TAG_DEFINE_SPRITE = 39;

export const swfSpriteTagFamily: SwfTagFamily = {
  instantiate: {
    hasPlacementContent(parsed, characterId) {
      return parsed.sprites.has(characterId);
    },
  },
  tags: [TAG_DEFINE_SPRITE],
  parse(body, _tag, state) {
    const spriteId = body.readUint16();
    body.readUint16();
    if (!body.valid || spriteId === 0 || state.definedCharacters.has(spriteId)) return false;
    state.definedCharacters.add(spriteId);
    const spriteReader = new SwfReader(body.source, body.pos, body.end);
    const spriteTimeline = readSwfTimeline(spriteReader, state);
    if (spriteTimeline === null || spriteReader.pos !== spriteReader.end) return false;
    state.sprites.set(spriteId, spriteTimeline);
    return true;
  },
};
