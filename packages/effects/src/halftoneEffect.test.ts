import { createHalftoneEffect, initializeHalftoneEffect } from './halftoneEffect';

describe('createHalftoneEffect', () => {
  it('tags the intent type', () => {
    expect(createHalftoneEffect().kind).toBe('HalftoneEffect');
  });

  it('carries options', () => {
    expect(createHalftoneEffect({ scale: 6, angle: 30 })).toMatchObject({ scale: 6, angle: 30 });
  });
});
describe('initializeHalftoneEffect', () => {
  it('is the construction initializer of createHalftoneEffect', () => {
    expect(typeof initializeHalftoneEffect).toBe('function');
  });
});
