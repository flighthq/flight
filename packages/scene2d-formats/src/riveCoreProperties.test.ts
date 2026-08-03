import { RiveFieldType } from '@flighthq/types/contract';

import { getRiveCorePropertyFieldType, isRiveCoreBytesProperty } from './riveCoreProperties';

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

describe('isRiveCoreBytesProperty', () => {
  it('marks the length-prefixed properties that are raw blobs, not text', () => {
    // An asset's embedded payload travels under the same wire code as a name; only the object model
    // says which is which, and decoding a payload as UTF-8 would corrupt it.
    expect(isRiveCoreBytesProperty(212)).toBe(true);
    expect(isRiveCoreBytesProperty(911)).toBe(true);
  });

  it('leaves genuine text alone', () => {
    // Component.name and the animation name are text under the same code.
    expect(isRiveCoreBytesProperty(4)).toBe(false);
    expect(isRiveCoreBytesProperty(55)).toBe(false);
    expect(isRiveCoreBytesProperty(999999)).toBe(false);
  });

  it('agrees with the field table that every blob key is length-prefixed', () => {
    for (const key of [212, 223, 359, 582, 588, 711, 866, 868, 871, 911, 920, 963]) {
      expect(getRiveCorePropertyFieldType(key)).toBe(RiveFieldType.String);
    }
  });
});
