import { createPath } from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import { writePathBooleanContours } from './writePathBooleanContours';

describe('writePathBooleanContours', () => {
  it('rebuilds into a supplied path without allocation', () => {
    const out = createPath('evenOdd');
    expect(writePathBooleanContours([[0, 0, 1, 0, 0, 1]], out)).toBe(out);
    expect(out.winding).toBe('nonZero');
    expect(out.commands.length).toBe(4);
  });
});
