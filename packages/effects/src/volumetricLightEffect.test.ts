import { createVolumetricLightEffect } from './volumetricLightEffect';

describe('createVolumetricLightEffect', () => {
  it('carries options', () => {
    expect(createVolumetricLightEffect({ density: 0.7, samples: 64 })).toMatchObject({
      density: 0.7,
      samples: 64,
    });
  });

  it('tags the intent type', () => {
    expect(createVolumetricLightEffect().kind).toBe('VolumetricLightEffect');
  });
});
