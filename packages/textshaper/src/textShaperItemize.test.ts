import type { ShapedRun, ShapeRunOptions, TextFormat } from '@flighthq/types';

import { setTextShaperBackend } from './textShaper';
import { itemizeText, shapeTextRuns } from './textShaperItemize';

const _emptyRun: ShapedRun = {
  advanceWidth: 0,
  direction: 'LeftToRight',
  font: null,
  glyphCount: 0,
  glyphs: [],
  script: 'Latn',
};

function _makeShapingBackend() {
  return {
    measureText: (t: string) => t.length * 8,
    shapeRun: (_t: string, _f: Readonly<TextFormat>, opts?: Readonly<ShapeRunOptions>): ShapedRun => ({
      ..._emptyRun,
      direction: opts?.direction ?? 'LeftToRight',
      script: opts?.script ?? 'Latn',
    }),
  };
}

afterEach(() => {
  setTextShaperBackend(null);
});

describe('itemizeText', () => {
  it('returns empty array for empty string', () => {
    expect(itemizeText('', {})).toEqual([]);
  });
  it('returns a single run for a pure Latin string', () => {
    const items = itemizeText('Hello', {});
    expect(items).toHaveLength(1);
    expect(items[0].start).toBe(0);
    expect(items[0].end).toBe(5);
    expect(items[0].script).toBe('Latn');
    expect(items[0].direction).toBe('LeftToRight');
  });
  it('splits Arabic from Latin', () => {
    // ASCII 'AB' (LTR/Latin) followed by Arabic 'سلام' (U+0633 U+0644 U+0627 U+0645, RTL/Arab)
    const arabic = 'سلام';
    const mixed = 'AB' + arabic;
    const items = itemizeText(mixed, {});
    expect(items).toHaveLength(2);
    expect(items[0].direction).toBe('LeftToRight');
    expect(items[0].script).toBe('Latn');
    expect(items[1].direction).toBe('RightToLeft');
    expect(items[1].script).toBe('Arab');
  });
  it('treats neutral characters (space) as belonging to the current run', () => {
    const items = itemizeText('Hello World', {});
    // Space is neutral; it should be absorbed into the Latin run, not create a boundary.
    expect(items).toHaveLength(1);
    expect(items[0].start).toBe(0);
    expect(items[0].end).toBe(11);
  });
  it('respects explicit direction override from options', () => {
    const items = itemizeText('Hello', {}, { direction: 'RightToLeft' });
    // Latin characters are LTR strong; the explicit direction in options sets the base but
    // strong LTR chars override.
    expect(items).toHaveLength(1);
    expect(items[0].direction).toBe('LeftToRight');
  });
  it('covers entire string (no gaps between items)', () => {
    const arabic = 'سلام';
    const text = 'Hi ' + arabic + ' end';
    const items = itemizeText(text, {});
    const covered = items.reduce((s, item) => s + (item.end - item.start), 0);
    expect(covered).toBe(text.length);
    // Verify contiguous coverage
    for (let i = 1; i < items.length; i++) {
      expect(items[i].start).toBe(items[i - 1].end);
    }
  });
});

describe('shapeTextRuns', () => {
  it('returns empty array for empty string', () => {
    expect(shapeTextRuns('', {})).toEqual([]);
  });
  it('returns empty array when no backend is set', () => {
    expect(shapeTextRuns('Hello', {})).toEqual([]);
  });
  it('returns empty array when backend is advances-only', () => {
    setTextShaperBackend({ measureText: (t: string) => t.length });
    expect(shapeTextRuns('Hello', {})).toEqual([]);
  });
  it('returns one ShapedRun per item for a mixed-script string', () => {
    setTextShaperBackend(_makeShapingBackend());
    const arabic = 'سلام';
    const runs = shapeTextRuns('AB' + arabic, {});
    expect(runs).toHaveLength(2);
    expect(runs[0].direction).toBe('LeftToRight');
    expect(runs[1].direction).toBe('RightToLeft');
  });
  it('passes per-item direction and script to shapeRun', () => {
    const captured: { direction?: string; script?: string }[] = [];
    setTextShaperBackend({
      measureText: () => 0,
      shapeRun: (_t: string, _f: Readonly<TextFormat>, opts?: Readonly<ShapeRunOptions>): ShapedRun => {
        captured.push({ direction: opts?.direction, script: opts?.script });
        return { ..._emptyRun };
      },
    });
    const arabic = 'سلام';
    shapeTextRuns('AB' + arabic, {});
    expect(captured[0].direction).toBe('LeftToRight');
    expect(captured[1].direction).toBe('RightToLeft');
    expect(captured[1].script).toBe('Arab');
  });
});
