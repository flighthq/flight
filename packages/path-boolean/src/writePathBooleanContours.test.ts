import { createPath } from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import { writePathBooleanContours } from './writePathBooleanContours.ts';

describe('writePathBooleanContours', () => {
  it('rebuilds into a supplied path without allocation', () => {
    const out = createPath('evenOdd');
    writePathBooleanContours(out, [[0, 0, 1, 0, 0, 1]]);
    expect(out.winding).toBe('nonZero');
    expect(out.commands.length).toBe(4);
  });
});
