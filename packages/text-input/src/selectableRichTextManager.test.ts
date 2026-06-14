import { createRichText, getRichTextRuntime } from '@flighthq/displayobject';
import type { InputKeyboardData, RichTextRuntime } from '@flighthq/types';
import { KeyCode } from '@flighthq/types';

import {
  blurSelectableRichText,
  createSelectableRichTextManager,
  dispatchSelectableRichTextKeyDown,
  dispatchSelectableRichTextPointerDown,
  dispatchSelectableRichTextPointerMove,
  dispatchSelectableRichTextWheel,
  focusSelectableRichText,
  getSelectableRichTextSelectionText,
} from './selectableRichTextManager';

function makeKeyData(data: Partial<InputKeyboardData> = {}): InputKeyboardData {
  return {
    altKey: false,
    capsLock: false,
    code: '',
    ctrlKey: false,
    key: '',
    keyCode: 0,
    location: 0,
    metaKey: false,
    modifier: 0,
    numLock: false,
    repeat: false,
    shiftKey: false,
    ...data,
  };
}

describe('blurSelectableRichText', () => {
  it('clears the focused target and resets selection', () => {
    const manager = createSelectableRichTextManager();
    const richText = createRichText({ data: { text: 'hello' } });
    focusSelectableRichText(manager, richText);
    const runtime = getRichTextRuntime(richText) as RichTextRuntime;
    runtime.selectionBeginIndex = 1;
    runtime.selectionEndIndex = 4;
    blurSelectableRichText(manager);
    expect(manager.focused).toBeNull();
    expect(runtime.selectionBeginIndex).toBe(0);
    expect(runtime.selectionEndIndex).toBe(0);
  });

  it('does not throw when nothing is focused', () => {
    expect(() => blurSelectableRichText(createSelectableRichTextManager())).not.toThrow();
  });
});

describe('createSelectableRichTextManager', () => {
  it('creates a manager with no focused target', () => {
    const manager = createSelectableRichTextManager();
    expect(manager.focused).toBeNull();
  });
});

describe('dispatchSelectableRichTextKeyDown', () => {
  it('returns false when nothing is focused', () => {
    expect(dispatchSelectableRichTextKeyDown(createSelectableRichTextManager(), makeKeyData())).toBe(false);
  });

  it('selects all on ctrl-a', () => {
    const manager = createSelectableRichTextManager();
    const richText = createRichText({ data: { text: 'hello' } });
    focusSelectableRichText(manager, richText);
    const result = dispatchSelectableRichTextKeyDown(
      manager,
      makeKeyData({ ctrlKey: true, key: 'a', keyCode: KeyCode.A }),
    );
    expect(result).toBe(true);
    const runtime = getRichTextRuntime(richText) as RichTextRuntime;
    expect(runtime.selectionBeginIndex).toBe(0);
    expect(runtime.selectionEndIndex).toBe(5);
  });

  it('returns false for unhandled keys', () => {
    const manager = createSelectableRichTextManager();
    focusSelectableRichText(manager, createRichText());
    expect(dispatchSelectableRichTextKeyDown(manager, makeKeyData({ key: 'ArrowLeft' }))).toBe(false);
  });
});

describe('dispatchSelectableRichTextPointerDown', () => {
  it('sets focus and collapses selection when layout is null', () => {
    const manager = createSelectableRichTextManager();
    const richText = createRichText({ data: { text: 'hello' } });
    const runtime = getRichTextRuntime(richText) as RichTextRuntime;
    runtime.selectionBeginIndex = 2;
    runtime.selectionEndIndex = 2;
    dispatchSelectableRichTextPointerDown(manager, richText, 0, 0);
    expect(manager.focused).toBe(richText);
    expect(runtime.selectionBeginIndex).toBe(0);
    expect(runtime.selectionEndIndex).toBe(0);
  });

  it('extends the selection end when extend is true', () => {
    const manager = createSelectableRichTextManager();
    const richText = createRichText({ data: { text: 'hello' } });
    const runtime = getRichTextRuntime(richText) as RichTextRuntime;
    runtime.selectionBeginIndex = 1;
    dispatchSelectableRichTextPointerDown(manager, richText, 0, 0, true);
    expect(runtime.selectionBeginIndex).toBe(1);
  });
});

describe('dispatchSelectableRichTextPointerMove', () => {
  it('does not throw when nothing is focused', () => {
    expect(() => dispatchSelectableRichTextPointerMove(createSelectableRichTextManager(), 0, 0)).not.toThrow();
  });

  it('does nothing when focused target has no layout', () => {
    const manager = createSelectableRichTextManager();
    const richText = createRichText({ data: { text: 'hello' } });
    focusSelectableRichText(manager, richText);
    expect(() => dispatchSelectableRichTextPointerMove(manager, 10, 5)).not.toThrow();
  });
});

describe('dispatchSelectableRichTextWheel', () => {
  it('does not throw when nothing is focused', () => {
    expect(() => dispatchSelectableRichTextWheel(createSelectableRichTextManager(), 2)).not.toThrow();
  });

  it('advances scrollV by the given delta', () => {
    const manager = createSelectableRichTextManager();
    const richText = createRichText({ data: { text: 'hello' } });
    focusSelectableRichText(manager, richText);
    expect(richText.data.scrollV).toBe(1);
    dispatchSelectableRichTextWheel(manager, 2);
    expect(richText.data.scrollV).toBe(3);
  });
});

describe('focusSelectableRichText', () => {
  it('sets the focused target', () => {
    const manager = createSelectableRichTextManager();
    const richText = createRichText({ data: { text: 'hello' } });
    focusSelectableRichText(manager, richText);
    expect(manager.focused).toBe(richText);
  });
});

describe('getSelectableRichTextSelectionText', () => {
  it('returns empty string when nothing is focused', () => {
    expect(getSelectableRichTextSelectionText(createSelectableRichTextManager())).toBe('');
  });

  it('returns the selected slice of text', () => {
    const manager = createSelectableRichTextManager();
    const richText = createRichText({ data: { text: 'hello world' } });
    focusSelectableRichText(manager, richText);
    const runtime = getRichTextRuntime(richText) as RichTextRuntime;
    runtime.selectionBeginIndex = 6;
    runtime.selectionEndIndex = 11;
    expect(getSelectableRichTextSelectionText(manager)).toBe('world');
  });
});
