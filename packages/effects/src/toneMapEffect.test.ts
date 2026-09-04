import { createToneMapEffect, initializeToneMapEffect } from './toneMapEffect';

describe('createToneMapEffect', () => {
  it('tags the intent type and operator', () => {
    expect(createToneMapEffect({ operator: 'aces' })).toMatchObject({ kind: 'ToneMapEffect', operator: 'aces' });
  });
});
describe('initializeToneMapEffect', () => {
  it('is the construction initializer of createToneMapEffect', () => {
    expect(typeof initializeToneMapEffect).toBe('function');
  });
});
