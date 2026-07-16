import type { Cursor } from '@flighthq/types';

import { createWebCursorBackend } from './cursorBackend';

describe('createWebCursorBackend', () => {
  function fakeElement(): { style: { cursor: string } } {
    return { style: { cursor: 'init' } };
  }

  it('writes the cursor value to element.style.cursor', () => {
    const el = fakeElement();
    const backend = createWebCursorBackend(el as unknown as HTMLElement);
    backend.setCursor('pointer' as Cursor);
    expect(el.style.cursor).toBe('pointer');
  });

  it('clears to the empty string when given null', () => {
    const el = fakeElement();
    const backend = createWebCursorBackend(el as unknown as HTMLElement);
    backend.setCursor('grab' as Cursor);
    backend.setCursor(null);
    expect(el.style.cursor).toBe('');
  });
});
