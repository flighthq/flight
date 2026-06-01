import { getAppearanceID } from '@flighthq/scenegraph-core';
import { createInputText, setRichTextFormatRange } from '@flighthq/scenegraph-display';
import type { KeyboardData, TextLayoutResult } from '@flighthq/types';
import { KeyCode } from '@flighthq/types';

import {
  appendInputText,
  applyInputTextRestriction,
  deleteInputTextBackward,
  deleteInputTextForward,
  getInputTextCaretIndex,
  getInputTextCaretRectangle,
  getInputTextCharacterIndexAtPoint,
  getInputTextDisplayText,
  getInputTextSelectionBeginIndex,
  getInputTextSelectionEndIndex,
  getInputTextSelectionRectangles,
  handleInputTextKeyboard,
  insertInputText,
  moveInputTextCaret,
  replaceInputText,
  replaceSelectedInputText,
  selectAllInputText,
  setInputTextSelection,
} from './inputTextEditing';

function createKeyboardData(data: Partial<KeyboardData>): KeyboardData {
  return {
    altKey: false,
    ctrlKey: false,
    key: '',
    keyCode: 0,
    metaKey: false,
    shiftKey: false,
    ...data,
  };
}

function createLayout(): TextLayoutResult {
  return {
    groups: [
      {
        ascent: 10,
        descent: 2,
        endIndex: 3,
        format: {},
        height: 12,
        leading: 0,
        lineIndex: 0,
        offsetX: 2,
        offsetY: 2,
        positions: [10, 10, 10],
        startIndex: 0,
        width: 30,
      },
      {
        ascent: 10,
        descent: 2,
        endIndex: 7,
        format: {},
        height: 12,
        leading: 0,
        lineIndex: 1,
        offsetX: 2,
        offsetY: 14,
        positions: [10, 10, 10, 10],
        startIndex: 3,
        width: 40,
      },
    ],
    lineAscents: [10, 10],
    lineDescents: [2, 2],
    lineHeights: [12, 12],
    lineLeadings: [0, 0],
    lineWidths: [30, 40],
    numLines: 2,
    textHeight: 24,
    textWidth: 40,
  };
}

describe('appendInputText', () => {
  it('appends without input restrictions', () => {
    const text = createInputText({ data: { maxChars: 3, text: 'abc' } });
    appendInputText(text, 'def');
    expect(text.data.text).toBe('abcdef');
    expect(getInputTextCaretIndex(text)).toBe(6);
  });
});

describe('applyInputTextRestriction', () => {
  it('allows accepted ranges', () => {
    const text = createInputText({ data: { restrict: 'A-Z 0-9' } });
    expect(applyInputTextRestriction(text.data, 'A1a!')).toBe('A1');
  });

  it('declines ranges after a caret', () => {
    const text = createInputText({ data: { restrict: '^a-z' } });
    expect(applyInputTextRestriction(text.data, 'Abc1')).toBe('A1');
  });

  it('supports escaping literal carets and hyphens', () => {
    const text = createInputText({ data: { restrict: '\\-\\^' } });
    expect(applyInputTextRestriction(text.data, '-^A')).toBe('-^');
  });

  it('applies maxChars to inserted user input', () => {
    const text = createInputText({ data: { maxChars: 5, text: 'abc' } });
    expect(applyInputTextRestriction(text.data, 'def')).toBe('de');
  });

  it('removes line breaks for single-line input', () => {
    const text = createInputText({ data: { multiline: false } });
    expect(applyInputTextRestriction(text.data, 'a\nb\rc')).toBe('abc');
  });
});

describe('deleteInputTextBackward', () => {
  it('deletes the previous character for a collapsed selection', () => {
    const text = createInputText({ data: { text: 'abc' } });
    setInputTextSelection(text, 2, 2);
    deleteInputTextBackward(text);
    expect(text.data.text).toBe('ac');
    expect(getInputTextCaretIndex(text)).toBe(1);
  });

  it('deletes the selected range', () => {
    const text = createInputText({ data: { text: 'abcd' } });
    setInputTextSelection(text, 1, 3);
    deleteInputTextBackward(text);
    expect(text.data.text).toBe('ad');
  });
});

describe('deleteInputTextForward', () => {
  it('deletes the next character for a collapsed selection', () => {
    const text = createInputText({ data: { text: 'abc' } });
    setInputTextSelection(text, 1, 1);
    deleteInputTextForward(text);
    expect(text.data.text).toBe('ac');
  });
});

describe('getInputTextCaretIndex', () => {
  it('clamps the runtime caret to text length', () => {
    const text = createInputText({ data: { text: 'abc' } });
    setInputTextSelection(text, 0, 99);
    expect(getInputTextCaretIndex(text)).toBe(3);
  });
});

describe('getInputTextCaretRectangle', () => {
  it('writes a caret rectangle from the layout group', () => {
    const text = createInputText({ data: { text: 'abcdefg' } });
    const out = { height: 0, lineIndex: 0, width: 0, x: 0, y: 0 };
    setInputTextSelection(text, 2, 2);
    getInputTextCaretRectangle(out, text, createLayout());
    expect(out).toEqual({ height: 12, lineIndex: 0, width: 1, x: 22, y: 2 });
  });
});

describe('getInputTextCharacterIndexAtPoint', () => {
  it('returns the nearest character index on a line', () => {
    const text = createInputText({ data: { text: 'abcdefg' } });
    expect(getInputTextCharacterIndexAtPoint(text, createLayout(), 27, 3)).toBe(3);
  });

  it('selects the closest line by y', () => {
    const text = createInputText({ data: { text: 'abcdefg' } });
    expect(getInputTextCharacterIndexAtPoint(text, createLayout(), 2, 20)).toBe(3);
  });
});

describe('getInputTextDisplayText', () => {
  it('returns plain text by default', () => {
    const text = createInputText({ data: { text: 'secret' } });
    expect(getInputTextDisplayText(text)).toBe('secret');
  });

  it('returns password characters when displayAsPassword is enabled', () => {
    const text = createInputText({ data: { displayAsPassword: true, passwordCharacter: '*', text: 'secret' } });
    expect(getInputTextDisplayText(text)).toBe('******');
  });
});

describe('getInputTextSelectionBeginIndex', () => {
  it('returns the lower selected index', () => {
    const text = createInputText({ data: { text: 'abcd' } });
    setInputTextSelection(text, 3, 1);
    expect(getInputTextSelectionBeginIndex(text)).toBe(1);
  });
});

describe('getInputTextSelectionEndIndex', () => {
  it('returns the higher selected index', () => {
    const text = createInputText({ data: { text: 'abcd' } });
    setInputTextSelection(text, 3, 1);
    expect(getInputTextSelectionEndIndex(text)).toBe(3);
  });
});

describe('getInputTextSelectionRectangles', () => {
  it('writes one rectangle per selected layout group', () => {
    const text = createInputText({ data: { text: 'abcdefg' } });
    const out: { height: number; lineIndex: number; width: number; x: number; y: number }[] = [];
    setInputTextSelection(text, 1, 5);
    getInputTextSelectionRectangles(out, text, createLayout());
    expect(out).toEqual([
      { height: 12, lineIndex: 0, width: 20, x: 12, y: 2 },
      { height: 12, lineIndex: 1, width: 20, x: 2, y: 14 },
    ]);
  });
});

describe('handleInputTextKeyboard', () => {
  it('handles arrow movement', () => {
    const text = createInputText({ data: { text: 'abc' } });
    setInputTextSelection(text, 2, 2);
    expect(handleInputTextKeyboard(text, createKeyboardData({ key: 'ArrowLeft', keyCode: KeyCode.LEFT }))).toBe(true);
    expect(getInputTextCaretIndex(text)).toBe(1);
  });

  it('extends selection when shift is held', () => {
    const text = createInputText({ data: { text: 'abc' } });
    setInputTextSelection(text, 1, 1);
    handleInputTextKeyboard(text, createKeyboardData({ key: 'ArrowRight', keyCode: KeyCode.RIGHT, shiftKey: true }));
    expect(getInputTextSelectionBeginIndex(text)).toBe(1);
    expect(getInputTextSelectionEndIndex(text)).toBe(2);
  });

  it('handles backspace', () => {
    const text = createInputText({ data: { text: 'abc' } });
    setInputTextSelection(text, 2, 2);
    handleInputTextKeyboard(text, createKeyboardData({ key: 'Backspace', keyCode: KeyCode.BACKSPACE }));
    expect(text.data.text).toBe('ac');
  });

  it('handles ctrl-a selection', () => {
    const text = createInputText({ data: { text: 'abc' } });
    handleInputTextKeyboard(text, createKeyboardData({ ctrlKey: true, key: 'a', keyCode: KeyCode.A }));
    expect(getInputTextSelectionBeginIndex(text)).toBe(0);
    expect(getInputTextSelectionEndIndex(text)).toBe(3);
  });

  it('handles paste using input restrictions', () => {
    const text = createInputText({ data: { restrict: '0-9', text: 'a' } });
    setInputTextSelection(text, 1, 1);
    handleInputTextKeyboard(text, createKeyboardData({ ctrlKey: true, key: 'v', keyCode: KeyCode.V }), {
      clipboardText: 'b23',
    });
    expect(text.data.text).toBe('a23');
  });

  it('inserts returns only for multiline input', () => {
    const text = createInputText({ data: { multiline: true, text: 'a' } });
    setInputTextSelection(text, 1, 1);
    expect(handleInputTextKeyboard(text, createKeyboardData({ key: 'Enter', keyCode: KeyCode.RETURN }))).toBe(true);
    expect(text.data.text).toBe('a\n');
  });
});

describe('insertInputText', () => {
  it('replaces the current selection using input restrictions', () => {
    const text = createInputText({ data: { restrict: '0-9', text: 'ab' } });
    setInputTextSelection(text, 1, 1);
    insertInputText(text, 'c3');
    expect(text.data.text).toBe('a3b');
  });
});

describe('moveInputTextCaret', () => {
  it('moves and collapses selection by default', () => {
    const text = createInputText({ data: { text: 'abc' } });
    moveInputTextCaret(text, 2);
    expect(getInputTextSelectionBeginIndex(text)).toBe(2);
    expect(getInputTextSelectionEndIndex(text)).toBe(2);
  });
});

describe('replaceInputText', () => {
  it('replaces a range and collapses selection after inserted text', () => {
    const text = createInputText({ data: { text: 'hello world' } });
    const before = getAppearanceID(text);
    replaceInputText(text, 6, 11, 'Flight');
    expect(text.data.text).toBe('hello Flight');
    expect(getInputTextSelectionBeginIndex(text)).toBe(12);
    expect(getInputTextSelectionEndIndex(text)).toBe(12);
    expect(getAppearanceID(text)).not.toBe(before);
  });

  it('updates serialized text format ranges after insertion', () => {
    const text = createInputText({ data: { text: 'abcd' } });
    setRichTextFormatRange(text, { bold: true }, 0, 4);
    replaceInputText(text, 2, 2, 'XY');
    expect(text.data.textFormatRanges).toEqual([{ start: 0, end: 6, format: { bold: true } }]);
  });

  it('updates serialized text format ranges after replacement', () => {
    const text = createInputText({ data: { text: 'abcd' } });
    setRichTextFormatRange(text, { bold: true }, 0, 2);
    setRichTextFormatRange(text, { italic: true }, 2, 4);
    replaceInputText(text, 1, 3, 'Z');
    expect(text.data.textFormatRanges).toEqual([
      { start: 0, end: 1, format: { bold: true } },
      { start: 1, end: 3, format: { italic: true } },
    ]);
  });
});

describe('replaceSelectedInputText', () => {
  it('does not apply input restrictions by default', () => {
    const text = createInputText({ data: { maxChars: 3, restrict: '0-9', text: 'abc' } });
    setInputTextSelection(text, 1, 2);
    replaceSelectedInputText(text, 'XYZ');
    expect(text.data.text).toBe('aXYZc');
  });

  it('can apply input restrictions for user input paths', () => {
    const text = createInputText({ data: { maxChars: 4, restrict: '0-9', text: 'ab' } });
    setInputTextSelection(text, 1, 1);
    replaceSelectedInputText(text, 'c345', { applyInputRules: true });
    expect(text.data.text).toBe('a34b');
  });
});

describe('selectAllInputText', () => {
  it('selects the full input text range', () => {
    const text = createInputText({ data: { text: 'abc' } });
    selectAllInputText(text);
    expect(getInputTextSelectionBeginIndex(text)).toBe(0);
    expect(getInputTextSelectionEndIndex(text)).toBe(3);
  });
});

describe('setInputTextSelection', () => {
  it('clamps selection to the text range', () => {
    const text = createInputText({ data: { text: 'abc' } });
    setInputTextSelection(text, -10, 10);
    expect(getInputTextSelectionBeginIndex(text)).toBe(0);
    expect(getInputTextSelectionEndIndex(text)).toBe(3);
  });
});
