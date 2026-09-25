import type { SwfTagHandler, SwfTagPlacement, SwfTagReader } from '@flighthq/types/contract';
import { BlendMode } from '@flighthq/types/contract';

import { EMPTY_ADJUSTMENTS, EMPTY_EFFECTS, readSwfColorTransform } from './swfAppearance.ts';
import { IDENTITY_MATRIX, readSwfMatrix } from './swfPrimitive.ts';

const TAG_PLACE_OBJECT = 4;
const TAG_PLACE_OBJECT_2 = 26;
const TAG_REMOVE_OBJECT = 5;
const TAG_REMOVE_OBJECT_2 = 28;

export const swfPlaceObjectHandler: SwfTagHandler = {
  tags: [TAG_PLACE_OBJECT, TAG_REMOVE_OBJECT, TAG_PLACE_OBJECT_2, TAG_REMOVE_OBJECT_2],
  parse(body, tag, _state, timeline) {
    if (tag === TAG_PLACE_OBJECT) readLegacyPlaceObject(body, timeline.placements);
    else if (tag === TAG_REMOVE_OBJECT) readLegacyRemoveObject(body, timeline.placements);
    else if (tag === TAG_REMOVE_OBJECT_2) timeline.placements.delete(body.readUint16());
    else readPlaceObject2(body, timeline.placements);
    return true;
  },
};

function readPlaceObject2(body: SwfTagReader, placements: Map<number, SwfTagPlacement>): void {
  const flags = body.readUint8();
  const depth = body.readUint16();
  const existing = placements.get(depth);
  const isMove = (flags & 0x01) !== 0;
  const inherited = isMove ? existing : undefined;
  const hasCharacter = (flags & 0x02) !== 0;
  const directLinkage = inherited?.directLinkage ?? null;
  const characterId = hasCharacter ? body.readUint16() : (inherited?.characterId ?? 0);
  const matrix = (flags & 0x04) !== 0 ? readSwfMatrix(body) : (inherited?.matrix ?? IDENTITY_MATRIX);
  const colorTransform =
    (flags & 0x08) !== 0
      ? readSwfColorTransform(body)
      : { alpha: inherited?.alpha ?? 1, colorAdjustments: inherited?.colorTransformAdjustments ?? null };
  const ratio = (flags & 0x10) !== 0 ? body.readUint16() / MORPH_RATIO_ONE : (inherited?.ratio ?? 0);
  const name = (flags & 0x20) !== 0 ? body.readString() : (inherited?.name ?? null);
  const clipDepth = (flags & 0x40) !== 0 ? body.readUint16() : (inherited?.clipDepth ?? 0);

  if (!body.valid || (isMove && existing === undefined) || (characterId === 0 && directLinkage === null)) return;
  placements.set(depth, {
    advancedBlendMode: inherited?.advancedBlendMode ?? null,
    alpha: colorTransform.alpha,
    blendMode: inherited?.blendMode ?? BlendMode.Normal,
    characterId,
    clipDepth,
    colorAdjustments: colorTransform.colorAdjustments,
    colorTransformAdjustments: colorTransform.colorAdjustments,
    depth,
    directLinkage,
    effects: inherited?.effects ?? EMPTY_EFFECTS,
    filterAdjustments: inherited?.filterAdjustments ?? EMPTY_ADJUSTMENTS,
    matrix,
    name,
    ratio,
  });
}

function readLegacyPlaceObject(body: SwfTagReader, placements: Map<number, SwfTagPlacement>): void {
  const characterId = body.readUint16();
  const depth = body.readUint16();
  const matrix = readSwfMatrix(body);
  const colorTransform = body.pos < body.end ? readSwfColorTransform(body, 3) : null;
  if (!body.valid || characterId === 0) return;
  placements.set(depth, {
    advancedBlendMode: null,
    alpha: 1,
    blendMode: BlendMode.Normal,
    characterId,
    clipDepth: 0,
    colorAdjustments: colorTransform?.colorAdjustments ?? null,
    colorTransformAdjustments: colorTransform?.colorAdjustments ?? null,
    depth,
    directLinkage: null,
    effects: EMPTY_EFFECTS,
    filterAdjustments: EMPTY_ADJUSTMENTS,
    matrix,
    name: null,
    ratio: 0,
  });
}

function readLegacyRemoveObject(body: SwfTagReader, placements: Map<number, SwfTagPlacement>): void {
  const characterId = body.readUint16();
  const depth = body.readUint16();
  if (!body.valid) return;
  const existing = placements.get(depth);
  if (existing?.characterId === characterId) placements.delete(depth);
}

const MORPH_RATIO_ONE = 0xffff;
