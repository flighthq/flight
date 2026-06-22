import { createHueSaturationEffect } from './hueSaturationEffect';

describe('createHueSaturationEffect', () => {
  it('tags the intent type', () => {
    expect(createHueSaturationEffect().kind).toBe('HueSaturationEffect');
  });

  it('carries options', () => {
    expect(createHueSaturationEffect({ hue: 90, saturation: 1.4, lightness: 0.1 })).toMatchObject({
      hue: 90,
      saturation: 1.4,
      lightness: 0.1,
    });
  });
});
