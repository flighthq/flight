import { describe, expect, it } from 'vitest';

import { reorderBidiLine } from './reorderBidiLine';
import { resolveBidiLevels } from './resolveBidiLevels';

const RLE = '\u202b';
const PDF = '\u202c';
const RLI = '\u2067';
const PDI = '\u2069';

const levelFixtures: ReadonlyArray<{ direction: 'ltr' | 'rtl'; levels: number[]; text: string }> = [
  { direction: 'ltr', text: 'a1-2b', levels: [0, 0, 0, 0, 0] },
  { direction: 'rtl', text: '!אב!', levels: [1, 1, 1, 1] },
  { direction: 'rtl', text: 'אב 12', levels: [1, 1, 1, 2, 2] },
  { direction: 'ltr', text: `a${RLI}אב${PDI}b`, levels: [0, 0, 1, 1, 0, 0] },
];

describe('bidi conformance fixtures', () => {
  it('covers weak chains, neutral sos/eos, numbers in RTL, and isolates', () => {
    for (const fixture of levelFixtures) {
      expect(Array.from(resolveBidiLevels(fixture.text, fixture.direction))).toEqual(fixture.levels);
    }
  });

  it('caps explicit embedding depth and ignores overflow embeddings', () => {
    const text = RLE.repeat(126) + 'a' + PDF.repeat(126);
    expect(resolveBidiLevels(text, 'ltr')[126]).toBe(126);
  });

  it('reorders a resolved RTL number fixture while preserving digit order', () => {
    const levels = resolveBidiLevels('אב 12', 'rtl');
    const visual: number[] = [];
    reorderBidiLine(levels, 0, levels.length, visual);
    expect(visual).toEqual([3, 4, 2, 1, 0]);
  });
});
