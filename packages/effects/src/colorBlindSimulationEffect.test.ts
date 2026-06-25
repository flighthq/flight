import { createColorBlindSimulationEffect } from './colorBlindSimulationEffect';

describe('createColorBlindSimulationEffect', () => {
  it('carries options', () => {
    expect(createColorBlindSimulationEffect({ type: 'protanopia' })).toMatchObject({
      type: 'protanopia',
    });
  });

  it('tags the intent type', () => {
    expect(createColorBlindSimulationEffect().kind).toBe('ColorBlindSimulationEffect');
  });
});
