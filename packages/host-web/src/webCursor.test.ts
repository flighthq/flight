import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createWebCursorBackend, initializeWebCursorBackend } from './webCursor';

describe('createWebCursorBackend', () => {
  it('returns an Entity', () => {
    const element = document.createElement('div');
    expect(EntityRuntimeKey in createWebCursorBackend(element)).toBe(true);
  });

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
describe('initializeWebCursorBackend', () => {
  it('is the construction initializer of createWebCursorBackend', () => {
    expect(typeof initializeWebCursorBackend).toBe('function');
  });
});
