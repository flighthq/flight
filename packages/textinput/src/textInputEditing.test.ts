import { getNodeAppearanceRevision } from '@flighthq/node';
import { createRichText, setRichTextFormatRange } from '@flighthq/text';
import type { KeyboardEventData, RichText, RichTextData, TextInputOptions, TextLayoutResult } from '@flighthq/types';
import { KeyCode } from '@flighthq/types';

import { enableTextInput, getTextInputState } from './textInput';
import {
  appendTextInput,
  applyTextInputRestriction,
  canRedoTextInput,
  canUndoTextInput,
  clearTextInputHistory,
  deleteTextInputBackward,
  deleteTextInputForward,
  deleteTextInputWordBackward,
  deleteTextInputWordForward,
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
  moveTextInputCaretByWord,
  moveTextInputCaretDown,
  moveTextInputCaretToLineEnd,
  moveTextInputCaretToLineStart,
  moveTextInputCaretUp,
  redoTextInput,
  replaceSelectedTextInput,
  replaceTextInput,
  scrollTextInputCaretIntoView,
  selectAllTextInput,
  selectLineAtTextInputIndex,
  selectWordAtTextInputIndex,
  setTextInputSelection,
  undoTextInput,
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

describe('canRedoTextInput', () => {
  it('returns false when nothing has been undone', () => {
    const text = createInput({ text: 'abc' });
    insertTextInput(text, 'X');
    expect(canRedoTextInput(text)).toBe(false);
  });

  it('returns true after an edit has been undone', () => {
    const text = createInput({ text: 'abc' });
    insertTextInput(text, 'X');
    undoTextInput(text);
    expect(canRedoTextInput(text)).toBe(true);
  });
});

describe('canUndoTextInput', () => {
  it('returns false on a freshly enabled field with no edits', () => {
    const text = createInput({ text: 'abc' });
    expect(canUndoTextInput(text)).toBe(false);
  });

  it('returns true after a recorded edit', () => {
    const text = createInput({ text: 'abc' });
    insertTextInput(text, 'X');
    expect(canUndoTextInput(text)).toBe(true);
  });
});

describe('clearTextInputHistory', () => {
  it('empties the history and resets the cursor without changing text', () => {
    const text = createInput({ text: 'abc' });
    insertTextInput(text, 'X');
    expect(canUndoTextInput(text)).toBe(true);
    clearTextInputHistory(text);
    expect(canUndoTextInput(text)).toBe(false);
    expect(canRedoTextInput(text)).toBe(false);
    expect(text.data.text).toBe('Xabc');
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

describe('deleteTextInputWordBackward', () => {
  it('deletes the word before the caret', () => {
    const text = createInput({ text: 'hello world' });
    setTextInputSelection(text, 11, 11);
    deleteTextInputWordBackward(text);
    expect(text.data.text).toBe('hello ');
    expect(getTextInputCaretIndex(text)).toBe(6);
  });

  it('deletes across whitespace to reach the prior word', () => {
    // caret at index 6 (before 'w') — skips the space at 5, then removes 'hello' (indices 0–5).
    const text = createInput({ text: 'hello world' });
    setTextInputSelection(text, 6, 6);
    deleteTextInputWordBackward(text);
    expect(text.data.text).toBe('world');
    expect(getTextInputCaretIndex(text)).toBe(0);
  });

  it('deletes the selected range instead of a word when selection is non-collapsed', () => {
    const text = createInput({ text: 'hello world' });
    setTextInputSelection(text, 0, 5);
    deleteTextInputWordBackward(text);
    expect(text.data.text).toBe(' world');
  });

  it('does nothing at the beginning of text', () => {
    const text = createInput({ text: 'abc' });
    setTextInputSelection(text, 0, 0);
    deleteTextInputWordBackward(text);
    expect(text.data.text).toBe('abc');
  });
});

describe('deleteTextInputWordForward', () => {
  it('deletes the word after the caret', () => {
    const text = createInput({ text: 'hello world' });
    setTextInputSelection(text, 6, 6);
    deleteTextInputWordForward(text);
    expect(text.data.text).toBe('hello ');
    expect(getTextInputCaretIndex(text)).toBe(6);
  });

  it('deletes the selected range instead of a word when selection is non-collapsed', () => {
    const text = createInput({ text: 'hello world' });
    setTextInputSelection(text, 6, 11);
    deleteTextInputWordForward(text);
    expect(text.data.text).toBe('hello ');
  });

  it('does nothing at the end of text', () => {
    const text = createInput({ text: 'abc' });
    setTextInputSelection(text, 3, 3);
    deleteTextInputWordForward(text);
    expect(text.data.text).toBe('abc');
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

  it('handles ctrl+left word-left motion', () => {
    const text = createInput({ text: 'hello world' });
    setTextInputSelection(text, 11, 11);
    handleTextInputKeyboard(text, createKeyboardData({ ctrlKey: true, key: 'ArrowLeft', keyCode: KeyCode.LEFT }));
    expect(getTextInputCaretIndex(text)).toBe(6);
  });

  it('handles ctrl+right word-right motion', () => {
    const text = createInput({ text: 'hello world' });
    setTextInputSelection(text, 0, 0);
    handleTextInputKeyboard(text, createKeyboardData({ ctrlKey: true, key: 'ArrowRight', keyCode: KeyCode.RIGHT }));
    expect(getTextInputCaretIndex(text)).toBe(5);
  });

  it('handles ctrl+backspace word-delete backward', () => {
    const text = createInput({ text: 'hello world' });
    setTextInputSelection(text, 11, 11);
    handleTextInputKeyboard(text, createKeyboardData({ ctrlKey: true, key: 'Backspace', keyCode: KeyCode.BACKSPACE }));
    expect(text.data.text).toBe('hello ');
  });

  it('handles ctrl+delete word-delete forward', () => {
    const text = createInput({ text: 'hello world' });
    setTextInputSelection(text, 6, 6);
    handleTextInputKeyboard(text, createKeyboardData({ ctrlKey: true, key: 'Delete', keyCode: KeyCode.DELETE }));
    expect(text.data.text).toBe('hello ');
  });

  it('handles down arrow with layout (moves to next line)', () => {
    const text = createInput({ multiline: true, text: 'abcdefg' });
    setTextInputSelection(text, 1, 1);
    handleTextInputKeyboard(text, createKeyboardData({ key: 'ArrowDown', keyCode: KeyCode.DOWN }), {
      layout: createLayout(),
    });
    // Should land somewhere on line 1 (indices 3–7).
    expect(getTextInputCaretIndex(text)).toBeGreaterThanOrEqual(3);
  });

  it('handles up arrow with layout (moves to prev line)', () => {
    const text = createInput({ multiline: true, text: 'abcdefg' });
    setTextInputSelection(text, 5, 5);
    handleTextInputKeyboard(text, createKeyboardData({ key: 'ArrowUp', keyCode: KeyCode.UP }), {
      layout: createLayout(),
    });
    // Should land somewhere on line 0 (indices 0–3).
    expect(getTextInputCaretIndex(text)).toBeLessThanOrEqual(3);
  });

  it('handles down at last line by moving to end', () => {
    const text = createInput({ text: 'abcdefg' });
    setTextInputSelection(text, 5, 5);
    handleTextInputKeyboard(text, createKeyboardData({ key: 'ArrowDown', keyCode: KeyCode.DOWN }), {
      layout: createLayout(),
    });
    expect(getTextInputCaretIndex(text)).toBe(7);
  });

  it('handles up at first line by moving to start', () => {
    const text = createInput({ text: 'abcdefg' });
    setTextInputSelection(text, 1, 1);
    handleTextInputKeyboard(text, createKeyboardData({ key: 'ArrowUp', keyCode: KeyCode.UP }), {
      layout: createLayout(),
    });
    expect(getTextInputCaretIndex(text)).toBe(0);
  });

  it('invokes onCopy callback for copy command', () => {
    const text = createInput({ text: 'hello' });
    setTextInputSelection(text, 0, 5);
    const copied: string[] = [];
    handleTextInputKeyboard(text, createKeyboardData({ ctrlKey: true, key: 'c', keyCode: KeyCode.C }), {
      onCopy: (t) => copied.push(t),
    });
    expect(copied).toEqual(['hello']);
  });

  it('returns false for unhandled keys', () => {
    const text = createInput({ text: 'abc' });
    expect(handleTextInputKeyboard(text, createKeyboardData({ key: 'F1', keyCode: 112 }))).toBe(false);
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

  it('resets desiredCaretX on horizontal move', () => {
    const text = createInput({ text: 'abc' });
    const state = getTextInputState(text)!;
    state.desiredCaretX = 50;
    moveTextInputCaret(text, 1);
    expect(state.desiredCaretX).toBe(-1);
  });
});

describe('moveTextInputCaretByWord', () => {
  it('moves backward by one word', () => {
    const text = createInput({ text: 'hello world' });
    setTextInputSelection(text, 11, 11);
    moveTextInputCaretByWord(text, -1);
    expect(getTextInputCaretIndex(text)).toBe(6);
  });

  it('moves forward by one word', () => {
    const text = createInput({ text: 'hello world' });
    setTextInputSelection(text, 0, 0);
    moveTextInputCaretByWord(text, 1);
    expect(getTextInputCaretIndex(text)).toBe(5);
  });

  it('extends selection when extendSelection is true', () => {
    const text = createInput({ text: 'hello world' });
    setTextInputSelection(text, 0, 0);
    moveTextInputCaretByWord(text, 1, true);
    expect(getTextInputSelectionBeginIndex(text)).toBe(0);
    expect(getTextInputSelectionEndIndex(text)).toBe(5);
  });

  it('clamps to text start when moving backward past the beginning', () => {
    const text = createInput({ text: 'hi' });
    setTextInputSelection(text, 1, 1);
    moveTextInputCaretByWord(text, -1);
    expect(getTextInputCaretIndex(text)).toBe(0);
  });

  it('clamps to text end when moving forward past the end', () => {
    const text = createInput({ text: 'hi' });
    setTextInputSelection(text, 2, 2);
    moveTextInputCaretByWord(text, 1);
    expect(getTextInputCaretIndex(text)).toBe(2);
  });
});

describe('moveTextInputCaretDown', () => {
  it('moves caret to the next line at the same x', () => {
    const text = createInput({ multiline: true, text: 'abcdefg' });
    setTextInputSelection(text, 1, 1);
    moveTextInputCaretDown(text, createLayout());
    expect(getTextInputCaretIndex(text)).toBeGreaterThanOrEqual(3);
  });

  it('moves to end of text when already on the last line', () => {
    const text = createInput({ text: 'abcdefg' });
    setTextInputSelection(text, 5, 5);
    moveTextInputCaretDown(text, createLayout());
    expect(getTextInputCaretIndex(text)).toBe(7);
  });

  it('falls back to end of text when layout is null', () => {
    const text = createInput({ text: 'abc' });
    setTextInputSelection(text, 1, 1);
    moveTextInputCaretDown(text, null);
    expect(getTextInputCaretIndex(text)).toBe(3);
  });

  it('preserves desiredCaretX across consecutive down moves', () => {
    const text = createInput({ multiline: true, text: 'abcdefg' });
    setTextInputSelection(text, 1, 1);
    const state = getTextInputState(text)!;
    moveTextInputCaretDown(text, createLayout());
    // desiredCaretX should be set and not reset between vertical steps.
    expect(state.desiredCaretX).not.toBe(-1);
  });

  it('extends selection when extendSelection is true', () => {
    const text = createInput({ multiline: true, text: 'abcdefg' });
    setTextInputSelection(text, 1, 1);
    moveTextInputCaretDown(text, createLayout(), true);
    // caret moved forward; anchor (selectionIndex) stayed at 1.
    expect(getTextInputSelectionBeginIndex(text)).toBe(1);
    expect(getTextInputSelectionEndIndex(text)).toBeGreaterThan(1);
  });
});

describe('moveTextInputCaretToLineEnd', () => {
  it('moves the caret to the end of the current layout line', () => {
    const text = createInput({ multiline: true, text: 'abcdefg' });
    setTextInputSelection(text, 1, 1);
    moveTextInputCaretToLineEnd(text, createLayout());
    // Caret is on line 0 (groups 0..3); the line's end index is 3.
    expect(getTextInputCaretIndex(text)).toBe(3);
  });

  it('falls back to end of text when layout is null', () => {
    const text = createInput({ text: 'abc' });
    setTextInputSelection(text, 1, 1);
    moveTextInputCaretToLineEnd(text, null);
    expect(getTextInputCaretIndex(text)).toBe(3);
  });

  it('extends selection when extendSelection is true', () => {
    const text = createInput({ multiline: true, text: 'abcdefg' });
    setTextInputSelection(text, 1, 1);
    moveTextInputCaretToLineEnd(text, createLayout(), true);
    expect(getTextInputSelectionBeginIndex(text)).toBe(1);
    expect(getTextInputSelectionEndIndex(text)).toBe(3);
  });
});

describe('moveTextInputCaretToLineStart', () => {
  it('moves the caret to the start of the current layout line', () => {
    const text = createInput({ multiline: true, text: 'abcdefg' });
    setTextInputSelection(text, 6, 6);
    moveTextInputCaretToLineStart(text, createLayout());
    // Caret is on line 1 (groups 3..7); the line's start index is 3.
    expect(getTextInputCaretIndex(text)).toBe(3);
  });

  it('falls back to start of text when layout is null', () => {
    const text = createInput({ text: 'abc' });
    setTextInputSelection(text, 2, 2);
    moveTextInputCaretToLineStart(text, null);
    expect(getTextInputCaretIndex(text)).toBe(0);
  });

  it('extends selection when extendSelection is true', () => {
    const text = createInput({ multiline: true, text: 'abcdefg' });
    setTextInputSelection(text, 6, 6);
    moveTextInputCaretToLineStart(text, createLayout(), true);
    expect(getTextInputSelectionBeginIndex(text)).toBe(3);
    expect(getTextInputSelectionEndIndex(text)).toBe(6);
  });
});

describe('moveTextInputCaretUp', () => {
  it('moves caret to the previous line at the same x', () => {
    const text = createInput({ multiline: true, text: 'abcdefg' });
    setTextInputSelection(text, 5, 5);
    moveTextInputCaretUp(text, createLayout());
    expect(getTextInputCaretIndex(text)).toBeLessThanOrEqual(3);
  });

  it('moves to start of text when already on the first line', () => {
    const text = createInput({ text: 'abcdefg' });
    setTextInputSelection(text, 1, 1);
    moveTextInputCaretUp(text, createLayout());
    expect(getTextInputCaretIndex(text)).toBe(0);
  });

  it('falls back to start of text when layout is null', () => {
    const text = createInput({ text: 'abc' });
    setTextInputSelection(text, 2, 2);
    moveTextInputCaretUp(text, null);
    expect(getTextInputCaretIndex(text)).toBe(0);
  });
});

describe('redoTextInput', () => {
  it('reapplies an undone edit', () => {
    const text = createInput({ text: 'abc' });
    insertTextInput(text, 'X');
    expect(text.data.text).toBe('Xabc');
    undoTextInput(text);
    expect(text.data.text).toBe('abc');
    redoTextInput(text);
    expect(text.data.text).toBe('Xabc');
  });

  it('does nothing when there is nothing to redo', () => {
    const text = createInput({ text: 'abc' });
    insertTextInput(text, 'X');
    redoTextInput(text);
    expect(text.data.text).toBe('Xabc');
  });

  it('restores the caret position recorded after the edit', () => {
    const text = createInput({ text: 'abc' });
    setTextInputSelection(text, 0, 0);
    insertTextInput(text, 'X');
    undoTextInput(text);
    redoTextInput(text);
    expect(getTextInputCaretIndex(text)).toBe(1);
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

describe('scrollTextInputCaretIntoView', () => {
  function createTallLayout(): TextLayoutResult {
    const groups = [];
    for (let line = 0; line < 4; line++) {
      groups.push({
        ascent: 10,
        descent: 2,
        endIndex: line + 1,
        format: {},
        height: 12,
        leading: 0,
        lineIndex: line,
        offsetX: 2,
        offsetY: 2 + line * 12,
        positions: [10],
        startIndex: line,
        width: 10,
      });
    }
    return {
      groups,
      lineAscents: [10, 10, 10, 10],
      lineDescents: [2, 2, 2, 2],
      lineHeights: [12, 12, 12, 12],
      lineLeadings: [0, 0, 0, 0],
      lineWidths: [10, 10, 10, 10],
      numLines: 4,
      textHeight: 48,
      textWidth: 10,
    };
  }

  it('scrolls down so a caret below the viewport becomes visible', () => {
    const text = createInput({ autoSize: 'none', height: 28, multiline: true, text: 'abcd', width: 100 });
    // Caret on the last line (index 4), viewport ~2 lines tall.
    setTextInputSelection(text, 4, 4);
    scrollTextInputCaretIntoView(text, createTallLayout(), 100, 24);
    expect(text.data.scrollV).toBeGreaterThan(1);
  });

  it('leaves scroll unchanged when the caret is already visible', () => {
    const text = createInput({ autoSize: 'none', height: 60, multiline: true, text: 'abcd', width: 100 });
    setTextInputSelection(text, 0, 0);
    scrollTextInputCaretIntoView(text, createTallLayout(), 100, 60);
    expect(text.data.scrollV).toBe(1);
    expect(text.data.scrollH).toBe(0);
  });

  it('scrolls horizontally so a caret past the right edge becomes visible', () => {
    const text = createInput({ autoSize: 'none', height: 40, text: 'abcdefg', width: 20 });
    // A wide single line; caret at the far right of line 1 of the standard fixture (x ~= 42).
    setTextInputSelection(text, 7, 7);
    scrollTextInputCaretIntoView(text, createLayout(), 20, 40);
    expect(text.data.scrollH).toBeGreaterThan(0);
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

describe('undoTextInput', () => {
  it('restores the text before the most recent edit', () => {
    const text = createInput({ text: 'abc' });
    insertTextInput(text, 'X');
    expect(text.data.text).toBe('Xabc');
    undoTextInput(text);
    expect(text.data.text).toBe('abc');
  });

  it('does nothing when there is nothing to undo', () => {
    const text = createInput({ text: 'abc' });
    undoTextInput(text);
    expect(text.data.text).toBe('abc');
  });

  it('walks back through multiple non-merged edits in order', () => {
    const text = createInput({ text: '' });
    replaceTextInput(text, 0, 0, 'a', { mergeKind: null });
    replaceTextInput(text, 1, 1, 'b', { mergeKind: null });
    expect(text.data.text).toBe('ab');
    undoTextInput(text);
    expect(text.data.text).toBe('a');
    undoTextInput(text);
    expect(text.data.text).toBe('');
  });

  it('coalesces consecutive edits sharing a non-null mergeKind into one undo step', () => {
    const text = createInput({ text: '' });
    replaceTextInput(text, 0, 0, 'a', { mergeKind: 'type' });
    replaceTextInput(text, 1, 1, 'b', { mergeKind: 'type' });
    expect(text.data.text).toBe('ab');
    undoTextInput(text);
    // Both keystrokes collapse into a single record, so one undo clears them both.
    expect(text.data.text).toBe('');
  });

  it('does not record history when historyLimit is 0', () => {
    const text = createInput({ text: 'abc' }, { historyLimit: 0 });
    insertTextInput(text, 'X');
    expect(canUndoTextInput(text)).toBe(false);
    undoTextInput(text);
    expect(text.data.text).toBe('Xabc');
  });

  it('restores the caret position recorded before the edit', () => {
    const text = createInput({ text: 'abc' });
    setTextInputSelection(text, 1, 1);
    insertTextInput(text, 'X');
    expect(getTextInputCaretIndex(text)).toBe(2);
    undoTextInput(text);
    expect(getTextInputCaretIndex(text)).toBe(1);
  });
});
