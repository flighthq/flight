import { describe, expect, it } from 'vitest';

import {
  appendLassoClose,
  appendLassoLineTo,
  appendLassoMoveTo,
  clearLassoPath,
  createLassoPath,
} from './pathCompat.ts';

describe('appendLassoClose', () => {
  it('appends a close command without data', () => {
    const path = createLassoPath();
    appendLassoClose(path);
    expect(path.commands).toEqual([7]);
    expect(path.data).toEqual([]);
  });
});

describe('appendLassoLineTo', () => {
  it('appends a line command and its point', () => {
    const path = createLassoPath();
    appendLassoLineTo(path, 3, 4);
    expect(path.commands).toEqual([2]);
    expect(path.data).toEqual([3, 4]);
  });
});

describe('appendLassoMoveTo', () => {
  it('appends a move command and its point', () => {
    const path = createLassoPath();
    appendLassoMoveTo(path, 1, 2);
    expect(path.commands).toEqual([1]);
    expect(path.data).toEqual([1, 2]);
  });
});

describe('clearLassoPath', () => {
  it('empties commands and data while keeping the path and its winding', () => {
    const path = createLassoPath();
    appendLassoMoveTo(path, 1, 2);
    appendLassoLineTo(path, 3, 4);
    clearLassoPath(path);
    expect(path.commands).toEqual([]);
    expect(path.data).toEqual([]);
    expect(path.winding).toBe('evenOdd');
  });
});

describe('createLassoPath', () => {
  it('creates an empty even-odd path', () => {
    const path = createLassoPath();
    expect(path.commands).toEqual([]);
    expect(path.data).toEqual([]);
    expect(path.winding).toBe('evenOdd');
  });
});
