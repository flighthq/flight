import { packColor } from '@flighthq/color/contract';
import type { ImportDiagnostic, RiveArtboardGraph, RiveCoreObject } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, RiveFieldType } from '@flighthq/types/contract';

import { createRiveRichText } from './riveText';

// A run's styleId indexes the artboard's component numbering — the same space parentId uses — rather
// than styles in declaration order. Rive's TextAlign is left=0, right=1, center=2.

const TEXT = 134;
const RUN = 135;
const STYLE_PAINT = 137;
const AXIS = 144;
const FILL = 20;
const SOLID_COLOR = 18;

const COLOR_VALUE = 37;
const RUN_TEXT = 268;
const RUN_STYLE_ID = 272;
const FONT_SIZE = 274;
const FONT_ASSET_ID = 279;
const AXIS_VALUE = 288;
const AXIS_TAG = 289;
const ALIGN = 281;
const WIDTH = 285;
const HEIGHT = 286;
const LINE_HEIGHT = 370;
const LETTER_SPACING = 390;

describe('createRiveRichText', () => {
  it('reads a single run as the label text', () => {
    const label = build([object(TEXT, {}), run('Hello', -1)], [-1, 0]);

    expect(label.data.text).toBe('Hello');
  });

  it('joins the runs in the order the file states them', () => {
    const label = build([object(TEXT, {}), run('one ', -1), run('two ', -1), run('three', -1)], [-1, 0, 0, 0]);

    expect(label.data.text).toBe('one two three');
  });

  it('carries the box the drawable states', () => {
    const label = build([object(TEXT, { [WIDTH]: 320, [HEIGHT]: 48 })], [-1]);

    expect(label.data.width).toBe(320);
    expect(label.data.height).toBe(48);
  });

  it('maps alignment the way the format numbers it', () => {
    for (const [value, expected] of [
      [0, 'left'],
      [1, 'right'],
      [2, 'center'],
    ] as const) {
      const label = build([object(TEXT, { [ALIGN]: value })], [-1]);
      expect(label.data.textFormat?.align).toBe(expected);
    }
  });

  // An alignment this reader does not know still sets the text, against an edge it was not authored
  // to. Nothing counts as lost and the drawable is present, so only the crumb records it.
  it('reports a text alignment it does not know', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const label = build([object(TEXT, { [ALIGN]: 7 })], [-1], [], diagnostics);

    expect(label.data.textFormat?.align).toBe('left');
    expect(diagnostics).toMatchObject([
      {
        detail: { alignValue: 7, substitutedAs: 'left' },
        kind: 'rive.text-align-substituted',
        severity: 'Recover',
      },
    ]);
  });

  it('reports one unknown alignment once however many runs the drawable carries', () => {
    const diagnostics: ImportDiagnostic[] = [];
    // Alignment belongs to the drawable, not the run. Building the format is per-run, so reporting
    // there would repeat a single authored value once for every run beside it.
    const label = build(
      [object(TEXT, { [ALIGN]: 7 }), run('one', -1), run('two', -1), run('three', -1)],
      [-1, 0, 0, 0],
      [],
      diagnostics,
    );

    expect(label.data.textFormatRanges).toHaveLength(3);
    expect(diagnostics.filter((entry) => entry.kind === 'rive.text-align-substituted')).toHaveLength(1);
  });

  it('stays silent across every alignment the format numbers', () => {
    const diagnostics: ImportDiagnostic[] = [];
    for (const [value, expected] of [
      [0, 'left'],
      [1, 'right'],
      [2, 'center'],
    ] as const) {
      // Left is 0 and shares the builder's final arm with an unknown value, so it must not report.
      const label = build([object(TEXT, { [ALIGN]: value })], [-1], [], diagnostics);
      expect(label.data.textFormat?.align).toBe(expected);
    }

    expect(diagnostics).toEqual([]);
  });

  it('takes size, line height and letter spacing from the run style', () => {
    const label = build(
      [
        object(TEXT, {}),
        run('x', 2),
        object(STYLE_PAINT, { [FONT_SIZE]: 24, [LINE_HEIGHT]: 30, [LETTER_SPACING]: 1.5 }),
      ],
      [-1, 0, 0],
    );

    expect(label.data.textFormat).toMatchObject({ leading: 30, letterSpacing: 1.5, size: 24 });
  });

  // The style paints itself through a fill child, exactly as a shape does, and Rive states the colour
  // as ARGB while Flight packs RGBA.
  it('unpacks the colour from the style own paint', () => {
    const label = build(
      [
        object(TEXT, {}),
        run('x', 2),
        object(STYLE_PAINT, {}),
        object(FILL, {}),
        object(SOLID_COLOR, { [COLOR_VALUE]: 0xff3366cc }),
      ],
      [-1, 0, 0, 2, 3],
    );

    expect(label.data.textFormat?.color).toBe(packColor(0x33 / 255, 0x66 / 255, 0xcc / 255, 1));
    expect(label.data.textColor).toBe(0x3366ccff);
  });

  it('ignores a colour belonging to a different style', () => {
    const label = build(
      [
        object(TEXT, {}),
        run('x', 2),
        object(STYLE_PAINT, {}),
        object(STYLE_PAINT, {}),
        object(FILL, {}),
        object(SOLID_COLOR, { [COLOR_VALUE]: 0xffff0000 }),
      ],
      // The paint hangs off the SECOND style, so the first style must not adopt it.
      [-1, 0, 0, 0, 3, 4],
    );

    expect(label.data.textFormat?.color).toBe(packColor(0, 0, 0, 1));
  });

  // A run is the unit the file authored, so each one states its own span rather than the differing
  // ones alone being recorded.
  it('gives every run a format range over the span it occupies in the joined string', () => {
    const label = build([object(TEXT, {}), run('one ', -1), run('two ', -1), run('three', -1)], [-1, 0, 0, 0]);

    expect(label.data.textFormatRanges.map((range) => [range.start, range.end])).toEqual([
      [0, 4],
      [4, 8],
      [8, 13],
    ]);
    expect(label.data.text.slice(4, 8)).toBe('two ');
  });

  it('carries a different format on each run rather than flattening to the first', () => {
    const label = build(
      [
        object(TEXT, {}),
        run('big', 3),
        run('small', 4),
        object(STYLE_PAINT, { [FONT_SIZE]: 48 }),
        object(STYLE_PAINT, { [FONT_SIZE]: 8 }),
      ],
      [-1, 0, 0, 0, 0],
    );

    expect(label.data.textFormatRanges.map((range) => range.format.size)).toEqual([48, 8]);
    // The first run's style still doubles as the drawable's own format, so a consumer that lays out
    // from the format alone renders the common single-style case correctly.
    expect(label.data.textFormat?.size).toBe(48);
  });

  // familyName exists in Rive's object model but is editor-only and never written to a runtime file,
  // so the asset's own name is the only name a .riv carries for a typeface.
  it('names the typeface by resolving the style font asset against the asset list', () => {
    const label = build(
      [object(TEXT, {}), run('x', 2), object(STYLE_PAINT, { [FONT_ASSET_ID]: 1 })],
      [-1, 0, 0],
      ['Inter', 'Roboto'],
    );

    expect(label.data.textFormat?.font).toBe('Roboto');
  });

  it('leaves the font unnamed when the style states no asset', () => {
    // An unset reference is -1 rather than 0, which would otherwise name the file's first asset.
    const label = build([object(TEXT, {}), run('x', 2), object(STYLE_PAINT, {})], [-1, 0, 0], ['Inter']);

    expect(label.data.textFormat?.font).toBeUndefined();
  });

  it('leaves the font unnamed when the style names an asset the file does not have', () => {
    const label = build(
      [object(TEXT, {}), run('x', 2), object(STYLE_PAINT, { [FONT_ASSET_ID]: 7 })],
      [-1, 0, 0],
      ['Inter'],
    );

    expect(label.data.textFormat?.font).toBeUndefined();
  });

  it('reports a run style that cannot be resolved', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const label = build([object(TEXT, {}), run('x', 7)], [-1, 0], [], diagnostics);

    expect(label.data.textFormat?.color).toBe(packColor(0, 0, 0, 1));
    expect(diagnostics).toEqual([
      {
        detail: { styleIndex: 7 },
        kind: 'rive.text-unresolved-style',
        origin: 'createRiveTextFormat',
        severity: ImportDiagnosticSeverity.Drop,
      },
    ]);
  });

  it('stays silent for resolved and absent run styles', () => {
    const diagnostics: ImportDiagnostic[] = [];
    build([object(TEXT, {}), run('resolved', 2), object(STYLE_PAINT, {})], [-1, 0, 0], [], diagnostics);
    build([object(TEXT, {}), run('absent', -1)], [-1, 0], [], diagnostics);

    expect(diagnostics).toEqual([]);
  });

  // A TextStyleAxis is a child component of the style, and Rive packs the OpenType tag into a uint
  // rather than stating it as text. 'wght' is 0x77676874 read most-significant byte first.
  it('unpacks a variable-font axis tag back into its four characters', () => {
    const label = build(
      [
        object(TEXT, {}),
        run('x', 2),
        object(STYLE_PAINT, {}),
        object(AXIS, { [AXIS_TAG]: 0x77676874, [AXIS_VALUE]: 700 }),
      ],
      [-1, 0, 0, 2],
    );

    expect(label.data.textFormat?.variations).toEqual([{ axis: 'wght', value: 700 }]);
  });

  it('carries every axis a style states', () => {
    const label = build(
      [
        object(TEXT, {}),
        run('x', 2),
        object(STYLE_PAINT, {}),
        object(AXIS, { [AXIS_TAG]: 0x77676874, [AXIS_VALUE]: 300 }),
        object(AXIS, { [AXIS_TAG]: 0x77647468, [AXIS_VALUE]: 87.5 }),
      ],
      [-1, 0, 0, 2, 2],
    );

    expect(label.data.textFormat?.variations).toEqual([
      { axis: 'wght', value: 300 },
      { axis: 'wdth', value: 87.5 },
    ]);
  });

  it('leaves variations absent when the style states no axis', () => {
    // Absent means the font's own defaults stand, which is not the same as an empty list.
    const label = build([object(TEXT, {}), run('x', 2), object(STYLE_PAINT, {})], [-1, 0, 0]);

    expect(label.data.textFormat?.variations).toBeUndefined();
  });

  it('ignores an axis belonging to a different style', () => {
    const label = build(
      [
        object(TEXT, {}),
        run('x', 2),
        object(STYLE_PAINT, {}),
        object(STYLE_PAINT, {}),
        object(AXIS, { [AXIS_TAG]: 0x77676874, [AXIS_VALUE]: 700 }),
      ],
      // The axis hangs off the SECOND style, so the first must not adopt it.
      [-1, 0, 0, 0, 3],
    );

    expect(label.data.textFormat?.variations).toBeUndefined();
  });

  it('produces an empty label for a text drawable with no runs', () => {
    const label = build([object(TEXT, { [WIDTH]: 10 })], [-1]);

    expect(label.data.text).toBe('');
  });

  it('falls back to a readable default when a run names no style', () => {
    const label = build([object(TEXT, {}), run('x', -1)], [-1, 0]);

    expect(label.data.textFormat?.color).toBe(packColor(0, 0, 0, 1));
  });
});

function build(
  objects: RiveCoreObject[],
  parents: number[],
  fontNames: readonly string[] = [],
  diagnostics?: ImportDiagnostic[],
) {
  const artboard: RiveArtboardGraph = {
    objects,
    parentIndices: parents,
    streamEnd: objects.length,
    streamStart: 0,
  };
  return createRiveRichText(artboard, 0, fontNames, diagnostics);
}

function run(text: string, styleId: number): RiveCoreObject {
  const properties = [{ key: RUN_TEXT, type: RiveFieldType.String, value: text }];
  if (styleId >= 0) properties.push({ key: RUN_STYLE_ID, type: RiveFieldType.Uint, value: styleId } as never);
  return { properties: properties as RiveCoreObject['properties'], typeKey: RUN };
}

function object(typeKey: number, properties: Readonly<Record<number, number>>): RiveCoreObject {
  return {
    properties: Object.entries(properties).map(([key, value]) => ({
      key: Number(key),
      type: RiveFieldType.Double,
      value,
    })),
    typeKey,
  };
}
