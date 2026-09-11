import { describe, expect, it } from 'vitest';

import { webHostStatusBarColor } from './webStatusbar';

describe('webHostStatusBarColor', () => {
  it('claims only theme-color writing', () => {
    expect(Object.keys(webHostStatusBarColor)).toEqual(['setBackgroundColor']);
  });

  it('creates and updates one theme-color meta element', () => {
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((element) => element.remove());
    webHostStatusBarColor.setBackgroundColor(0x112233ff);
    webHostStatusBarColor.setBackgroundColor(0xaabbccff);
    const elements = document.head.querySelectorAll('meta[name="theme-color"]');
    expect(elements).toHaveLength(1);
    expect(elements[0].getAttribute('content')).toBe('#aabbcc');
  });
});
