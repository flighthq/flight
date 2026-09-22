import type { SwfTagHandler, SwfTagParseState, SwfTagReader } from '@flighthq/types/contract';

import { SWF_LOSSLESS_ALPHA_MIME_TYPE, SWF_LOSSLESS_MIME_TYPE } from './swfImageMimeType';

const TAG_DEFINE_BITS_LOSSLESS = 20;

const TAG_DEFINE_BITS_LOSSLESS_2 = 36;

export const swfLosslessBitmapHandler: SwfTagHandler = {
  tags: [TAG_DEFINE_BITS_LOSSLESS, TAG_DEFINE_BITS_LOSSLESS_2],
  parse(body, tag, state) {
    return readSwfLosslessBitmapDefinition(body, state, tag === TAG_DEFINE_BITS_LOSSLESS_2);
  },
};

function readSwfLosslessBitmapDefinition(body: SwfTagReader, state: SwfTagParseState, hasAlpha: boolean): boolean {
  const characterId = body.readUint16();
  const payloadStart = body.pos;
  const format = body.readUint8();
  const width = body.readUint16();
  const height = body.readUint16();
  if (format === LOSSLESS_BITMAP_FORMAT_COLORMAPPED) body.readUint8();
  const validFormat =
    format === LOSSLESS_BITMAP_FORMAT_COLORMAPPED ||
    format === LOSSLESS_BITMAP_FORMAT_32_BIT ||
    (!hasAlpha && format === LOSSLESS_BITMAP_FORMAT_15_BIT);
  if (
    !body.valid ||
    characterId === 0 ||
    width === 0 ||
    height === 0 ||
    state.definedCharacters.has(characterId) ||
    !validFormat
  ) {
    return false;
  }
  state.definedCharacters.add(characterId);
  state.characterBounds.set(characterId, { height, width, x: 0, y: 0 });
  state.images.set(characterId, {
    bytes: body.source.subarray(payloadStart, body.end),
    mimeType: hasAlpha ? SWF_LOSSLESS_ALPHA_MIME_TYPE : SWF_LOSSLESS_MIME_TYPE,
  });
  return true;
}

const LOSSLESS_BITMAP_FORMAT_15_BIT = 4;

const LOSSLESS_BITMAP_FORMAT_32_BIT = 5;

const LOSSLESS_BITMAP_FORMAT_COLORMAPPED = 3;
