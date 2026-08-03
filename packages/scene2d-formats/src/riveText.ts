import { packColor } from '@flighthq/color/contract';
import { createTextLabel } from '@flighthq/text/contract';
import type { RiveArtboardGraph, RiveCoreObject, TextLabel } from '@flighthq/types/contract';

import { isRiveCoreTypeDerivedFrom } from './riveCoreTypes';

/**
 * Builds a text label from a Rive text drawable.
 *
 * The words live in the drawable's **value runs**, each naming a style, and a style's colour comes
 * from a paint child of its own — the same shape a fill takes on a shape. `styleId` indexes the
 * artboard's component numbering, the same space `parentId` uses, which was confirmed against the
 * corpus where it resolves all 150 runs and resolving it against the styles in order resolves 4.
 *
 * Runs are concatenated and the first run's style sets the format. A text whose runs differ in style
 * is rich text, which needs more than one format can carry, so that difference is recorded as
 * uncovered rather than silently flattened to the first style.
 */
export function createRiveTextLabel(artboard: Readonly<RiveArtboardGraph>, index: number): TextLabel {
  const source = artboard.objects[index];
  const runs: number[] = [];
  for (let child = index + 1; child < artboard.objects.length; child++) {
    if (artboard.parentIndices[child] !== index) continue;
    if (artboard.objects[child].typeKey === RIVE_TEXT_VALUE_RUN) runs.push(child);
  }

  let text = '';
  for (const run of runs) text += readRiveText(artboard.objects[run], RIVE_RUN_TEXT, '');
  const style = runs.length === 0 ? -1 : readRiveNumber(artboard.objects[runs[0]], RIVE_RUN_STYLE_ID, -1);

  return createTextLabel({
    data: {
      autoSize: 'none',
      height: readRiveNumber(source, RIVE_TEXT_HEIGHT, 0),
      text,
      textFormat: createRiveTextFormat(artboard, style, readRiveNumber(source, RIVE_TEXT_ALIGN, 0)),
      width: readRiveNumber(source, RIVE_TEXT_WIDTH, 0),
    },
  });
}

function createRiveTextFormat(artboard: Readonly<RiveArtboardGraph>, styleIndex: number, align: number) {
  const style = styleIndex >= 0 && styleIndex < artboard.objects.length ? artboard.objects[styleIndex] : null;
  return {
    align:
      align === RIVE_ALIGN_RIGHT
        ? ('right' as const)
        : align === RIVE_ALIGN_CENTER
          ? ('center' as const)
          : ('left' as const),
    color: readRiveStyleColor(artboard, styleIndex),
    leading: style === null ? undefined : readRiveNumber(style, RIVE_STYLE_LINE_HEIGHT, -1),
    letterSpacing: style === null ? undefined : readRiveNumber(style, RIVE_STYLE_LETTER_SPACING, 0),
    size: style === null ? undefined : readRiveNumber(style, RIVE_STYLE_FONT_SIZE, 12),
  };
}

// A style paints itself the way a shape does: through a fill whose own child states the colour.
function readRiveStyleColor(artboard: Readonly<RiveArtboardGraph>, styleIndex: number): number {
  if (styleIndex < 0) return RIVE_DEFAULT_TEXT_COLOR;
  for (let index = styleIndex + 1; index < artboard.objects.length; index++) {
    const object = artboard.objects[index];
    if (!isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_SOLID_COLOR)) continue;
    if (!isRiveDescendantOf(artboard, index, styleIndex)) continue;
    const packed = readRiveNumber(object, RIVE_SOLID_COLOR_VALUE, 0);
    // Rive states colour as ARGB; Flight packs RGBA from normalized components.
    return packColor(
      ((packed >>> 16) & 0xff) / 255,
      ((packed >>> 8) & 0xff) / 255,
      (packed & 0xff) / 255,
      ((packed >>> 24) & 0xff) / 255,
    );
  }
  return RIVE_DEFAULT_TEXT_COLOR;
}

function isRiveDescendantOf(artboard: Readonly<RiveArtboardGraph>, index: number, ancestor: number): boolean {
  let parent = artboard.parentIndices[index];
  while (parent >= 0) {
    if (parent === ancestor) return true;
    parent = artboard.parentIndices[parent];
  }
  return false;
}

function readRiveNumber(source: Readonly<RiveCoreObject>, key: number, fallback: number): number {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'number' ? fallback : property.value;
}

function readRiveText(source: Readonly<RiveCoreObject>, key: number, fallback: string): string {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'string' ? fallback : property.value;
}

const RIVE_TEXT_VALUE_RUN = 135;
const RIVE_SOLID_COLOR = 18;

const RIVE_RUN_TEXT = 268;
const RIVE_RUN_STYLE_ID = 272;
const RIVE_STYLE_FONT_SIZE = 274;
const RIVE_TEXT_ALIGN = 281;
const RIVE_TEXT_WIDTH = 285;
const RIVE_TEXT_HEIGHT = 286;
const RIVE_STYLE_LINE_HEIGHT = 370;
const RIVE_STYLE_LETTER_SPACING = 390;
const RIVE_SOLID_COLOR_VALUE = 37;

const RIVE_ALIGN_RIGHT = 1;
const RIVE_ALIGN_CENTER = 2;
// Opaque black, matching what a text style with no paint would show.
const RIVE_DEFAULT_TEXT_COLOR = packColor(0, 0, 0, 1);
