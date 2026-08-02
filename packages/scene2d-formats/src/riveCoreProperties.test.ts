import { RiveFieldType } from '@flighthq/types/contract';

import { getRiveCorePropertyFieldType } from './riveCoreProperties';

describe('getRiveCorePropertyFieldType', () => {
  it('answers for the core properties every file uses', () => {
    // Component.name, Artboard.width, Artboard.height — the first properties any reader meets.
    expect(getRiveCorePropertyFieldType(4)).toBe(RiveFieldType.String);
    expect(getRiveCorePropertyFieldType(7)).toBe(RiveFieldType.Double);
    expect(getRiveCorePropertyFieldType(8)).toBe(RiveFieldType.Double);
  });

  it('answers for a retired alternate key, not only the current one', () => {
    // Node.x is key 13 today and was key 9 ("xArtboard") before. Files in circulation still write 9,
    // and a table built only from current keys stalls on the first node of most real files.
    expect(getRiveCorePropertyFieldType(13)).toBe(RiveFieldType.Double);
    expect(getRiveCorePropertyFieldType(9)).toBe(RiveFieldType.Double);
  });

  it('covers every wire width', () => {
    const widths = new Set<number>();
    for (let key = 0; key < 1100; key++) {
      const type = getRiveCorePropertyFieldType(key);
      if (type !== undefined) widths.add(type);
    }

    expect([...widths].sort()).toEqual([
      RiveFieldType.Uint,
      RiveFieldType.String,
      RiveFieldType.Double,
      RiveFieldType.Color,
    ]);
  });

  it('returns undefined for a key the object model does not define', () => {
    expect(getRiveCorePropertyFieldType(0)).toBeUndefined();
    expect(getRiveCorePropertyFieldType(999999)).toBeUndefined();
  });
});
