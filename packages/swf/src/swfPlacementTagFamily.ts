import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  Adjustment,
  Effect,
  ImportDiagnostic,
  SwfTagFamily,
  SwfTagPlacement,
  SwfTagReader,
} from '@flighthq/types/contract';
import { BlendMode, ImportDiagnosticSeverity } from '@flighthq/types/contract';

import {
  EMPTY_ADJUSTMENTS,
  EMPTY_EFFECTS,
  joinSwfColorAdjustments,
  readSwfColorTransform,
  resolveSwfAdvancedBlendMode,
  resolveSwfBlendMode,
} from './swfAppearance';
import { readSwfFilterList } from './swfFilter';
import { IDENTITY_MATRIX, readSwfMatrix } from './swfPrimitive';

// The display-list records: what a frame places, where, and how it is tinted, blended and filtered.
// These are the tags that build the timeline itself, so a build that renders anything at all registers
// this family.

// The tag codes this family claims. Declared above the family value rather than at the foot of
// the file because the value reads them when the module initializes.
const TAG_PLACE_OBJECT = 4;
const TAG_PLACE_OBJECT_2 = 26;
const TAG_PLACE_OBJECT_3 = 70;
const TAG_PLACE_OBJECT_4 = 94;
const TAG_REMOVE_OBJECT = 5;
const TAG_REMOVE_OBJECT_2 = 28;

export const swfPlacementTagFamily: SwfTagFamily = {
  tags: [
    TAG_PLACE_OBJECT,
    TAG_PLACE_OBJECT_2,
    TAG_PLACE_OBJECT_3,
    TAG_PLACE_OBJECT_4,
    TAG_REMOVE_OBJECT,
    TAG_REMOVE_OBJECT_2,
  ],
  parse(body, tag, state, timeline) {
    if (tag === TAG_PLACE_OBJECT) readLegacyPlaceObject(body, timeline.placements);
    else if (tag === TAG_REMOVE_OBJECT) readLegacyRemoveObject(body, timeline.placements);
    // RemoveObject2 names only the depth, so the record is the depth and nothing else.
    else if (tag === TAG_REMOVE_OBJECT_2) timeline.placements.delete(body.readUint16());
    else {
      const extended = tag === TAG_PLACE_OBJECT_3 || tag === TAG_PLACE_OBJECT_4;
      readPlaceObject(body, timeline.placements, extended, state.diagnostics);
    }
    return true;
  },
};

function readPlaceObject(
  body: SwfTagReader,
  placements: Map<number, SwfTagPlacement>,
  hasExtendedFlags: boolean,
  diagnostics: ImportDiagnostic[] | undefined,
): void {
  const flags = body.readUint8();
  const extendedFlags = hasExtendedFlags ? body.readUint8() : 0;
  const depth = body.readUint16();
  const existing = placements.get(depth);
  const isMove = (flags & 0x01) !== 0;
  const inherited = isMove ? existing : undefined;
  const hasCharacter = (flags & 0x02) !== 0;
  const hasClassName = (extendedFlags & 0x08) !== 0 || ((extendedFlags & 0x10) !== 0 && hasCharacter);
  const directLinkage = hasClassName ? body.readString() : (inherited?.directLinkage ?? null);
  const characterId = hasCharacter ? body.readUint16() : (inherited?.characterId ?? 0);
  const matrix = (flags & 0x04) !== 0 ? readSwfMatrix(body) : (inherited?.matrix ?? IDENTITY_MATRIX);
  const colorTransform =
    (flags & 0x08) !== 0
      ? readSwfColorTransform(body)
      : { alpha: inherited?.alpha ?? 1, colorAdjustments: inherited?.colorTransformAdjustments ?? null };
  const ratio = (flags & 0x10) !== 0 ? body.readUint16() / MORPH_RATIO_ONE : (inherited?.ratio ?? 0);
  const name = (flags & 0x20) !== 0 ? body.readString() : (inherited?.name ?? null);
  const clipDepth = (flags & 0x40) !== 0 ? body.readUint16() : (inherited?.clipDepth ?? 0);

  // A filter list is variable-width and the blend mode sits behind it, so the list reports whether it
  // reached its end. An unknown filter has no skippable payload length; the blend byte is then out of
  // reach and must not be invented from the unknown payload's first byte.
  const hasFilterList = (extendedFlags & 0x01) !== 0;
  const readEffects: Effect[] = [];
  const readFilterAdjustments: Adjustment[] = [];
  const filterListComplete = !hasFilterList || readSwfFilterList(body, readEffects, readFilterAdjustments, diagnostics);
  const declaresBlendMode = (extendedFlags & 0x02) !== 0;
  const hasBlendMode = declaresBlendMode && filterListComplete;
  if (declaresBlendMode && !filterListComplete) {
    // The record declared a blend mode and the byte carrying it is unreachable behind a list that did
    // not finish. The placement keeps the filters read so far, so nothing about the result says a
    // declared channel went unread.
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.blend-mode-behind-unread-filters',
      'readPlaceObject',
      { capability: 'swf.placement.blend-mode' },
    );
  }
  const blendModeValue = hasBlendMode ? body.readUint8() : 0;

  if (!body.valid || (isMove && existing === undefined) || (characterId === 0 && directLinkage === null)) return;
  // A record that declares a channel replaces it, including with nothing; one that stays silent about it
  // keeps whatever the move inherited. That is why an empty list a record did declare is not the same
  // value as no list at all.
  const effects = hasFilterList ? readEffects : (inherited?.effects ?? EMPTY_EFFECTS);
  const filterAdjustments = hasFilterList ? readFilterAdjustments : (inherited?.filterAdjustments ?? EMPTY_ADJUSTMENTS);
  placements.set(depth, {
    advancedBlendMode: hasBlendMode
      ? resolveSwfAdvancedBlendMode(blendModeValue)
      : (inherited?.advancedBlendMode ?? null),
    alpha: colorTransform.alpha,
    blendMode: hasBlendMode ? resolveSwfBlendMode(blendModeValue) : (inherited?.blendMode ?? BlendMode.Normal),
    characterId,
    clipDepth,
    colorAdjustments: joinSwfColorAdjustments(colorTransform.colorAdjustments, filterAdjustments),
    colorTransformAdjustments: colorTransform.colorAdjustments,
    depth,
    directLinkage,
    effects,
    filterAdjustments,
    matrix,
    name,
    ratio,
  });
}

function readLegacyPlaceObject(body: SwfTagReader, placements: Map<number, SwfTagPlacement>): void {
  const characterId = body.readUint16();
  const depth = body.readUint16();
  const matrix = readSwfMatrix(body);
  // The legacy record's colour transform has no alpha channel at all, so it can only tint.
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

// A placement ratio is 16-bit, so this is both its maximum and the divisor that makes it a 0..1 progress.
const MORPH_RATIO_ONE = 0xffff;
