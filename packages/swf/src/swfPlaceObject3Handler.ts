import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  Adjustment,
  Effect,
  ImportDiagnostic,
  SwfTagHandler,
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

const TAG_PLACE_OBJECT_3 = 70;
const TAG_PLACE_OBJECT_4 = 94;

export const swfPlaceObject3Handler: SwfTagHandler = {
  tags: [TAG_PLACE_OBJECT_3, TAG_PLACE_OBJECT_4],
  parse(body, _tag, state, timeline) {
    readPlaceObject3(body, timeline.placements, state.diagnostics);
    return true;
  },
};

function readPlaceObject3(
  body: SwfTagReader,
  placements: Map<number, SwfTagPlacement>,
  diagnostics: ImportDiagnostic[] | undefined,
): void {
  const flags = body.readUint8();
  const extendedFlags = body.readUint8();
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

  const hasFilterList = (extendedFlags & 0x01) !== 0;
  const readEffects: Effect[] = [];
  const readFilterAdjustments: Adjustment[] = [];
  const filterListComplete = !hasFilterList || readSwfFilterList(body, readEffects, readFilterAdjustments, diagnostics);
  const declaresBlendMode = (extendedFlags & 0x02) !== 0;
  const hasBlendMode = declaresBlendMode && filterListComplete;
  if (declaresBlendMode && !filterListComplete) {
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

const MORPH_RATIO_ONE = 0xffff;
