import { describe, expect, it } from 'vitest';

import { allocateWebCursorBackend } from './webCursor';

describe('allocateWebCursorBackend', () => {
  it('sets element.style.cursor to the given cursor value', () => {
    const element = document.createElement('div');
    const backend = allocateWebCursorBackend(element);
    backend.setCursor('pointer');
    expect(element.style.cursor).toBe('pointer');
  });

  it('clears element.style.cursor when given null', () => {
    const element = document.createElement('div');
    const backend = allocateWebCursorBackend(element);
    backend.setCursor('pointer');
    backend.setCursor(null);
    expect(element.style.cursor).toBe('');
  });

  it('constructs without a DOM side effect', () => {
    const element = document.createElement('div');
    allocateWebCursorBackend(element);
    expect(element.style.cursor).toBe('');
  });
});
