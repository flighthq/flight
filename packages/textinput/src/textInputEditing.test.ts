import { getNodeAppearanceRevision } from '@flighthq/node';
import { createRichText, setRichTextFormatRange } from '@flighthq/text';
import type { KeyboardEventData, RichText, RichTextData, TextInputOptions, TextLayoutResult } from '@flighthq/types';
import { KeyCode } from '@flighthq/types';

import { enableTextInput } from './textInput';
import {
  appendTextInput,
  applyTextInputRestriction,
  deleteTextInputBackward,
  deleteTextInputForward,
  getTextInputCaretIndex,
  getTextInputCaretRectangle,
  getTextInputCharacterIndexAtPoint,
  getTextInputDisplayText,
  getTextInputSelectionBeginIndex,
  getTextInputSelectionEndIndex,
  getTextInputSelectionRectangles,
  getTextInputSelectionText,
  handleTextInputKeyboard,
  insertTextInput,
  moveTextInputCaret,
  replaceSelectedTextInput,
  replaceTextInput,
  selectAllTextInput,
  selectLineAtTextInputIndex,
  selectWordAtTextInputIndex,
  setTextInputSelection,
} from './textInputEditing';

// Editing operates on a RichText with the input capability enabled. Field/maxChars/multiline live on
// RichTextData; restrict/password live on the enableTextInput options (the TextInputState slot).
function createInput(data: Partial<RichTextData> = {}, options: TextInputOptions = {}): RichText {
  const text = createRichText({ data });
  enableTextInput(text, options);
  return text;
}

function createKeyboardData(data: Partial<KeyboardEventData>): KeyboardEventData {
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

describe('appendTextInput', () => {
  it('appends without input restrictions', () => {
    const text = createInput({ maxChars: 3, text: 'abc' });
    appendTextInput(text, 'def');
    expect(text.data.text).toBe('abcdef');
    expect(getTextInputCaretIndex(text)).toBe(6);
  });
});

describe('applyTextInputRestriction', () => {
  it('allows accepted ranges', () => {
    const text = createInput({}, { restrict: 'A-Z 0-9' });
    expect(applyTextInputRestriction(text, 'A1a!')).toBe('A1');
  });

  it('declines ranges after a caret', () => {
    const text = createInput({}, { restrict: '^a-z' });
    expect(applyTextInputRestriction(text, 'Abc1')).toBe('A1');
  });

  it('supports escaping literal carets and hyphens', () => {
    const text = createInput({}, { restrict: '\\-\\^' });
    expect(applyTextInputRestriction(text, '-^A')).toBe('-^');
  });

  it('applies maxChars to inserted user input', () => {
    const text = createInput({ maxChars: 5, text: 'abc' });
    expect(applyTextInputRestriction(text, 'def')).toBe('de');
  });

  it('removes line breaks for single-line input', () => {
    const text = createInput({ multiline: false });
    expect(applyTextInputRestriction(text, 'a\nb\rc')).toBe('abc');
  });
});

describe('deleteTextInputBackward', () => {
  it('deletes the previous character for a collapsed selection', () => {
    const text = createInput({ text: 'abc' });
    setTextInputSelection(text, 2, 2);
    deleteTextInputBackward(text);
    expect(text.data.text).toBe('ac');
    expect(getTextInputCaretIndex(text)).toBe(1);
  });

  it('deletes the selected range', () => {
    const text = createInput({ text: 'abcd' });
    setTextInputSelection(text, 1, 3);
    deleteTextInputBackward(text);
    expect(text.data.text).toBe('ad');
  });
});

describe('deleteTextInputForward', () => {
  it('deletes the next character for a collapsed selection', () => {
    const text = createInput({ text: 'abc' });
    setTextInputSelection(text, 1, 1);
    deleteTextInputForward(text);
    expect(text.data.text).toBe('ac');
  });
});

describe('getTextInputCaretIndex', () => {
  it('clamps the runtime caret to text length', () => {
    const text = createInput({ text: 'abc' });
    setTextInputSelection(text, 0, 99);
    expect(getTextInputCaretIndex(text)).toBe(3);
  });
});

describe('getTextInputCaretRectangle', () => {
  it('writes a caret rectangle from the layout group', () => {
    const text = createInput({ text: 'abcdefg' });
    const out = { height: 0, lineIndex: 0, width: 0, x: 0, y: 0 };
    setTextInputSelection(text, 2, 2);
    getTextInputCaretRectangle(out, text, createLayout());
    expect(out).toEqual({ height: 12, lineIndex: 0, width: 1, x: 22, y: 2 });
  });
});

describe('getTextInputCharacterIndexAtPoint', () => {
  it('returns the nearest character index on a line', () => {
    const text = createInput({ text: 'abcdefg' });
    expect(getTextInputCharacterIndexAtPoint(text, createLayout(), 27, 3)).toBe(3);
  });

  it('selects the closest line by y', () => {
    const text = createInput({ text: 'abcdefg' });
    expect(getTextInputCharacterIndexAtPoint(text, createLayout(), 2, 20)).toBe(3);
  });
});

describe('getTextInputDisplayText', () => {
  it('returns plain text by default', () => {
    const text = createInput({ text: 'secret' });
    expect(getTextInputDisplayText(text)).toBe('secret');
  });

  it('returns password characters when displayAsPassword is enabled', () => {
    const text = createInput({ text: 'secret' }, { displayAsPassword: true, passwordCharacter: '*' });
    expect(getTextInputDisplayText(text)).toBe('******');
  });
});

describe('getTextInputSelectionBeginIndex', () => {
  it('returns the lower selected index', () => {
    const text = createInput({ text: 'abcd' });
    setTextInputSelection(text, 3, 1);
    expect(getTextInputSelectionBeginIndex(text)).toBe(1);
  });
});

describe('getTextInputSelectionEndIndex', () => {
  it('returns the higher selected index', () => {
    const text = createInput({ text: 'abcd' });
    setTextInputSelection(text, 3, 1);
    expect(getTextInputSelectionEndIndex(text)).toBe(3);
  });
});

describe('getTextInputSelectionRectangles', () => {
  it('writes one rectangle per selected layout group', () => {
    const text = createInput({ text: 'abcdefg' });
    const out: { height: number; lineIndex: number; width: number; x: number; y: number }[] = [];
    setTextInputSelection(text, 1, 5);
    getTextInputSelectionRectangles(out, text, createLayout());
    expect(out).toEqual([
      { height: 12, lineIndex: 0, width: 20, x: 12, y: 2 },
      { height: 12, lineIndex: 1, width: 20, x: 2, y: 14 },
    ]);
  });
});

describe('getTextInputSelectionText', () => {
  it('returns the selected slice of text', () => {
    const text = createInput({ text: 'hello world' });
    setTextInputSelection(text, 6, 11);
    expect(getTextInputSelectionText(text)).toBe('world');
  });

  it('returns empty string for a collapsed selection', () => {
    const text = createInput({ text: 'hello' });
    setTextInputSelection(text, 2, 2);
    expect(getTextInputSelectionText(text)).toBe('');
  });
});

describe('handleTextInputKeyboard', () => {
  it('handles arrow movement', () => {
    const text = createInput({ text: 'abc' });
    setTextInputSelection(text, 2, 2);
    expect(handleTextInputKeyboard(text, createKeyboardData({ key: 'ArrowLeft', keyCode: KeyCode.LEFT }))).toBe(true);
    expect(getTextInputCaretIndex(text)).toBe(1);
  });

  it('extends selection when shift is held', () => {
    const text = createInput({ text: 'abc' });
    setTextInputSelection(text, 1, 1);
    handleTextInputKeyboard(text, createKeyboardData({ key: 'ArrowRight', keyCode: KeyCode.RIGHT, shiftKey: true }));
    expect(getTextInputSelectionBeginIndex(text)).toBe(1);
    expect(getTextInputSelectionEndIndex(text)).toBe(2);
  });

  it('handles backspace', () => {
    const text = createInput({ text: 'abc' });
    setTextInputSelection(text, 2, 2);
    handleTextInputKeyboard(text, createKeyboardData({ key: 'Backspace', keyCode: KeyCode.BACKSPACE }));
    expect(text.data.text).toBe('ac');
  });

  it('handles ctrl-a selection', () => {
    const text = createInput({ text: 'abc' });
    handleTextInputKeyboard(text, createKeyboardData({ ctrlKey: true, key: 'a', keyCode: KeyCode.A }));
    expect(getTextInputSelectionBeginIndex(text)).toBe(0);
    expect(getTextInputSelectionEndIndex(text)).toBe(3);
  });

  it('handles paste using input restrictions', () => {
    const text = createInput({ text: 'a' }, { restrict: '0-9' });
    setTextInputSelection(text, 1, 1);
    handleTextInputKeyboard(text, createKeyboardData({ ctrlKey: true, key: 'v', keyCode: KeyCode.V }), {
      clipboardText: 'b23',
    });
    expect(text.data.text).toBe('a23');
  });

  it('inserts returns only for multiline input', () => {
    const text = createInput({ multiline: true, text: 'a' });
    setTextInputSelection(text, 1, 1);
    expect(handleTextInputKeyboard(text, createKeyboardData({ key: 'Enter', keyCode: KeyCode.RETURN }))).toBe(true);
    expect(text.data.text).toBe('a\n');
  });
});

describe('insertTextInput', () => {
  it('replaces the current selection using input restrictions', () => {
    const text = createInput({ text: 'ab' }, { restrict: '0-9' });
    setTextInputSelection(text, 1, 1);
    insertTextInput(text, 'c3');
    expect(text.data.text).toBe('a3b');
  });
});

describe('moveTextInputCaret', () => {
  it('moves and collapses selection by default', () => {
    const text = createInput({ text: 'abc' });
    moveTextInputCaret(text, 2);
    expect(getTextInputSelectionBeginIndex(text)).toBe(2);
    expect(getTextInputSelectionEndIndex(text)).toBe(2);
  });
});

describe('replaceSelectedTextInput', () => {
  it('does not apply input restrictions by default', () => {
    const text = createInput({ maxChars: 3, text: 'abc' }, { restrict: '0-9' });
    setTextInputSelection(text, 1, 2);
    replaceSelectedTextInput(text, 'XYZ');
    expect(text.data.text).toBe('aXYZc');
  });

  it('can apply input restrictions for user input paths', () => {
    const text = createInput({ maxChars: 4, text: 'ab' }, { restrict: '0-9' });
    setTextInputSelection(text, 1, 1);
    replaceSelectedTextInput(text, 'c345', { applyInputRules: true });
    expect(text.data.text).toBe('a34b');
  });
});

describe('replaceTextInput', () => {
  it('replaces a range and collapses selection after inserted text', () => {
    const text = createInput({ text: 'hello world' });
    const before = getNodeAppearanceRevision(text);
    replaceTextInput(text, 6, 11, 'Flight');
    expect(text.data.text).toBe('hello Flight');
    expect(getTextInputSelectionBeginIndex(text)).toBe(12);
    expect(getTextInputSelectionEndIndex(text)).toBe(12);
    expect(getNodeAppearanceRevision(text)).not.toBe(before);
  });

  it('updates serialized text format ranges after insertion', () => {
    const text = createInput({ text: 'abcd' });
    setRichTextFormatRange(text, { bold: true }, 0, 4);
    replaceTextInput(text, 2, 2, 'XY');
    expect(text.data.textFormatRanges).toEqual([{ start: 0, end: 6, format: { bold: true } }]);
  });

  it('updates serialized text format ranges after replacement', () => {
    const text = createInput({ text: 'abcd' });
    setRichTextFormatRange(text, { bold: true }, 0, 2);
    setRichTextFormatRange(text, { italic: true }, 2, 4);
    replaceTextInput(text, 1, 3, 'Z');
    expect(text.data.textFormatRanges).toEqual([
      { start: 0, end: 1, format: { bold: true } },
      { start: 1, end: 3, format: { italic: true } },
    ]);
  });
});

describe('selectAllTextInput', () => {
  it('selects the full input text range', () => {
    const text = createInput({ text: 'abc' });
    selectAllTextInput(text);
    expect(getTextInputSelectionBeginIndex(text)).toBe(0);
    expect(getTextInputSelectionEndIndex(text)).toBe(3);
  });
});

describe('selectLineAtTextInputIndex', () => {
  it('selects from the start to the end of the line', () => {
    const text = createInput({ text: 'hello\nworld' });
    selectLineAtTextInputIndex(text, 8);
    expect(getTextInputSelectionBeginIndex(text)).toBe(6);
    expect(getTextInputSelectionEndIndex(text)).toBe(11);
  });
});

describe('selectWordAtTextInputIndex', () => {
  it('selects the word at the given index', () => {
    const text = createInput({ text: 'hello world' });
    selectWordAtTextInputIndex(text, 1);
    expect(getTextInputSelectionBeginIndex(text)).toBe(0);
    expect(getTextInputSelectionEndIndex(text)).toBe(5);
  });
});

describe('setTextInputSelection', () => {
  it('clamps selection to the text range', () => {
    const text = createInput({ text: 'abc' });
    setTextInputSelection(text, -10, 10);
    expect(getTextInputSelectionBeginIndex(text)).toBe(0);
    expect(getTextInputSelectionEndIndex(text)).toBe(3);
  });
});
