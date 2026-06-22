import { createTiltShiftEffect } from './tiltShiftEffect';

describe('createTiltShiftEffect', () => {
  it('tags the intent type', () => {
    expect(createTiltShiftEffect().kind).toBe('TiltShiftEffect');
  });

  it('carries options', () => {
    expect(createTiltShiftEffect({ center: 0.5, width: 0.2, blur: 4 })).toMatchObject({
      center: 0.5,
      width: 0.2,
      blur: 4,
    });
  });
});
