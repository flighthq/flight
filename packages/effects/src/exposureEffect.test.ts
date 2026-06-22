import { createExposureEffect } from './exposureEffect';

describe('createExposureEffect', () => {
  it('tags the intent type', () => {
    expect(createExposureEffect({ exposure: 1 }).kind).toBe('ExposureEffect');
  });
});
