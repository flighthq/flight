import { createSampler, createTexture } from '@flighthq/texture/contract';
import type {
  SwfTagHandler,
  SwfTagParseResult,
  SwfTagParseState,
  SwfTagReader,
  Texture2D,
} from '@flighthq/types/contract';

import { createSwfTexturedSprite } from './swfNode';

// Video characters. A DefineVideoStream declares a packet sequence rather than a browser-playable file,
// so what this family retains is the character's identity and authored extent — enough to materialize
// the display leaf honestly, without pretending those packets are pixels.

const TAG_DEFINE_VIDEO_STREAM = 60;

export const swfVideoHandler: SwfTagHandler = {
  instantiate: {
    createPlacementNode(parsed, characterId, bounds) {
      const video = parsed.videos.get(characterId);
      if (video === undefined) return null;
      return createSwfTexturedSprite(acquireSwfVideoTexture(parsed, characterId, video), bounds);
    },
    hasPlacementContent(parsed, characterId) {
      return parsed.videos.has(characterId);
    },
  },
  tags: [TAG_DEFINE_VIDEO_STREAM],
  parse(body, _tag, state) {
    return readSwfVideoDefinition(body, state);
  },
};

function readSwfVideoDefinition(body: SwfTagReader, state: SwfTagParseState): boolean {
  const characterId = body.readUint16();
  const frameCount = body.readUint16();
  const width = body.readUint16();
  const height = body.readUint16();
  const flags = body.readUint8();
  const codecId = body.readUint8();
  if (!body.valid || characterId === 0 || width === 0 || height === 0 || state.definedCharacters.has(characterId)) {
    return false;
  }
  state.definedCharacters.add(characterId);
  state.characterBounds.set(characterId, { height, width, x: 0, y: 0 });
  state.videos.set(characterId, {
    codecId,
    deblocking: (flags >> 1) & 0x07,
    frameCount,
    height,
    smoothing: (flags & 0x01) !== 0,
    width,
  });
  return true;
}

// Allocates the stable 2D texture identity a video character's Sprites share. Its source deliberately
// stays null: DefineVideoStream declares a packet sequence rather than a browser-playable file, and
// Stage A promises graph structure and authored extents without pretending those packets are pixels.
function acquireSwfVideoTexture(
  parsed: Readonly<SwfTagParseResult>,
  characterId: number,
  definition: Readonly<SwfVideoDefinition>,
): Texture2D {
  let texture = parsed.videoTextures.get(characterId);
  if (texture === undefined) {
    texture = createTexture({
      sampler: createSampler({
        magFilter: definition.smoothing ? 'linear' : 'nearest',
        minFilter: definition.smoothing ? 'linear' : 'nearest',
        mipmaps: false,
      }),
    });
    parsed.videoTextures.set(characterId, texture);
  }
  return texture;
}

interface SwfVideoDefinition {
  codecId: number;
  deblocking: number;
  frameCount: number;
  height: number;
  smoothing: boolean;
  width: number;
}
