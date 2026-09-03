import { packColor } from '@flighthq/color/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createRichText } from '@flighthq/text/contract';
import { createTextFormatRange } from '@flighthq/textlayout/contract';
import type {
  FontVariation,
  ImportDiagnostic,
  RichText,
  RiveArtboardGraph,
  RiveCoreObject,
  TextFormat,
  TextFormatRange,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { isRiveCoreTypeDerivedFrom } from './riveCoreTypes';

/**
 * Builds a rich text node from a Rive text drawable.
 *
 * The words live in the drawable's **value runs**, each naming a style, and a style's colour comes
 * from a paint child of its own — the same shape a fill takes on a shape. `styleId` indexes the
 * artboard's component numbering, the same space `parentId` uses, rather than indexing styles in
 * declaration order.
 *
 * Runs are joined in file order and **each run contributes one `TextFormatRange`** over the span it
 * occupies in the joined string, which is what carries a drawable whose runs differ in style. One
 * range per run rather than one only where the style changes: a run is the unit the file authored, so
 * a consumer reads back the structure that was written rather than a coalesced version of it.
 *
 * A text drawable always becomes a `RichText`, never a `TextLabel`, even when a single run means the
 * ranges are redundant with the format. `TextFormatRange` lives only on `RichTextData`, so the kind
 * would otherwise depend on the *contents* of the file — a caller that registered a renderer for one
 * kind would silently lose every multi-run text. One Rive concept maps to one Flight kind.
 */
export function createRiveRichText(
  artboard: Readonly<RiveArtboardGraph>,
  index: number,
  fontNames: readonly string[],
  diagnostics?: ImportDiagnostic[],
): RichText {
  const source = artboard.objects[index];
  const runs: number[] = [];
  for (let child = index + 1; child < artboard.objects.length; child++) {
    if (artboard.parentIndices[child] !== index) continue;
    if (artboard.objects[child].typeKey === RIVE_TEXT_VALUE_RUN) runs.push(child);
  }

  const align = readRiveNumber(source, RIVE_TEXT_ALIGN, 0);
  // Left is stated as 0 and is also what the format builder's final arm returns, so only a value
  // outside the three is a substitution: the text still sets, against an edge it was not authored to.
  // Reported here rather than in that builder, which runs once per run and would repeat one drawable's
  // single alignment for every run it carries.
  if (align !== RIVE_ALIGN_LEFT && align !== RIVE_ALIGN_RIGHT && align !== RIVE_ALIGN_CENTER) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'rive.text-align-substituted',
      'createRiveRichText',
      { alignValue: align, substitutedAs: 'left' },
    );
  }
  const formatRanges: TextFormatRange[] = [];
  const unresolvedStyles = new Set<number>();
  let text = '';
  for (const run of runs) {
    const value = readRiveText(artboard.objects[run], RIVE_RUN_TEXT, '');
    const style = readRiveNumber(artboard.objects[run], RIVE_RUN_STYLE_ID, -1);
    // A run's span is measured in the joined string, so it is stated before the run is appended.
    formatRanges.push(
      createTextFormatRange(
        createRiveTextFormat(artboard, style, align, fontNames, diagnostics, unresolvedStyles),
        text.length,
        text.length + value.length,
      ),
    );
    text += value;
  }

  // The first run's style doubles as the drawable's own format, so a consumer that lays out from the
  // format alone still renders the common single-style case correctly.
  const baseStyle = runs.length === 0 ? -1 : readRiveNumber(artboard.objects[runs[0]], RIVE_RUN_STYLE_ID, -1);
  const format = createRiveTextFormat(artboard, baseStyle, align, fontNames, diagnostics, unresolvedStyles);

  const node = createRichText();
  node.data.defaultTextFormat = format;
  node.data.height = readRiveNumber(source, RIVE_TEXT_HEIGHT, 0);
  node.data.text = text;
  node.data.textColor = format.color ?? RIVE_DEFAULT_TEXT_COLOR;
  node.data.textFormat = format;
  node.data.textFormatRanges = formatRanges;
  node.data.width = readRiveNumber(source, RIVE_TEXT_WIDTH, 0);
  return node;
}

function createRiveTextFormat(
  artboard: Readonly<RiveArtboardGraph>,
  styleIndex: number,
  align: number,
  fontNames: readonly string[],
  diagnostics: ImportDiagnostic[] | undefined,
  unresolvedStyles: Set<number>,
): TextFormat {
  const style = styleIndex >= 0 && styleIndex < artboard.objects.length ? artboard.objects[styleIndex] : null;
  const format: TextFormat = {
    align:
      align === RIVE_ALIGN_RIGHT
        ? ('right' as const)
        : align === RIVE_ALIGN_CENTER
          ? ('center' as const)
          : ('left' as const),
    color: readRiveStyleColor(artboard, styleIndex),
  };
  if (style === null) {
    if (styleIndex >= 0 && !unresolvedStyles.has(styleIndex)) {
      unresolvedStyles.add(styleIndex);
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'rive.text-unresolved-style',
        'createRiveTextFormat',
        { styleIndex },
      );
    }
    return format;
  }

  format.leading = readRiveNumber(style, RIVE_STYLE_LINE_HEIGHT, -1);
  format.letterSpacing = readRiveNumber(style, RIVE_STYLE_LETTER_SPACING, 0);
  format.size = readRiveNumber(style, RIVE_STYLE_FONT_SIZE, RIVE_DEFAULT_FONT_SIZE);

  // A style names its typeface by asset rather than by family: `familyName` exists in the object
  // model but is editor-only and never written to a runtime file, so the asset's name is the only
  // name a `.riv` carries. The bytes behind it stay unacquired here — naming the font is this codec's
  // job and decoding it is the resource layer's, exactly as SWF resolves a font id to a family name.
  const fontAsset = readRiveNumber(style, RIVE_STYLE_FONT_ASSET_ID, RIVE_MISSING_ASSET_ID);
  const fontName = fontAsset >= 0 && fontAsset < fontNames.length ? fontNames[fontAsset] : '';
  if (fontName !== '') format.font = fontName;

  const variations = readRiveStyleAxes(artboard, styleIndex);
  // An absent list means the font's own axis defaults stand, which is not the same as an empty one.
  if (variations.length > 0) format.variations = variations;
  return format;
}

// A variable-font axis is a child component of the style, the way its paint is. Rive packs the
// OpenType tag into a uint rather than stating it as text, so it is unpacked back into the four
// characters a shaper matches on.
function readRiveStyleAxes(artboard: Readonly<RiveArtboardGraph>, styleIndex: number): FontVariation[] {
  const variations: FontVariation[] = [];
  if (styleIndex < 0) return variations;
  for (let index = styleIndex + 1; index < artboard.objects.length; index++) {
    const object = artboard.objects[index];
    if (object.typeKey !== RIVE_TEXT_STYLE_AXIS) continue;
    if (artboard.parentIndices[index] !== styleIndex) continue;
    variations.push({
      axis: toRiveOpenTypeTag(readRiveNumber(object, RIVE_AXIS_TAG, 0)),
      value: readRiveNumber(object, RIVE_AXIS_VALUE, 0),
    });
  }
  return variations;
}

// The four bytes read most-significant first, which is the order an OpenType tag is written in.
function toRiveOpenTypeTag(packed: number): string {
  return String.fromCharCode((packed >>> 24) & 0xff, (packed >>> 16) & 0xff, (packed >>> 8) & 0xff, packed & 0xff);
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
const RIVE_TEXT_STYLE_AXIS = 144;
const RIVE_SOLID_COLOR = 18;

const RIVE_RUN_TEXT = 268;
const RIVE_RUN_STYLE_ID = 272;
const RIVE_STYLE_FONT_SIZE = 274;
const RIVE_STYLE_FONT_ASSET_ID = 279;
const RIVE_AXIS_VALUE = 288;
const RIVE_AXIS_TAG = 289;
const RIVE_TEXT_ALIGN = 281;
const RIVE_TEXT_WIDTH = 285;
const RIVE_TEXT_HEIGHT = 286;
const RIVE_STYLE_LINE_HEIGHT = 370;
const RIVE_STYLE_LETTER_SPACING = 390;
const RIVE_SOLID_COLOR_VALUE = 37;

const RIVE_ALIGN_LEFT = 0;
const RIVE_ALIGN_RIGHT = 1;
const RIVE_ALIGN_CENTER = 2;
// The object model's own initial values: a style with no stated size is 12, and an unset asset
// reference is -1 rather than 0, which would otherwise name the file's first asset.
const RIVE_DEFAULT_FONT_SIZE = 12;
const RIVE_MISSING_ASSET_ID = -1;
// Opaque black, matching what a text style with no paint would show.
const RIVE_DEFAULT_TEXT_COLOR = packColor(0, 0, 0, 1);
