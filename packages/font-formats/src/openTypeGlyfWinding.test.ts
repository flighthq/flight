import { EntityRuntimeKey, PathCommand } from '@flighthq/types/contract';
import type { Path } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createGlyphOutlineSourceFromOpenTypeFont } from './openTypeGlyphOutlineSource';
import { createSyntheticFont, emptySyntheticGlyph, ringSyntheticGlyph } from './openTypeTestHelper';

// Contour DIRECTION, which nothing else in this suite can see. A bounding box is min/max over a point
// set and a contour count is a count — both are identical whichever way a contour is wound, so a
// reversed counter turns a ring into a solid disc with every other number unchanged.
//
// The check is the SIGNED AREA per contour, whose sign IS the winding direction. It needs no
// rasterizer, and it was validated against one: a browser's nonzero fill paints a hole for opposite
// signs, fills it for matching signs, and — the case this test must NOT flag — paints the identical
// hole when BOTH contours are reversed, because only their relative direction matters.
function signedContourAreas(path: Readonly<Path>): number[] {
  const areas: number[] = [];
  let points: [number, number][] = [];
  let at = 0;
  const closeContour = (): void => {
    if (points.length > 2) {
      let twiceArea = 0;
      for (let index = 0; index < points.length; index += 1) {
        const [x1, y1] = points[index]!;
        const [x2, y2] = points[(index + 1) % points.length]!;
        twiceArea += x1 * y2 - x2 * y1;
      }
      areas.push(twiceArea / 2);
    }
    points = [];
  };
  for (const command of path.commands) {
    if (command === PathCommand.MOVE_TO || command === PathCommand.LINE_TO) {
      points.push([path.data[at]!, path.data[at + 1]!]);
      at += 2;
    } else if (command === PathCommand.CURVE_TO) {
      points.push([path.data[at + 2]!, path.data[at + 3]!]);
      at += 4;
    } else if (command === PathCommand.CUBIC_CURVE_TO) {
      points.push([path.data[at + 4]!, path.data[at + 5]!]);
      at += 6;
    } else if (command === PathCommand.CLOSE) {
      closeContour();
    }
  }
  closeContour();
  return areas;
}

function ringAreas(reverseCounter: boolean, flipBoth = false): number[] {
  const font = createSyntheticFont({
    glyphs: [emptySyntheticGlyph(), ringSyntheticGlyph(reverseCounter, flipBoth)],
  });
  const source = createGlyphOutlineSourceFromOpenTypeFont(font)!;
  const path: Path = { [EntityRuntimeKey]: undefined, commands: [], data: [], winding: 'nonZero' };
  expect(source.getGlyphOutline(path, 1)).toBe(true);
  return signedContourAreas(path);
}

describe('openTypeGlyfWinding', () => {
  it('winds a counter opposite its outer contour, which is what makes it a hole', () => {
    const areas = ringAreas(false);
    expect(areas).toHaveLength(2);
    // Magnitudes are the squares' own areas, so this also pins that the right points reached the path.
    expect(areas.map(Math.abs)).toEqual([360_000, 40_000]);
    expect(Math.sign(areas[0]!)).not.toBe(Math.sign(areas[1]!));
  });

  it('detects a counter wound the wrong way, which every other check reads as identical', () => {
    const areas = ringAreas(true);
    expect(Math.sign(areas[0]!)).toBe(Math.sign(areas[1]!));
  });

  it('ignores both contours being reversed, which a nonzero fill renders identically', () => {
    // The negative control. A check that flagged this would be firing on a non-defect — verified
    // against a browser, where both-flipped paints the same hole as the correct winding.
    const areas = ringAreas(false, true);
    expect(Math.sign(areas[0]!)).not.toBe(Math.sign(areas[1]!));
  });
});
