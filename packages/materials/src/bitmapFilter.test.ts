import BitmapFilter from './bitmapFilter';

describe('BitmapFilter', () => {
  describe('constructor', () => {
    it('creates an instance', () => {
      const filter = new BitmapFilter();
      expect(filter).toBeInstanceOf(BitmapFilter);
    });
  });

  describe('clone', () => {
    it('returns a new BitmapFilter instance', () => {
      const original = new BitmapFilter();
      const cloned = BitmapFilter.clone(original);
      expect(cloned).toBeInstanceOf(BitmapFilter);
    });

    it('returns a different object than the original', () => {
      const original = new BitmapFilter();
      const cloned = BitmapFilter.clone(original);
      expect(cloned).not.toBe(original);
    });
  });
});
