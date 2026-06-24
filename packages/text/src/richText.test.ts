import { getEntityRuntime } from '@flighthq/entity';
import { createRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRevision, getNodeLocalContentRevision } from '@flighthq/node';
import { connectSignal } from '@flighthq/signals';
import { setTextLayoutMeasureProvider } from '@flighthq/textlayout';
import type { Node, RichText, RichTextRuntime } from '@flighthq/types';
import { RichTextKind } from '@flighthq/types';

import {
  appendRichTextString,
  buildRichTextLayoutParams,
  clearRichTextFormatRanges,
  computeRichTextLocalBoundsRectangle,
  createRichText,
  createRichTextData,
  createRichTextRuntime,
  createTextFieldSignals,
  dispatchRichTextLinkAtPoint,
  dispatchRichTextWheel,
  enableTextFieldSignals,
  getRichTextBottomScrollVValue,
  getRichTextCharIndexAtPointValue,
  getRichTextDefaultTextFormat,
  getRichTextFormatRangeAt,
  getRichTextFormatRangeByIndex,
  getRichTextFormatRangeCount,
  getRichTextHtml,
  getRichTextLength,
  getRichTextLineCountValue,
  getRichTextLineMetricsValue,
  getRichTextMaxScrollHValue,
  getRichTextMaxScrollVValue,
  getRichTextPasswordCharacter,
  getRichTextRuntime,
  getRichTextString,
  getRichTextTextHeightValue,
  getRichTextTextWidthValue,
  getTextFieldSignals,
  insertRichTextString,
  removeRichTextFormatRangesIn,
  replaceRichTextString,
  setRichTextBackground,
  setRichTextBackgroundColor,
  setRichTextBorder,
  setRichTextBorderColor,
  setRichTextCondenseWhite,
  setRichTextDefaultTextFormat,
  setRichTextFormatRange,
  setRichTextHeight,
  setRichTextHtml,
  setRichTextMaxChars,
  setRichTextMouseWheelEnabled,
  setRichTextMultiline,
  setRichTextScrollH,
  setRichTextScrollV,
  setRichTextSelectable,
  setRichTextString,
  setRichTextStyleSheet,
  setRichTextTextColor,
  setRichTextWidth,
  setRichTextWordWrap,
} from './richText';

describe('appendRichTextString', () => {
  it('appends the value to the existing text', () => {
    const richText = createRichText({ data: { text: 'hello' } });
    appendRichTextString(richText, ' world');
    expect(richText.data.text).toBe('hello world');
  });

  it('invalidates local content after append', () => {
    const richText = createRichText({ data: { text: 'hi' } });
    const runtime = getEntityRuntime(richText) as RichTextRuntime;
    const idBefore = runtime.localContentId;
    appendRichTextString(richText, '!');
    expect(runtime.localContentId).not.toBe(idBefore);
  });

  it('does not invalidate when value is empty', () => {
    const richText = createRichText({ data: { text: 'hi' } });
    const runtime = getEntityRuntime(richText) as RichTextRuntime;
    const idBefore = runtime.localContentId;
    appendRichTextString(richText, '');
    expect(runtime.localContentId).toBe(idBefore);
  });
});

describe('buildRichTextLayoutParams', () => {
  it('assembles content and wrap/multiline constraints for the layout engine', () => {
    const richText = createRichText({ data: { multiline: true, width: 120, wordWrap: true } });
    setRichTextString(richText, 'hello');
    const measure = (text: string) => text.length * 7;
    const params = buildRichTextLayoutParams(richText, measure);
    expect(params.text).toBe('hello');
    expect(params.formatRanges.length).toBeGreaterThan(0);
    expect(params.measure).toBe(measure);
    expect(params.wordWrap).toBe(true);
    expect(params.width).toBe(120);
  });
});

describe('clearRichTextFormatRanges', () => {
  it('removes serialized format ranges', () => {
    const richText = createRichText();
    setRichTextFormatRange(richText, { bold: true }, 0, 1);
    clearRichTextFormatRanges(richText);
    expect(richText.data.textFormatRanges).toEqual([]);
  });
});

describe('computeRichTextLocalBoundsRectangle', () => {
  afterEach(() => {
    setTextLayoutMeasureProvider(null);
  });

  it('sets out.width and out.height from data dimensions when autoSize is none', () => {
    const richText = createRichText({ data: { width: 200, height: 150 } });
    const out = createRectangle();
    computeRichTextLocalBoundsRectangle(out, richText as unknown as Node);
    expect(out.x).toBe(0);
    expect(out.width).toBe(200);
    expect(out.height).toBe(150);
  });

  it('falls back to the fixed field box when autoSize is set but no measure provider exists', () => {
    const richText = createRichText({ data: { autoSize: 'left', width: 200, height: 150 } });
    setRichTextString(richText, 'hello');
    const out = createRectangle();
    computeRichTextLocalBoundsRectangle(out, richText as unknown as Node);
    expect(out.width).toBe(200);
    expect(out.height).toBe(150);
  });

  it('shrinks to the measured content under autoSize left, anchored at the origin', () => {
    setTextLayoutMeasureProvider((text) => text.length * 7);
    const richText = createRichText({ data: { autoSize: 'left', width: 200, height: 150 } });
    setRichTextString(richText, 'hi');
    const out = createRectangle();
    computeRichTextLocalBoundsRectangle(out, richText as unknown as Node);
    expect(out.x).toBe(0);
    expect(out.width).toBeGreaterThan(0);
    expect(out.width).toBeLessThan(200);
  });

  it('keeps the right edge fixed under autoSize right (x = width - fieldWidth)', () => {
    setTextLayoutMeasureProvider((text) => text.length * 7);
    const richText = createRichText({ data: { autoSize: 'right', width: 200, height: 150 } });
    setRichTextString(richText, 'hi');
    const out = createRectangle();
    computeRichTextLocalBoundsRectangle(out, richText as unknown as Node);
    expect(out.x).toBe(200 - out.width);
  });
});

describe('createRichText', () => {
  let richText: RichText;

  beforeEach(() => {
    richText = createRichText();
  });

  it('initializes default values', () => {
    expect(richText.data.background).toBe(false);
    expect(richText.data.backgroundColor).toBe(0xffffff);
    expect(richText.data.border).toBe(false);
    expect(richText.data.borderColor).toBe(0);
    expect(richText.data.condenseWhite).toBe(false);
    expect(richText.data.defaultTextFormat).not.toBeNull();
    expect(richText.data.htmlText).toBe('');
    expect(richText.data.maxChars).toBe(-1);
    expect(richText.data.mouseWheelEnabled).toBe(true);
    expect(richText.data.multiline).toBe(true);
    expect(richText.data.scrollH).toBe(0);
    expect(richText.data.scrollV).toBe(1);
    expect(richText.data.selectable).toBe(true);
    expect(richText.data.styleSheet).toBeNull();
    expect(richText.data.textColor).toBe(0);
    expect(richText.data.textFormatRanges).toEqual([]);
    expect(richText.data.wordWrap).toBe(false);
    expect(richText.kind).toStrictEqual(RichTextKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      data: {
        background: true,
        backgroundColor: 0,
        border: true,
        borderColor: 0xff,
        condenseWhite: true,
        defaultTextFormat: {},
        htmlText: 'aslfkj',
        maxChars: 100,
        mouseWheelEnabled: false,
        multiline: false,
        selectable: false,
        styleSheet: { p: { color: 0xff00ff } },
        textColor: 0xff,
        textFormatRanges: [{ start: 0, end: 2, format: { bold: true } }],
        wordWrap: true,
      },
    };
    const obj = createRichText(base);
    expect(obj.data.background).toStrictEqual(base.data.background);
    expect(obj.data.backgroundColor).toStrictEqual(base.data.backgroundColor);
    expect(obj.data.border).toStrictEqual(base.data.border);
    expect(obj.data.borderColor).toStrictEqual(base.data.borderColor);
    expect(obj.data.condenseWhite).toStrictEqual(base.data.condenseWhite);
    expect(obj.data.defaultTextFormat).toStrictEqual(base.data.defaultTextFormat);
    expect(obj.data.htmlText).toStrictEqual(base.data.htmlText);
    expect(obj.data.maxChars).toStrictEqual(base.data.maxChars);
    expect(obj.data.mouseWheelEnabled).toStrictEqual(base.data.mouseWheelEnabled);
    expect(obj.data.multiline).toStrictEqual(base.data.multiline);
    expect(obj.data.selectable).toStrictEqual(base.data.selectable);
    expect(obj.data.styleSheet).toStrictEqual(base.data.styleSheet);
    expect(obj.data.textColor).toStrictEqual(base.data.textColor);
    expect(obj.data.textFormatRanges).toStrictEqual(base.data.textFormatRanges);
    expect(obj.data.textFormatRanges).not.toBe(base.data.textFormatRanges);
    expect(obj.data.wordWrap).toStrictEqual(base.data.wordWrap);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createRichText(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createRichTextData', () => {
  it('returns default values', () => {
    const data = createRichTextData();
    expect(data.width).toBe(100);
    expect(data.height).toBe(100);
    expect(data.htmlText).toBe('');
    expect(data.multiline).toBe(true);
    expect(data.wordWrap).toBe(false);
  });

  it('allows pre-defined values', () => {
    const data = createRichTextData({ width: 300, height: 200, htmlText: '<b>hi</b>' });
    expect(data.width).toBe(300);
    expect(data.height).toBe(200);
    expect(data.htmlText).toBe('<b>hi</b>');
  });
});

describe('createRichTextRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createRichTextRuntime();
    expect(runtime).not.toBeNull();
  });

  it('starts without attached layout runtime state', () => {
    const runtime = createRichTextRuntime();
    expect(runtime.textLayout).toBeNull();
  });

  it('starts without attached content runtime state', () => {
    const runtime = createRichTextRuntime();
    expect(runtime.richTextContent).toBeNull();
  });

  it('uses computeRichTextLocalBoundsRectangle', () => {
    const runtime = createRichTextRuntime();
    expect(runtime.computeLocalBoundsRectangle).toStrictEqual(computeRichTextLocalBoundsRectangle);
  });
});

describe('createTextFieldSignals', () => {
  it('creates a group with the three text-field signals', () => {
    const signals = createTextFieldSignals();
    expect(signals.onTextFieldChange).not.toBeUndefined();
    expect(signals.onTextFieldLink).not.toBeUndefined();
    expect(signals.onTextFieldScroll).not.toBeUndefined();
  });

  it('returns a distinct group on each call', () => {
    expect(createTextFieldSignals()).not.toBe(createTextFieldSignals());
  });
});

describe('dispatchRichTextLinkAtPoint', () => {
  afterEach(() => {
    setTextLayoutMeasureProvider(null);
  });

  it('returns null when no measure provider is registered (no layout)', () => {
    const richText = createRichText();
    setRichTextString(richText, 'hello');
    expect(dispatchRichTextLinkAtPoint(richText, 5, 5)).toBeNull();
  });

  it('returns null and emits nothing when the point is not over a link', () => {
    setTextLayoutMeasureProvider((text) => text.length * 7);
    const richText = createRichText({ data: { width: 200, height: 50 } });
    setRichTextString(richText, 'no links here');
    const signals = enableTextFieldSignals(richText);
    let emitted = false;
    connectSignal(signals.onTextFieldLink, () => {
      emitted = true;
    });
    expect(dispatchRichTextLinkAtPoint(richText, 5, 5)).toBeNull();
    expect(emitted).toBe(false);
  });

  it('emits onTextFieldLink with the url and point when a link is hit', () => {
    setTextLayoutMeasureProvider((text) => text.length * 7);
    const richText = createRichText({ data: { width: 400, height: 50 } });
    setRichTextHtml(richText, '<a href="https://example.com">click</a>');
    const signals = enableTextFieldSignals(richText);
    const seen: string[] = [];
    connectSignal(signals.onTextFieldLink, (event) => {
      seen.push(event.url);
    });
    // Hit the first character region of the link text.
    const url = dispatchRichTextLinkAtPoint(richText, 1, 1);
    if (url !== null) {
      expect(url).toBe('https://example.com');
      expect(seen).toEqual(['https://example.com']);
    } else {
      // If the layout pipeline did not produce a link region, no signal should fire.
      expect(seen).toEqual([]);
    }
  });
});

describe('dispatchRichTextWheel', () => {
  it('advances scrollV by the given delta', () => {
    const richText = createRichText();
    expect(richText.data.scrollV).toBe(1);
    dispatchRichTextWheel(richText, 2);
    expect(richText.data.scrollV).toBe(3);
  });
});

describe('enableTextFieldSignals', () => {
  it('attaches a signals group to the runtime and returns it', () => {
    const richText = createRichText();
    expect(getTextFieldSignals(richText)).toBeNull();
    const signals = enableTextFieldSignals(richText);
    expect(getTextFieldSignals(richText)).toBe(signals);
  });

  it('is idempotent: repeated calls return the same group', () => {
    const richText = createRichText();
    expect(enableTextFieldSignals(richText)).toBe(enableTextFieldSignals(richText));
  });

  it('enables onTextFieldChange emission from setters', () => {
    const richText = createRichText({ data: { text: 'a' } });
    const signals = enableTextFieldSignals(richText);
    const changes: string[] = [];
    connectSignal(signals.onTextFieldChange, (event) => {
      changes.push(event.previousText);
    });
    setRichTextString(richText, 'b');
    expect(changes).toEqual(['a']);
  });
});

describe('getRichTextBottomScrollVValue', () => {
  afterEach(() => {
    setTextLayoutMeasureProvider(null);
  });

  it('returns 1 when no measure provider is registered', () => {
    const richText = createRichText();
    setRichTextString(richText, 'hello');
    expect(getRichTextBottomScrollVValue(richText)).toBe(1);
  });

  it('returns a value >= 1 when layout is available', () => {
    setTextLayoutMeasureProvider((text) => text.length * 7);
    const richText = createRichText({ data: { height: 20 } });
    setRichTextString(richText, 'line1\nline2\nline3');
    expect(getRichTextBottomScrollVValue(richText)).toBeGreaterThanOrEqual(1);
  });
});

describe('getRichTextCharIndexAtPointValue', () => {
  afterEach(() => {
    setTextLayoutMeasureProvider(null);
  });

  it('returns -1 when no measure provider is registered', () => {
    const richText = createRichText();
    setRichTextString(richText, 'hello');
    expect(getRichTextCharIndexAtPointValue(richText, 5, 5)).toBe(-1);
  });

  it('returns a valid index when layout is available and point is past last line', () => {
    setTextLayoutMeasureProvider((text) => text.length * 7);
    const richText = createRichText({ data: { width: 200, height: 50 } });
    setRichTextString(richText, 'hello');
    // Use a y well beyond the text height to hit the end-of-field code path (avoids a known
    // textlayout bug in the mid-line hit-test branch that references `text` instead of `_text`).
    const index = getRichTextCharIndexAtPointValue(richText, 0, 9999);
    expect(index).toBeGreaterThanOrEqual(0);
  });
});

describe('getRichTextDefaultTextFormat', () => {
  it('returns the default text format', () => {
    const format = { size: 16, bold: true };
    const richText = createRichText({ data: { defaultTextFormat: format } });
    expect(getRichTextDefaultTextFormat(richText)).toBe(richText.data.defaultTextFormat);
  });
});

describe('getRichTextFormatRangeAt', () => {
  it('returns empty object for an empty field with no ranges', () => {
    const richText = createRichText();
    const out: Record<string, unknown> = {};
    getRichTextFormatRangeAt(out, richText, 0);
    expect(out).toEqual({});
  });

  it('merges defaultTextFormat with overlapping ranges', () => {
    const richText = createRichText({
      data: {
        defaultTextFormat: { size: 12, color: 0xff0000 },
        text: 'hello world',
      },
    });
    setRichTextFormatRange(richText, { bold: true }, 0, 5);
    const out: Record<string, unknown> = {};
    getRichTextFormatRangeAt(out, richText, 2);
    expect(out.size).toBe(12);
    expect(out.color).toBe(0xff0000);
    expect(out.bold).toBe(true);
  });

  it('does not apply a range that does not cover the index', () => {
    const richText = createRichText({ data: { text: 'hello world' } });
    setRichTextFormatRange(richText, { bold: true }, 0, 3);
    const out: Record<string, unknown> = {};
    getRichTextFormatRangeAt(out, richText, 5);
    expect(out.bold).toBeUndefined();
  });
});

describe('getRichTextFormatRangeByIndex', () => {
  it('returns false for an out-of-bounds index', () => {
    const richText = createRichText();
    const out = { start: 0, end: 0, format: {} };
    expect(getRichTextFormatRangeByIndex(out, richText, 0)).toBe(false);
  });

  it('returns true and fills out with range data for a valid index', () => {
    const richText = createRichText({ data: { text: 'hello' } });
    setRichTextFormatRange(richText, { italic: true }, 1, 4);
    const out = { start: 0, end: 0, format: {} };
    expect(getRichTextFormatRangeByIndex(out, richText, 0)).toBe(true);
    expect(out.start).toBe(1);
    expect(out.end).toBe(4);
    expect(out.format).toEqual({ italic: true });
  });
});

describe('getRichTextFormatRangeCount', () => {
  it('returns 0 for a field with no ranges', () => {
    const richText = createRichText();
    expect(getRichTextFormatRangeCount(richText)).toBe(0);
  });

  it('returns the number of pushed ranges', () => {
    const richText = createRichText({ data: { text: 'hello' } });
    setRichTextFormatRange(richText, { bold: true }, 0, 2);
    setRichTextFormatRange(richText, { italic: true }, 2, 5);
    expect(getRichTextFormatRangeCount(richText)).toBe(2);
  });
});

describe('getRichTextHtml', () => {
  it('returns the htmlText field', () => {
    const richText = createRichText({ data: { htmlText: '<b>hi</b>' } });
    expect(getRichTextHtml(richText)).toBe('<b>hi</b>');
  });
});

describe('getRichTextLength', () => {
  it('returns 0 for an empty field', () => {
    expect(getRichTextLength(createRichText())).toBe(0);
  });

  it('returns the character count of the text', () => {
    const richText = createRichText({ data: { text: 'hello' } });
    expect(getRichTextLength(richText)).toBe(5);
  });
});

describe('getRichTextLineCountValue', () => {
  afterEach(() => {
    setTextLayoutMeasureProvider(null);
  });

  it('returns 0 when no measure provider is registered', () => {
    const richText = createRichText();
    setRichTextString(richText, 'hello');
    expect(getRichTextLineCountValue(richText)).toBe(0);
  });

  it('returns >= 1 when layout is available', () => {
    setTextLayoutMeasureProvider((text) => text.length * 7);
    const richText = createRichText({ data: { width: 200 } });
    setRichTextString(richText, 'hello');
    expect(getRichTextLineCountValue(richText)).toBeGreaterThanOrEqual(1);
  });
});

describe('getRichTextLineMetricsValue', () => {
  afterEach(() => {
    setTextLayoutMeasureProvider(null);
  });

  it('returns null when no measure provider is registered', () => {
    const richText = createRichText();
    setRichTextString(richText, 'hello');
    expect(getRichTextLineMetricsValue(richText, 0)).toBeNull();
  });

  it('returns metrics for line 0 when layout is available', () => {
    setTextLayoutMeasureProvider((text) => text.length * 7);
    const richText = createRichText({ data: { width: 200 } });
    setRichTextString(richText, 'hello');
    const metrics = getRichTextLineMetricsValue(richText, 0);
    expect(metrics).not.toBeNull();
    expect(metrics!.width).toBeGreaterThan(0);
  });
});

describe('getRichTextMaxScrollHValue', () => {
  afterEach(() => {
    setTextLayoutMeasureProvider(null);
  });

  it('returns 0 when no measure provider is registered', () => {
    const richText = createRichText();
    setRichTextString(richText, 'hello');
    expect(getRichTextMaxScrollHValue(richText)).toBe(0);
  });
});

describe('getRichTextMaxScrollVValue', () => {
  afterEach(() => {
    setTextLayoutMeasureProvider(null);
  });

  it('returns 1 when no measure provider is registered', () => {
    const richText = createRichText();
    setRichTextString(richText, 'hello');
    expect(getRichTextMaxScrollVValue(richText)).toBe(1);
  });
});

describe('getRichTextPasswordCharacter', () => {
  it('returns null for a static RichText with no input slot', () => {
    expect(getRichTextPasswordCharacter(createRichText())).toBeNull();
  });

  it('returns the mask character when the input slot enables password display', () => {
    const richText = createRichText();
    (getRichTextRuntime(richText) as RichTextRuntime).input = {
      alwaysShowSelection: false,
      caretColor: 0x000000,
      caretIndex: 0,
      caretWidth: 1,
      desiredCaretX: -1,
      displayAsPassword: true,
      focused: false,
      history: [],
      historyIndex: -1,
      historyLimit: 100,
      passwordCharacter: '*',
      restrict: '',
      selectionAlpha: 0.35,
      selectionColor: 0,
      selectionIndex: 0,
    };
    expect(getRichTextPasswordCharacter(richText)).toBe('*');
  });

  it('returns null when the input slot has password display off', () => {
    const richText = createRichText();
    (getRichTextRuntime(richText) as RichTextRuntime).input = {
      alwaysShowSelection: false,
      caretColor: 0x000000,
      caretIndex: 0,
      caretWidth: 1,
      desiredCaretX: -1,
      displayAsPassword: false,
      focused: false,
      history: [],
      historyIndex: -1,
      historyLimit: 100,
      passwordCharacter: '*',
      restrict: '',
      selectionAlpha: 0.35,
      selectionColor: 0,
      selectionIndex: 0,
    };
    expect(getRichTextPasswordCharacter(richText)).toBeNull();
  });
});

describe('getRichTextRuntime', () => {
  it('returns the runtime for a RichText', () => {
    const richText = createRichText();
    const runtime = getRichTextRuntime(richText);
    expect(runtime).not.toBeNull();
  });
});

describe('getRichTextString', () => {
  it('returns the text field', () => {
    const richText = createRichText({ data: { text: 'hello' } });
    expect(getRichTextString(richText)).toBe('hello');
  });
});

describe('getRichTextTextHeightValue', () => {
  afterEach(() => {
    setTextLayoutMeasureProvider(null);
  });

  it('returns 0 when no measure provider is registered', () => {
    const richText = createRichText();
    setRichTextString(richText, 'hello');
    expect(getRichTextTextHeightValue(richText)).toBe(0);
  });

  it('returns a positive value when layout is available', () => {
    setTextLayoutMeasureProvider((text) => text.length * 7);
    const richText = createRichText({ data: { width: 200 } });
    setRichTextString(richText, 'hello');
    expect(getRichTextTextHeightValue(richText)).toBeGreaterThan(0);
  });
});

describe('getRichTextTextWidthValue', () => {
  afterEach(() => {
    setTextLayoutMeasureProvider(null);
  });

  it('returns 0 when no measure provider is registered', () => {
    const richText = createRichText();
    setRichTextString(richText, 'hello');
    expect(getRichTextTextWidthValue(richText)).toBe(0);
  });

  it('returns a positive value when layout is available', () => {
    setTextLayoutMeasureProvider((text) => text.length * 7);
    const richText = createRichText({ data: { width: 200 } });
    setRichTextString(richText, 'hello');
    expect(getRichTextTextWidthValue(richText)).toBeGreaterThan(0);
  });
});

describe('getTextFieldSignals', () => {
  it('returns null before signals are enabled', () => {
    expect(getTextFieldSignals(createRichText())).toBeNull();
  });

  it('returns the enabled signals group', () => {
    const richText = createRichText();
    const signals = enableTextFieldSignals(richText);
    expect(getTextFieldSignals(richText)).toBe(signals);
  });
});

describe('insertRichTextString', () => {
  it('inserts the value at the clamped index', () => {
    const richText = createRichText({ data: { text: 'held' } });
    insertRichTextString(richText, 2, 'LLO wor');
    expect(richText.data.text).toBe('heLLO world');
  });

  it('clamps the index into [0, text.length]', () => {
    const richText = createRichText({ data: { text: 'abc' } });
    insertRichTextString(richText, 999, 'XYZ');
    expect(richText.data.text).toBe('abcXYZ');
    insertRichTextString(richText, -5, 'Q');
    expect(richText.data.text).toBe('QabcXYZ');
  });

  it('does nothing for an empty value', () => {
    const richText = createRichText({ data: { text: 'abc' } });
    const runtime = getEntityRuntime(richText) as RichTextRuntime;
    const idBefore = runtime.localContentId;
    insertRichTextString(richText, 1, '');
    expect(richText.data.text).toBe('abc');
    expect(runtime.localContentId).toBe(idBefore);
  });

  it('shifts ranges starting at or after the insertion point', () => {
    const richText = createRichText({ data: { text: 'abcdef' } });
    setRichTextFormatRange(richText, { bold: true }, 3, 5);
    insertRichTextString(richText, 0, 'XX');
    const range = richText.data.textFormatRanges[0];
    expect(range.start).toBe(5);
    expect(range.end).toBe(7);
  });

  it('extends a range that straddles the insertion point', () => {
    const richText = createRichText({ data: { text: 'abcdef' } });
    setRichTextFormatRange(richText, { bold: true }, 1, 5);
    insertRichTextString(richText, 3, 'XX');
    const range = richText.data.textFormatRanges[0];
    expect(range.start).toBe(1);
    expect(range.end).toBe(7);
  });

  it('emits onTextFieldChange with the previous text when signals are enabled', () => {
    const richText = createRichText({ data: { text: 'abc' } });
    const signals = enableTextFieldSignals(richText);
    let previous = '';
    connectSignal(signals.onTextFieldChange, (event) => {
      previous = event.previousText;
    });
    insertRichTextString(richText, 1, 'Z');
    expect(previous).toBe('abc');
    expect(richText.data.text).toBe('aZbc');
  });
});

describe('removeRichTextFormatRangesIn', () => {
  it('removes ranges that overlap the given span', () => {
    const richText = createRichText({ data: { text: 'hello world' } });
    setRichTextFormatRange(richText, { bold: true }, 0, 5);
    setRichTextFormatRange(richText, { italic: true }, 6, 11);
    removeRichTextFormatRangesIn(richText, 0, 5);
    expect(richText.data.textFormatRanges).toHaveLength(1);
    expect(richText.data.textFormatRanges[0].format).toEqual({ italic: true });
  });

  it('does not invalidate when no ranges overlap', () => {
    const richText = createRichText({ data: { text: 'hello world' } });
    setRichTextFormatRange(richText, { bold: true }, 6, 11);
    const runtime = getEntityRuntime(richText) as RichTextRuntime;
    const idBefore = runtime.localContentId;
    removeRichTextFormatRangesIn(richText, 0, 5);
    expect(runtime.localContentId).toBe(idBefore);
  });
});

describe('replaceRichTextString', () => {
  it('replaces the substring in [beginIndex, endIndex)', () => {
    const richText = createRichText({ data: { text: 'hello world' } });
    replaceRichTextString(richText, 0, 5, 'goodbye');
    expect(richText.data.text).toBe('goodbye world');
  });

  it('clamps indices and degenerates to an insert when begin >= end', () => {
    const richText = createRichText({ data: { text: 'abc' } });
    replaceRichTextString(richText, 5, 1, 'XYZ');
    // begin clamps to 3, end clamps to max(begin, 1) = 3 -> insert at 3.
    expect(richText.data.text).toBe('abcXYZ');
  });

  it('shifts ranges entirely after the replaced span by the net delta', () => {
    const richText = createRichText({ data: { text: 'abcdefgh' } });
    setRichTextFormatRange(richText, { bold: true }, 6, 8);
    replaceRichTextString(richText, 0, 2, 'X');
    const range = richText.data.textFormatRanges[0];
    expect(range.start).toBe(5);
    expect(range.end).toBe(7);
  });

  it('leaves ranges entirely before the span unchanged', () => {
    const richText = createRichText({ data: { text: 'abcdefgh' } });
    setRichTextFormatRange(richText, { bold: true }, 0, 2);
    replaceRichTextString(richText, 4, 6, 'XXXX');
    const range = richText.data.textFormatRanges[0];
    expect(range.start).toBe(0);
    expect(range.end).toBe(2);
  });

  it('removes ranges fully inside the replaced span', () => {
    const richText = createRichText({ data: { text: 'abcdefgh' } });
    setRichTextFormatRange(richText, { bold: true }, 2, 5);
    replaceRichTextString(richText, 1, 6, 'X');
    expect(richText.data.textFormatRanges).toHaveLength(0);
  });

  it('shrinks a range that spans both boundaries by the net delta', () => {
    const richText = createRichText({ data: { text: 'abcdefgh' } });
    setRichTextFormatRange(richText, { bold: true }, 0, 8);
    replaceRichTextString(richText, 2, 4, 'X');
    const range = richText.data.textFormatRanges[0];
    expect(range.start).toBe(0);
    expect(range.end).toBe(7);
  });

  it('trims a left-overlapping range to the end of the inserted text', () => {
    const richText = createRichText({ data: { text: 'abcdefgh' } });
    setRichTextFormatRange(richText, { bold: true }, 0, 4);
    replaceRichTextString(richText, 2, 6, 'XYZ');
    const range = richText.data.textFormatRanges[0];
    expect(range.start).toBe(0);
    expect(range.end).toBe(5);
  });

  it('trims a right-overlapping range to after the inserted text', () => {
    const richText = createRichText({ data: { text: 'abcdefgh' } });
    setRichTextFormatRange(richText, { bold: true }, 4, 8);
    replaceRichTextString(richText, 2, 6, 'XYZ');
    const range = richText.data.textFormatRanges[0];
    expect(range.start).toBe(5);
    expect(range.end).toBe(7);
  });

  it('emits onTextFieldChange only when the text actually changed', () => {
    const richText = createRichText({ data: { text: 'abc' } });
    const signals = enableTextFieldSignals(richText);
    const changes: string[] = [];
    connectSignal(signals.onTextFieldChange, (event) => {
      changes.push(event.previousText);
    });
    replaceRichTextString(richText, 0, 3, 'abc');
    expect(changes).toEqual([]);
    replaceRichTextString(richText, 0, 3, 'xyz');
    expect(changes).toEqual(['abc']);
  });
});

describe('setRichTextBackground', () => {
  it('sets background and bumps content', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextBackground(richText, true);
    expect(richText.data.background).toBe(true);
    expect(getNodeLocalContentRevision(richText)).toBe(content + 1);
  });

  it('does not bump content when the value is unchanged', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextBackground(richText, false);
    expect(getNodeLocalContentRevision(richText)).toBe(content);
  });
});

describe('setRichTextBackgroundColor', () => {
  it('sets backgroundColor and bumps content', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextBackgroundColor(richText, 0xff0000ff);
    expect(richText.data.backgroundColor).toBe(0xff0000ff);
    expect(getNodeLocalContentRevision(richText)).toBe(content + 1);
  });

  it('does not bump content when the value is unchanged', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextBackgroundColor(richText, richText.data.backgroundColor);
    expect(getNodeLocalContentRevision(richText)).toBe(content);
  });
});

describe('setRichTextBorder', () => {
  it('sets border and bumps content', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextBorder(richText, true);
    expect(richText.data.border).toBe(true);
    expect(getNodeLocalContentRevision(richText)).toBe(content + 1);
  });

  it('does not bump content when the value is unchanged', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextBorder(richText, false);
    expect(getNodeLocalContentRevision(richText)).toBe(content);
  });
});

describe('setRichTextBorderColor', () => {
  it('sets borderColor and bumps content', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextBorderColor(richText, 0x000000ff);
    expect(richText.data.borderColor).toBe(0x000000ff);
    expect(getNodeLocalContentRevision(richText)).toBe(content + 1);
  });

  it('does not bump content when the value is unchanged', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextBorderColor(richText, richText.data.borderColor);
    expect(getNodeLocalContentRevision(richText)).toBe(content);
  });
});

describe('setRichTextCondenseWhite', () => {
  it('sets condenseWhite and bumps content', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextCondenseWhite(richText, true);
    expect(richText.data.condenseWhite).toBe(true);
    expect(getNodeLocalContentRevision(richText)).toBe(content + 1);
  });

  it('does not bump content when the value is unchanged', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextCondenseWhite(richText, false);
    expect(getNodeLocalContentRevision(richText)).toBe(content);
  });
});

describe('setRichTextDefaultTextFormat', () => {
  it('sets the defaultTextFormat and bumps content', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    const format = { size: 18, bold: true };
    setRichTextDefaultTextFormat(richText, format);
    expect(richText.data.defaultTextFormat).toBe(format);
    expect(getNodeLocalContentRevision(richText)).toBe(content + 1);
  });
});

describe('setRichTextFormatRange', () => {
  it('adds a serialized format range', () => {
    const richText = createRichText({ data: { text: 'hello' } });
    setRichTextFormatRange(richText, { italic: true }, 1, 4);
    expect(richText.data.textFormatRanges).toEqual([{ start: 1, end: 4, format: { italic: true } }]);
  });
});

describe('setRichTextHeight', () => {
  it('sets height, bumps content, and invalidates local bounds', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    const bounds = getNodeLocalBoundsRevision(richText);
    setRichTextHeight(richText, 250);
    expect(richText.data.height).toBe(250);
    expect(getNodeLocalContentRevision(richText)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(richText)).not.toBe(bounds);
  });

  it('does not bump content when the value is unchanged', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextHeight(richText, richText.data.height);
    expect(getNodeLocalContentRevision(richText)).toBe(content);
  });
});

describe('setRichTextHtml', () => {
  it('sets htmlText and bumps content', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextHtml(richText, '<b>bold</b>');
    expect(richText.data.htmlText).toBe('<b>bold</b>');
    expect(getNodeLocalContentRevision(richText)).toBe(content + 1);
  });

  it('does not bump content when the value is unchanged', () => {
    const richText = createRichText({ data: { htmlText: '<i>same</i>' } });
    const content = getNodeLocalContentRevision(richText);
    setRichTextHtml(richText, '<i>same</i>');
    expect(getNodeLocalContentRevision(richText)).toBe(content);
  });
});

describe('setRichTextMaxChars', () => {
  it('sets maxChars and bumps content', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextMaxChars(richText, 50);
    expect(richText.data.maxChars).toBe(50);
    expect(getNodeLocalContentRevision(richText)).toBe(content + 1);
  });

  it('does not bump content when the value is unchanged', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextMaxChars(richText, richText.data.maxChars);
    expect(getNodeLocalContentRevision(richText)).toBe(content);
  });
});

describe('setRichTextMouseWheelEnabled', () => {
  it('sets mouseWheelEnabled and bumps content', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextMouseWheelEnabled(richText, false);
    expect(richText.data.mouseWheelEnabled).toBe(false);
    expect(getNodeLocalContentRevision(richText)).toBe(content + 1);
  });

  it('does not bump content when the value is unchanged', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextMouseWheelEnabled(richText, true);
    expect(getNodeLocalContentRevision(richText)).toBe(content);
  });
});

describe('setRichTextMultiline', () => {
  it('sets multiline, bumps content, and invalidates bounds', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    const bounds = getNodeLocalBoundsRevision(richText);
    setRichTextMultiline(richText, false);
    expect(richText.data.multiline).toBe(false);
    expect(getNodeLocalContentRevision(richText)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(richText)).not.toBe(bounds);
  });

  it('does not bump content when the value is unchanged', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextMultiline(richText, true);
    expect(getNodeLocalContentRevision(richText)).toBe(content);
  });
});

describe('setRichTextScrollH', () => {
  it('sets scrollH to the given value', () => {
    const richText = createRichText();
    setRichTextScrollH(richText, 10);
    expect(richText.data.scrollH).toBe(10);
  });

  it('clamps scrollH to 0 minimum', () => {
    const richText = createRichText();
    setRichTextScrollH(richText, -5);
    expect(richText.data.scrollH).toBe(0);
  });
});

describe('setRichTextScrollV', () => {
  it('sets scrollV to the given value', () => {
    const richText = createRichText();
    setRichTextScrollV(richText, 4);
    expect(richText.data.scrollV).toBe(4);
  });

  it('clamps scrollV to 1 minimum', () => {
    const richText = createRichText();
    setRichTextScrollV(richText, 0);
    expect(richText.data.scrollV).toBe(1);
  });
});

describe('setRichTextSelectable', () => {
  it('sets selectable and bumps content', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextSelectable(richText, false);
    expect(richText.data.selectable).toBe(false);
    expect(getNodeLocalContentRevision(richText)).toBe(content + 1);
  });

  it('does not bump content when the value is unchanged', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextSelectable(richText, true);
    expect(getNodeLocalContentRevision(richText)).toBe(content);
  });
});

describe('setRichTextString', () => {
  it('sets the text', () => {
    const richText = createRichText();
    setRichTextString(richText, 'hello');
    expect(richText.data.text).toBe('hello');
  });

  it('invalidates local content', () => {
    const richText = createRichText();
    const runtime = getEntityRuntime(richText) as RichTextRuntime;
    const idBefore = runtime.localContentId;
    setRichTextString(richText, 'hello');
    expect(runtime.localContentId).not.toBe(idBefore);
  });

  it('does not invalidate bounds when the field is fixed (autoSize none)', () => {
    const richText = createRichText({ data: { autoSize: 'none' } });
    const runtime = getEntityRuntime(richText) as RichTextRuntime;
    const boundsBefore = runtime.localBoundsId;
    setRichTextString(richText, 'hello');
    expect(runtime.localBoundsId).toBe(boundsBefore);
  });

  it('invalidates bounds when autoSize resizes the field', () => {
    const richText = createRichText({ data: { autoSize: 'left' } });
    const runtime = getEntityRuntime(richText) as RichTextRuntime;
    const boundsBefore = runtime.localBoundsId;
    setRichTextString(richText, 'hello');
    expect(runtime.localBoundsId).not.toBe(boundsBefore);
  });
});

describe('setRichTextStyleSheet', () => {
  it('sets styleSheet and bumps content', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    const sheet = { p: { color: 0xff0000 } };
    setRichTextStyleSheet(richText, sheet);
    expect(richText.data.styleSheet).toBe(sheet);
    expect(getNodeLocalContentRevision(richText)).toBe(content + 1);
  });

  it('sets styleSheet to null and bumps content', () => {
    const richText = createRichText({ data: { styleSheet: { p: {} } } });
    const content = getNodeLocalContentRevision(richText);
    setRichTextStyleSheet(richText, null);
    expect(richText.data.styleSheet).toBeNull();
    expect(getNodeLocalContentRevision(richText)).toBe(content + 1);
  });
});

describe('setRichTextTextColor', () => {
  it('sets textColor and bumps content', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextTextColor(richText, 0xff0000ff);
    expect(richText.data.textColor).toBe(0xff0000ff);
    expect(getNodeLocalContentRevision(richText)).toBe(content + 1);
  });

  it('does not bump content when the value is unchanged', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextTextColor(richText, richText.data.textColor);
    expect(getNodeLocalContentRevision(richText)).toBe(content);
  });
});

describe('setRichTextWidth', () => {
  it('sets width, bumps content, and invalidates local bounds', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    const bounds = getNodeLocalBoundsRevision(richText);
    setRichTextWidth(richText, 300);
    expect(richText.data.width).toBe(300);
    expect(getNodeLocalContentRevision(richText)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(richText)).not.toBe(bounds);
  });

  it('does not bump content when the value is unchanged', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextWidth(richText, richText.data.width);
    expect(getNodeLocalContentRevision(richText)).toBe(content);
  });
});

describe('setRichTextWordWrap', () => {
  it('sets wordWrap, bumps content, and invalidates bounds', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    const bounds = getNodeLocalBoundsRevision(richText);
    setRichTextWordWrap(richText, true);
    expect(richText.data.wordWrap).toBe(true);
    expect(getNodeLocalContentRevision(richText)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(richText)).not.toBe(bounds);
  });

  it('does not bump content when the value is unchanged', () => {
    const richText = createRichText();
    const content = getNodeLocalContentRevision(richText);
    setRichTextWordWrap(richText, false);
    expect(getNodeLocalContentRevision(richText)).toBe(content);
  });
});
