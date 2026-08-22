import { describe, expect, it } from 'vitest';

import { createWebCursorBackend } from './webCursor';

describe('createWebCursorBackend', () => {
  it('sets element.style.cursor to the given cursor value', () => {
    const element = document.createElement('div');
    const backend = createWebCursorBackend(element);
    backend.setCursor('pointer');
    expect(element.style.cursor).toBe('pointer');
  });

  it('clears element.style.cursor when given null', () => {
    const element = document.createElement('div');
    const backend = createWebCursorBackend(element);
    backend.setCursor('pointer');
    backend.setCursor(null);
    expect(element.style.cursor).toBe('');
  });

  it('constructs without a DOM side effect', () => {
    const element = document.createElement('div');
    createWebCursorBackend(element);
    expect(element.style.cursor).toBe('');
  });
});
