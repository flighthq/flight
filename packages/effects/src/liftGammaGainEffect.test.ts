import { createLiftGammaGainEffect } from './liftGammaGainEffect';

describe('createLiftGammaGainEffect', () => {
  it('tags the intent type', () => {
    expect(createLiftGammaGainEffect().kind).toBe('LiftGammaGainEffect');
  });

  it('carries options', () => {
    expect(createLiftGammaGainEffect({ lift: 0x808080ff, gamma: 0x808080ff, gain: 0x808080ff })).toMatchObject({
      lift: 0x808080ff,
      gamma: 0x808080ff,
      gain: 0x808080ff,
    });
  });
});
