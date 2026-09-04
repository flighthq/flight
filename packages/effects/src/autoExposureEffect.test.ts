import { createAutoExposureEffect, initializeAutoExposureEffect } from './autoExposureEffect';

describe('createAutoExposureEffect', () => {
  it('carries options', () => {
    expect(createAutoExposureEffect({ adaptationSpeed: 2 })).toMatchObject({ adaptationSpeed: 2 });
  });

  it('tags the intent type', () => {
    expect(createAutoExposureEffect().kind).toBe('AutoExposureEffect');
  });
});
describe('initializeAutoExposureEffect', () => {
  it('is the construction initializer of createAutoExposureEffect', () => {
    expect(typeof initializeAutoExposureEffect).toBe('function');
  });
});
